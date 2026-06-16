/**
 * RideChain — Polygonscan verification script
 *
 * Run AFTER deploy.js:
 *   npx hardhat run scripts/verify.js --network amoy
 *
 * Reads deployed-addresses.json written by deploy.js.
 * Requires POLYGONSCAN_API_KEY in .env
 */

const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

// Must match values used in deploy.js exactly (constructor args must match)
const TREASURY   = "0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb";
const BASE_FARE  = ethers.parseUnits("0.50", 6);
const PER_KM     = ethers.parseUnits("0.40", 6);
const PER_MIN    = ethers.parseUnits("0.10", 6);
const TIMELOCK_DELAY = 172800n;

async function verify(address, constructorArguments, contractPath) {
  console.log(`\nVerifying ${contractPath ?? address} at ${address}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments,
      contract: contractPath,
    });
    console.log("  ✓ Verified");
  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("  ✓ Already verified");
    } else {
      console.warn("  ✗ Verification failed:", err.message);
    }
  }
}

async function main() {
  const addrFile = path.join(__dirname, "..", "deployed-addresses.json");
  if (!fs.existsSync(addrFile)) {
    throw new Error("deployed-addresses.json not found — run deploy.js first");
  }

  const data = JSON.parse(fs.readFileSync(addrFile, "utf8"));
  const a = data.contracts;
  const deployer = data.deployer;

  console.log("=".repeat(60));
  console.log("RideChain — Polygonscan Verification");
  console.log("=".repeat(60));
  console.log("Network:", data.network, `(chainId ${data.chainId})`);
  console.log("Deployed at:", data.deployedAt);

  // 1. MockUSDC (no constructor args)
  await verify(a.MOCK_USDC, [], "contracts/MockUSDC.sol:MockUSDC");

  // 2. RideChainToken (founder = deployer)
  await verify(a.RIDE_CHAIN_TOKEN, [deployer], "contracts/RideChainToken.sol:RideChainToken");

  // 3. TimelockController
  await verify(
    a.TIMELOCK,
    [
      TIMELOCK_DELAY,
      [deployer],
      [deployer],
      deployer,
    ],
    "contracts/RideChainGovernor.sol:TimelockController"
  );

  // 4. RideChainGovernor
  const councilMembers = [deployer, deployer, deployer, deployer, deployer];
  await verify(
    a.GOVERNOR,
    [a.RIDE_CHAIN_TOKEN, a.TIMELOCK, deployer, councilMembers],
    "contracts/RideChainGovernor.sol:RideChainGovernor"
  );

  // 5. RideHailing
  await verify(
    a.RIDE_HAILING,
    [a.MOCK_USDC, TREASURY],
    "contracts/RideHailing.sol:RideHailing"
  );

  // 6. RideChainLicence
  await verify(
    a.LICENCE,
    [a.MOCK_USDC],
    "contracts/RideChainLicence.sol:RideChainLicence"
  );

  // 7. PricingOracle
  await verify(
    a.PRICING_ORACLE,
    [BASE_FARE, PER_KM, PER_MIN],
    "contracts/PricingOracle.sol:PricingOracle"
  );

  console.log("\n" + "=".repeat(60));
  console.log("Verification complete.");
  console.log("View on Polygonscan Amoy:");
  for (const [name, addr] of Object.entries(a)) {
    console.log(`  ${name.padEnd(20)} https://amoy.polygonscan.com/address/${addr}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
