/**
 * modules/helpers/index.js
 * Master Barrel Export for Shared Helpers
 */

const biometrics = require('./biometrics');
const stealth = require('./stealth');
const domUtils = require('./dom_utils');

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

  // DOM Interactions
  smartClick: domUtils.smartClick,
  clickElementByText: domUtils.clickElementByText,
  clickGoogleNext: domUtils.clickGoogleNext,
  handleConsentIfPresent: domUtils.handleConsentIfPresent
};
