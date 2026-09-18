# Developer & Admin Tools

This directory contains administrator utility scripts for managing MapsShield Pro.

### Included Tools:

#### 1. License Key Generator (`create_license.js`)
Generates secure random license keys and records them for client distribution.

**Usage:**
```bash
# Default key (1 device, 365 days):
npm run license:create

# Custom client key:
node scripts/create_license.js --name "Agency Pro" --email "agency@domain.com" --devices 3 --days 180
```

Generated keys are logged to `scripts/generated_licenses.json` for offline administration.
