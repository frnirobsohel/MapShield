const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectPageAnomaly,
  isElementActionable,
  waitForActionableElement,
  waitForPageOrTabTransition,
  waitForTroubleshooterQuestion
} = require('../modules/helpers/dom_observer');

test('detectPageAnomaly: detects Chrome offline error URL', async () => {
  const mockPage = {
    url: () => 'chrome-error://chromewebdata/',
    evaluate: async () => null
  };
  const result = await detectPageAnomaly(mockPage);
  assert.equal(result.isAnomaly, true);
  assert.equal(result.type, 'OFFLINE');
  assert.match(result.message, /offline/i);
});

test('detectPageAnomaly: detects Google Unusual Traffic /sorry/index page', async () => {
  const mockPage = {
    url: () => 'https://www.google.com/sorry/index?continue=https://maps.google.com',
    evaluate: async () => null
  };
  const result = await detectPageAnomaly(mockPage);
  assert.equal(result.isAnomaly, true);
  assert.equal(result.type, 'CAPTCHA');
  assert.match(result.message, /CAPTCHA/i);
});

test('detectPageAnomaly: detects Google Account Challenge / Verification required', async () => {
  const mockPage = {
    url: () => 'https://accounts.google.com/signin/v2/challenge/pwd?TL=...',
    evaluate: async () => null
  };
  const result = await detectPageAnomaly(mockPage);
  assert.equal(result.isAnomaly, true);
  assert.equal(result.type, 'SECURITY_CHALLENGE');
  assert.match(result.message, /Challenge/i);
});

test('detectPageAnomaly: detects in-page DOM CAPTCHA iframe', async () => {
  const mockPage = {
    url: () => 'https://support.google.com/legal/troubleshooter/1114905',
    evaluate: async (fn) => {
      // Simulate DOM check inside page.evaluate
      return { isAnomaly: true, type: 'CAPTCHA', message: 'CAPTCHA challenge iframe is present in DOM' };
    }
  };
  const result = await detectPageAnomaly(mockPage);
  assert.equal(result.isAnomaly, true);
  assert.equal(result.type, 'CAPTCHA');
});

test('detectPageAnomaly: returns clean result for normal responsive page', async () => {
  const mockPage = {
    url: () => 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7',
    evaluate: async () => null
  };
  const result = await detectPageAnomaly(mockPage);
  assert.equal(result.isAnomaly, false);
  assert.equal(result.type, null);
  assert.equal(result.message, null);
});

test('detectPageAnomaly: handles null or broken page object safely', async () => {
  assert.equal((await detectPageAnomaly(null)).isAnomaly, false);
  assert.equal((await detectPageAnomaly({})).isAnomaly, false);
});

test('isElementActionable: rejects null or undefined handles', async () => {
  const mockPage = { evaluate: async () => true };
  assert.equal(await isElementActionable(mockPage, null), false);
  assert.equal(await isElementActionable(mockPage, undefined), false);
});

test('isElementActionable: delegates DOM validation to page.evaluate', async () => {
  const mockHandle = {};
  const mockPagePass = {
    evaluate: async (fn, handle) => true
  };
  assert.equal(await isElementActionable(mockPagePass, mockHandle), true);

  const mockPageFail = {
    evaluate: async (fn, handle) => false
  };
  assert.equal(await isElementActionable(mockPageFail, mockHandle), false);
});

test('waitForActionableElement: immediately returns element when already actionable', async () => {
  const mockHandle = { id: 'test-btn' };
  const mockPage = {
    url: () => 'https://maps.google.com',
    $: async (selector) => mockHandle,
    evaluate: async () => true
  };

  const result = await waitForActionableElement(mockPage, 'button.action-btn', {
    timeout: 1000,
    pollInterval: 50,
    checkAnomaly: false
  });

  assert.equal(result, mockHandle);
});

test('waitForActionableElement: polls and returns element when it becomes actionable after delay', async () => {
  const mockHandle = { id: 'delayed-btn' };
  let attempts = 0;
  const mockPage = {
    url: () => 'https://maps.google.com',
    $: async (selector) => {
      attempts++;
      return attempts >= 3 ? mockHandle : null;
    },
    evaluate: async () => true
  };

  const result = await waitForActionableElement(mockPage, 'button.delayed', {
    timeout: 2000,
    pollInterval: 50,
    checkAnomaly: false
  });

  assert.equal(result, mockHandle);
  assert.ok(attempts >= 3);
});

