const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TROUBLESHOOTER_OPTIONS,
  formatCleanHumanName,
  getReviewLinkPreferredPath,
  setReviewLinkPreferredPath,
  clearReviewLinkPreferences
} = require('../modules/reporter/legal_reporter');

// Mock DOM State Simulator for Google Troubleshooter Flow
class MockGoogleTroubleshooterDOM {
  constructor(scenario) {
    this.scenario = scenario; // 'defamation_under_maps' | 'defamation_under_local_listings' | 'defamation_under_ai_yes' | 'only_other_available'
    this.currentStep3Selection = null;
    this.currentAISelection = 'No';
    this.selectedOptions = [];
    this.questionsAnswered = {};
  }

  // Simulates selectOptionByCriteria behavior in DOM
  selectOption(criteria) {
    const { name, inputName, inputValue, textPattern, labelDescription } = criteria;
    const optionDesc = labelDescription || textPattern || inputValue;

    // Track AI Check selection
    if (textPattern && textPattern.includes('Yes') && !textPattern.includes('No')) {
      this.currentAISelection = 'Yes';
    } else if (textPattern && textPattern.includes('No')) {
      this.currentAISelection = 'No';
    }

    // Track Step 3 changes
    if (textPattern && textPattern.includes('Maps') && !textPattern.includes('Google Maps')) {
      this.currentStep3Selection = 'Maps';
    } else if (textPattern && textPattern.includes('Local listings')) {
      this.currentStep3Selection = 'Local listings';
    }

    this.selectedOptions.push({
      step: criteria.step,
      desc: optionDesc,
      inputName,
      inputValue
    });

    return true;
  }

  // Simulates isDefamationAvailable in DOM
  isDefamationAvailable() {
    if (this.currentAISelection === 'Yes') {
      return this.scenario === 'defamation_under_ai_yes';
    }
    if (this.currentStep3Selection === 'Maps') {
      return this.scenario === 'defamation_under_maps';
    }
    if (this.currentStep3Selection === 'Local listings') {
      return this.scenario === 'defamation_under_maps' || this.scenario === 'defamation_under_local_listings';
    }
    return false;
  }

  // Executes the exact walkthrough logic from legal_reporter.js with reviewUrl link memory
  runAdaptiveWorkflow(reviewUrl = '') {
    const preferredPath = getReviewLinkPreferredPath(reviewUrl);

    // If this specific review link previously verified AI="Yes", take direct path
    if (preferredPath === 'ai_yes') {
      this.selectOption(TROUBLESHOOTER_OPTIONS.step1);
      this.selectOption(TROUBLESHOOTER_OPTIONS.step2AIYes);
      this.selectOption(TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI);
      this.selectOption(TROUBLESHOOTER_OPTIONS.step4DefamationAI);
      return this.selectedOptions;
    }

    // 1. Step 1: Product Selection
    this.selectOption(TROUBLESHOOTER_OPTIONS.step1);

    // 2. Step 2: AI Generated Content Check (No)
    this.selectOption(TROUBLESHOOTER_OPTIONS.step2);

    // 3. Step 3: Primary selection "Maps"
    this.selectOption(TROUBLESHOOTER_OPTIONS.step3Maps);

    // 4. Step 4: Legal Reasons
    this.selectOption(TROUBLESHOOTER_OPTIONS.step4);

    // 5. Step 5 Check
    let defAvail = this.isDefamationAvailable();
    if (defAvail) {
      this.selectOption(TROUBLESHOOTER_OPTIONS.step5Defamation);
    } else {
      // Visual Reselection: If scenario has defamation under AI="Yes", reselect Step 2
      if (this.scenario === 'defamation_under_ai_yes') {
        this.selectOption(TROUBLESHOOTER_OPTIONS.step2AIYes);
        this.selectOption(TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI);
        this.selectOption(TROUBLESHOOTER_OPTIONS.step4DefamationAI);
        if (reviewUrl) {
          setReviewLinkPreferredPath(reviewUrl, 'ai_yes');
        }
      } else {
        // Fallback: switch Step 3 to Local listings
        this.selectOption(TROUBLESHOOTER_OPTIONS.step3LocalListings);
        this.selectOption(TROUBLESHOOTER_OPTIONS.step4);
        defAvail = this.isDefamationAvailable();
        if (defAvail) {
          this.selectOption(TROUBLESHOOTER_OPTIONS.step5Defamation);
        } else {
          this.selectOption(TROUBLESHOOTER_OPTIONS.step5Other);
        }
      }
    }

    return this.selectedOptions;
  }
}

