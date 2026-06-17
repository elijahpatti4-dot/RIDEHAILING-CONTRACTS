/**
 * RideChain -- Mint test USDC to one or more addresses
 *
 * Usage:
 *   TO=0xABC...  AMOUNT=10000  npx hardhat run scripts/mint-usdc.js --network amoy
 *   TO=0xABC...,0xDEF...  AMOUNT=5000  npx hardhat run scripts/mint-usdc.js --network amoy
 *
 * TO     : comma-separated list of recipient addresses
 * AMOUNT : amount in whole USD (e.g. 10000 = $10,000 USDC)
 *
 * Only works on testnet — MockUSDC has open mint(), real USDC does not.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external pure returns (uint8)",
];

async function main() {
  const toRaw   = process.env.TO;
  const amountUsd = process.env.AMOUNT ?? "10000";

  if (!toRaw) throw new Error("Set TO env var (comma-separated addresses)");

  const recipients = toRaw.split(",").map((a) => a.trim()).filter(Boolean);
  for (const addr of recipients) {
    if (!ethers.isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
  }

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const usdc = new ethers.Contract(addresses.MOCK_USDC, USDC_ABI, deployer);
  const amountRaw = ethers.parseUnits(amountUsd, 6);

  console.log("=".repeat(60));
  console.log("RideChain -- Mint Test USDC");
  console.log("=".repeat(60));
  console.log("MockUSDC :", addresses.MOCK_USDC);
  console.log("Amount   : $" + Number(amountUsd).toLocaleString() + " USDC each");
  console.log("Minting to", recipients.length, "address(es)...");
  console.log("-".repeat(60));

  for (const recipient of recipients) {
    const before = await usdc.balanceOf(recipient);
    const tx = await usdc.mint(recipient, amountRaw);
    await tx.wait();
    const after = await usdc.balanceOf(recipient);
    console.log(
      `  ${recipient}  $${ethers.formatUnits(before,6)} -> $${ethers.formatUnits(after,6)}`
    );
  }

  console.log("\nDone! Recipients can now use the RideChain testnet frontend.");
  console.log("Frontend: http://localhost:5173");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
