/**
 * RideChain -- Verify a driver address (owner only)
 *
 * Windows CMD:
 *   set DRIVER=0xYourDriverAddress
 *   npx hardhat run scripts/verify-driver.js --network amoy
 *
 * PowerShell:
 *   $env:DRIVER="0xYourDriverAddress"
 *   npx hardhat run scripts/verify-driver.js --network amoy
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ABI = [
  "function verifyDriver(address driver) external",
  "function reputations(address) external view returns (uint256,uint256,uint256,uint256,uint256,bool,uint8)",
];

async function main() {
  const driver = process.env.DRIVER;
  if (!driver || !ethers.isAddress(driver)) {
    throw new Error(
      "Set DRIVER env var to a valid address.\n" +
      "  CMD:        set DRIVER=0x...\n" +
      "  PowerShell: $env:DRIVER=\"0x...\""
    );
  }

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const rideHailing = new ethers.Contract(addresses.RIDE_HAILING, ABI, deployer);

  // Check current status
  const rep = await rideHailing.reputations(driver);
  const isVerified = rep[5]; // isVerifiedDriver is index 5

  console.log("=".repeat(60));
  console.log("RideChain -- Verify Driver");
  console.log("=".repeat(60));
  console.log("Driver    :", driver);
  console.log("Currently :", isVerified ? "Already verified" : "Not verified");
  console.log("-".repeat(60));

  if (isVerified) {
    console.log("Driver is already verified. Nothing to do.");
    return;
  }

  console.log("Verifying driver...");
  const tx = await rideHailing.verifyDriver(driver);
  const receipt = await tx.wait();
  console.log("Confirmed :", receipt.hash);

  const rep2 = await rideHailing.reputations(driver);
  console.log("Status now:", rep2[5] ? "Verified" : "Failed");
  console.log(`View: https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
