const { ethers } = require("hardhat");
async function main() {
  const d = require("../deployed-addresses.json");
  const addr = d.contracts.RIDE_HAILING;

  // Check provider
  const net = await ethers.provider.getNetwork();
  console.log("Provider chainId:", net.chainId);

  // Get code
  const code = await ethers.provider.getCode(addr);
  console.log("RIDE_HAILING:", addr);
  console.log("Code 0x prefix? (length > 2):", code !== "0x" && code.length > 2);
  console.log("Code length:", code.length);

  // Also check MOCK_USDC
  const code2 = await ethers.provider.getCode(d.contracts.MOCK_USDC);
  console.log("MOCK_USDC:", d.contracts.MOCK_USDC, "has code:", code2 !== "0x" && code2.length > 2);

  // Try provider directly
  const provider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");
  const net2 = await provider.getNetwork();
  console.log("Direct RPC chainId:", net2.chainId);
  const code3 = await provider.getCode(addr);
  console.log("Direct RPC code:", code3.length > 2);
  const bal = await provider.getBalance("0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb");
  console.log("Direct RPC deployer balance:", ethers.formatEther(bal));
}
main();
