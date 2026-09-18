# 🛡️ MapsShield Pro - Desktop Application

> **Enterprise Google Maps Review Protection & Anti-Detection Reporting Suite**  
> An intelligent, fully automated desktop application engineered with human-like behavioral biometrics, synchronized Client Hints, multi-model AI inspection, and zero-CDP anti-detection to combat fake, malicious, and defamatory reviews on Google Maps.

---

## 🌟 Key Highlights

- **🖥️ Native Desktop Experience**: Built with Electron and custom high-performance Vanilla CSS (no bloated frameworks), featuring a dark glassmorphic design and Google Sheets-style spreadsheet managers.
- **🛡️ Undetectable Anti-Detection Engine**: Powered by `rebrowser-puppeteer-core` and `ghost-cursor` with Bezier curve mouse trajectories, micro-delays, human typing cadence, and automatic CDP signal suppression (`navigator.webdriver = undefined`).
- **🎭 Synchronized Client Hints & User-Agents**: Guarantees zero fingerprint mismatch by aligning HTTP `User-Agent`, `Sec-Ch-Ua`, `Sec-Ch-Ua-Platform`, `Sec-Ch-Ua-Mobile`, and in-page `navigator.userAgentData.brands` with the running browser engine.
- **⚡ Strict "1-Account = 1-Report" Policy**: Protects Google accounts from being flagged or burnt by enforcing exactly 1 report per account. Includes one-click **Reset History** to allow accounts to be reused when desired.
- **🤖 Multi-Provider AI Policy Inspector**: Integrates Google Gemini, OpenAI (GPT-4o), Anthropic (Claude 3.5), and DeepSeek to automatically read review text, detect policy violations, and select the optimal violation category.
- **🌐 Universal Proxy & WebRTC Leak Protection**: Supports HTTP, HTTPS, SOCKS4, and SOCKS5 with IP rotation, authenticated proxies, and strict `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` leak prevention.
- **💾 High-Concurrency SQLite Database**: Powered by Node's native `DatabaseSync` (`node:sqlite`) with `WAL` journal mode and `PRAGMA busy_timeout = 5000` to ensure rock-solid multi-process concurrency and persistent audit logging.

---

## 📸 Application Architecture & Modules

```
rensgmb/
├── electron/                  # Electron Main Process & IPC Layer
│   ├── main.js                # App lifecycle, window management
│   ├── preload.js             # Context isolation & secure desktop bridge
│   └── ipc/                   # Modular IPC controllers
│       ├── accounts_ipc.js    # Accounts import (CSV/Excel/TXT) & reset history
│       ├── agent_ipc.js       # Child process execution & real-time telemetry
│       ├── links_ipc.js       # Target URL queue manager
│       ├── proxies_ipc.js     # Proxy parser & live connectivity tester
│       └── system_ipc.js      # App configuration & native system bridge
├── src/renderer/              # Frontend UI (Electron Viewport)
│   ├── index.html             # Google Sheets-style multi-pane layout
│   ├── styles.css             # Polished dark-theme CSS design system
│   └── app.js                 # Frontend state, pagination & IPC events
├── modules/                   # Autonomous Agent Automation Engine
│   ├── ai/                    # Multi-provider AI review analyzer
│   ├── auth/                  # Google login, 2FA, & backup code handler
│   ├── browser/               # User-Agent manager & session manager
│   ├── helpers/               # Ghost-cursor biometrics, DOM utilities, deep stealth
│   ├── network/               # Universal proxy resolver & rotation
│   └── reporter/              # Google Maps 3-dots, RAP iframe & legal reporter
├── database/                  # Local SQLite Database Service
│   └── db.js                  # SQLite engine with auto-migration & audit logging
├── agent.js                   # Single-job standalone automation core
├── agent_runner.js            # Multi-target queue runner with 1:1 account policy
└── start_app.bat              # One-click desktop launcher
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.x or higher (Node 22+ recommended for native `node:sqlite` support)
- **Google Chrome**: Modern installed version of Google Chrome, Microsoft Edge, or Brave on Windows

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/frnirobsohel/MapShield.git
   cd MapShield
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Launch the Desktop Application**:
   - Double-click [`start_app.bat`](file:///start_app.bat), OR run:
   ```bash
   npm start
   ```

---

## 💡 How It Works (No `.env` Needed!)

All configuration is handled dynamically inside the desktop user interface. No manual file editing or `.env` configuration is required!

### 1. Import or Add Google Accounts
- Navigate to the **Account** tab.
- Click **Import (CSV / Excel / TXT)** or click **Add Row** to input accounts.
- Supported format for text files:
  ```text
  email@gmail.com:password:2fa_secret:backup_code_1,backup_code_2
  ```
- Accounts are automatically assigned to report jobs on a strict **1 Account = 1 Report** basis.
- To re-enable used accounts for another round of reporting, simply click **Reset History**.

### 2. Add Target Review Links
- Navigate to the **Link** tab.
- Click **Import (TXT / CSV)** or use **Add Link** to enqueue Google Maps review URLs.
- Select your desired report category (e.g. `Spam`, `Conflict of Interest`, `Harassment`, or `🤖 AI Auto Decision`).
- Specify the target report quota per link.

### 3. (Optional) Configure Proxies
- Navigate to the **Proxy** tab.
- Import proxies in standard formats: `ip:port`, `ip:port:user:pass`, or `socks5://user:pass@host:port`.
- Choose between **Direct Connection**, **Static Proxy**, or **Sequential Rotation**.
- Use **Test All Proxies** to verify latency and connectivity before launching.

### 4. (Optional) AI Violation Inspection
- In the Control Panel, enable **AI Review Inspection**.
- Select your AI provider (**Google Gemini**, **OpenAI ChatGPT**, **Anthropic Claude**, or **DeepSeek**).
- Paste your API key. The agent will read the review text in real-time, determine whether it violates Google Policies, and select the highest-impact violation reason automatically.

### 5. Start Execution
- Go to the **Control** or **Dashboard** tab.
- Select your preferred browser (Google Chrome is pre-selected by default).
- Click **Start Reporter Agent**.
- Watch the live progress bar and terminal logs as the agent authenticates, applies humanized cursor movements, submits violations, and captures proof screenshots.

---

## 🛡️ Anti-Detection & Stealth Verification

| Anti-Detection Vector | Implementation | Status |
| :--- | :--- | :--- |
| **Automation Flag** | `delete Object.getPrototypeOf(navigator).webdriver` | ✅ Suppressed |
| **CDP Leak Protection** | `rebrowser-puppeteer-core` patched runtime | ✅ Verified |
| **Client Hints** | Synchronized `Sec-Ch-Ua` and `navigator.userAgentData.brands` | ✅ Zero Mismatch |
| **Mouse Movements** | `ghost-cursor` Cubic Bezier curves & random wandering | ✅ Humanized |
| **Typing Dynamics** | Gaussian randomized delays and natural backspace corrections | ✅ Humanized |
| **WebRTC IP Leak** | `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` | ✅ Protected |
| **Account Safety** | Strict 1:1 account usage limit + isolated profile cache | ✅ Enforced |

---

## 📄 License & Disclaimer

This software is developed strictly for legitimate business reputation defense and policy compliance verification to assist business owners in reporting fraudulent, defamatory, and competitor-sabotaged reviews that violate Google's Maps User Contributed Content Policies. 

Please ensure all usage adheres to applicable local laws and platform terms of service.
