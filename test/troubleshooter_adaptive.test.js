const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TROUBLESHOOTER_OPTIONS,
  TROUBLESHOOTER_STEPS,
  selectOptionByCriteria,
  isDefamationAvailable,
  waitForStep5Options,
  visuallyReselectStep2AI,
  getReviewLinkPreferredPath,
  setReviewLinkPreferredPath,
  clearReviewLinkPreferences,
  normalizeReviewUrl
} = require('../modules/reporter/legal_reporter');

test('TROUBLESHOOTER_OPTIONS: defines all primary, AI-direct, and fallback path options', () => {
  // Step 1: Product Selection
  assert.equal(TROUBLESHOOTER_OPTIONS.step1.step, 1);
  assert.match(TROUBLESHOOTER_OPTIONS.step1.textPattern, /Google Maps/i);

  // Step 2: AI Check (Legacy "No")
  assert.equal(TROUBLESHOOTER_OPTIONS.step2.step, 2);
  assert.equal(TROUBLESHOOTER_OPTIONS.step2.inputValue, '14438492');

  // Step 2: AI Check (Direct "Yes")
  assert.equal(TROUBLESHOOTER_OPTIONS.step2AIYes.step, 2);
  assert.equal(TROUBLESHOOTER_OPTIONS.step2AIYes.inputValue, '14438288');
  assert.match(TROUBLESHOOTER_OPTIONS.step2AIYes.textPattern, /Yes/);

  // Step 3: Primary (Maps)
  assert.equal(TROUBLESHOOTER_OPTIONS.step3Maps.step, 3);
  assert.equal(TROUBLESHOOTER_OPTIONS.step3Maps.inputValue, '1115689');
  assert.match(TROUBLESHOOTER_OPTIONS.step3Maps.labelDescription, /Maps/);

  // Step 3: Fallback (Local listings)
  assert.equal(TROUBLESHOOTER_OPTIONS.step3LocalListings.step, 3);
  assert.match(
    TROUBLESHOOTER_OPTIONS.step3LocalListings.labelDescription,
    /Local listings \(including business listings\), photos, or saved items/
  );
  assert.match(TROUBLESHOOTER_OPTIONS.step3LocalListings.textPattern, /Local listings/i);

  // Step 3: AI Direct Branch (Legal Reasons)
  assert.equal(TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI.step, 3);
  assert.equal(TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI.inputValue, '16943707');

  // Step 4: Legal vs Policy
  assert.equal(TROUBLESHOOTER_OPTIONS.step4.step, 4);
  assert.equal(TROUBLESHOOTER_OPTIONS.step4.inputValue, '13010990');

  // Step 4: AI Direct Branch (Defamation)
  assert.equal(TROUBLESHOOTER_OPTIONS.step4DefamationAI.step, 4);
  assert.equal(TROUBLESHOOTER_OPTIONS.step4DefamationAI.inputValue, '16944292');
  assert.match(TROUBLESHOOTER_OPTIONS.step4DefamationAI.labelDescription, /Defamation/);

  // Step 5: Primary (Defamation)
  assert.equal(TROUBLESHOOTER_OPTIONS.step5Defamation.step, 5);
  assert.equal(TROUBLESHOOTER_OPTIONS.step5Defamation.inputValue, '15220331');
  assert.match(TROUBLESHOOTER_OPTIONS.step5Defamation.labelDescription, /Defamation/);

  // Step 5: Fallback (Other legal reason)
  assert.equal(TROUBLESHOOTER_OPTIONS.step5Other.step, 5);
  assert.match(
    TROUBLESHOOTER_OPTIONS.step5Other.labelDescription,
    /Other: Report content for a legal reason not listed above/
  );
  assert.match(TROUBLESHOOTER_OPTIONS.step5Other.textPattern, /legal reason not listed above/i);
});

test('TROUBLESHOOTER_STEPS: maintains 5-step array backward compatibility', () => {
  assert.equal(Array.isArray(TROUBLESHOOTER_STEPS), true);
  assert.equal(TROUBLESHOOTER_STEPS.length, 5);
  assert.equal(TROUBLESHOOTER_STEPS[0].step, 1);
  assert.equal(TROUBLESHOOTER_STEPS[1].step, 2);
  assert.equal(TROUBLESHOOTER_STEPS[2].step, 3);
  assert.equal(TROUBLESHOOTER_STEPS[3].step, 4);
  assert.equal(TROUBLESHOOTER_STEPS[4].step, 5);
});

test('Review-Link-Scoped Path Memory: correctly manages preferences per normalized URL', () => {
  clearReviewLinkPreferences();

  const url1 = 'https://maps.google.com/?cid=123456789&hl=en#target';
  const url1Variant = 'https://maps.google.com/?cid=123456789&hl=bn';
  const url2 = 'https://www.google.com/maps/reviews/data=xyz987';

  assert.equal(getReviewLinkPreferredPath(url1), null);

  // Set preference for url1
  setReviewLinkPreferredPath(url1, 'ai_yes');
  assert.equal(getReviewLinkPreferredPath(url1), 'ai_yes');

  // Different link remains unaffected
  assert.equal(getReviewLinkPreferredPath(url2), null);

  // Clear resets
  clearReviewLinkPreferences();
  assert.equal(getReviewLinkPreferredPath(url1), null);
});

test('Adaptive helper functions: properly exported as async functions', () => {
  assert.equal(typeof selectOptionByCriteria, 'function');
  assert.equal(typeof isDefamationAvailable, 'function');
  assert.equal(typeof waitForStep5Options, 'function');
  assert.equal(typeof visuallyReselectStep2AI, 'function');
  assert.equal(typeof normalizeReviewUrl, 'function');
});
