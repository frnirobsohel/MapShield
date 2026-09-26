---
name: stealth-browser-evasion
description: Zero-CDP protocol stealth, anti-bot evasion, rebrowser V8 patch integration, bezier curve cursor biometrics, and fingerprint spoofing.
source: mapshield-pro / rebrowser-puppeteer
risk: safe
---

# Stealth & Zero-CDP Anti-Detection Skill

## Overview
Automating Google Maps and high-security endpoints requires bypassing advanced anti-bot systems (Cloudflare, Google reCAPTCHA Enterprise, DataDome, Arkose). Standard Puppeteer leaks CDP execution contexts and non-human mouse vectors. This skill enforces Zero-CDP stealth and biometric simulation.

## Core Anti-Detection Directives

### 1. Zero-CDP Protocol Leak Prevention
- Never call raw `page.evaluate()` in ways that trigger `Runtime.enable` across the main world.
- Use `rebrowser-puppeteer-core` with V8 runtime patches that prevent detection via `console.debug`, `Error.stack` inspect hooks, or `navigator.webdriver`.
- Disable Blink automation flags during launch:
```javascript
const browserArgs = [
  '--disable-blink-features=AutomationControlled',
  '--no-default-browser-check',
  '--disable-infobars',
  '--disable-features=IsolateOrigins,site-per-process',
  '--window-size=1366,768',
];
```

### 2. Human Biometric Mouse Simulation (Ghost Cursor)
Bots move in instant, linear vectors. Humans move in curved bezier trajectories with overshoot and variable acceleration:
```javascript
const { createCursor } = require('ghost-cursor');

const cursor = createCursor(page);
// Moves with natural cubic bezier curve and micro-jitters
await cursor.move(targetSelector);
// Natural human click with randomized dwell time (50ms - 150ms)
await cursor.click(targetSelector, { waitForClick: 100 });
```

### 3. Realistic Keyboard Input Cadence
Never paste full strings instantaneously into form inputs. Type with human-like Gaussian jitter:
```javascript
async function humanType(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    const delay = Math.floor(Math.random() * (120 - 45 + 1)) + 45; // 45-120ms jitter
    await page.keyboard.type(char, { delay });
  }
}
```

### 4. Fingerprint Consistency & Navigator Overrides
Ensure headers, user-agent, viewport, and client hints are mutually consistent:
```javascript
await page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
);
await page.evaluateOnNewDocument(() => {
  // Hide webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Add realistic plugins and languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
});
```

### 5. Sticky Proxy Authentication
- Always bind an account to a single sticky proxy IP during its active work session.
- Authenticate via `page.authenticate({ username, password })`.
- If Google triggers a 2FA challenge, evaluate if IP rotation or session cooldown is required.
