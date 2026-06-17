/**
 * RideChain -- Register a Regional Master Licence
 *
 * Usage:
 *   REGION="East Africa" COUNTRIES="Kenya,Uganda,Tanzania,Rwanda" \
 *     npx hardhat run scripts/add-regional-licence.js --network amoy
 *
 * Cost: $200,000 USDC (flows directly to founder wallet).
 * The caller (PRIVATE_KEY in .env) must hold >= 200,000 USDC.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const LICENCE_ABI = [
  "function registerRegionalLicence(string regionName, string[] countries) external",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
];

const FEE_USD = 200_000;
const FEE_RAW = ethers.parseUnits(String(FEE_USD), 6);

async function main() {
  const regionName = process.env.REGION;
  const countriesRaw = process.env.COUNTRIES;

  if (!regionName)   throw new Error("Set REGION env var (e.g. REGION=\"East Africa\")");
  if (!countriesRaw) throw new Error("Set COUNTRIES env var (comma-separated, e.g. COUNTRIES=\"Kenya,Uganda,Tanzania\")");

  const countries = countriesRaw.split(",").map((c) => c.trim()).filter(Boolean);
  if (countries.length === 0) throw new Error("COUNTRIES must include at least one country");

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const usdc    = new ethers.Contract(addresses.MOCK_USDC, ERC20_ABI, deployer);
  const licence = new ethers.Contract(addresses.LICENCE,   LICENCE_ABI, deployer);

  console.log("=".repeat(60));
  console.log("RideChain -- Register Regional Master Licence");
  console.log("=".repeat(60));
  console.log("Region    :", regionName);
  console.log("Countries :", countries.join(", "));
  console.log("Fee       : $200,000 USDC");
  console.log("Operator  :", deployer.address);
  console.log("-".repeat(60));

  const balance   = await usdc.balanceOf(deployer.address);
  const allowance = await usdc.allowance(deployer.address, addresses.LICENCE);
  console.log("USDC balance  :", ethers.formatUnits(balance, 6));
  console.log("USDC allowance:", ethers.formatUnits(allowance, 6));

  if (balance < FEE_RAW) {
    throw new Error(`Insufficient USDC. Have ${ethers.formatUnits(balance,6)}, need ${FEE_USD}`);
  }

  if (allowance < FEE_RAW) {
    console.log("\nApproving USDC spend...");
    const tx = await usdc.approve(addresses.LICENCE, FEE_RAW);
    await tx.wait();
    console.log("Approved:", tx.hash);
  }

  console.log("\nRegistering regional licence...");
  const tx = await licence.registerRegionalLicence(regionName, countries);
  const receipt = await tx.wait();
  console.log("Confirmed:", receipt.hash);
  console.log("\nRegional licence registered successfully!");
  console.log(`View: https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
