const { ethers } = require("hardhat");
async function main() {
  const [s] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(s.address);
  console.log("MATIC:", ethers.formatEther(bal));
}
main();
