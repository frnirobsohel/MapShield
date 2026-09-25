const { runMapsReporter, DEFAULT_MAPS_URL } = require('./maps_reporter');
const {
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
  formatCleanHumanName,
  deduplicateWords
} = require('./legal_reporter');

module.exports = {
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
  formatCleanHumanName,
  deduplicateWords
};
