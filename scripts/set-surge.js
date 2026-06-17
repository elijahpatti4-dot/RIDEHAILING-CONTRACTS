/**
 * RideChain -- Set Surge Multiplier on PricingOracle
 *
 * Usage:
 *   SURGE=15000 npx hardhat run scripts/set-surge.js --network amoy
 *
 * SURGE is in basis points (BPS):
 *   10000 = 1.0x (normal)
 *   12500 = 1.25x
 *   15000 = 1.5x
 *   20000 = 2.0x
 *   30000 = 3.0x (hard cap)
 *
 * Only the contract owner (deployer wallet) can call this.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ORACLE_ABI = [
  "function setSurgeMultiplier(uint256 _surgeMultiplierBps) external",
  "function surgeMultiplierBps() external view returns (uint256)",
  "function MAX_SURGE_BPS() external view returns (uint256)",
  "function getRecommendedFare(uint256 distanceMetres, uint256 durationSeconds) external view returns (uint256)",
];

function bpsToMultiplier(bps) {
  return (Number(bps) / 10000).toFixed(2) + "x";
}

async function main() {
  const surgeBps = BigInt(process.env.SURGE ?? "10000");

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const oracle = new ethers.Contract(addresses.PRICING_ORACLE, ORACLE_ABI, deployer);

  const currentBps = await oracle.surgeMultiplierBps();
  const maxBps     = await oracle.MAX_SURGE_BPS();

  console.log("=".repeat(60));
  console.log("RideChain -- Set Surge Multiplier");
  console.log("=".repeat(60));
  console.log("Oracle   :", addresses.PRICING_ORACLE);
  console.log("Owner    :", deployer.address);
  console.log("Current  :", bpsToMultiplier(currentBps), `(${currentBps} BPS)`);
  console.log("New      :", bpsToMultiplier(surgeBps),   `(${surgeBps} BPS)`);
  console.log("Hard cap :", bpsToMultiplier(maxBps),     `(${maxBps} BPS)`);
  console.log("-".repeat(60));

  if (surgeBps < 10_000n) throw new Error("Surge cannot be below 1.0x (10000 BPS)");
  if (surgeBps > maxBps)  throw new Error(`Surge exceeds hard cap of ${bpsToMultiplier(maxBps)}`);

  // Preview: 10km, 20min fare
  const fareBefore = await oracle.getRecommendedFare(10_000, 1_200);
  console.log(`Fare preview (10km, 20min) before: $${ethers.formatUnits(fareBefore, 6)}`);

  console.log("\nSetting surge...");
  const tx = await oracle.setSurgeMultiplier(surgeBps);
  const receipt = await tx.wait();
  console.log("Confirmed:", receipt.hash);

  const fareAfter = await oracle.getRecommendedFare(10_000, 1_200);
  console.log(`Fare preview (10km, 20min) after:  $${ethers.formatUnits(fareAfter, 6)}`);
  console.log(`\nSurge set to ${bpsToMultiplier(surgeBps)} successfully!`);
  console.log(`View: https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
