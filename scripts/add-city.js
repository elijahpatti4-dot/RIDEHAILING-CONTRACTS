/**
 * RideChain -- Register a City Operator Licence
 *
 * Usage:
 *   CITY="Nairobi" OPERATOR=0x... CONTRACT=0x... TIER=0 \
 *     npx hardhat run scripts/add-city.js --network amoy
 *
 * Tiers:  0=COMMUNITY ($5,000)  1=INDEPENDENT ($20,000)
 *         2=ENTERPRISE ($50,000) 3=GOVERNMENT ($100,000)
 *
 * The caller (PRIVATE_KEY in .env) must be the operator
 * and must hold enough USDC to cover the upfront fee.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const TIER_NAMES = ["COMMUNITY", "INDEPENDENT", "ENTERPRISE", "GOVERNMENT"];
const TIER_FEES  = [5_000, 20_000, 50_000, 100_000]; // USD

const LICENCE_ABI = [
  "function registerCityLicence(string cityName, address contractAddress, uint8 tierType) external",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
];

async function main() {
  const cityName    = process.env.CITY;
  const operator    = process.env.OPERATOR;  // defaults to deployer if omitted
  const contractAddr = process.env.CONTRACT;
  const tier        = parseInt(process.env.TIER ?? "0");

  if (!cityName)    throw new Error("Set CITY env var (e.g. CITY=\"Nairobi\")");
  if (!contractAddr) throw new Error("Set CONTRACT env var (deployed RideHailing address for this city)");
  if (tier < 0 || tier > 3) throw new Error("TIER must be 0-3");

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  ).contracts;

  const [deployer] = await ethers.getSigners();
  const operatorAddr = operator || deployer.address;

  const usdc    = new ethers.Contract(addresses.MOCK_USDC, ERC20_ABI, deployer);
  const licence = new ethers.Contract(addresses.LICENCE,   LICENCE_ABI, deployer);

  const feeUsd = TIER_FEES[tier];
  const feeRaw = ethers.parseUnits(String(feeUsd), 6);

  console.log("=".repeat(60));
  console.log("RideChain -- Register City Licence");
  console.log("=".repeat(60));
  console.log("City        :", cityName);
  console.log("Operator    :", operatorAddr);
  console.log("Contract    :", contractAddr);
  console.log("Tier        :", TIER_NAMES[tier], `($${feeUsd.toLocaleString()} USDC)`);
  console.log("Licence addr:", addresses.LICENCE);
  console.log("-".repeat(60));

  const balance   = await usdc.balanceOf(deployer.address);
  const allowance = await usdc.allowance(deployer.address, addresses.LICENCE);
  console.log("USDC balance  :", ethers.formatUnits(balance, 6));
  console.log("USDC allowance:", ethers.formatUnits(allowance, 6));

  if (balance < feeRaw) {
    throw new Error(`Insufficient USDC. Have ${ethers.formatUnits(balance,6)}, need ${feeUsd}`);
  }

  if (allowance < feeRaw) {
    console.log("\nApproving USDC spend...");
    const tx = await usdc.approve(addresses.LICENCE, feeRaw);
    await tx.wait();
    console.log("Approved:", tx.hash);
  }

  console.log("\nRegistering city licence...");
  const tx = await licence.registerCityLicence(cityName, contractAddr, tier);
  const receipt = await tx.wait();
  console.log("Confirmed:", receipt.hash);
  console.log("\nCity licence registered successfully!");
  console.log(`View: https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
