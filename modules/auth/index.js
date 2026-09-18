/**
 * modules/auth/index.js
 * Master Barrel Export for Authentication Domain
 */

const googleAuth = require('./google_auth');

module.exports = {
  ensureGoogleLoggedIn: googleAuth.ensureGoogleLoggedIn,
  detectCurrentPageStatus: googleAuth.detectCurrentPageStatus,
  isActualBackupCodePage: googleAuth.isActualBackupCodePage,
  clickTryAnotherWay: googleAuth.clickTryAnotherWay,
  selectBackupCodeOption: googleAuth.selectBackupCodeOption,
  findBackupCodeInput: googleAuth.findBackupCodeInput,
  handleLandingPageIfPresent: googleAuth.handleLandingPageIfPresent,
  handleGooglePostLoginPrompts: googleAuth.handleGooglePostLoginPrompts,
  naturalBrowseToGmail: googleAuth.naturalBrowseToGmail
};
