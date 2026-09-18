const net = require('net');

/**
 * Format a proxy object into a standard URL string
 */
function formatProxyString(p) {
  if (!p) return '';
  const proto = p.protocol || 'http';
  if (p.username && p.password) {
    return `${proto}://${p.username}:${p.password}@${p.host}:${p.port}`;
  }
  return `${proto}://${p.host}:${p.port}`;
}

/**
 * Universal Proxy Parser
 * Handles:
 * - Objects: { host, port, username, password, protocol }
 * - Full URLs: http://user:pass@host:port, socks5://host:port
 * - Standard auth format: user:pass@host:port
 * - 4-part tokens: host:port:user:pass OR user:pass:host:port
 * - 2-part tokens: host:port
 * - Single token: host (default port 8080)
 */
function parseProxy(input) {
  if (!input) return null;

  if (typeof input === 'object' && input !== null) {
    if (input.host && input.port) {
      const protocol = (input.protocol || 'http').replace(':', '');
      const host = String(input.host).trim().replace(/[\[\]]/g, '');
      const port = parseInt(input.port, 10) || 8080;
      const username = input.username ? String(input.username).trim() : '';
      const password = input.password ? String(input.password).trim() : '';
      const formatted = formatProxyString({ protocol, host, port, username, password });
      const serverUrl = `${protocol}://${host}:${port}`;
      const auth = username ? { username, password } : null;
      return { protocol, host, port, username, password, formatted, serverUrl, auth };
    }
    if (input.formatted) {
      return parseProxy(input.formatted);
    }
  }

  if (typeof input === 'string') {
    let raw = input.trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) return null;

    let protocol = 'http';
    if (raw.includes('://')) {
      const parts = raw.split('://');
      protocol = parts[0].toLowerCase();
      raw = parts.slice(1).join('://');
    }

    let host = '';
    let port = 8080;
    let username = '';
    let password = '';

    if (raw.includes('@')) {
      const [authPart, hostPortPart] = raw.split('@');
      const authTokens = authPart.split(':');
      const hpTokens = hostPortPart.split(':');

      if (authTokens.length === 2 && /^\d+$/.test(authTokens[1])) {
        host = authTokens[0];
        port = parseInt(authTokens[1], 10) || 8080;
        username = hpTokens[0] || '';
        password = hpTokens.slice(1).join(':') || '';
      } else {
        username = authTokens[0] || '';
        password = authTokens.slice(1).join(':') || '';
        host = hpTokens[0] || '';
        port = parseInt(hpTokens[1] || '8080', 10) || 8080;
      }
    } else {
      let delimiter = ':';
      if (raw.includes('\t')) delimiter = '\t';
      else if (raw.includes(';') && !raw.includes(':')) delimiter = ';';
      else if (raw.includes(',') && !raw.includes(':')) delimiter = ',';

      const tokens = raw.split(delimiter).map(t => t.trim()).filter(Boolean);

      if (tokens.length >= 4) {
        if (/^\d+$/.test(tokens[1])) {
          host = tokens[0];
          port = parseInt(tokens[1], 10) || 8080;
          username = tokens[2];
          password = tokens.slice(3).join(delimiter);
        } else if (/^\d+$/.test(tokens[3])) {
          username = tokens[0];
          password = tokens[1];
          host = tokens[2];
          port = parseInt(tokens[3], 10) || 8080;
        } else {
          host = tokens[0];
          port = parseInt(tokens[1], 10) || 8080;
          username = tokens[2];
          password = tokens.slice(3).join(delimiter);
        }
      } else if (tokens.length === 3) {
        host = tokens[0];
        port = parseInt(tokens[1], 10) || 8080;
        username = tokens[2];
      } else if (tokens.length === 2) {
        host = tokens[0];
        port = parseInt(tokens[1], 10) || 8080;
      } else if (tokens.length === 1) {
        host = tokens[0];
      }
    }

    host = host.replace(/[\[\]]/g, '').trim();
    if (!host) return null;

    const formatted = formatProxyString({ protocol, host, port, username, password });
    const serverUrl = `${protocol}://${host}:${port}`;
    const auth = username ? { username, password } : null;

    return { protocol, host, port, username, password, formatted, serverUrl, auth };
  }

  return null;
}
class ProxyManager {
  constructor(proxies = []) {
    this.proxies = this._normalizeList(proxies);
    this.currentIndex = 0;
    this.lastUsed = null;
  }

  /**
   * Normalize an array of proxy strings or objects into structured format.
   * @private
   */
  _normalizeList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => parseProxy(item)).filter(Boolean);
  }

  /**
   * Parse a proxy string or object into standard format.
   * @param {string|Object} input
   * @returns {Object|null}
   */
  _parseProxy(input) {
    return parseProxy(input);
  }

  _formatProxyString(p) {
    return formatProxyString(p);
  }

  /**
   * Set or update the proxy pool.
   * @param {Array<string|Object>} proxyList 
   */
  set_proxies(proxyList) {
    this.proxies = this._normalizeList(proxyList);
    this.currentIndex = 0;
  }

  /**
   * Retrieves the next proxy from the pool based on rotation strategy.
   * @param {Array<string|Object>} [customList] Optional ad-hoc proxy list
   * @param {'round_robin'|'random'|'sticky'} [mode='round_robin'] Rotation strategy
   * @returns {Object|null} Normalized proxy object with .formatted URL string
   */
  get_next_proxy(customList = null, mode = 'round_robin') {
    const list = customList ? this._normalizeList(customList) : this.proxies;
    if (!list || list.length === 0) {
      return null;
    }

    if (mode === 'sticky' && this.lastUsed) {
      return this.lastUsed;
    }

    if (mode === 'random') {
      const idx = Math.floor(Math.random() * list.length);
      this.lastUsed = list[idx];
      return this.lastUsed;
    }

    // Default: round_robin
    if (this.currentIndex >= list.length) {
      this.currentIndex = 0;
    }
    const proxy = list[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % list.length;
    this.lastUsed = proxy;
    return proxy;
  }

  /**
   * Tests socket/network reachability and latency of a proxy server.
   * @param {string|Object} proxy Proxy object or string
   * @param {number} [timeoutMs=3500] Timeout in milliseconds
   * @returns {Promise<{ success: boolean, latency: number|string, status: 'active'|'failed', error: string|null, ip?: string }>}
   */
  test_proxy(proxy, timeoutMs = 3500) {
    const parsed = this._parseProxy(proxy);
    if (!parsed || !parsed.host || !parsed.port) {
      return Promise.resolve({
        success: false,
        latency: 'Error',
        status: 'failed',
        error: 'Invalid proxy configuration'
      });
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      let isResolved = false;

      const finish = (success, error = null) => {
        if (isResolved) return;
        isResolved = true;
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({
          success,
          latency: success ? `${latency}ms` : 'Timeout',
          status: success ? 'active' : 'failed',
          error: error ? error.message : null,
          ip: parsed.host
        });
      };

      socket.setTimeout(timeoutMs);

      socket.connect(parsed.port, parsed.host, () => {
        finish(true);
      });

      socket.on('timeout', () => {
        finish(false, new Error(`Connection timed out after ${timeoutMs}ms`));
      });

      socket.on('error', (err) => {
        finish(false, err);
      });
    });
  }
}

ProxyManager.parseProxy = parseProxy;
ProxyManager.formatProxyString = formatProxyString;

module.exports = ProxyManager;
module.exports.parseProxy = parseProxy;
module.exports.formatProxyString = formatProxyString;
