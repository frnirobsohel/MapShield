/**
 * modules/auth/index.js
 * Master Barrel Export for Authentication Domain
 */

const googleAuth = require('./google_auth');

module.exports = {
  ensureGoogleLoggedIn: googleAuth.ensureGoogleLoggedIn,
  detectCurrentPageStatus: googleAuth.detectCurrentPageStatus,
  isActualBackupCodePage: googleAuth.isActualBackupCodePage,
  isActualTotpPage: googleAuth.isActualTotpPage,
  clickTryAnotherWay: googleAuth.clickTryAnotherWay,
  selectBackupCodeOption: googleAuth.selectBackupCodeOption,
  selectAuthenticatorOption: googleAuth.selectAuthenticatorOption,
  findBackupCodeInput: googleAuth.findBackupCodeInput,
  findTotpInput: googleAuth.findTotpInput,
  handleLandingPageIfPresent: googleAuth.handleLandingPageIfPresent,
  handleGooglePostLoginPrompts: googleAuth.handleGooglePostLoginPrompts,
  naturalBrowseToGmail: googleAuth.naturalBrowseToGmail,
  generateTOTP: googleAuth.generateTOTP,
  isValidSecret: googleAuth.isValidSecret
};
