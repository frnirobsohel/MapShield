const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseService } = require('../database/db');
const {
  REPORT_LOGS_DIR,
  PROOFS_DIR,
  ERRORS_DIR,
  ensureScreenshotDirs,
  appendActivityLog,
  getLatestScreenshot
} = require('../modules/helpers/screenshot_paths');

const TEST_DB_PATH = path.join(__dirname, 'test_audit_logger.sqlite');

test.before(() => {
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
});

test.after(() => {
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
});

test('file_audit: ensureScreenshotDirs creates proofs and errors directories', () => {
  ensureScreenshotDirs();
  assert.ok(fs.existsSync(PROOFS_DIR), 'Proofs directory must exist');
  assert.ok(fs.existsSync(ERRORS_DIR), 'Errors directory must exist');
});

test('file_audit: appendActivityLog creates activity.log and reports_history.csv on success and error', () => {
  const successEntry = {
    timestamp: '2026-10-02T22:00:00.000Z',
    status: 'completed',
    url: 'https://maps.app.goo.gl/sampleSuccessLink',
    email: 'testaccount@gmail.com',
    mode: 'standard',
    reason: 'spam',
    error: null,
    screenshot: 'report_logs/proofs/proof_spam_sample.png'
  };

  const errorEntry = {
    timestamp: '2026-10-02T22:01:00.000Z',
    status: 'failed',
    url: 'https://maps.app.goo.gl/sampleFailLink',
    email: 'badaccount@gmail.com',
    mode: 'standard',
    reason: 'conflict',
    error: 'Google 3-dots button not reachable',
    screenshot: 'report_logs/errors/error_dots_sample.png'
  };

  appendActivityLog(successEntry);
  appendActivityLog(errorEntry);

  const logFile = path.join(REPORT_LOGS_DIR, 'activity.log');
  const csvFile = path.join(REPORT_LOGS_DIR, 'reports_history.csv');

  assert.ok(fs.existsSync(logFile), 'activity.log must exist');
  assert.ok(fs.existsSync(csvFile), 'reports_history.csv must exist');

  const logContent = fs.readFileSync(logFile, 'utf8');
  assert.ok(logContent.includes('[COMPLETED]'), 'activity.log must contain COMPLETED event');
  assert.ok(logContent.includes('sampleSuccessLink'), 'activity.log must contain success URL');
  assert.ok(logContent.includes('[FAILED]'), 'activity.log must contain FAILED event');
  assert.ok(logContent.includes('Google 3-dots button not reachable'), 'activity.log must contain error message');

  const csvContent = fs.readFileSync(csvFile, 'utf8');
  assert.ok(csvContent.startsWith('Timestamp,Status,URL,Email,Mode,Reason,Error,Screenshot'), 'CSV must contain standard headers');
  assert.ok(csvContent.includes('"COMPLETED"'), 'CSV must contain COMPLETED status');
  assert.ok(csvContent.includes('"FAILED"'), 'CSV must contain FAILED status');
  assert.ok(csvContent.includes('"Google 3-dots button not reachable"'), 'CSV must contain escaped error string');
});

test('file_audit: db.recordAuditLog saves to SQLite and persists to files simultaneously', () => {
  const db = new DatabaseService(TEST_DB_PATH);

  const auditRecord = {
    url: 'https://maps.app.goo.gl/dualSavedLink',
    email: 'dual@gmail.com',
    proxy: '1.2.3.4:8080',
    status: 'completed',
    reason: 'offensive',
    mode: 'legal',
    error: null,
    screenshot: 'report_logs/proofs/dual_proof.png',
    timestamp: new Date().toISOString()
  };

  db.recordAuditLog(auditRecord);

  // 1. Verify SQLite record
  const logs = db.getAuditLogs(10);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].url, 'https://maps.app.goo.gl/dualSavedLink');
  assert.strictEqual(logs[0].status, 'completed');
  assert.strictEqual(logs[0].email, 'dual@gmail.com');
  assert.strictEqual(logs[0].mode, 'legal');

  // 2. Verify files record
  const logContent = fs.readFileSync(path.join(REPORT_LOGS_DIR, 'activity.log'), 'utf8');
  assert.ok(logContent.includes('dualSavedLink'), 'activity.log must reflect recordAuditLog call');
});

test('file_audit: handles Error object instances and sanitizes multiline strings', () => {
  const db = new DatabaseService(TEST_DB_PATH);

  const multilineError = new Error('Line 1 Failure\nLine 2 Details\r\nLine 3 Stack');
  db.recordAuditLog({
    url: 'https://maps.app.goo.gl/multilineErrorLink',
    email: 'err@gmail.com',
    status: 'failed',
    error: multilineError,
    screenshot: 'report_logs/errors/multi_err.png'
  });

  const logs = db.getAuditLogs(5);
  const found = logs.find(l => l.url.includes('multilineErrorLink'));
  assert.ok(found, 'Database must record error entry with Error object without crashing');
  assert.ok(found.error.includes('Line 1 Failure'), 'Database must extract error message');

  const logContent = fs.readFileSync(path.join(REPORT_LOGS_DIR, 'activity.log'), 'utf8');
  const matchingLine = logContent.split('\n').find(l => l.includes('multilineErrorLink'));
  assert.ok(matchingLine, 'Log must contain multiline error entry');
  assert.ok(matchingLine.includes('Line 1 Failure Line 2 Details Line 3 Stack'), 'Newlines must be collapsed into single line in activity.log');
});

test('file_audit: getLatestScreenshot returns a valid path', () => {
  const proofPath = getLatestScreenshot('proof');
  assert.ok(typeof proofPath === 'string' && proofPath.includes('proof'), 'Proof screenshot path must be string containing proof');
  const errorPath = getLatestScreenshot('error');
  assert.ok(typeof errorPath === 'string' && errorPath.includes('error'), 'Error screenshot path must be string containing error');
});