test('waitForActionableElement: times out and returns null when element is absent', async () => {
  const mockPage = {
    url: () => 'https://maps.google.com',
    $: async () => null,
    evaluate: async () => null
  };

  const result = await waitForActionableElement(mockPage, 'button.non-existent', {
    timeout: 200,
    pollInterval: 50,
    checkAnomaly: false
  });

  assert.equal(result, null);
});

test('waitForActionableElement: halts execution when severe CAPTCHA anomaly is detected', async () => {
  const mockPage = {
    url: () => 'https://www.google.com/sorry/index',
    $: async () => null,
    evaluate: async () => null
  };

  await assert.rejects(
    async () => {
      await waitForActionableElement(mockPage, 'button.action-btn', {
        timeout: 1000,
        pollInterval: 50,
        checkAnomaly: true
      });
    },
    /Execution halted: Google Unusual Traffic \/ CAPTCHA page detected/
  );
});

test('waitForPageOrTabTransition: matches target on active page when already completed', async () => {
  const mockActivePage = {
    url: () => 'https://reportcontent.google.com/forms/sample',
    evaluate: async () => true,
    bringToFront: async () => {}
  };

  const mockBrowser = {
    pages: async () => [mockActivePage]
  };

  const result = await waitForPageOrTabTransition(mockBrowser, mockActivePage, ['reportcontent.google.com'], {
    timeout: 1000
  });

  assert.equal(result, mockActivePage);
});

test('waitForPageOrTabTransition: switches to newly detected tab matching target pattern', async () => {
  const mockInitialPage = {
    url: () => 'https://support.google.com/legal/troubleshooter/1114905',
    evaluate: async () => true,
    bringToFront: async () => {}
  };

  const mockNewLegalTab = {
    url: () => 'https://reportcontent.google.com/forms/legal_other',
    evaluate: async () => true,
    bringToFront: async () => {}
  };

  let pageQueryCount = 0;
  const mockBrowser = {
    pages: async () => {
      pageQueryCount++;
      return pageQueryCount >= 2 ? [mockInitialPage, mockNewLegalTab] : [mockInitialPage];
    }
  };

  const result = await waitForPageOrTabTransition(mockBrowser, mockInitialPage, ['reportcontent.google.com'], {
    timeout: 2000
  });

  assert.equal(result, mockNewLegalTab);
});

test('waitForPageOrTabTransition: safely evaluates custom predicate functions', async () => {
  const mockInitialPage = {
    url: () => 'https://support.google.com/legal/troubleshooter/1114905',
    evaluate: async () => true,
    bringToFront: async () => {}
  };

  const mockNewLegalTab = {
    url: () => 'https://reportcontent.google.com/contact/lr_legalother',
    evaluate: async () => true,
    bringToFront: async () => {}
  };

  const mockBrowser = {
    pages: async () => [mockInitialPage, mockNewLegalTab]
  };

  const customPredicate = (p) => p.url().includes('lr_legalother');

  const result = await waitForPageOrTabTransition(mockBrowser, mockInitialPage, [customPredicate], {
    timeout: 1000
  });

  assert.equal(result, mockNewLegalTab);
});

test('waitForTroubleshooterQuestion: verifies criteria and returns true when actionable', async () => {
  const mockHandle = { id: 'radio-option' };
  const mockPage = {
    url: () => 'https://support.google.com/legal/troubleshooter/1114905',
    $: async (sel) => mockHandle,
    evaluate: async () => 'READY',
    evaluateHandle: async () => ({ asElement: () => mockHandle })
  };

  const criteria = {
    inputName: '1620659',
    inputValue: '9723198',
    labelDescription: 'Google Maps, Waze and related products'
  };

  const ready = await waitForTroubleshooterQuestion(mockPage, criteria, { timeout: 1000 });
  assert.equal(ready, true);
});

test('isElementActionable: accepts element when ripple or touch overlay belongs to same container', async () => {
  const mockHandle = { id: 'rap-option-link' };
  const mockPage = {
    evaluate: async (fn, handle) => {
      // Simulate DOM element actionability check passing with Material ripple overlay
      return true;
    }
  };

  const actionable = await isElementActionable(mockPage, mockHandle);
  assert.equal(actionable, true);
});
