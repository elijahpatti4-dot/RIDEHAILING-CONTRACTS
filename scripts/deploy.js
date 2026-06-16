/**
 * RideChain — Full deployment script for Polygon Amoy testnet
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your values
 *   2. Get test MATIC from https://faucet.polygon.technology (select Amoy)
 *   3. Run: npx hardhat run scripts/deploy.js --network amoy
 *
 * Output: deployed-addresses.json (used by verify.js and the frontend)
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
//  Config — edit these before deploying
// ─────────────────────────────────────────────────────────────────────────────

// All licensing fees and ride-volume fees flow exclusively to this address.
const TREASURY = "0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb";

// PricingOracle default rates (USDC, 6 decimals) — Nairobi baseline
const BASE_FARE     = ethers.parseUnits("0.50", 6); // $0.50 flat
const PER_KM        = ethers.parseUnits("0.40", 6); // $0.40 / km
const PER_MIN       = ethers.parseUnits("0.10", 6); // $0.10 / min

// Timelock min delay: 2 days (172800 seconds)
const TIMELOCK_DELAY = 172800n;

// ─────────────────────────────────────────────────────────────────────────────
//  Deploy
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("RideChain — Deploy Script");
  console.log("=".repeat(60));
  console.log("Network     :", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer    :", deployer.address);
  console.log("Treasury    :", TREASURY);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("MATIC balance:", ethers.formatEther(balance), "MATIC");
  console.log("-".repeat(60));

  if (balance === 0n) {
    throw new Error("Deployer has 0 MATIC — get testnet MATIC from https://faucet.polygon.technology");
  }

  const addresses = {};

  // ── 1. MockUSDC ───────────────────────────────────────────────────────────
  // Testnet only. On mainnet, use real USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  console.log("\n[1/7] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  addresses.MOCK_USDC = await usdc.getAddress();
  console.log("      MockUSDC:", addresses.MOCK_USDC);

  // ── 2. RideChainToken ─────────────────────────────────────────────────────
  console.log("\n[2/7] Deploying RideChainToken...");
  const Token = await ethers.getContractFactory("RideChainToken");
  const token = await Token.deploy(deployer.address); // founder = deployer
  await token.waitForDeployment();
  addresses.RIDE_CHAIN_TOKEN = await token.getAddress();
  // FounderVesting is deployed by the token constructor — read it back
  addresses.FOUNDER_VESTING = await token.vestingContract();
  console.log("      RideChainToken  :", addresses.RIDE_CHAIN_TOKEN);
  console.log("      FounderVesting  :", addresses.FOUNDER_VESTING);

  // ── 3. TimelockController ─────────────────────────────────────────────────
  console.log("\n[3/7] Deploying TimelockController...");
  const TimelockFactory = await ethers.getContractFactory("TimelockController");
  // proposers and executors will be set to the Governor after it's deployed
  // for now we pass deployer as temporary proposer/executor; revoked after wiring
  const timelock = await TimelockFactory.deploy(
    TIMELOCK_DELAY,
    [deployer.address], // proposers (temporary — Governor added below)
    [deployer.address], // executors (temporary)
    deployer.address    // admin (revoked after wiring)
  );
  await timelock.waitForDeployment();
  addresses.TIMELOCK = await timelock.getAddress();
  console.log("      TimelockController:", addresses.TIMELOCK);

  // ── 4. RideChainGovernor ──────────────────────────────────────────────────
  console.log("\n[4/7] Deploying RideChainGovernor...");
  // Guardian council — use deployer address for all 5 slots on testnet.
  // Replace with real multisig addresses on mainnet.
  const councilMembers = [
    deployer.address,
    deployer.address,
    deployer.address,
    deployer.address,
    deployer.address,
  ];
  const Governor = await ethers.getContractFactory("RideChainGovernor");
  const governor = await Governor.deploy(
    addresses.RIDE_CHAIN_TOKEN,
    addresses.TIMELOCK,
    deployer.address, // foundingWallet
    councilMembers
  );
  await governor.waitForDeployment();
  addresses.GOVERNOR = await governor.getAddress();
  console.log("      RideChainGovernor:", addresses.GOVERNOR);

  // Wire Governor into Timelock roles
  console.log("      Wiring Governor roles into Timelock...");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const TIMELOCK_ADMIN_ROLE = await timelock.TIMELOCK_ADMIN_ROLE();

  await (await timelock.grantRole(PROPOSER_ROLE,  addresses.GOVERNOR)).wait();
  await (await timelock.grantRole(EXECUTOR_ROLE,  ethers.ZeroAddress)).wait(); // anyone can execute
  await (await timelock.grantRole(CANCELLER_ROLE, addresses.GOVERNOR)).wait();
  // Revoke deployer's admin role — timelock is now self-administered
  await (await timelock.revokeRole(TIMELOCK_ADMIN_ROLE, deployer.address)).wait();
  console.log("      Timelock roles configured.");

  // ── 5. RideHailing ────────────────────────────────────────────────────────
  console.log("\n[5/7] Deploying RideHailing...");
  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rideHailing = await RideHailing.deploy(
    addresses.MOCK_USDC,
    TREASURY
  );
  await rideHailing.waitForDeployment();
  addresses.RIDE_HAILING = await rideHailing.getAddress();
  console.log("      RideHailing:", addresses.RIDE_HAILING);

  // ── 6. RideChainLicence ───────────────────────────────────────────────────
  console.log("\n[6/7] Deploying RideChainLicence...");
  const Licence = await ethers.getContractFactory("RideChainLicence");
  const licence = await Licence.deploy(addresses.MOCK_USDC);
  await licence.waitForDeployment();
  addresses.LICENCE = await licence.getAddress();
  console.log("      RideChainLicence:", addresses.LICENCE);

  // ── 7. PricingOracle ──────────────────────────────────────────────────────
  console.log("\n[7/7] Deploying PricingOracle...");
  const Oracle = await ethers.getContractFactory("PricingOracle");
  const oracle = await Oracle.deploy(BASE_FARE, PER_KM, PER_MIN);
  await oracle.waitForDeployment();
  addresses.PRICING_ORACLE = await oracle.getAddress();
  console.log("      PricingOracle:", addresses.PRICING_ORACLE);

  // Wire PricingOracle into RideHailing
  console.log("      Wiring PricingOracle into RideHailing...");
  await (await rideHailing.setPricingOracle(addresses.PRICING_ORACLE)).wait();
  console.log("      Done.");

  // ─────────────────────────────────────────────────────────────────────────
  //  Save addresses
  // ─────────────────────────────────────────────────────────────────────────

  const output = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury: TREASURY,
    contracts: addresses,
  };

  const outPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("All contracts deployed successfully!");
  console.log("=".repeat(60));
  console.log(JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to: deployed-addresses.json");
  console.log("\nNext step: run  npx hardhat run scripts/verify.js --network amoy");
  console.log("Then update frontend/src/config/contracts.js with these addresses.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