test('Adaptive Fallback - Scenario 1: Defamation is available under Maps', () => {
  const dom = new MockGoogleTroubleshooterDOM('defamation_under_maps');
  const path = dom.runAdaptiveWorkflow();

  const selectedDescriptions = path.map(p => p.desc);
  assert.equal(selectedDescriptions[0], 'Google Maps, Waze and related products');
  assert.equal(selectedDescriptions[1], 'No');
  assert.equal(selectedDescriptions[2], 'Maps');
  assert.equal(selectedDescriptions[3], 'Legal Reasons to Report Content');
  assert.equal(selectedDescriptions[4], 'Defamation: Report content that defames you or your business');

  // Should NOT have triggered fallback
  assert.equal(selectedDescriptions.includes('Local listings (including business listings), photos, or saved items'), false);
});

test('Adaptive Fallback - Scenario 2: Defamation NOT under Maps, but found under Local listings', () => {
  const dom = new MockGoogleTroubleshooterDOM('defamation_under_local_listings');
  const path = dom.runAdaptiveWorkflow();

  const selectedDescriptions = path.map(p => p.desc);
  assert.equal(selectedDescriptions[0], 'Google Maps, Waze and related products');
  assert.equal(selectedDescriptions[1], 'No');
  assert.equal(selectedDescriptions[2], 'Maps');
  assert.equal(selectedDescriptions[3], 'Legal Reasons to Report Content');

  // Fallback executed!
  assert.equal(selectedDescriptions[4], 'Local listings (including business listings), photos, or saved items');
  assert.equal(selectedDescriptions[5], 'Legal Reasons to Report Content');
  assert.equal(selectedDescriptions[6], 'Defamation: Report content that defames you or your business');
});

test('Adaptive Fallback - Scenario 3: Defamation NOT available anywhere -> Falls back to Other Legal Reason', () => {
  const dom = new MockGoogleTroubleshooterDOM('only_other_available');
  const path = dom.runAdaptiveWorkflow();

  const selectedDescriptions = path.map(p => p.desc);
  assert.equal(selectedDescriptions[0], 'Google Maps, Waze and related products');
  assert.equal(selectedDescriptions[1], 'No');
  assert.equal(selectedDescriptions[2], 'Maps');
  assert.equal(selectedDescriptions[3], 'Legal Reasons to Report Content');

  // Fallback to Local listings
  assert.equal(selectedDescriptions[4], 'Local listings (including business listings), photos, or saved items');
  assert.equal(selectedDescriptions[5], 'Legal Reasons to Report Content');

  // Fallback to Other
  assert.equal(
    selectedDescriptions[6],
    'Other: Report content for a legal reason not listed above (for example, content violating local anti-terrorism or hate speech laws)'
  );
});

test('Adaptive Reselection & Link Memory - Scenario 4 & 5: Multi-account same-link learning', () => {
  clearReviewLinkPreferences();
  const targetReviewUrl = 'https://maps.google.com/review/123456';

  // Account 1: Starts on No, hits missing Defamation, visually reselects Step 2 "Yes"
  const account1DOM = new MockGoogleTroubleshooterDOM('defamation_under_ai_yes');
  const path1 = account1DOM.runAdaptiveWorkflow(targetReviewUrl);

  const desc1 = path1.map(p => p.desc);
  // Visually went through initial steps
  assert.equal(desc1[0], 'Google Maps, Waze and related products');
  assert.equal(desc1[1], 'No');
  assert.equal(desc1[2], 'Maps');
  assert.equal(desc1[3], 'Legal Reasons to Report Content');

  // Reselected to AI="Yes" path
  assert.equal(desc1[4], 'Yes (AI Generated Content Check)');
  assert.equal(desc1[5], 'Legal Reasons to Report Content');
  assert.equal(desc1[6], 'Defamation: Report content that defames you or your business/organization');

  // Link preference should now be saved for targetReviewUrl
  assert.equal(getReviewLinkPreferredPath(targetReviewUrl), 'ai_yes');

  // Account 2 on SAME review link: Directly takes AI="Yes" path in 1 pass!
  const account2DOM = new MockGoogleTroubleshooterDOM('defamation_under_ai_yes');
  const path2 = account2DOM.runAdaptiveWorkflow(targetReviewUrl);

  const desc2 = path2.map(p => p.desc);
  assert.equal(desc2.length, 4); // Exactly 4 clean steps!
  assert.equal(desc2[0], 'Google Maps, Waze and related products');
  assert.equal(desc2[1], 'Yes (AI Generated Content Check)');
  assert.equal(desc2[2], 'Legal Reasons to Report Content');
  assert.equal(desc2[3], 'Defamation: Report content that defames you or your business/organization');

  // Different link (Link 3) does NOT inherit Link 1's preference
  const differentReviewUrl = 'https://maps.google.com/review/999888';
  assert.equal(getReviewLinkPreferredPath(differentReviewUrl), null);
});
