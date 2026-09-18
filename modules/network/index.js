const ProxyManager = require('./proxy_manager');

module.exports = {
  ProxyManager,
  parseProxy: ProxyManager.parseProxy,
  formatProxyString: ProxyManager.formatProxyString
};
