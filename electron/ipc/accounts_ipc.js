/**
 * electron/ipc/accounts_ipc.js
 * IPC Controller for Bulk Google Accounts (Import, Template, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function normalizeAccountRow(row) {
  const account = { email: '', password: '', twoFactor: '', backupCode: '' };

  for (const key of Object.keys(row)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const k = key.trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = String(row[key] || '').trim();

    if (k.includes('email') || k.includes('mail') || k === 'user' || k === 'username' || k === 'account') {
      account.email = val;
    } else if (k.includes('pass') || k === 'pwd') {
      account.password = val;
    } else if (k.includes('2fa') || k.includes('totp') || k.includes('secret') || k.includes('twofactor')) {
      account.twoFactor = val;
    } else if (k.includes('backup') || k.includes('code') || k.includes('backupcode')) {
      account.backupCode = val;
    }
  }

  return account;
}

function registerAccountsIpc({ mainWindow, app, getDatabase, getXLSX }) {
  // IPC: Upload & Parse CSV or Excel file
  ipcMain.handle('accounts:upload', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Google Accounts CSV or Excel File',
      filters: [
        { name: 'Accounts Files (*.csv, *.xlsx, *.xls, *.txt)', extensions: ['csv', 'xlsx', 'xls', 'txt'] },
        { name: 'Excel / CSV Files (*.csv, *.xlsx, *.xls)', extensions: ['csv', 'xlsx', 'xls'] },
        { name: 'Text Files (*.txt)', extensions: ['txt'] },
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
      const accounts = [];

      if (ext === '.txt') {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('#') || line.startsWith('//')) continue;
          let delimiter = ':';
          if (line.includes(',') && !line.includes(':')) delimiter = ',';
          else if (line.includes('\t')) delimiter = '\t';
          const parts = line.split(delimiter).map(p => p.trim());
          if (parts[0] && parts[0].includes('@')) {
            accounts.push({
              email: parts[0],
              password: parts[1] || '',
              twoFactor: parts[2] || '',
              backupCode: parts.slice(3).join(delimiter) || ''
            });
          }
        }
      } else {
        // Enforce safe file size limit (< 50MB) to prevent ReDoS / Out-of-memory
        const stat = fs.statSync(filePath);
        if (stat.size > 50 * 1024 * 1024) {
          return { success: false, error: 'File size exceeds maximum 50MB limit.' };
        }

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
          if (!row || typeof row !== 'object') continue;
          const normalized = normalizeAccountRow(row);
          if (normalized.email) {
            accounts.push(normalized);
          }
        }
      }

      return {
        success: true,
        filePath: path.basename(filePath),
        count: accounts.length,
        accounts: accounts
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Download / Export Sample CSV Template
  ipcMain.handle('accounts:template', async () => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Sample Accounts CSV Template',
      defaultPath: 'google_accounts_template.csv',
      filters: [{ name: 'CSV File', extensions: ['csv'] }]
    });

    if (res.canceled || !res.filePath) {
      return { success: false };
    }

    try {
      const header = 'email,password,2fa,backup_codes\n';
      const sample = 'your_account1@gmail.com,Pass1234!,JBSWY3DPEHPK3PXP,"12345678, 87654321"\nyour_account2@gmail.com,Pass5678!,,"11223344, 55667788"\n';
      fs.writeFileSync(res.filePath, header + sample, 'utf8');
      return { success: true, filePath: res.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Get Saved Accounts (from SQLite)
  ipcMain.handle('accounts:get', async () => {
    try {
      const db = getDatabase();
      const accounts = db.getAccounts() || [];
      return { success: true, accounts };
    } catch (e) {
      console.warn('[SQLite] accounts:get notice:', e.message);
      return { success: true, accounts: [] };
    }
  });

  // IPC: Save Accounts List to SQLite
  ipcMain.handle('accounts:save', async (event, accounts) => {
    try {
      if (!Array.isArray(accounts)) {
        return { success: false, error: 'Invalid accounts payload: expected an array' };
      }
      const validated = accounts.filter(a => a && typeof a === 'object' && a.email).map(a => ({
        id: typeof a.id === 'string' && a.id ? a.id : undefined,
        email: String(a.email).trim(),
        password: String(a.password || ''),
        twoFactor: String(a.twoFactor || a['2fa'] || ''),
        backupCode: String(a.backupCode || a.backupCodes || ''),
        used: Boolean(a.used),
        usedCount: Number(a.usedCount) || 0,
        lastUsedAt: a.lastUsedAt || a.lastUsed || null,
        status: typeof a.status === 'string' ? a.status : 'active',
        lastError: typeof a.lastError === 'string' ? a.lastError : null
      }));
      const db = getDatabase();
      db.saveAccounts(validated, false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Reset Accounts Usage History
  ipcMain.handle('accounts:resetHistory', async (event, email) => {
    try {
      const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : null;
      const db = getDatabase();
      db.resetAccountsHistory(cleanEmail);
      const accounts = db.getAccounts();
      return { success: true, accounts };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerAccountsIpc,
  normalizeAccountRow
};
