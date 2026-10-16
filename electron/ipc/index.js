/**
 * electron/ipc/index.js
 * Master IPC Registry for MapsShield Pro Desktop
 */

const { registerSystemIpc, prewarmHardwareId, detectInstalledBrowsers } = require('./system_ipc');
const { registerAccountsIpc } = require('./accounts_ipc');
const { registerProxiesIpc } = require('./proxies_ipc');
const { registerLinksIpc } = require('./links_ipc');
const { registerAgentIpc, killActiveAgentProcess } = require('./agent_ipc');
const { registerLogsIpc } = require('./logs_ipc');

function registerAllIpcHandlers(context) {
  registerSystemIpc(context);
  registerAccountsIpc(context);
  registerProxiesIpc(context);
  registerLinksIpc(context);
  registerAgentIpc(context);
  registerLogsIpc(context);
}

module.exports = {
  registerAllIpcHandlers,
  prewarmHardwareId,
  detectInstalledBrowsers,
  killActiveAgentProcess
};
