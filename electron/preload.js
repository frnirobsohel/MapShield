const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  getBrowsers: () => ipcRenderer.invoke('browsers:get'),
  browseCustomBrowser: () => ipcRenderer.invoke('browser:browse'),
  getHardwareId: () => ipcRenderer.invoke('system:getHardwareId'),
  
  // Bulk Accounts APIs
  uploadAccountsFile: () => ipcRenderer.invoke('accounts:upload'),
  downloadAccountsTemplate: () => ipcRenderer.invoke('accounts:template'),
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  saveAccounts: (accounts) => ipcRenderer.invoke('accounts:save', accounts),
  resetAccountsHistory: (email) => ipcRenderer.invoke('accounts:resetHistory', email),

  // Bulk Proxies APIs
  uploadProxiesFile: () => ipcRenderer.invoke('proxies:upload'),
  getProxies: () => ipcRenderer.invoke('proxies:get'),
  saveProxies: (proxies) => ipcRenderer.invoke('proxies:save', proxies),
  testProxy: (proxy) => ipcRenderer.invoke('proxies:test', proxy),
  testAllProxies: (proxies) => ipcRenderer.invoke('proxies:testAll', proxies),

  // Bulk Review Links APIs
  uploadLinksFile: () => ipcRenderer.invoke('links:upload'),
  getLinks: () => ipcRenderer.invoke('links:get'),
  saveLinks: (links) => ipcRenderer.invoke('links:save', links),
  openExternalUrl: (url) => ipcRenderer.invoke('url:open', url),

  clearSession: () => ipcRenderer.invoke('session:clear'),
  checkSessionStatus: () => ipcRenderer.invoke('session:status'),
  openAppFolder: () => ipcRenderer.invoke('folder:open'),
  startAgent: (options) => ipcRenderer.invoke('agent:start', options),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  getAuditLogs: (limit) => ipcRenderer.invoke('audit:get', limit),
  
  onLog: (callback) => {
    const handler = (_event, text, isErr) => callback(text, isErr);
    ipcRenderer.on('agent:log', handler);
    return () => ipcRenderer.removeListener('agent:log', handler);
  },
  onProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:progress', handler);
    return () => ipcRenderer.removeListener('agent:progress', handler);
  },
  onScreenshot: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:screenshot', handler);
    return () => ipcRenderer.removeListener('agent:screenshot', handler);
  },
  onStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:status', handler);
    return () => ipcRenderer.removeListener('agent:status', handler);
  },
  onFinished: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:finished', handler);
    return () => ipcRenderer.removeListener('agent:finished', handler);
  },
  onAccountUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('account:update', handler);
    return () => ipcRenderer.removeListener('account:update', handler);
  },
  onLinkUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('link:update', handler);
    return () => ipcRenderer.removeListener('link:update', handler);
  }
});
