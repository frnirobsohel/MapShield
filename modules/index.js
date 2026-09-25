/**
 * Modules Unified Exporter
 * Groups core domain modules: Browser, Network, Reporter, AI, Auth & Helpers
 */

const { BrowserManager, SessionManager, UserAgentManager } = require('./browser');
const {
  ProxyManager,
  parseProxy,
  formatProxyString,
  NETWORK_ERROR_PATTERNS,
  isNetworkError,
  isPageOffline
} = require('./network');
const {
  runMapsReporter,
  DEFAULT_MAPS_URL,
  walkthroughTroubleshooter,
  visuallyReselectStep2AI,
  getReviewLinkPreferredPath,
  setReviewLinkPreferredPath,
  clearReviewLinkPreferences,
  normalizeReviewUrl,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS,
  TROUBLESHOOTER_OPTIONS
} = require('./reporter');
const {
  reviewViolationWithGemini,
  extractReviewDetails,
  analyzeReviewWithAI,
  analyzeReviewMultiCategoriesWithAI,
  generateLegalNoticeWithAI,
  buildPrompt,
  buildMultiCategoryPrompt
} = require('./ai');
const auth = require('./auth');
const helpers = require('./helpers');

module.exports = {
  // Browser & Profile Lifecycle
  BrowserManager,
  SessionManager,
  UserAgentManager,

  // Network & Proxies
  ProxyManager,
  parseProxy,
  formatProxyString,
  NETWORK_ERROR_PATTERNS,
  isNetworkError,
  isPageOffline,

  // Automation & Reporter
  runMapsReporter,
  DEFAULT_MAPS_URL,
  walkthroughTroubleshooter,
  visuallyReselectStep2AI,
  getReviewLinkPreferredPath,
  setReviewLinkPreferredPath,
  clearReviewLinkPreferences,
  normalizeReviewUrl,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS,
  TROUBLESHOOTER_OPTIONS,

  // Artificial Intelligence
  reviewViolationWithGemini,
  extractReviewDetails,
  analyzeReviewWithAI,
  analyzeReviewMultiCategoriesWithAI,
  generateLegalNoticeWithAI,
  buildPrompt,
  buildMultiCategoryPrompt,

  // Authentication & 2FA
  auth,
  ensureGoogleLoggedIn: auth.ensureGoogleLoggedIn,

  // Shared Biometric, Stealth & DOM Helpers
  helpers,
  sleep: helpers.sleep,
  gaussianRandom: helpers.gaussianRandom,
  randomBetween: helpers.randomBetween,
  humanScroll: helpers.humanScroll,
  humanWanderMouse: helpers.humanWanderMouse,
  humanType: helpers.humanType,
  applyDeepStealth: helpers.applyDeepStealth,
  attachDialogAutoHandler: helpers.attachDialogAutoHandler,
  smartClick: helpers.smartClick,
  detectPageAnomaly: helpers.detectPageAnomaly,
  isElementActionable: helpers.isElementActionable,
  waitForActionableElement: helpers.waitForActionableElement,
  waitForPageOrTabTransition: helpers.waitForPageOrTabTransition,
  waitForTroubleshooterQuestion: helpers.waitForTroubleshooterQuestion,

  // Screenshot & Report Logs
  captureProofScreenshot: helpers.captureProofScreenshot,
  captureErrorScreenshot: helpers.captureErrorScreenshot,
  screenshotPaths: helpers.screenshotPaths
};
