# Automation Modules Architecture

This directory houses the core automation and domain modules, organized by functional responsibility.

### Directory Layout

```text
modules/
├── helpers/                  # Shared Biometric, Stealth & DOM Automation Helpers
│   ├── biometrics.js         # Gaussian delays, human typing velocity, mouse wandering, scrolling
│   ├── stealth.js            # BotGuard evasion, CDP camouflage, navigator overrides
│   ├── dom_utils.js          # smartClick, clickElementByText, clickGoogleNext
│   └── index.js              # Helpers barrel export
│
├── auth/                     # Google Account Authentication & 2FA Engine
│   ├── google_auth.js        # Automated login, 2FA challenge solver, backup code processing
│   └── index.js              # Auth barrel export
│
├── browser/                  # Browser lifecycle, stealth launch & session sandbox
│   ├── browser_manager.js    # BrowserManager: launch(), close(), create_temp_profile()
│   ├── session_manager.js    # SessionManager: create_session(), destroy_session()
│   ├── user_agent_manager.js # UserAgentManager: get_next_user_agent(), validate_ua()
│   └── index.js              # Barrel export
│
├── network/                  # Network routing, IP rotation & proxies
│   ├── proxy_manager.js      # ProxyManager: get_next_proxy(), test_proxy()
│   └── index.js              # Barrel export
│
├── reporter/                 # Target Google Maps review reporting execution
│   ├── maps_reporter.js      # Form filling, button navigation & proof generation
│   └── index.js              # Barrel export
│
├── ai/                       # AI review inspection & semantic analysis
│   ├── ai_reviewer.js        # Gemini API review evaluation & classification
│   └── index.js              # Barrel export
│
└── index.js                  # Master unified export
```

### Usage Examples

```javascript
// Import everything from root barrel:
const {
  BrowserManager,
  ProxyManager,
  UserAgentManager,
  SessionManager,
  runMapsReporter,
  ensureGoogleLoggedIn,
  sleep,
  gaussianRandom,
  humanScroll,
  humanWanderMouse,
  humanType,
  applyDeepStealth,
  smartClick
} = require('./modules');

// Or import domain-specifically:
const { ensureGoogleLoggedIn } = require('./modules/auth');
const { sleep, humanType, smartClick } = require('./modules/helpers');
const { BrowserManager } = require('./modules/browser');
const { ProxyManager } = require('./modules/network');
const { runMapsReporter } = require('./modules/reporter');
const { reviewViolationWithGemini } = require('./modules/ai');
```
