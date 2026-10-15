/**
 * modules/helpers/index.js
 * Master Barrel Export for Shared Helpers
 */

const biometrics = require('./biometrics');
const stealth = require('./stealth');
const domUtils = require('./dom_utils');
const domObserver = require('./dom_observer');
const screenshotPaths = require('./screenshot_paths');
const cryptoUtils = require('./crypto_utils');
const jobTiming = require('./job_timing');

module.exports = {
  // Biometrics & Human Dynamics
  sleep: biometrics.sleep,
  gaussianRandom: biometrics.gaussianRandom,
  randomBetween: biometrics.randomBetween,
  humanScroll: biometrics.humanScroll,
  humanWanderMouse: biometrics.humanWanderMouse,
  naturalKeyPress: biometrics.naturalKeyPress,
  humanType: biometrics.humanType,
  QWERTY_NEIGHBORS: biometrics.QWERTY_NEIGHBORS,
  SHIFT_CHARS: biometrics.SHIFT_CHARS,

  // Deep Stealth Camouflage
  applyDeepStealth: stealth.applyDeepStealth,
  attachDialogAutoHandler: stealth.attachDialogAutoHandler,

  // DOM Interactions & Actionability Engine
  smartClick: domUtils.smartClick,
  clickElementByText: domUtils.clickElementByText,
  clickGoogleNext: domUtils.clickGoogleNext,
  handleConsentIfPresent: domUtils.handleConsentIfPresent,
  detectPageAnomaly: domObserver.detectPageAnomaly,
  isElementActionable: domObserver.isElementActionable,
  waitForActionableElement: domObserver.waitForActionableElement,
  waitForPageOrTabTransition: domObserver.waitForPageOrTabTransition,
  waitForTroubleshooterQuestion: domObserver.waitForTroubleshooterQuestion,

  // Screenshot & Report Logs Manager
  screenshotPaths,
  captureProofScreenshot: screenshotPaths.captureProofScreenshot,
  captureErrorScreenshot: screenshotPaths.captureErrorScreenshot,
  getProofScreenshotPath: screenshotPaths.getProofScreenshotPath,
  getErrorScreenshotPath: screenshotPaths.getErrorScreenshotPath,
  appendActivityLog: screenshotPaths.appendActivityLog,
  getLatestScreenshot: screenshotPaths.getLatestScreenshot,
  REPORT_LOGS_DIR: screenshotPaths.REPORT_LOGS_DIR,
  PROJECT_REPORT_LOGS_DIR: screenshotPaths.PROJECT_REPORT_LOGS_DIR,
  PROOFS_DIR: screenshotPaths.PROOFS_DIR,
  ERRORS_DIR: screenshotPaths.ERRORS_DIR,

  // Crypto Utilities
  encrypt: cryptoUtils.encrypt,
  decrypt: cryptoUtils.decrypt,
  isEncrypted: cryptoUtils.isEncrypted,

  // Job timing (cooldown / success hold)
  resolveJobCooldownMs: jobTiming.resolveJobCooldownMs,
  resolveSuccessHoldMs: jobTiming.resolveSuccessHoldMs
};

