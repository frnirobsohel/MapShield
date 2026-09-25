const test = require('node:test');
const assert = require('node:assert/strict');

// Import REASON_CONFIGS mapping to test contract
test('Google RAP Reason Configs: correctly maps all 9 live categories to official rCodes', () => {
  // Expected contract based on live Google Maps RAP HTML
  const EXPECTED_MAPPINGS = {
    offtopic: { rCode: '1', label: 'Off topic' },
    spam: { rCode: '2', label: 'Spam' },
    conflict: { rCode: '3', label: 'Conflict of interest' },
    profanity: { rCode: '4', label: 'Profanity' },
    harmful: { rCode: '5', label: 'Harmful' },
    bullying: { rCode: '6', label: 'Bullying or harassment' },
    discrimination: { rCode: '7', label: 'Discrimination or hate speech' },
    personal_info: { rCode: '8', label: 'Personal information' },
    not_helpful: { rCode: '12', label: 'Not helpful' }
  };

  // Inspect maps_reporter module exports / internal mappings
  const fs = require('fs');
  const code = fs.readFileSync('modules/reporter/maps_reporter.js', 'utf8');

  for (const [key, expected] of Object.entries(EXPECTED_MAPPINGS)) {
    assert.match(code, new RegExp(`${key}:\\s*\\{[^}]*rCode:\\s*['"]${expected.rCode}['"]`), `rCode for ${key} must be ${expected.rCode}`);
    assert.match(code, new RegExp(`label:\\s*['"]${expected.label}['"]`), `label for ${key} must be ${expected.label}`);
  }
});

test('Google RAP Link Regex: accurately isolates exact rCode parameter', () => {
  const testHref = '/local/content/rap/report/submit?t=1&postId=ChZDSUhNMG9nS0VJQ0FnSUNJXzdfSmVBEAE&r=2&d=286732320';
  
  // Test matching r=2
  const isMatchSpam = new RegExp(`[?&]r=2(?:&|$)`).test(testHref);
  assert.equal(isMatchSpam, true, 'r=2 must match in RAP submit URL');

  // Ensure r=1 or r=12 does not false-match r=2
  const isMatchConflict = new RegExp(`[?&]r=1(?:&|$)`).test(testHref);
  assert.equal(isMatchConflict, false, 'r=1 must NOT match when r=2 is present');

  const testHrefNotHelpful = '/local/content/rap/report/submit?t=1&postId=ChZDSUhNMG9nS0VJQ0FnSUNJXzdfSmVBEAE&r=12&d=286732320';
  const isMatch12 = new RegExp(`[?&]r=12(?:&|$)`).test(testHrefNotHelpful);
  assert.equal(isMatch12, true, 'r=12 must match accurately');

  const isFalseMatch1 = new RegExp(`[?&]r=1(?:&|$)`).test(testHrefNotHelpful);
  assert.equal(isFalseMatch1, false, 'r=1 must NOT match against r=12');
});

test('Google RAP Submit Button Selectors: accurately target live RAP submit button', () => {
  const code = require('fs').readFileSync('modules/reporter/maps_reporter.js', 'utf8');

  // Verify exact jsname and class targeting
  assert.match(code, /button\[jsname="haV7P"\],\s*\.mhBSmf\s+button/);
  assert.match(code, /span\.VfPpkd-vQzf8d/);
});

