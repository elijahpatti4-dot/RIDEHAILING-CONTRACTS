/**
 * RideChain -- Report Ride Volume (City or Regional)
 *
 * Usage -- city operator:
 *   TYPE=city VOLUME=50000 \
 *     npx hardhat run scripts/report-volume.js --network amoy
 *
 * Usage -- regional master:
 *   TYPE=regional VOLUME=500000 \
 *     npx hardhat run scripts/report-volume.js --network amoy
 *
 * VOLUME is in whole USD (e.g. 50000 = $50,000 of ride volume).
 * Fee deducted automatically:
 *   City:     1%   of VOLUME  -> founder wallet
 *   Regional: 1.5% of VOLUME  -> founder wallet
 *
 * Caller must be the registered operator for their city/region.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const LICENCE_ABI = [
  "function reportCityVolume(uint256 rideVolume) external",
  "function reportRegionalVolume(uint256 rideVolume) external",
  "function operatorCity(address) external view returns (string)",
  "function operatorRegion(address) external view returns (string)",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
];

async function main() {
  const type      = (process.env.TYPE || "city").toLowerCase();
  const volumeUsd = process.env.VOLUME;

  if (!volumeUsd) throw new Error("Set VOLUME env var (whole USD, e.g. VOLUME=50000)");
  if (type !== "city" && type !== "regional") throw new Error("TYPE must be 'city' or 'regional'");

  const volumeRaw = ethers.parseUnits(volumeUsd, 6);
  const feeRaw    = type === "city"
    ? (volumeRaw * 100n) / 10_000n      // 1%
    : (volumeRaw * 150n) / 10_000n;     // 1.5%
  const feePct = type === "city" ? "1%" : "1.5%";

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const usdc    = new ethers.Contract(addresses.MOCK_USDC, ERC20_ABI, deployer);
  const licence = new ethers.Contract(addresses.LICENCE,   LICENCE_ABI, deployer);

  // Resolve the operator's registered territory
  const territory = type === "city"
    ? await licence.operatorCity(deployer.address)
    : await licence.operatorRegion(deployer.address);

  if (!territory) throw new Error(`Caller is not a registered ${type} operator`);

  console.log("=".repeat(60));
  console.log(`RideChain -- Report ${type === "city" ? "City" : "Regional"} Volume`);
  console.log("=".repeat(60));
  console.log("Operator    :", deployer.address);
  console.log("Territory   :", territory);
  console.log("Volume (USD):", `$${Number(volumeUsd).toLocaleString()}`);
  console.log(`Fee (${feePct})   :`, `$${ethers.formatUnits(feeRaw, 6)}`);
  console.log("-".repeat(60));

  const balance   = await usdc.balanceOf(deployer.address);
  const allowance = await usdc.allowance(deployer.address, addresses.LICENCE);
  console.log("USDC balance  :", ethers.formatUnits(balance, 6));
  console.log("USDC allowance:", ethers.formatUnits(allowance, 6));

  if (balance < feeRaw) {
    throw new Error(`Insufficient USDC for fee. Have ${ethers.formatUnits(balance,6)}, need ${ethers.formatUnits(feeRaw,6)}`);
  }

  if (allowance < feeRaw) {
    console.log("\nApproving USDC spend...");
    const approveTx = await usdc.approve(addresses.LICENCE, feeRaw);
    await approveTx.wait();
    console.log("Approved:", approveTx.hash);
  }

  console.log("\nReporting volume...");
  const fn = type === "city" ? "reportCityVolume" : "reportRegionalVolume";
  const tx = await licence[fn](volumeRaw);
  const receipt = await tx.wait();
  console.log("Confirmed:", receipt.hash);
  console.log("\nVolume reported successfully!");
  console.log(`Fee paid to founder: $${ethers.formatUnits(feeRaw, 6)} USDC`);
  console.log(`View: https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
