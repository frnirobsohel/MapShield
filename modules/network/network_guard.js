/**
 * modules/network/network_guard.js
 * Comprehensive Network Offline / DNS Disconnection Detector
 * Detects Chrome offline errors, dinosaur page markers, and network drops
 */

const NETWORK_ERROR_PATTERNS = [
  'DNS_PROBE_FINISHED_NO_INTERNET',
  'DNS_PROBE_FINISHED_BAD_CONFIG',
  'DNS_PROBE_FINISHED_NXDOMAIN',
  'DNS_PROBE_STARTED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_NAME_RESOLUTION_FAILED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_ABORTED',
  'ERR_NETWORK_CHANGED',
  'ERR_ADDRESS_UNREACHABLE',
  'ERR_ADDRESS_INVALID',
  'ERR_NETWORK_ACCESS_DENIED',
  'ERR_PROXY_CONNECTION_FAILED',
  'ERR_TUNNEL_CONNECTION_FAILED',
  'ERR_TIMED_OUT',
  'ERR_SOCKS_CONNECTION_FAILED',
  'ERR_PROXY_AUTH_REQUESTED',
  'Navigation timeout',
  'net::ERR_',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'Press space to play',
  'chrome-error://'
];

/**
 * Checks if an error object or error string indicates network disconnection/failure
 * @param {Error|string} err
 * @returns {boolean}
 */
function isNetworkError(err) {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  const upper = msg.toUpperCase();
  return NETWORK_ERROR_PATTERNS.some(p => upper.includes(p.toUpperCase()));
}

/**
 * Checks if a Puppeteer page has navigated to Chrome error or dinosaur offline screen
 * @param {Object} page Puppeteer / Rebrowser page
 * @returns {Promise<boolean>}
 */
async function isPageOffline(page) {
  if (!page) return false;
  try {
    const url = page.url() || '';
    if (url.startsWith('chrome-error://') || url.includes('chromewebdata')) {
      return true;
    }
    const offlineFound = await page.evaluate(() => {
      const text = (document.body ? document.body.innerText : '') || '';
      return (
        text.includes('DNS_PROBE_FINISHED_NO_INTERNET') ||
        text.includes('ERR_INTERNET_DISCONNECTED') ||
        text.includes('Press space to play') ||
        text.includes('Checking the network cables') ||
        text.includes('No internet')
      );
    }).catch(() => false);
    return Boolean(offlineFound);
  } catch (e) {
    return false;
  }
}

module.exports = {
  NETWORK_ERROR_PATTERNS,
  isNetworkError,
  isPageOffline
};
