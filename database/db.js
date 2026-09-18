// Suppress Node.js ExperimentalWarning for node:sqlite in desktop UI
const origEmit = process.emit;
process.emit = function (name, data, ...args) {
  if (name === 'warning' && typeof data === 'object' && data.name === 'ExperimentalWarning') {
    return false;
  }
  return origEmit.apply(process, [name, data, ...args]);
};

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'mapsshield.sqlite');
    this.init();
  }

  init() {
    // Ensure parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open or create SQLite database file
    this.db = new DatabaseSync(this.dbPath);

    // High performance PRAGMAs for desktop reliability
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    // Create Tables if not exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        twoFactor TEXT,
        backupCode TEXT,
        used INTEGER DEFAULT 0,
        usedCount INTEGER DEFAULT 0,
        lastUsedAt TEXT,
        status TEXT DEFAULT 'ready',
        lastError TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS review_links (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        reason TEXT DEFAULT 'spam',
        mode TEXT DEFAULT 'standard',
        targetCount INTEGER DEFAULT 1,
        doneCount INTEGER DEFAULT 0,
        completedCount INTEGER DEFAULT 0,
        status TEXT DEFAULT 'queued',
        lastReportedAt TEXT,
        lastError TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT DEFAULT 'http',
        username TEXT,
        password TEXT,
        formatted TEXT,
        latency TEXT DEFAULT '—',
        status TEXT DEFAULT 'untested',
        lastTestedAt TEXT,
        error TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS report_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        email TEXT,
        proxy TEXT,
        status TEXT,
        reason TEXT,
        mode TEXT,
        error TEXT,
        screenshot TEXT,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
      CREATE INDEX IF NOT EXISTS idx_review_links_url ON review_links(url);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON report_audit_logs(timestamp);
    `);

    // Auto-migrate from JSON files if database tables are empty
    this.autoMigrateFromJson();
  }

  // --- Auto Migration from Existing JSON files ---
  autoMigrateFromJson() {
    const rootDir = path.resolve(__dirname, '..');

    // 1. Migrate accounts.json
    try {
      const accountsCount = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
      if (accountsCount === 0) {
        const accountsJsonPath = path.join(rootDir, 'accounts.json');
        if (fs.existsSync(accountsJsonPath)) {
          const list = JSON.parse(fs.readFileSync(accountsJsonPath, 'utf8'));
          if (Array.isArray(list) && list.length > 0) {
            this.saveAccounts(list, false);
          }
        }
      }
    } catch (e) {
      console.warn('[SQLite] Accounts migration notice:', e.message);
    }

    // 2. Migrate review_links.json
    try {
      const linksCount = this.db.prepare('SELECT COUNT(*) as count FROM review_links').get().count;
      if (linksCount === 0) {
        const linksJsonPath = path.join(rootDir, 'review_links.json');
        if (fs.existsSync(linksJsonPath)) {
          const list = JSON.parse(fs.readFileSync(linksJsonPath, 'utf8'));
          if (Array.isArray(list) && list.length > 0) {
            this.saveLinks(list, false);
          }
        }
      }
    } catch (e) {
      console.warn('[SQLite] Links migration notice:', e.message);
    }

    // 3. Migrate proxies.json
    try {
      const proxiesCount = this.db.prepare('SELECT COUNT(*) as count FROM proxies').get().count;
      if (proxiesCount === 0) {
        const proxiesJsonPath = path.join(rootDir, 'proxies.json');
        if (fs.existsSync(proxiesJsonPath)) {
          const list = JSON.parse(fs.readFileSync(proxiesJsonPath, 'utf8'));
          if (Array.isArray(list) && list.length > 0) {
            this.saveProxies(list, false);
          }
        }
      }
    } catch (e) {
      console.warn('[SQLite] Proxies migration notice:', e.message);
    }

    // 4. Migrate .env to app_settings if app_settings is empty
    try {
      const settingsCount = this.db.prepare('SELECT COUNT(*) as count FROM app_settings').get().count;
      if (settingsCount === 0) {
        const envPath = path.join(rootDir, '.env');
        const settingsToMigrate = {
          defaultUrl: 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7',
          urls: ['https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7'],
          reportReason: 'spam',
          reportType: 'standard',
          browserPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: false,
          aiProvider: 'gemini',
          aiApiKey: '',
          aiModel: 'gemini-2.0-flash',
          aiInspection: false
        };
        if (fs.existsSync(envPath)) {
          const lines = fs.readFileSync(envPath, 'utf8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const [k, ...v] = trimmed.split('=');
            const val = v.join('=').split('#')[0].trim();
            const key = k.trim();
            if (key === 'MAPS_REVIEW_URL') {
              settingsToMigrate.defaultUrl = val;
              settingsToMigrate.urls = [val];
            } else if (key === 'MAPS_REPORT_REASON') settingsToMigrate.reportReason = val;
            else if (key === 'MAPS_REPORT_TYPE') settingsToMigrate.reportType = val;
            else if (key === 'BROWSER_PATH') settingsToMigrate.browserPath = val;
            else if (key === 'HEADLESS') settingsToMigrate.headless = val === 'true';
            else if (key === 'AI_PROVIDER') settingsToMigrate.aiProvider = val;
            else if (key === 'GEMINI_API_KEY' || key === 'AI_API_KEY') settingsToMigrate.aiApiKey = val;
            else if (key === 'AI_MODEL') settingsToMigrate.aiModel = val;
            else if (key === 'AI_INSPECTION') settingsToMigrate.aiInspection = val === 'true';
          }
        }
        this.saveSettings(settingsToMigrate);
      }
    } catch (e) {
      console.warn('[SQLite] Settings migration notice:', e.message);
    }
  }

  // --- ACCOUNTS OPERATIONS ---
  getAccounts() {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY rowid ASC').all();
    return rows.map(r => ({
      ...r,
      used: Boolean(r.used),
      usedCount: r.usedCount || 0
    }));
  }

  saveAccounts(accounts, mirrorJson = true) {
    if (!Array.isArray(accounts)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.exec('DELETE FROM accounts;');
      const stmt = this.db.prepare(`
        INSERT INTO accounts (id, email, password, twoFactor, backupCode, used, usedCount, lastUsedAt, status, lastError, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        const id = a.id || ('acc_' + (i + 1) + '_' + Math.random().toString(36).substr(2, 6));
        stmt.run(
          id,
          String(a.email || '').trim(),
          a.password || '',
          a.twoFactor || a['2fa'] || '',
          a.backupCode || a.backupCodes || '',
          a.used ? 1 : 0,
          a.usedCount || 0,
          a.lastUsedAt || null,
          a.status || 'ready',
          a.lastError || a.error || null,
          new Date().toISOString()
        );
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }

    if (mirrorJson) {
      const rootDir = path.resolve(__dirname, '..');
      try {
        fs.writeFileSync(path.join(rootDir, 'accounts.json'), JSON.stringify(accounts, null, 2), 'utf8');
      } catch (e) {}
    }
  }

  updateAccountStatus(email, statusData) {
    if (!email) return;
    const stmt = this.db.prepare(`
      UPDATE accounts 
      SET used = 1,
          usedCount = usedCount + 1,
          status = ?,
          lastError = ?,
          lastUsedAt = ?,
          updatedAt = ?
      WHERE LOWER(email) = LOWER(?)
    `);
    stmt.run(
      statusData.status || 'success',
      statusData.error || null,
      statusData.timestamp || new Date().toLocaleTimeString(),
      new Date().toISOString(),
      email.trim()
    );
  }

  clearAccounts() {
    this.db.exec('DELETE FROM accounts;');
    const rootDir = path.resolve(__dirname, '..');
    try {
      fs.writeFileSync(path.join(rootDir, 'accounts.json'), '[]', 'utf8');
    } catch (e) {}
  }

  resetAccountsHistory(email = null) {
    if (email) {
      const stmt = this.db.prepare(`
        UPDATE accounts
        SET used = 0,
            usedCount = 0,
            status = 'ready',
            lastError = NULL,
            lastUsedAt = NULL,
            updatedAt = ?
        WHERE LOWER(email) = LOWER(?)
      `);
      stmt.run(new Date().toISOString(), email.trim());
    } else {
      const stmt = this.db.prepare(`
        UPDATE accounts
        SET used = 0,
            usedCount = 0,
            status = 'ready',
            lastError = NULL,
            lastUsedAt = NULL,
            updatedAt = ?
      `);
      stmt.run(new Date().toISOString());
    }

    const rootDir = path.resolve(__dirname, '..');
    try {
      const accounts = this.getAccounts();
      fs.writeFileSync(path.join(rootDir, 'accounts.json'), JSON.stringify(accounts, null, 2), 'utf8');
    } catch (e) {}
  }

  // --- REVIEW LINKS OPERATIONS ---
  getLinks() {
    const rows = this.db.prepare('SELECT * FROM review_links ORDER BY rowid ASC').all();
    return rows.map(r => ({
      ...r,
      targetCount: r.targetCount || 1,
      doneCount: r.doneCount || 0,
      completedCount: r.completedCount || 0
    }));
  }

  saveLinks(links, mirrorJson = true) {
    if (!Array.isArray(links)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.exec('DELETE FROM review_links;');
      const stmt = this.db.prepare(`
        INSERT INTO review_links (id, url, reason, mode, targetCount, doneCount, completedCount, status, lastReportedAt, lastError, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        const id = l.id || ('lnk_' + (i + 1) + '_' + Math.random().toString(36).substr(2, 6));
        stmt.run(
          id,
          String(l.url || '').trim(),
          l.reason || 'spam',
          l.mode || 'standard',
          Math.max(1, parseInt(l.targetCount, 10) || 1),
          Math.max(0, parseInt(l.doneCount !== undefined ? l.doneCount : (l.completedCount || 0), 10) || 0),
          Math.max(0, parseInt(l.completedCount || 0, 10) || 0),
          l.status || 'queued',
          l.lastReportedAt || null,
          l.lastError || null,
          new Date().toISOString()
        );
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }

    if (mirrorJson) {
      const rootDir = path.resolve(__dirname, '..');
      try {
        fs.writeFileSync(path.join(rootDir, 'review_links.json'), JSON.stringify(links, null, 2), 'utf8');
        fs.writeFileSync(path.join(rootDir, 'review_urls.txt'), links.map(l => (typeof l === 'string' ? l : l.url)).join('\n'), 'utf8');
      } catch (e) {}
    }
  }

  updateLinkProgress(url, updateData) {
    if (!url) return;
    const isSuccess = updateData.status === 'completed' || updateData.status === 'success';
    if (isSuccess) {
      const stmt = this.db.prepare(`
        UPDATE review_links
        SET doneCount = doneCount + 1,
            completedCount = completedCount + 1,
            status = ?,
            lastError = NULL,
            lastReportedAt = ?,
            updatedAt = ?
        WHERE url = ? OR url LIKE ?
      `);
      stmt.run(
        'completed',
        updateData.timestamp || new Date().toLocaleTimeString(),
        new Date().toISOString(),
        url.trim(),
        `%${url.trim()}%`
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE review_links
        SET status = ?,
            lastError = ?,
            updatedAt = ?
        WHERE url = ? OR url LIKE ?
      `);
      stmt.run(
        updateData.status || 'failed',
        updateData.error || 'Failed',
        new Date().toISOString(),
        url.trim(),
        `%${url.trim()}%`
      );
    }
  }

  clearLinks() {
    this.db.exec('DELETE FROM review_links;');
    const rootDir = path.resolve(__dirname, '..');
    try {
      fs.writeFileSync(path.join(rootDir, 'review_links.json'), '[]', 'utf8');
      fs.writeFileSync(path.join(rootDir, 'review_urls.txt'), '', 'utf8');
    } catch (e) {}
  }

  // --- PROXIES OPERATIONS ---
  getProxies() {
    return this.db.prepare('SELECT * FROM proxies ORDER BY rowid ASC').all();
  }

  saveProxies(proxies, mirrorJson = true) {
    if (!Array.isArray(proxies)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.exec('DELETE FROM proxies;');
      const stmt = this.db.prepare(`
        INSERT INTO proxies (id, host, port, protocol, username, password, formatted, latency, status, lastTestedAt, error, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < proxies.length; i++) {
        const p = proxies[i];
        const id = p.id || ('prx_' + (i + 1) + '_' + Math.random().toString(36).substr(2, 6));
        stmt.run(
          id,
          String(p.host || '').trim(),
          parseInt(p.port, 10) || 80,
          p.protocol || 'http',
          p.username || '',
          p.password || '',
          p.formatted || `${p.host}:${p.port}`,
          p.latency || '—',
          p.status || 'untested',
          p.lastTestedAt || null,
          p.error || null,
          new Date().toISOString()
        );
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }

    if (mirrorJson) {
      const rootDir = path.resolve(__dirname, '..');
      try {
        fs.writeFileSync(path.join(rootDir, 'proxies.json'), JSON.stringify(proxies, null, 2), 'utf8');
      } catch (e) {}
    }
  }

  clearProxies() {
    this.db.exec('DELETE FROM proxies;');
    const rootDir = path.resolve(__dirname, '..');
    try {
      fs.writeFileSync(path.join(rootDir, 'proxies.json'), '[]', 'utf8');
    } catch (e) {}
  }

  // --- AUDIT LOGS OPERATIONS ---
  recordAuditLog(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO report_audit_logs (url, email, proxy, status, reason, mode, error, screenshot, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.url || '',
      entry.email || '',
      entry.proxy || '',
      entry.status || 'completed',
      entry.reason || 'spam',
      entry.mode || 'standard',
      entry.error || null,
      entry.screenshot || null,
      entry.timestamp || new Date().toISOString()
    );
  }

  getAuditLogs(limit = 100) {
    return this.db.prepare('SELECT * FROM report_audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  }

  // --- APP SETTINGS OPERATIONS ---
  getSettings() {
    const defaultSettings = {
      defaultUrl: 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7',
      urls: [],
      reportReason: 'spam',
      reportType: 'standard',
      browserPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: false,
      aiProvider: 'gemini',
      aiApiKey: '',
      aiModel: 'gemini-2.0-flash',
      aiInspection: false
    };

    try {
      const rows = this.db.prepare('SELECT key, value FROM app_settings').all();
      for (const row of rows) {
        if (row.key === 'headless' || row.key === 'aiInspection') {
          defaultSettings[row.key] = row.value === 'true' || row.value === '1';
        } else if (row.key === 'urls') {
          try { defaultSettings.urls = JSON.parse(row.value); } catch (e) { defaultSettings.urls = [row.value]; }
        } else {
          defaultSettings[row.key] = row.value;
        }
      }
    } catch (e) {
      console.warn('[SQLite] getSettings notice:', e.message);
    }
    return defaultSettings;
  }

  saveSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO app_settings (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `);
      for (const [k, v] of Object.entries(settings)) {
        if (v === undefined || v === null) continue;
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        stmt.run(k, valStr, new Date().toISOString());
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }
}

let dbInstance = null;
function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

module.exports = {
  DatabaseService,
  getDatabase
};
