/**
 * electron/ipc/proxies_ipc.js
 * IPC Controller for Proxies (Import, Parse, Latency Testing, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
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

  return {
    id: 'prx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    protocol: protocol || 'http',
    host: host,
    port: Number(port) || 8080,
    username: (username || '').trim(),
    password: (password || '').trim(),
    latency: '—',
    status: 'untested',
    lastTested: null
  };
}

function testProxyPing(host, port, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let finished = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const ms = Date.now() - start;
      socket.destroy();
      if (!finished) {
        finished = true;
        resolve({ success: true, latency: `${ms}ms`, status: 'ready' });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!finished) {
        finished = true;
        resolve({ success: false, latency: 'Timeout', status: 'failed', error: 'Timed out' });
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (!finished) {
        finished = true;
        resolve({ success: false, latency: 'Failed', status: 'failed', error: err.code || err.message });
      }
    });

    try {
      socket.connect(Number(port), host);
    } catch (e) {
      if (!finished) {
        finished = true;
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
        formatted: typeof p.formatted === 'string' ? p.formatted : `${p.host}:${p.port}`,
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
      const newProxies = [];

      if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = getXLSX();
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
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
    return await testProxyPing(String(proxy.host).trim(), port, 3500);
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
          const res = await testProxyPing(p.host, p.port, 3500);
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
