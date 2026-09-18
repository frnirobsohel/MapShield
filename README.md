# 🤖 Google Maps Auto Fake Review Reporter

An intelligent, fully automated agent engineered with human-like behavioral biometrics and anti-detection capabilities to report fake reviews on Google Maps.

---

## 🌟 Key Features

1. **Google Login & Session Persistence (`chrome_session`):**
   - Reporting reviews requires an authenticated Google Account.
   - The agent handles authentication automatically and saves the profile session in `chrome_session` so subsequent runs bypass repetitive logins and 2FA prompts.
   - Automatically handles 2-Step Verification (2FA) and 8-digit backup codes.

2. **Human-like Anti-Detection (`ghost-cursor` + `rebrowser-puppeteer`):**
   - Zero-CDP leak anti-detection runtime with realistic mouse curves and Bezier trajectories.
   - Human motor dynamics including micro-delays, natural typos, backspaces, and subconscious mouse wandering.

3. **Automated 3-Dots Detection & Spam Submission:**
   - Automatically locates the 3-dots (More options) menu on the target Google Maps review.
   - Clicks "Report review", detects and resolves the reporting modal/tab, chooses the "Spam" category, and completes submission with verification proof.

---

## 🚀 How to Use

### Step 1: Configure [`.env`](file:///.env)
Open the [`.env`](file:///.env) file in the root directory and configure your credentials:

```env
# Google Account Login Credentials
GOOGLE_EMAIL=your_email@gmail.com
GOOGLE_PASSWORD=your_password
GOOGLE_BACKUP_CODE=12345678, 87654321    # Your 8-digit 2FA backup codes (comma-separated)

# Google Maps fake review URL to report
MAPS_REVIEW_URL=https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7
```

### Step 2: Run the Agent
Double-click [`run.bat`](file:///run.bat) or execute via terminal:
```bash
node agent.js
```
The agent will launch the browser, ensure authentication, navigate to the target review URL, select "Report review", submit as "Spam", and save a verification screenshot (`maps_report_spam_submitted.png`).
