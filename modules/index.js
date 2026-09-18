/**
 * Modules Unified Exporter
 * Groups core domain modules: Browser, Network, Reporter, AI, Auth & Helpers
 */

const { BrowserManager, SessionManager, UserAgentManager } = require('./browser');
const { ProxyManager, parseProxy, formatProxyString } = require('./network');
const { runMapsReporter, DEFAULT_MAPS_URL } = require('./reporter');
const {
  reviewViolationWithGemini,
  extractReviewDetails,
  analyzeReviewWithAI,
  generateLegalNoticeWithAI
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

  // Automation & Reporter
  runMapsReporter,
  DEFAULT_MAPS_URL,

  // Artificial Intelligence
  reviewViolationWithGemini,
  extractReviewDetails,
  analyzeReviewWithAI,
  generateLegalNoticeWithAI,

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
  smartClick: helpers.smartClick
};
