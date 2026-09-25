/**
 * electron/ipc/links_ipc.js
 * IPC Controller for Target Review Links (Import, Manage Quotas, SQLite sync)
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function registerLinksIpc({ mainWindow, app, getDatabase, getXLSX }) {
  // IPC: Get Links (from SQLite with fallback to review_links.json or review_urls.txt)
  ipcMain.handle('links:get', async () => {
    try {
      const db = getDatabase();
      const links = db.getLinks() || [];
      for (const l of links) {
        if (!l.targetCount || isNaN(l.targetCount)) l.targetCount = 1;
        if (l.doneCount === undefined) l.doneCount = l.completedCount || 0;
      }
      return { success: true, links };
    } catch (e) {
      console.warn('[SQLite] links:get notice:', e.message);
      return { success: true, links: [] };
    }
  });

  // IPC: Save Links (writes to SQLite)
  ipcMain.handle('links:save', async (event, links) => {
    try {
      if (!Array.isArray(links)) {
        return { success: false, error: 'Invalid links payload: expected an array' };
      }
      const validated = links.filter(l => l && typeof l === 'object' && l.url).map(l => ({
        id: typeof l.id === 'string' && l.id ? l.id : ('lnk_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex')),
        url: String(l.url).trim(),
        reason: typeof l.reason === 'string' ? l.reason.trim() : 'spam',
        mode: typeof l.mode === 'string' ? l.mode.trim() : 'standard',
        targetCount: Math.max(1, parseInt(l.targetCount, 10) || 1),
        doneCount: Math.max(0, parseInt(l.doneCount !== undefined ? l.doneCount : (l.completedCount || 0), 10) || 0),
        completedCount: Math.max(0, parseInt(l.completedCount || 0, 10) || 0),
        status: typeof l.status === 'string' ? l.status : 'queued',
        lastReportedAt: l.lastReportedAt || null,
        lastError: typeof l.lastError === 'string' ? l.lastError : null,
        businessName: typeof l.businessName === 'string' ? l.businessName.trim() : '',
        country: typeof l.country === 'string' ? l.country.trim() : 'United States'
      }));
      const db = getDatabase();
      db.saveLinks(validated, false);
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
      // Enforce safe file size limit (< 50MB) to prevent ReDoS / Out-of-memory
      const stat = fs.statSync(filePath);
      if (stat.size > 50 * 1024 * 1024) {
        return { success: false, error: 'File size exceeds maximum 50MB limit.' };
      }

      const newLinks = [];

      if (ext === '.xlsx' || ext === '.xls') {
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
          const u = row.url || row.URL || row.link || row.Link || row.review_url || '';
          if (u && String(u).trim().startsWith('http')) {
            const tCount = parseInt(row.target || row.Target || row.count || row.Count || row.target_count || row.targetCount || row.reports || row.reports_needed || 1, 10) || 1;
            const bName = String(row.businessName || row.business_name || row.business || row.Business || row.BusinessName || row.name || '').trim();
            const cName = String(row.country || row.Country || row.region || row.Region || 'United States').trim() || 'United States';
            newLinks.push({
              id: 'lnk_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
              url: String(u).trim(),
              reason: row.reason || row.Reason || 'spam',
              mode: row.mode || row.Mode || 'standard',
              status: 'queued',
              targetCount: Math.max(1, tCount),
              doneCount: 0,
              completedCount: 0,
              lastReportedAt: null,
              businessName: bName,
              country: cName
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
            const bName = parts[4] ? parts[4].trim() : '';
            const cName = (parts[5] ? parts[5].trim() : 'United States') || 'United States';
            newLinks.push({
              id: 'lnk_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
              url: u,
              reason: (parts[1] || 'spam').trim(),
              mode: (parts[2] || 'standard').trim(),
              status: 'queued',
              targetCount: Math.max(1, tCount),
              doneCount: 0,
              completedCount: 0,
              lastReportedAt: null,
              businessName: bName,
              country: cName
            });
          }
        }
      }

      const db = getDatabase();
      let existing = [];
      try {
        existing = db.getLinks() || [];
      } catch (e) {}
      const combined = [...existing, ...newLinks];
      db.saveLinks(combined, false);

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

  // IPC: Inspect Review Link with AI to pre-select top 1 to 3 violation categories
  ipcMain.handle('links:ai-inspect', async (event, { id, url }) => {
    try {
      if (!url) {
        return { success: false, message: 'Review URL is missing.' };
      }

      const db = getDatabase();
      const settings = db.getSettings();
      const apiKey = settings.aiApiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return {
          success: false,
          message: 'AI API Key not found. Please add your Gemini, OpenAI, or DeepSeek API key in Settings first.'
        };
      }

      const BrowserManager = require(path.join(__dirname, '../../modules/browser/browser_manager'));
      const { extractReviewDetails, analyzeReviewMultiCategoriesWithAI } = require(path.join(__dirname, '../../modules/ai/ai_reviewer'));

      let details = { reviewText: '', reviewerName: 'Anonymous', rating: 'Unknown' };
      let browser = null;

      try {
        const browserPath = settings.browserPath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const bm = new BrowserManager();
        const launched = await bm.launch({
          browserPath,
          headless: true,
          useTempProfile: true,
          args: ['--window-size=1280,800', '--disable-gpu']
        });
        browser = launched.browser;
        const page = launched.page || (await browser.newPage());
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        details = await extractReviewDetails(page);
      } catch (browserErr) {
        console.warn('⚠️ Headless review detail extraction error:', browserErr.message);
      } finally {
        if (browser) {
          try { await browser.close(); } catch (e) {}
        }
      }

      // Call AI Multi-Category Analysis
      const aiResult = await analyzeReviewMultiCategoriesWithAI({
        reviewText: details.reviewText,
        reviewerName: details.reviewerName,
        rating: details.rating,
        provider: settings.aiProvider || 'gemini',
        apiKey,
        model: settings.aiModel
      });

      // If AI call encountered an error (e.g. 401 unauthorized, network fail)
      if (aiResult.reasoning && aiResult.reasoning.startsWith('AI Error:')) {
        return {
          success: false,
          message: aiResult.reasoning,
          categories: ['spam', 'conflict', 'offtopic'],
          reason: 'spam, conflict, offtopic',
          reasoning: aiResult.reasoning,
          reviewDetails: details
        };
      }

      const categories = aiResult.categories && aiResult.categories.length > 0 ? aiResult.categories : ['spam', 'conflict', 'offtopic'];
      const reasonStr = categories.join(', ');

      // Save categories to SQLite review_links
      let updatedLinks = [];
      try {
        const links = db.getLinks() || [];
        for (const l of links) {
          if (l.id === id || l.url === url) {
            l.reason = reasonStr;
          }
        }
        db.saveLinks(links, true);
        updatedLinks = links;
      } catch (saveErr) {
        console.warn('⚠️ Failed to save updated link reason to DB:', saveErr.message);
      }

      return {
        success: true,
        id,
        url,
        categories,
        reason: reasonStr,
        reasoning: aiResult.reasoning,
        reviewDetails: details,
        links: updatedLinks
      };
    } catch (err) {
      console.error('❌ links:ai-inspect error:', err);
      return { success: false, message: err.message };
    }
  });
}

module.exports = {
  registerLinksIpc
};
