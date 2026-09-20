/**
 * electron/ipc/system_ipc.js
 * IPC Controller for System, Hardware UUID, Browsers & Configuration
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

let cachedDetectedBrowsers = null;
let cachedHardwareId = null;

function detectInstalledBrowsers() {
  if (cachedDetectedBrowsers && cachedDetectedBrowsers.length > 0) {
    return cachedDetectedBrowsers;
  }
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'SOHEL');
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidateBrowsers = [
    {
      id: 'chrome',
      name: 'Google Chrome',
      paths: [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      paths: [
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ]
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      paths: [
        path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
      ]
    },
    {
      id: 'opera',
      name: 'Opera Browser',
      paths: [
        path.join(localAppData, 'Programs', 'Opera', 'launcher.exe'),
        path.join(programFiles, 'Opera', 'launcher.exe')
      ]
    },
    {
      id: 'operagx',
      name: 'Opera GX',
      paths: [
        path.join(localAppData, 'Programs', 'Opera GX', 'launcher.exe')
      ]
    },
    {
      id: 'vivaldi',
      name: 'Vivaldi Browser',
      paths: [
        path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'),
        path.join(programFiles, 'Vivaldi', 'Application', 'vivaldi.exe')
      ]
    },
    {
      id: 'chromium',
      name: 'Chromium',
      paths: [
        path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Chromium', 'Application', 'chrome.exe')
      ]
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      paths: [
        path.join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
        path.join(programFilesX86, 'Mozilla Firefox', 'firefox.exe'),
        path.join(localAppData, 'Mozilla Firefox', 'firefox.exe')
      ]
    },
    {
      id: 'gologin',
      name: 'GoLogin (Orbita)',
      paths: [
        path.join(userProfile, '.gologin', 'browser', 'orbita-browser', 'chrome.exe')
      ]
    }
  ];

  const results = [];
  for (const b of candidateBrowsers) {
    let foundPath = null;
    for (const p of b.paths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }
    if (foundPath) {
      results.push({
        id: b.id,
        name: b.name,
        path: foundPath,
        installed: true
      });
    }
  }

  if (results.length === 0) {
    results.push({
      id: 'chrome',
      name: 'Google Chrome (Default)',
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      installed: false
    });
  }

  cachedDetectedBrowsers = results;
  return results;
}

async function prewarmHardwareId() {
  if (cachedHardwareId) {
    return cachedHardwareId;
  }

  try {
    const { stdout } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
      windowsHide: true,
      timeout: 1500
    });
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9\-]+)/i);
    if (match && match[1]) {
      cachedHardwareId = match[1].trim().toUpperCase();
      return cachedHardwareId;
    }
  } catch (e) {}

  try {
    const host = os.hostname() || 'LOCALHOST';
    const cpu = os.cpus()[0]?.model || 'GENERIC-CPU';
    cachedHardwareId = 'MB-' + crypto.createHash('sha256').update(host + cpu).digest('hex').substring(0, 24).toUpperCase();
    return cachedHardwareId;
  } catch (e) {
    cachedHardwareId = 'MB-HARDWARE-DEFAULT-UUID';
    return cachedHardwareId;
  }
}

function registerSystemIpc({ mainWindow, app, getDatabase }) {
  ipcMain.handle('browsers:get', async () => {
    return detectInstalledBrowsers();
  });

  ipcMain.handle('system:getHardwareId', async () => {
    return prewarmHardwareId();
  });

  ipcMain.handle('browser:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Custom Chromium Browser Executable',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedPath = result.filePaths[0];
    const fileName = path.basename(selectedPath, '.exe');
    return {
      canceled: false,
      browser: {
        id: 'custom',
        name: `Custom (${fileName})`,
        path: selectedPath,
        installed: true
      }
    };
  });

  ipcMain.handle('url:open', async (event, url) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL protocol' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('folder:open', async () => {
    try {
      const targetFolder = app.isPackaged ? app.getPath('userData') : app.getAppPath();
      await shell.openPath(targetFolder);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('folder:openReports', async (_event, subfolder = '') => {
    try {
      const baseDir = app.isPackaged ? app.getPath('userData') : app.getAppPath();
      const sanitizedSubfolder = String(subfolder || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const targetDir = sanitizedSubfolder
        ? path.join(baseDir, 'report_logs', sanitizedSubfolder)
        : path.join(baseDir, 'report_logs');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      await shell.openPath(targetDir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('config:get', async () => {
    try {
      const db = getDatabase();
      const settings = db.getSettings();
      return { success: true, data: settings, ...settings };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('config:save', async (event, data) => {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, error: 'Invalid config settings: expected an object' };
      }
      const db = getDatabase();
      const cleanData = { ...data };
      delete cleanData.data;
      delete cleanData.success;
      db.saveSettings(cleanData);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = {
  registerSystemIpc,
  detectInstalledBrowsers,
  prewarmHardwareId
};
