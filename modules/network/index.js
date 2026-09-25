const ProxyManager = require('./proxy_manager');
const { NETWORK_ERROR_PATTERNS, isNetworkError, isPageOffline } = require('./network_guard');

module.exports = {
  ProxyManager,
  parseProxy: ProxyManager.parseProxy,
  formatProxyString: ProxyManager.formatProxyString,
  NETWORK_ERROR_PATTERNS,
  isNetworkError,
  isPageOffline
};
