/**
 * electron/ipc/proxies_ipc.js
 * IPC Controller for Proxies (Import, Parse, Latency Testing, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

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
    id: 'prx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
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
      const proxies = db.getProxies();
      if (Array.isArray(proxies) && proxies.length > 0) {
        return { success: true, proxies };
      }
    } catch (e) {
      console.warn('[SQLite] proxies:get notice:', e.message);
    }

    const proxiesJsonPath = path.join(app.getAppPath(), 'proxies.json');
    if (fs.existsSync(proxiesJsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(proxiesJsonPath, 'utf8'));
        if (Array.isArray(data)) {
          return { success: true, proxies: data };
        }
      } catch (e) {}
    }
    return { success: true, proxies: [] };
  });

  ipcMain.handle('proxies:save', async (event, proxies) => {
    try {
      const db = getDatabase();
      db.saveProxies(proxies || [], true);
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
        const proxiesJsonPath = path.join(app.getAppPath(), 'proxies.json');
        if (fs.existsSync(proxiesJsonPath)) {
          try { existing = JSON.parse(fs.readFileSync(proxiesJsonPath, 'utf8')); } catch (e) {}
        }
      }
      const combined = [...existing, ...newProxies];
      try {
        db.saveProxies(combined, true);
      } catch (e) {
        const proxiesJsonPath = path.join(app.getAppPath(), 'proxies.json');
        fs.writeFileSync(proxiesJsonPath, JSON.stringify(combined, null, 2), 'utf8');
      }

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
    if (!proxy || !proxy.host || !proxy.port) {
      return { success: false, latency: 'Error', status: 'failed', error: 'Invalid proxy parameters' };
    }
    return await testProxyPing(proxy.host, proxy.port, 3500);
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
