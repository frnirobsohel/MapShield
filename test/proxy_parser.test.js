const test = require('node:test');
const assert = require('node:assert');
const { parseProxy, formatProxyString } = require('../modules/network/proxy_manager');

test('proxy_parser: parses standard IP:PORT format', () => {
  const result = parseProxy('192.168.1.1:8080');
  assert.ok(result, 'Should parse valid proxy string');
  assert.strictEqual(result.host, '192.168.1.1');
  assert.strictEqual(result.port, 8080);
  assert.strictEqual(result.protocol, 'http');
  assert.strictEqual(result.auth, null);
  assert.strictEqual(result.serverUrl, 'http://192.168.1.1:8080');
});

test('proxy_parser: parses 4-part host:port:user:pass format', () => {
  const result = parseProxy('proxy.example.com:9000:myuser:mypass123');
  assert.ok(result);
  assert.strictEqual(result.host, 'proxy.example.com');
  assert.strictEqual(result.port, 9000);
  assert.strictEqual(result.username, 'myuser');
  assert.strictEqual(result.password, 'mypass123');
  assert.deepStrictEqual(result.auth, { username: 'myuser', password: 'mypass123' });
});

test('proxy_parser: parses URL with auth protocol://user:pass@host:port', () => {
  const result = parseProxy('socks5://user1:secretpass@10.0.0.5:1080');
  assert.ok(result);
  assert.strictEqual(result.protocol, 'socks5');
  assert.strictEqual(result.host, '10.0.0.5');
  assert.strictEqual(result.port, 1080);
  assert.strictEqual(result.username, 'user1');
  assert.strictEqual(result.password, 'secretpass');
});

test('proxy_parser: handles proxy objects correctly', () => {
  const proxyObj = {
    host: '1.2.3.4',
    port: '3128',
    username: 'admin',
    password: 'pwd',
    protocol: 'https'
  };
  const result = parseProxy(proxyObj);
  assert.ok(result);
  assert.strictEqual(result.host, '1.2.3.4');
  assert.strictEqual(result.port, 3128);
  assert.strictEqual(result.protocol, 'https');
  assert.strictEqual(result.serverUrl, 'https://1.2.3.4:3128');
});

test('proxy_parser: ignores comments and empty inputs safely', () => {
  assert.strictEqual(parseProxy(''), null);
  assert.strictEqual(parseProxy(null), null);
  assert.strictEqual(parseProxy(undefined), null);
  assert.strictEqual(parseProxy('# this is a comment'), null);
  assert.strictEqual(parseProxy('// another comment'), null);
});

test('proxy_parser: formatProxyString formats with and without auth', () => {
  const withAuth = formatProxyString({
    host: 'proxy.test',
    port: 8080,
    username: 'u',
    password: 'p',
    protocol: 'http'
  });
  assert.strictEqual(withAuth, 'http://u:p@proxy.test:8080');

  const withoutAuth = formatProxyString({
    host: 'proxy.test',
    port: 8080,
    protocol: 'http'
  });
  assert.strictEqual(withoutAuth, 'http://proxy.test:8080');
});
