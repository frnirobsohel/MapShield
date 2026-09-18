/**
 * electron/ipc/links_ipc.js
 * IPC Controller for Target Review Links (Import, Manage Quotas, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function registerLinksIpc({ mainWindow, app, getDatabase, getXLSX }) {
  // IPC: Get Links (from SQLite with fallback to review_links.json or review_urls.txt)
  ipcMain.handle('links:get', async () => {
    try {
      const db = getDatabase();
      const links = db.getLinks();
      if (Array.isArray(links) && links.length > 0) {
        for (const l of links) {
          if (!l.targetCount || isNaN(l.targetCount)) l.targetCount = 1;
          if (l.doneCount === undefined) l.doneCount = l.completedCount || 0;
        }
        return { success: true, links };
      }
    } catch (e) {
      console.warn('[SQLite] links:get notice:', e.message);
    }

    const linksJsonPath = path.join(app.getAppPath(), 'review_links.json');
    if (fs.existsSync(linksJsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(linksJsonPath, 'utf8'));
        if (Array.isArray(data) && data.length > 0) {
          for (const l of data) {
            if (!l.targetCount || isNaN(l.targetCount)) l.targetCount = 1;
            if (l.doneCount === undefined) l.doneCount = l.completedCount || 0;
          }
          return { success: true, links: data };
        }
      } catch (e) {}
    }

    const urlsPath = path.join(app.getAppPath(), 'review_urls.txt');
    const links = [];
    if (fs.existsSync(urlsPath)) {
      const lines = fs.readFileSync(urlsPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        links.push({
          id: 'lnk_' + (i + 1) + '_' + Math.random().toString(36).substr(2, 6),
          url: lines[i],
          reason: 'spam',
          mode: 'standard',
          status: 'queued',
          targetCount: 1,
          doneCount: 0,
          completedCount: 0,
          lastReportedAt: null
        });
      }
    }

    for (const l of links) {
      if (!l.targetCount || isNaN(l.targetCount)) l.targetCount = 1;
      if (l.doneCount === undefined) l.doneCount = l.completedCount || 0;
    }

    return { success: true, links };
  });

  // IPC: Save Links (writes to SQLite & mirrors review_links.json, review_urls.txt)
  ipcMain.handle('links:save', async (event, links) => {
    try {
      const db = getDatabase();
      db.saveLinks(links || [], true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Upload Links File (.txt, .csv, .xlsx)
  ipcMain.handle('links:upload', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Target Review Links File',
      filters: [
        { name: 'Review Link Files (*.txt, *.csv, *.xlsx)', extensions: ['txt', 'csv', 'xlsx', 'xls'] },
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
      const newLinks = [];

      if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = getXLSX();
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        for (const row of rawRows) {
          const u = row.url || row.URL || row.link || row.Link || row.review_url || '';
          if (u && String(u).trim().startsWith('http')) {
            const tCount = parseInt(row.target || row.Target || row.count || row.Count || row.target_count || row.targetCount || row.reports || row.reports_needed || 1, 10) || 1;
            newLinks.push({
              id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              url: String(u).trim(),
              reason: row.reason || row.Reason || 'spam',
              mode: row.mode || row.Mode || 'standard',
              status: 'queued',
              targetCount: Math.max(1, tCount),
              doneCount: 0,
              completedCount: 0,
              lastReportedAt: null
            });
          }
        }
      } else {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const parts = line.split(',');
          const u = parts[0].trim();
          if (u.startsWith('http')) {
            const tCount = parseInt(parts[3] || 1, 10) || 1;
            newLinks.push({
              id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              url: u,
              reason: (parts[1] || 'spam').trim(),
              mode: (parts[2] || 'standard').trim(),
              status: 'queued',
              targetCount: Math.max(1, tCount),
              doneCount: 0,
              completedCount: 0,
              lastReportedAt: null
            });
          }
        }
      }

      const db = getDatabase();
      let existing = [];
      try {
        existing = db.getLinks() || [];
      } catch (e) {}
      if (existing.length === 0) {
        const linksJsonPath = path.join(app.getAppPath(), 'review_links.json');
        if (fs.existsSync(linksJsonPath)) {
          try { existing = JSON.parse(fs.readFileSync(linksJsonPath, 'utf8')); } catch (e) {}
        }
      }
      const combined = [...existing, ...newLinks];
      try {
        db.saveLinks(combined, true);
      } catch (e) {
        const linksJsonPath = path.join(app.getAppPath(), 'review_links.json');
        fs.writeFileSync(linksJsonPath, JSON.stringify(combined, null, 2), 'utf8');
        const urlsPath = path.join(app.getAppPath(), 'review_urls.txt');
        fs.writeFileSync(urlsPath, combined.map(l => l.url).join('\n'), 'utf8');
      }

      return {
        success: true,
        filePath: path.basename(filePath),
        count: newLinks.length,
        links: combined
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerLinksIpc
};
