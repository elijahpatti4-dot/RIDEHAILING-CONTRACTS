/**
 * RideChain — Patch frontend/src/config/contracts.js with deployed addresses
 *
 * Run after deploy.js:
 *   node scripts/update-frontend-addresses.js
 *
 * Reads deployed-addresses.json, replaces the ADDRESSES object in contracts.js.
 */

const fs = require("fs");
const path = require("path");

const addrFile  = path.join(__dirname, "..", "deployed-addresses.json");
const contracts = path.join(__dirname, "..", "frontend", "src", "config", "contracts.js");

if (!fs.existsSync(addrFile)) {
  console.error("deployed-addresses.json not found — run deploy.js first");
  process.exit(1);
}

const { contracts: a } = JSON.parse(fs.readFileSync(addrFile, "utf8"));

let src = fs.readFileSync(contracts, "utf8");

// Replace the ADDRESSES object block
const newAddresses = `export const ADDRESSES = {
  RIDE_HAILING:   "${a.RIDE_HAILING}",
  LICENCE:        "${a.LICENCE}",
  TOKEN:          "${a.RIDE_CHAIN_TOKEN}",
  GOVERNOR:       "${a.GOVERNOR}",
  TIMELOCK:       "${a.TIMELOCK}",
  PRICING_ORACLE: "${a.PRICING_ORACLE}",
  USDC:           "${a.MOCK_USDC}",
};`;

// Match the existing ADDRESSES block (from 'export const ADDRESSES' to the closing '};')
const addressRegex = /export const ADDRESSES = \{[\s\S]*?\};/;

if (!addressRegex.test(src)) {
  console.error("Could not find ADDRESSES block in contracts.js — patch it manually.");
  console.log("\nPaste this into contracts.js:\n");
  console.log(newAddresses);
  process.exit(1);
}

src = src.replace(addressRegex, newAddresses);
fs.writeFileSync(contracts, src);

console.log("✓ frontend/src/config/contracts.js patched with deployed addresses:");
for (const [k, v] of Object.entries(a)) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
