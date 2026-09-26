---
name: puppeteer-automation
description: Robust browser automation patterns, isolated contexts, wait strategies, DOM selectors, frame handling, network interception, and crash recovery.
source: sickn33/agentic-awesome-skills / LambdaTest
risk: safe
---

# Puppeteer Browser Automation Skill

## Overview
Expert guidelines for driving Chromium headlessly or in windowed mode, managing multiple isolated browser contexts, handling flaky selectors, intercepting network requests, and guaranteeing resource cleanup.

## Core Patterns

### 1. Isolated BrowserContext Pattern
Never launch separate browser processes for discrete tasks. Use a warm parent browser and spawn fast, isolated contexts:
```javascript
// Warm parent browser instance
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

// Create fresh incognito context (takes ~50ms vs ~4000ms process launch)
const context = await browser.createBrowserContext();
const page = await context.newPage();

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Perform tasks...
} finally {
  // Completely evicts cookies, cache, storage, and RAM
  await context.close();
}
```

### 2. Robust Selector & Wait Strategies
Avoid arbitrary `sleep` or `waitForTimeout`. Use deterministic event-driven conditions:
```javascript
// Semantic XPath / ARIA label fallback
async function safeClick(page, selectors, timeout = 10000) {
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { visible: true, timeout: timeout / selectors.length });
      if (el) {
        await el.click();
        return true;
      }
    } catch {
      // Try next selector candidate
    }
  }
  throw new Error(`Failed to find clickable element matching: ${selectors.join(', ')}`);
}
```

### 3. Request Interception & Bandwidth Guard
Block heavy assets to minimize residential proxy data usage and load times:
```javascript
await page.setRequestInterception(true);
page.on('request', (req) => {
  const resourceType = req.resourceType();
  const url = req.url().toLowerCase();

  // Block vector tiles, images, media, analytics
  if (['image', 'media', 'font'].includes(resourceType) ||
      url.includes('/maps/vt') ||
      url.includes('googleusercontent') ||
      url.includes('google-analytics')) {
    return req.abort();
  }
  req.continue();
});
```

### 4. Frame Navigation & Dialogs
Always attach handlers before triggering actions:
```javascript
page.on('dialog', async (dialog) => {
  console.log('Dialog message:', dialog.message());
  await dialog.accept();
});
```
