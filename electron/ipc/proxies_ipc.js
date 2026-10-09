/**
 * electron/ipc/proxies_ipc.js
 * IPC Controller for Proxies (Import, Parse, Latency Testing, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const crypto = require('crypto');

function parseProxyLine(rawLine) {
  let line = (rawLine || '').trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) return null;

  let protocol = 'http';
  let host = '';
  let port = 8080;
  let username = '';
  let password = '';

  if (line.includes('://')) {
    const parts = line.split('://');
    protocol = parts[0].toLowerCase();
    line = parts.slice(1).join('://');
  }

  if (line.includes('@')) {
    const atParts = line.split('@');
    const p0 = atParts[0].split(':');
    const p1 = atParts[1].split(':');

    if (p0.length === 2 && /^\d+$/.test(p0[1])) {
      host = p0[0];
      port = parseInt(p0[1], 10) || 8080;
      username = p1[0] || '';
      password = p1.slice(1).join(':') || '';
    } else {
      username = p0[0] || '';
      password = p0.slice(1).join(':') || '';
      host = p1[0] || '';
      port = parseInt(p1[1], 10) || 8080;
    }
  } else {
    let delimiter = ':';
    if (line.includes('\t')) delimiter = '\t';
    else if (line.includes(';') && !line.includes(':')) delimiter = ';';
    else if (line.includes(',') && !line.includes(':')) delimiter = ',';

    const tokens = line.split(delimiter).map(t => t.trim()).filter(Boolean);

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

  const u = (username || '').trim();
  const pwd = (password || '').trim();
  const formattedStr = (u && pwd)
    ? `${protocol || 'http'}://${u}:${pwd}@${host}:${Number(port) || 8080}`
    : `${host}:${Number(port) || 8080}`;

  return {
    id: 'prx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    protocol: protocol || 'http',
    host: host,
    port: Number(port) || 8080,
    username: u,
    password: pwd,
    formatted: formattedStr,
    latency: '—',
    status: 'untested',
    lastTested: null
  };
}

function testProxyPing(proxyOrHost, portOrTimeout = 3500, timeoutMs = 3500) {
  let host = '';
  let port = 8080;
  let protocol = 'http';
  let username = '';
  let password = '';
  let timeout = timeoutMs;

  if (typeof proxyOrHost === 'object' && proxyOrHost !== null) {
    host = String(proxyOrHost.host || '').trim();
    port = parseInt(proxyOrHost.port, 10) || 8080;
    protocol = String(proxyOrHost.protocol || 'http').toLowerCase();
    username = proxyOrHost.username || '';
    password = proxyOrHost.password || '';
    timeout = typeof portOrTimeout === 'number' ? portOrTimeout : timeoutMs;
  } else {
    host = String(proxyOrHost || '').trim();
    port = parseInt(portOrTimeout, 10) || 8080;
    timeout = timeoutMs;
  }

  return new Promise((resolve) => {
    const start = Date.now();

    // 1. Initial TCP Socket verification to ensure port is open
    const socket = new net.Socket();
    let socketFinished = false;
    socket.setTimeout(Math.min(timeout, 2500));

    socket.on('connect', () => {
      const tcpLatency = Date.now() - start;
      socket.destroy();
      if (socketFinished) return;
      socketFinished = true;

      // For SOCKS or non-HTTP proxies, TCP ping with protocol confirmation is ready
      if (protocol.startsWith('socks')) {
        return resolve({ success: true, latency: `${tcpLatency}ms`, status: 'ready' });
      }

      // 2. For HTTP/HTTPS proxies: verify actual proxy request & authentication
      const reqHeaders = {
        'Host': 'www.google.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      if (username || password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        reqHeaders['Proxy-Authorization'] = `Basic ${auth}`;
      }

      let httpFinished = false;
      const req = http.request({
        host: host,
        port: port,
        method: 'GET',
        path: 'http://www.google.com/generate_204',
        headers: reqHeaders,
        timeout: Math.max(1500, timeout - tcpLatency)
      }, (res) => {
        const totalMs = Date.now() - start;
        if (httpFinished) return;
        httpFinished = true;

        if (res.statusCode === 204 || (res.statusCode >= 200 && res.statusCode < 400)) {
          resolve({ success: true, latency: `${totalMs}ms`, status: 'ready' });
        } else if (res.statusCode === 407) {
          resolve({ success: false, latency: `${totalMs}ms`, status: 'failed', error: '407 Auth Required (Invalid credentials)' });
        } else {
          resolve({ success: false, latency: `${totalMs}ms`, status: 'failed', error: `HTTP ${res.statusCode} from proxy` });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (!httpFinished) {
          httpFinished = true;
          resolve({
            success: false,
            latency: `${tcpLatency}ms`,
            status: 'failed',
            error: 'HTTP proxy request timed out'
          });
        }
      });

      req.on('error', (err) => {
        req.destroy();
        if (!httpFinished) {
          httpFinished = true;
          resolve({
            success: false,
            latency: `${tcpLatency}ms`,
            status: 'failed',
            error: err?.code || err?.message || 'HTTP proxy request failed'
          });
        }
      });

      req.end();
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!socketFinished) {
        socketFinished = true;
        resolve({ success: false, latency: 'Timeout', status: 'failed', error: 'Connection timed out' });
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (!socketFinished) {
        socketFinished = true;
        resolve({ success: false, latency: 'Failed', status: 'failed', error: err.code || err.message });
      }
    });

    try {
      socket.connect(Number(port), host);
    } catch (e) {
      if (!socketFinished) {
        socketFinished = true;
        resolve({ success: false, latency: 'Error', status: 'failed', error: e.message });
      }
    }
  });
}

function registerProxiesIpc({ mainWindow, app, getDatabase, getXLSX }) {
  ipcMain.handle('proxies:get', async () => {
    try {
      const db = getDatabase();
      const proxies = db.getProxies() || [];
      return { success: true, proxies };
    } catch (e) {
      console.warn('[SQLite] proxies:get notice:', e.message);
      return { success: true, proxies: [] };
    }
  });

  ipcMain.handle('proxies:save', async (event, proxies) => {
    try {
      if (!Array.isArray(proxies)) {
        return { success: false, error: 'Invalid proxies payload: expected an array' };
      }
      const validated = proxies.filter(p => p && typeof p === 'object' && p.host).map(p => ({
        id: typeof p.id === 'string' && p.id ? p.id : ('prx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex')),
        host: String(p.host).trim(),
        port: parseInt(p.port, 10) || 8080,
        protocol: typeof p.protocol === 'string' ? p.protocol.trim() : 'http',
        username: String(p.username || '').trim(),
        password: String(p.password || '').trim(),
        formatted: typeof p.formatted === 'string' && p.formatted.includes('@')
          ? p.formatted
          : (p.username && p.password ? `${p.protocol || 'http'}://${p.username}:${p.password}@${p.host}:${p.port}` : `${p.host}:${p.port}`),
        latency: typeof p.latency === 'string' ? p.latency : '—',
        status: typeof p.status === 'string' ? p.status : 'untested',
        lastTestedAt: p.lastTestedAt || p.lastTested || null,
        error: p.error || null
      }));
      const db = getDatabase();
      db.saveProxies(validated, false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('proxies:upload', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Proxies File',
      filters: [
        { name: 'Proxy Files (*.txt, *.csv, *.xlsx)', extensions: ['txt', 'csv', 'xlsx', 'xls'] },
        { name: 'Text Files (*.txt)', extensions: ['txt'] },
        { name: 'CSV Files (*.csv)', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (res.canceled || res.filePaths.length === 0) {
      return { success: false, message: 'Upload cancelled' };
    }

    try {
      const filePath = res.filePaths[0];
      const ext = path.extname(filePath).toLowerCase();
      // Enforce safe file size limit (< 50MB) to prevent ReDoS / Out-of-memory
      const stat = fs.statSync(filePath);
      if (stat.size > 50 * 1024 * 1024) {
        return { success: false, error: 'File size exceeds maximum 50MB limit.' };
      }

      const newProxies = [];

      if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = getXLSX();
        // Safe options: disable formula evaluation, HTML parsing, styles and enable dense mode
        // Completely neutralizes SheetJS formula prototype pollution (GHSA-4r6h-8v6p-xvw6)
        const workbook = XLSX.readFile(filePath, {
          cellFormula: false,
          cellHTML: false,
          cellNF: false,
          cellStyles: false,
          cellText: false,
          dense: true,
          WTF: false
        });
        if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
          return { success: false, error: 'No readable sheets found in workbook.' };
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          return { success: false, error: 'Sheet content could not be read.' };
        }
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        for (const row of rawRows) {
          const line = row.proxy || row.Proxy || row.ip || row.IP || row.host || row.Host || '';
          if (line) {
            if (row.port || row.Port) {
              const parsed = parseProxyLine(`${line}:${row.port || row.Port}:${row.username || row.user || ''}:${row.password || row.pass || ''}`);
              if (parsed) newProxies.push(parsed);
            } else {
              const parsed = parseProxyLine(String(line));
              if (parsed) newProxies.push(parsed);
            }
          }
        }
      } else {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
          const parsed = parseProxyLine(rawLine);
          if (parsed) newProxies.push(parsed);
        }
      }

      const db = getDatabase();
      let existing = [];
      try {
        existing = db.getProxies() || [];
      } catch (e) {}
      if (existing.length === 0) {
        const proxiesUserData = path.join(app.getPath('userData'), 'proxies.json');
        const proxiesAppPath = path.join(app.getAppPath(), 'proxies.json');
        const proxiesJsonPath = fs.existsSync(proxiesUserData) ? proxiesUserData : proxiesAppPath;
        if (fs.existsSync(proxiesJsonPath)) {
          try { existing = JSON.parse(fs.readFileSync(proxiesJsonPath, 'utf8')); } catch (e) {}
        }
      }
      const combined = [...existing, ...newProxies];
      db.saveProxies(combined, false);

      return {
        success: true,
        filePath: path.basename(filePath),
        count: newProxies.length,
        proxies: combined
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('proxies:test', async (event, proxy) => {
    if (!proxy || typeof proxy !== 'object' || !proxy.host || !proxy.port) {
      return { success: false, latency: 'Error', status: 'failed', error: 'Invalid proxy parameters' };
    }
    const port = parseInt(proxy.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { success: false, latency: 'Error', status: 'failed', error: 'Invalid proxy port (must be 1-65535)' };
    }
    return await testProxyPing(proxy, 4000);
  });

  ipcMain.handle('proxies:testAll', async (event, proxies) => {
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return { success: true, results: [] };
    }
    const results = [];
    const concurrency = 6;
    for (let i = 0; i < proxies.length; i += concurrency) {
      const chunk = proxies.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (p) => {
          const res = await testProxyPing(p, 4000);
          return { id: p.id, ...res };
        })
      );
      results.push(...chunkResults);
    }
    return { success: true, results };
  });
}

module.exports = {
  registerProxiesIpc,
  parseProxyLine,
  testProxyPing
};
