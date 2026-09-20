const { runMapsReporter, DEFAULT_MAPS_URL } = require('./maps_reporter');
const {
  walkthroughTroubleshooter,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS
} = require('./legal_reporter');

module.exports = {
  runMapsReporter,
  DEFAULT_MAPS_URL,
  walkthroughTroubleshooter,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS
};
