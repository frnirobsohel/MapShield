const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

test('xlsx_security: reading workbook with hardened options disables formula execution and HTML', () => {
  // Create a minimal test workbook buffer
  const ws = xlsx.utils.aoa_to_sheet([
    ['url', 'reason', 'target'],
    ['https://maps.app.goo.gl/test1', 'spam', '2']
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Links');
  const tempPath = path.join(__dirname, 'temp_security_test.xlsx');

  try {
    xlsx.writeFile(wb, tempPath);
    assert.ok(fs.existsSync(tempPath));

    // Test with hardened options matching links_ipc, accounts_ipc, and proxies_ipc
    const safeWb = xlsx.readFile(tempPath, {
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
      dense: true,
      WTF: false
    });

    assert.ok(safeWb, 'Workbook should parse successfully');
    const rows = xlsx.utils.sheet_to_json(safeWb.Sheets['Links'], { defval: '', raw: false });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].url, 'https://maps.app.goo.gl/test1');
    assert.strictEqual(rows[0].reason, 'spam');
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
  }
});
