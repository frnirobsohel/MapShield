/**
 * MapsShield Pro - Admin License Key Generator Tool
 * (For the Administrator ONLY - not for end users)
 * 
 * Usage:
 *   node create_license.js
 *   node create_license.js --name "John Doe" --email "john@domain.com" --devices 1 --days 365
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateLicenseKey(prefix = 'MAPS-PRO') {
  const p1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const p2 = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${p1}-${p2}`;
}

// Parse args
const args = process.argv.slice(2);
let clientName = 'VIP Client';
let clientEmail = 'client@example.com';
let maxDevices = 1;
let days = 365;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) clientName = args[++i];
  if (args[i] === '--email' && args[i + 1]) clientEmail = args[++i];
  if (args[i] === '--devices' && args[i + 1]) maxDevices = parseInt(args[++i], 10);
  if (args[i] === '--days' && args[i + 1]) days = parseInt(args[++i], 10);
}

const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() + days);
const expiryStr = expiryDate.toISOString().split('T')[0];

const key = generateLicenseKey();

console.log('====================================================');
console.log('  MAPSSHIELD PRO - ADMIN LICENSE GENERATOR');
console.log('====================================================');
console.log(`  License Key  : ${key}`);
console.log(`  Client Name  : ${clientName}`);
console.log(`  Client Email : ${clientEmail}`);
console.log(`  Max Devices  : ${maxDevices} PC (Motherboard Locked)`);
console.log(`  Expiry Date  : ${expiryStr} (${days} days)`);
console.log('====================================================');
console.log('  Send this License Key to the client.');
console.log('  When they enter it in the app, it locks to their Motherboard ID.');
console.log('====================================================\n');

// Append to generated_licenses.json for admin record
const recordPath = path.join(__dirname, 'generated_licenses.json');
let records = [];
try {
  if (fs.existsSync(recordPath)) {
    records = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  }
} catch (e) {}

records.push({
  license_key: key,
  customer_name: clientName,
  customer_email: clientEmail,
  max_devices: maxDevices,
  expiry_date: expiryStr,
  created_at: new Date().toISOString()
});

fs.writeFileSync(recordPath, JSON.stringify(records, null, 2), 'utf8');
console.log(`  [Saved to generated_licenses.json] Total licenses issued: ${records.length}\n`);
