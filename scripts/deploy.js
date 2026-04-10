const { ethers } = require("hardhat");

/**
 * Deploy script for Polygon Mumbai testnet.
 *
 * Before running:
 * 1. Set your wallet private key as environment variable PRIVATE_KEY
 * 2. Get test MATIC from https://faucet.polygon.technology
 * 3. Run: npx hardhat run scripts/deploy.js --network mumbai
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with wallet:", deployer.address);

  // On Mumbai testnet use a real test USDC contract address
  // or deploy MockUSDC first for full testing
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC deployed to:", await usdc.getAddress());

  // Treasury is the deployer wallet for testing
  // In production this is the DAO treasury contract address
  const treasury = deployer.address;

  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rideHailing = await RideHailing.deploy(
    await usdc.getAddress(),
    treasury
  );
  await rideHailing.waitForDeployment();
  console.log("RideHailing deployed to:", await rideHailing.getAddress());

  console.log("\n--- Save these addresses ---");
  console.log("USDC:", await usdc.getAddress());
  console.log("RideHailing:", await rideHailing.getAddress());
  console.log("Treasury:", treasury);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
