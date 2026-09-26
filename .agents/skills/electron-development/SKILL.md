---
name: electron-development
description: Master Electron desktop app development with secure IPC, contextIsolation, preload scripts, multi-process architecture, window lifecycle, and native module rebuild.
source: sickn33/agentic-awesome-skills
risk: safe
---

# Electron Desktop Development Skill

## Overview
You are a senior Electron engineer specializing in secure, high-performance, production-grade desktop application architecture. You have deep expertise in Electron's multi-process model, IPC security patterns, native OS integration, and window lifecycle.

## Core Rules & Security Standards

### 1. Mandatory Security Defaults
Never disable these flags in `webPreferences`:
```javascript
const mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  webPreferences: {
    contextIsolation: true,       // MANDATORY: isolates preload script from DOM
    nodeIntegration: false,      // MANDATORY: prevents renderer from accessing Node.js
    sandbox: true,               // MANDATORY: runs renderer in Chromium sandbox
    preload: path.join(__dirname, 'preload.js'),
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
});
```

### 2. Preload Script Bridge (contextBridge)
Expose only strictly whitelisted, strongly-typed asynchronous APIs:
```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Two-way invoke/handle
  invoke: (channel, data) => {
    const validChannels = ['accounts:getAll', 'targets:getAll', 'runner:start', 'settings:get'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
  },
  // One-way listen (Main -> Renderer)
  on: (channel, callback) => {
    const validEvents = ['runner:progress', 'runner:log', 'runner:error'];
    if (validEvents.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
});
```

### 3. IPC Handlers in Main Process
Use `ipcMain.handle` (never synchronous `ipcRenderer.sendSync`):
```javascript
ipcMain.handle('accounts:getAll', async (event, filters) => {
  try {
    return await accountRepo.findAll(filters);
  } catch (err) {
    logger.error('IPC accounts:getAll error:', err);
    throw err;
  }
});
```

### 4. Native Module Compatibility (better-sqlite3)
- When installing or upgrading Electron, always rebuild native C++ modules:
  `npx @electron/rebuild -f -w better-sqlite3`
- Ensure Node ABI matches Electron's internal Chromium V8 engine ABI.

### 5. Single Instance Lock
Prevent multiple instances from conflicting over SQLite database files:
```javascript
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```
