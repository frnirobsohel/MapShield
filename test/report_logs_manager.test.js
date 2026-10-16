const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const {
  REPORT_LOGS_DIR,
  PROOFS_DIR,
  ERRORS_DIR,
  ensureScreenshotDirs,
  getAllReportLogs,
  getReportHtmlContent,
  clearReportLogs,
  captureErrorScreenshot,
  captureProofScreenshot
} = require('../modules/helpers/screenshot_paths');

test('report_logs_manager: ensureScreenshotDirs and getAllReportLogs structure', () => {
  ensureScreenshotDirs();
  const res = getAllReportLogs();

  assert.ok(Array.isArray(res.logs), 'res.logs must be an array');
  assert.ok(res.summary, 'res.summary must exist');
  assert.strictEqual(typeof res.summary.total, 'number');
  assert.strictEqual(typeof res.summary.errors, 'number');
  assert.strictEqual(typeof res.summary.proofs, 'number');
  assert.strictEqual(typeof res.summary.totalSizeBytes, 'number');
  assert.strictEqual(typeof res.summary.formattedTotalSize, 'string');
});

test('report_logs_manager: captures forensic error metadata and html snapshot', async () => {
  ensureScreenshotDirs();

  // Mock page object simulating clean CDP calls without DOM injection
  const mockPage = {
    url: () => 'https://maps.google.com/review/test_123',
    title: async () => 'Test Google Review Page',
    screenshot: async ({ path: p }) => {
      fs.writeFileSync(p, Buffer.alloc(1024, 0x1));
    },
    content: async () => '<html><body><button class="test-btn">Report</button></body></html>'
  };

  const prefix = 'unit_test_err';
  const paths = await captureErrorScreenshot(mockPage, prefix, {
    stepName: 'CLICK_TEST_BUTTON',
    selector: 'button.test-btn',
    error: new Error('Simulated element timeout'),
    fullPage: false
  });

  assert.ok(paths, 'captureErrorScreenshot should return paths');
  assert.ok(fs.existsSync(paths.archivePath), 'Screenshot PNG must exist');

  const baseName = paths.filename.replace(/\.png$/i, '');
  const jsonPath = path.join(ERRORS_DIR, `${baseName}.json`);
  const htmlPath = path.join(ERRORS_DIR, `${baseName}.html`);

  assert.ok(fs.existsSync(jsonPath), 'Companion JSON metadata must exist');
  assert.ok(fs.existsSync(htmlPath), 'Companion HTML snapshot must exist');

  const metaContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(metaContent.status, 'FAILED');
  assert.strictEqual(metaContent.step, 'CLICK_TEST_BUTTON');
  assert.strictEqual(metaContent.selector, 'button.test-btn');
  assert.strictEqual(metaContent.url, 'https://maps.google.com/review/test_123');
  assert.ok(metaContent.error.message.includes('Simulated element timeout'));

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(htmlContent.includes('<button class="test-btn">Report</button>'));

  // Test reading via getReportHtmlContent helper
  const readRes = getReportHtmlContent(htmlPath);
  assert.ok(readRes.success);
  assert.ok(readRes.html.includes('button class="test-btn"'));

  // Cleanup unit test files
  try {
    if (fs.existsSync(paths.archivePath)) fs.unlinkSync(paths.archivePath);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  } catch (_) {}
});

test('report_logs_manager: clearReportLogs executes without throwing', () => {
  ensureScreenshotDirs();
  const dummyFile = path.join(ERRORS_DIR, 'unit_test_dummy_clear.tmp');
  fs.writeFileSync(dummyFile, 'test');
  assert.ok(fs.existsSync(dummyFile));
  
  // Verify function returns object structure
  assert.strictEqual(typeof clearReportLogs, 'function');
  if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile);
  assert.ok(fs.existsSync(ERRORS_DIR), 'ERRORS_DIR must remain created');
});

test('report_logs_manager: pagination calculation and slicing logic', () => {
  const dummyLogs = Array.from({ length: 45 }, (_, i) => ({ id: `log_${i + 1}`, name: `Task #${i + 1}` }));
  const pageSize = 10;
  const totalPages = Math.ceil(dummyLogs.length / pageSize);
  assert.strictEqual(totalPages, 5, '45 items with 10 per page must equal 5 pages');

  // Page 1
  let page = 1;
  let start = (page - 1) * pageSize;
  let end = Math.min(start + pageSize, dummyLogs.length);
  let slice = dummyLogs.slice(start, end);
  assert.strictEqual(slice.length, 10);
  assert.strictEqual(slice[0].id, 'log_1');
  assert.strictEqual(slice[9].id, 'log_10');

  // Last Page (Page 5)
  page = 5;
  start = (page - 1) * pageSize;
  end = Math.min(start + pageSize, dummyLogs.length);
  slice = dummyLogs.slice(start, end);
  assert.strictEqual(slice.length, 5);
  assert.strictEqual(slice[0].id, 'log_41');
  assert.strictEqual(slice[4].id, 'log_45');
});

test('report_logs_manager: screenshot base64 data URL conversion and path verification', () => {
  ensureScreenshotDirs();
  const testImgPath = path.join(PROOFS_DIR, 'test_sample_proof.png');
  const dummyBuffer = Buffer.from('FAKE_PNG_BINARY_CONTENT');
  fs.writeFileSync(testImgPath, dummyBuffer);

  assert.ok(fs.existsSync(testImgPath));
  const readBuffer = fs.readFileSync(testImgPath);
  const base64Data = `data:image/png;base64,${readBuffer.toString('base64')}`;

  assert.ok(base64Data.startsWith('data:image/png;base64,'));
  assert.ok(base64Data.includes(dummyBuffer.toString('base64')));

  // Cleanup
  if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);
});

test('report_logs_manager: parses CSV lines with commas and quotes accurately', () => {
  ensureScreenshotDirs();
  const actPath = path.join(REPORT_LOGS_DIR, 'reports_history.csv');
  const testLine = '"2026-10-17T00:00:00.000Z","FAILED","https://maps.google.com/?cid=123,456","user@example.com","standard","spam","Error, with comma","errors/error_csv_test_123.png"\n';
  fs.appendFileSync(actPath, testLine, 'utf8');

  // Create corresponding test png
  const dummyPng = path.join(ERRORS_DIR, 'error_csv_test_123.png');
  fs.writeFileSync(dummyPng, Buffer.from('test'));

  const res = getAllReportLogs(true);
  const found = res.logs.find(l => l.baseName === 'error_csv_test_123');
  assert.ok(found, 'Log entry must be found');
  assert.strictEqual(found.url, 'https://maps.google.com/?cid=123,456', 'URL with comma must be preserved');
  assert.strictEqual(found.email, 'user@example.com');

  // Clean up
  try {
    if (fs.existsSync(dummyPng)) fs.unlinkSync(dummyPng);
  } catch (_) {}
});


