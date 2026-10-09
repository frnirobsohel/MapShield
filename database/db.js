// Suppress Node.js ExperimentalWarning for node:sqlite in desktop UI
// Guard: only patch if not already patched by agent_runner.js
if (!process.__experimentalWarningPatched) {
  const origEmit = process.emit;
  process.emit = function (name, data, ...args) {
    if (name === 'warning' && typeof data === 'object' && (data.name === 'ExperimentalWarning' || (data.message && data.message.includes('SQLite')))) {
      return false;
    }
    return origEmit.apply(process, [name, data, ...args]);
  };
  process.__experimentalWarningPatched = true;
}

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../modules/helpers/crypto_utils');

class DatabaseService {
  constructor(dbPath) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      const defaultDir = process.env.MAPSSHIELD_USER_DATA
        ? path.join(process.env.MAPSSHIELD_USER_DATA, 'database')
        : __dirname;
      const targetDbPath = path.join(defaultDir, 'mapsshield.sqlite');

      // Auto-migration: If target is in userData and doesn't exist yet, but legacy __dirname db exists, copy it over!
      if (process.env.MAPSSHIELD_USER_DATA && !fs.existsSync(targetDbPath)) {
        const legacyPath = path.join(__dirname, 'mapsshield.sqlite');
        if (fs.existsSync(legacyPath)) {
          try {
            if (!fs.existsSync(defaultDir)) {
              fs.mkdirSync(defaultDir, { recursive: true });
            }
            fs.copyFileSync(legacyPath, targetDbPath);
          } catch (_) {}
        }
      }
      this.dbPath = targetDbPath;
    }
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
    this.db.exec('PRAGMA busy_timeout = 10000;');
    this.db.exec('PRAGMA cache_size = -64000;');
    this.db.exec('PRAGMA temp_store = MEMORY;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Create Tables if not exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        twoFactor TEXT,
        backupCode TEXT,
        recoveryEmail TEXT,
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
        updatedAt TEXT,
        businessName TEXT,
        country TEXT
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

    // Ensure businessName and country columns exist for review_links in existing databases
    try { this.db.exec('ALTER TABLE review_links ADD COLUMN businessName TEXT;'); } catch (_) {}
    try { this.db.exec('ALTER TABLE review_links ADD COLUMN country TEXT;'); } catch (_) {}
    try { this.db.exec('ALTER TABLE accounts ADD COLUMN recoveryEmail TEXT;'); } catch (_) {}
    try { this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_formatted ON proxies(formatted);'); } catch (_) {}

    // Auto-migrate from JSON files if database tables are empty
    this.autoMigrateFromJson();
  }

  // --- Auto Migration from Existing JSON files ---
  autoMigrateFromJson() {
    const findJson = (filename) => {
      if (process.env.MAPSSHIELD_USER_DATA) {
        const userPath = path.join(process.env.MAPSSHIELD_USER_DATA, filename);
        if (fs.existsSync(userPath)) return userPath;
      }
      const devPath = path.join(path.resolve(__dirname, '..'), filename);
      if (fs.existsSync(devPath)) return devPath;
      return null;
    };

    // 1. Migrate accounts.json
    try {
      const accountsCount = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
      if (accountsCount === 0) {
        const accountsJsonPath = findJson('accounts.json');
        if (accountsJsonPath && fs.existsSync(accountsJsonPath)) {
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
        const linksJsonPath = findJson('review_links.json');
        if (linksJsonPath && fs.existsSync(linksJsonPath)) {
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
        const proxiesJsonPath = findJson('proxies.json');
        if (proxiesJsonPath && fs.existsSync(proxiesJsonPath)) {
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
        const envPath = findJson('.env');
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
        if (envPath && fs.existsSync(envPath)) {
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
      // Decrypt sensitive fields on read (backward compatible with plaintext)
      password: decrypt(r.password),
      twoFactor: decrypt(r.twoFactor),
      backupCode: decrypt(r.backupCode),
      recoveryEmail: decrypt(r.recoveryEmail),
      used: Boolean(r.used),
      usedCount: r.usedCount || 0
    }));
  }

  saveAccounts(accounts) {
    if (!Array.isArray(accounts)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const incomingEmails = accounts
        .map(a => a && a.email ? String(a.email).trim().toLowerCase() : '')
        .filter(Boolean);

      if (incomingEmails.length > 0) {
        // Chunk deletion to prevent SQLite SQL variable limit (>999)
        const keepSet = new Set(incomingEmails);
        const allExisting = this.db.prepare('SELECT email FROM accounts').all();
        const toDelete = allExisting
          .map(r => r.email)
          .filter(e => !keepSet.has(String(e).trim().toLowerCase()));

        const chunkSize = 500;
        for (let c = 0; c < toDelete.length; c += chunkSize) {
          const slice = toDelete.slice(c, c + chunkSize);
          const placeholders = slice.map(() => '?').join(',');
          this.db.prepare(`DELETE FROM accounts WHERE email IN (${placeholders})`).run(...slice);
        }
      } else {
        this.db.exec('DELETE FROM accounts;');
      }

      const stmt = this.db.prepare(`
        INSERT INTO accounts (id, email, password, twoFactor, backupCode, used, usedCount, lastUsedAt, status, lastError, updatedAt, recoveryEmail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          password = excluded.password,
          twoFactor = excluded.twoFactor,
          backupCode = excluded.backupCode,
          recoveryEmail = COALESCE(excluded.recoveryEmail, accounts.recoveryEmail),
          used = excluded.used,
          usedCount = CASE WHEN excluded.status = 'active' AND excluded.usedCount = 0 THEN 0 WHEN excluded.usedCount > 0 THEN excluded.usedCount ELSE accounts.usedCount END,
          lastUsedAt = COALESCE(excluded.lastUsedAt, accounts.lastUsedAt),
          status = excluded.status,
          lastError = excluded.lastError,
          updatedAt = excluded.updatedAt
      `);
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        if (!a || !a.email) continue;
        const id = a.id || ('acc_' + (i + 1) + '_' + crypto.randomBytes(4).toString('hex'));
        stmt.run(
          id,
          String(a.email || '').trim(),
          encrypt(a.password || ''),
          encrypt(a.twoFactor || a['2fa'] || ''),
          encrypt(a.backupCode || a.backupCodes || ''),
          a.used ? 1 : 0,
          a.usedCount || 0,
          a.lastUsedAt || null,
          a.status || 'ready',
          a.lastError || a.error || null,
          new Date().toISOString(),
          encrypt(a.recoveryEmail || a.recovery_email || '')
        );
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }

  updateAccountBackupCodes(id, backupCodes) {
    if (!id) return;
    const stmt = this.db.prepare(`
      UPDATE accounts
      SET backupCode = ?, updatedAt = ?
      WHERE id = ?
    `);
    return stmt.run(encrypt(backupCodes || ''), new Date().toISOString(), id);
  }

  updateAccountBackupCodesByEmail(email, backupCodes) {
    if (!email) return;
    const stmt = this.db.prepare(`
      UPDATE accounts
      SET backupCode = ?, updatedAt = ?
      WHERE LOWER(email) = LOWER(?)
    `);
    return stmt.run(encrypt(backupCodes || ''), new Date().toISOString(), String(email).trim());
  }

  updateAccountStatus(email, statusData) {
    if (!email) return;
    const isSuccess = statusData.status === 'success' || statusData.status === 'completed';
    const shouldMarkUsed = isSuccess && statusData.used !== false;
    if (shouldMarkUsed) {
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
        statusData.timestamp || new Date().toISOString(),
        new Date().toISOString(),
        email.trim()
      );
    } else {
      // Preserve account as unused: if explicitly used === false/0, ensure used remains 0
      const forceUnused = statusData.used === false || statusData.used === 0;
      const stmt = this.db.prepare(`
        UPDATE accounts 
        SET used = CASE WHEN ? THEN 0 ELSE used END,
        status = ?,
        lastError = ?,
        updatedAt = ?
        WHERE LOWER(email) = LOWER(?)
      `);
      stmt.run(
        forceUnused ? 1 : 0,
        statusData.status || 'ready',
        statusData.error || null,
        new Date().toISOString(),
        email.trim()
      );
    }
  }

  clearAccounts() {
    this.db.exec('DELETE FROM accounts;');
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
  }

  // --- REVIEW LINKS OPERATIONS ---
  getLinks() {
    const rows = this.db.prepare('SELECT * FROM review_links ORDER BY rowid ASC').all();
    return rows.map(r => ({
      ...r,
      targetCount: r.targetCount || 1,
      doneCount: r.doneCount || 0,
      completedCount: r.completedCount || 0,
      businessName: r.businessName || '',
      country: r.country || ''
    }));
  }

  saveLinks(links) {
    if (!Array.isArray(links)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const incomingUrls = links
        .map(l => l && l.url ? String(l.url).trim() : '')
        .filter(Boolean);

      if (incomingUrls.length > 0) {
        // Chunk deletion to avoid SQLite SQL variable limit (>999)
        const keepSet = new Set(incomingUrls);
        const allRows = this.db.prepare('SELECT url FROM review_links').all();
        const toDelete = allRows
          .map(r => r.url)
          .filter(u => !keepSet.has(String(u).trim()));

        const chunkSize = 500;
        for (let c = 0; c < toDelete.length; c += chunkSize) {
          const slice = toDelete.slice(c, c + chunkSize);
          const placeholders = slice.map(() => '?').join(',');
          this.db.prepare(`DELETE FROM review_links WHERE url IN (${placeholders})`).run(...slice);
        }
      } else {
        this.db.exec('DELETE FROM review_links;');
      }

      const stmt = this.db.prepare(`
        INSERT INTO review_links (id, url, reason, mode, targetCount, doneCount, completedCount, status, lastReportedAt, lastError, updatedAt, businessName, country)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          reason = excluded.reason,
          mode = excluded.mode,
          targetCount = excluded.targetCount,
          doneCount = CASE WHEN excluded.doneCount > 0 THEN excluded.doneCount ELSE review_links.doneCount END,
          completedCount = CASE WHEN excluded.completedCount > 0 THEN excluded.completedCount ELSE review_links.completedCount END,
          status = excluded.status,
          lastReportedAt = COALESCE(excluded.lastReportedAt, review_links.lastReportedAt),
          lastError = excluded.lastError,
          updatedAt = excluded.updatedAt,
          businessName = excluded.businessName,
          country = excluded.country
      `);
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        if (!l || !l.url) continue;
        const id = l.id || ('lnk_' + (i + 1) + '_' + crypto.randomBytes(4).toString('hex'));
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
          new Date().toISOString(),
          l.businessName ? String(l.businessName).trim() : null,
          l.country ? String(l.country).trim() : null
        );
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
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
            status = CASE WHEN doneCount + 1 >= targetCount THEN 'completed' ELSE 'queued' END,
            lastError = NULL,
            lastReportedAt = ?,
            updatedAt = ?
        WHERE url = ?
      `);
      stmt.run(
        updateData.timestamp || new Date().toISOString(),
        new Date().toISOString(),
        url.trim()
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE review_links
        SET status = ?,
            lastError = ?,
            updatedAt = ?
        WHERE url = ?
      `);
      stmt.run(
        updateData.status || 'failed',
        updateData.error || 'Failed',
        new Date().toISOString(),
        url.trim()
      );
    }
  }

  clearLinks() {
    this.db.exec('DELETE FROM review_links;');
  }

  // --- PROXIES OPERATIONS ---
  getProxies() {
    return this.db.prepare('SELECT * FROM proxies ORDER BY rowid ASC').all();
  }

  saveProxies(proxies) {
    if (!Array.isArray(proxies)) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const incomingKeys = new Set();
      const stmt = this.db.prepare(`
        INSERT INTO proxies (id, host, port, protocol, username, password, formatted, latency, status, lastTestedAt, error, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(formatted) DO UPDATE SET
          protocol = excluded.protocol,
          password = excluded.password,
          latency = CASE WHEN proxies.latency != '—' AND proxies.latency IS NOT NULL THEN proxies.latency ELSE excluded.latency END,
          status = CASE WHEN proxies.status != 'untested' AND proxies.status IS NOT NULL THEN proxies.status ELSE excluded.status END,
          lastTestedAt = COALESCE(proxies.lastTestedAt, excluded.lastTestedAt),
          error = COALESCE(proxies.error, excluded.error),
          updatedAt = excluded.updatedAt
      `);
      for (let i = 0; i < proxies.length; i++) {
        const p = proxies[i];
        if (!p || !p.host) continue;
        const host = String(p.host || '').trim();
        const port = parseInt(p.port, 10) || 80;
        const username = p.username || '';
        const formatted = p.formatted || `${host}:${port}`;
        incomingKeys.add(formatted);
        const id = p.id || ('prx_' + (i + 1) + '_' + crypto.randomBytes(4).toString('hex'));
        stmt.run(
          id,
          host,
          port,
          p.protocol || 'http',
          username,
          p.password || '',
          formatted,
          p.latency || '—',
          p.status || 'untested',
          p.lastTestedAt || null,
          p.error || null,
          new Date().toISOString()
        );
      }

      // Delete only proxies that were removed from the incoming list
      const existing = this.db.prepare('SELECT id, formatted FROM proxies').all();
      for (const ep of existing) {
        if (!incomingKeys.has(ep.formatted)) {
          this.db.prepare('DELETE FROM proxies WHERE id = ?').run(ep.id);
        }
      }

      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }

  clearProxies() {
    this.db.exec('DELETE FROM proxies;');
  }

  updateProxyStatus(proxyIdentifier, statusData = {}) {
    if (!proxyIdentifier) return;
    try {
      const stmt = this.db.prepare(`
        UPDATE proxies
        SET status = ?,
            error = ?,
            lastTestedAt = ?,
            updatedAt = ?
        WHERE formatted = ? OR id = ? OR (host || ':' || port) = ?
      `);
      stmt.run(
        statusData.status || 'error',
        statusData.error || null,
        statusData.timestamp || new Date().toISOString(),
        new Date().toISOString(),
        proxyIdentifier,
        proxyIdentifier,
        proxyIdentifier
      );
    } catch (e) {
      console.warn('[SQLite] updateProxyStatus notice:', e.message);
    }
  }

  // --- AUDIT LOGS OPERATIONS ---
  recordAuditLog(entry = {}) {
    const ts = entry.timestamp || new Date().toISOString();
    const errStr = entry.error ? (entry.error.message || String(entry.error)) : null;
    const screenshotStr = entry.screenshot ? String(entry.screenshot) : null;
    const stmt = this.db.prepare(`
      INSERT INTO report_audit_logs (url, email, proxy, status, reason, mode, error, screenshot, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      String(entry.url || ''),
      entry.email ? String(entry.email) : null,
      entry.proxy ? String(entry.proxy) : null,
      String(entry.status || 'completed'),
      String(entry.reason || 'spam'),
      String(entry.mode || 'standard'),
      errStr,
      screenshotStr,
      ts
    );

    // Persist human-readable audit entry to activity.log and reports_history.csv
    try {
      const { appendActivityLog } = require('../modules/helpers/screenshot_paths');
      appendActivityLog({
        ...entry,
        error: errStr,
        screenshot: screenshotStr,
        timestamp: ts
      });
    } catch (_) {}
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
      aiInspection: false,
      legalFullName: '',
      legalBusinessName: '',
      legalCountry: 'United States',
      captchaProvider: '2captcha',
      captchaApiKey: '',
      captchaAutoSolve: true
    };

    try {
      const rows = this.db.prepare('SELECT key, value FROM app_settings').all();
      for (const row of rows) {
        if (row.key === 'data' || row.key === 'success') continue;
        if (row.key === 'headless' || row.key === 'aiInspection' || row.key === 'captchaAutoSolve') {
          defaultSettings[row.key] = row.value === 'true' || row.value === '1';
        } else if (row.key === 'urls') {
          try { defaultSettings.urls = JSON.parse(row.value); } catch (e) { defaultSettings.urls = [row.value]; }
        } else if (row.key === 'aiApiKey' || row.key === 'captchaApiKey') {
          // Decrypt sensitive API keys on read
          defaultSettings[row.key] = decrypt(row.value);
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
        if (v === undefined || v === null || k === 'data' || k === 'success') continue;
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        // Encrypt sensitive API keys before storing
        const storeVal = (k === 'aiApiKey' || k === 'captchaApiKey') ? encrypt(valStr) : valStr;
        stmt.run(k, storeVal, new Date().toISOString());
      }
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }

  close() {
    if (this.db) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (_) {}
      try {
        this.db.close();
      } catch (e) {}
      this.db = null;
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
