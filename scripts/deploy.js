/**
 * RideChain -- Full deployment script for Polygon Amoy testnet
 * Run: npx hardhat run scripts/deploy.js --network amoy
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const TREASURY = "0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb";
const BASE_FARE = ethers.parseUnits("0.50", 6);
const PER_KM    = ethers.parseUnits("0.40", 6);
const PER_MIN   = ethers.parseUnits("0.10", 6);
const TIMELOCK_DELAY = 172800n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("RideChain -- Deploy Script");
  console.log("Network     :", network.name, "(chainId", network.chainId + ")");
  console.log("Deployer    :", deployer.address);
  console.log("Treasury    :", TREASURY);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("MATIC balance:", ethers.formatEther(balance), "MATIC");
  console.log("-".repeat(60));

  if (balance === 0n) throw new Error("Deployer has 0 MATIC");

  const addresses = {};

  console.log("\n[1/7] Deploying MockUSDC...");
  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();
  addresses.MOCK_USDC = await usdc.getAddress();
  console.log("      MockUSDC:", addresses.MOCK_USDC);

  console.log("\n[2/7] Deploying RideChainToken...");
  const token = await (await ethers.getContractFactory("RideChainToken")).deploy(deployer.address);
  await token.waitForDeployment();
  addresses.RIDE_CHAIN_TOKEN = await token.getAddress();
  addresses.FOUNDER_VESTING  = await token.vestingContract();
  console.log("      RideChainToken :", addresses.RIDE_CHAIN_TOKEN);
  console.log("      FounderVesting :", addresses.FOUNDER_VESTING);

  console.log("\n[3/7] Deploying TimelockController...");
  const timelock = await (await ethers.getContractFactory("TimelockController")).deploy(
    TIMELOCK_DELAY,
    [deployer.address],
    [deployer.address],
    deployer.address
  );
  await timelock.waitForDeployment();
  addresses.TIMELOCK = await timelock.getAddress();
  console.log("      TimelockController:", addresses.TIMELOCK);

  console.log("\n[4/7] Deploying RideChainGovernor...");
  const councilMembers = Array(5).fill(deployer.address);
  const governor = await (await ethers.getContractFactory("RideChainGovernor")).deploy(
    addresses.RIDE_CHAIN_TOKEN, addresses.TIMELOCK, deployer.address, councilMembers
  );
  await governor.waitForDeployment();
  addresses.GOVERNOR = await governor.getAddress();
  console.log("      RideChainGovernor:", addresses.GOVERNOR);

  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(),      addresses.GOVERNOR)).wait();
  await (await timelock.grantRole(await timelock.EXECUTOR_ROLE(),      ethers.ZeroAddress)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(),     addresses.GOVERNOR)).wait();
  await (await timelock.revokeRole(await timelock.TIMELOCK_ADMIN_ROLE(), deployer.address)).wait();
  console.log("      Timelock roles configured.");

  console.log("\n[5/7] Deploying RideHailing...");
  const rideHailing = await (await ethers.getContractFactory("RideHailing")).deploy(
    addresses.MOCK_USDC, TREASURY
  );
  await rideHailing.waitForDeployment();
  addresses.RIDE_HAILING = await rideHailing.getAddress();
  console.log("      RideHailing:", addresses.RIDE_HAILING);

  console.log("\n[6/7] Deploying RideChainLicence...");
  const licence = await (await ethers.getContractFactory("RideChainLicence")).deploy(addresses.MOCK_USDC);
  await licence.waitForDeployment();
  addresses.LICENCE = await licence.getAddress();
  console.log("      RideChainLicence:", addresses.LICENCE);

  console.log("\n[7/7] Deploying PricingOracle...");
  const oracle = await (await ethers.getContractFactory("PricingOracle")).deploy(BASE_FARE, PER_KM, PER_MIN);
  await oracle.waitForDeployment();
  addresses.PRICING_ORACLE = await oracle.getAddress();
  console.log("      PricingOracle:", addresses.PRICING_ORACLE);

  await (await rideHailing.setPricingOracle(addresses.PRICING_ORACLE)).wait();
  console.log("      PricingOracle wired into RideHailing.");

  const output = {
    network: network.name, chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address, treasury: TREASURY,
    contracts: addresses,
  };
  fs.writeFileSync(path.join(__dirname, "..", "deployed-addresses.json"), JSON.stringify(output, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("All contracts deployed!");
  console.log(JSON.stringify(addresses, null, 2));
  console.log("\nNext: npx hardhat run scripts/update-frontend-addresses.js");
  console.log("Then: npx hardhat run scripts/verify.js --network amoy");
}

main().catch((err) => { console.error(err); process.exit(1); });
