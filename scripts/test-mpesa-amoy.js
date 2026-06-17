/**
 * Full M-Pesa test: rider + driver as separate wallets on Amoy
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [signer] = await ethers.getSigners();

  // Create a throwaway driver wallet
  const driverWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log("Driver wallet:", driverWallet.address);

  // Fund driver with MATIC + USDC
  const MATIC_AMT = ethers.parseEther("0.05");
  await (await signer.sendTransaction({ to: driverWallet.address, value: MATIC_AMT })).wait();
  console.log("  Funded with 0.05 MATIC");

  // Load addresses
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8"));
  const { MOCK_USDC, RIDE_HAILING } = data.contracts;

  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rh = RideHailing.attach(RIDE_HAILING);
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach(MOCK_USDC);

  // Mint USDC to both
  await (await usdc.mint(signer.address, ethers.parseUnits("100", 6))).wait();
  await (await usdc.connect(signer).mint(driverWallet.address, ethers.parseUnits("50", 6))).wait();
  console.log("  Funded both with USDC");

  // ── M-Pesa Flow ──
  const P = ethers.keccak256(ethers.toUtf8Bytes("A"));
  const D = ethers.keccak256(ethers.toUtf8Bytes("B"));
  const F = ethers.parseUnits("10", 6);

  console.log("\n── M-Pesa Full Flow ──\n");

  // 1. Rider requests M-Pesa ride
  console.log("[1] Rider requests M-Pesa ride...");
  let tx = await rh.connect(signer).requestRide(P, D, F, 600n, F, 2);
  let r = await tx.wait();
  let rideId;
  for (const l of r.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === "RideRequested") { rideId = parsed.args.rideId; break; }
    } catch {}
  }
  console.log(`  rideId=${rideId}  tx=${tx.hash.slice(0, 20)}... ✅`);

  // 2. Driver bonds + accepts
  console.log("[2] Driver bonds + accepts...");
  const BOND = (F * 10n) / 100n;
  await (await usdc.connect(driverWallet).approve(RIDE_HAILING, BOND)).wait();
  tx = await rh.connect(driverWallet).acceptOffer(rideId);
  await tx.wait();
  console.log(`  Driver accepted ✅`);

  // 3. Rider starts ride
  console.log("[3] Rider starts ride...");
  tx = await rh.connect(signer).startRide(rideId);
  await tx.wait();
  console.log(`  Ride started ✅`);

  // 4. Rider completes ride
  console.log("[4] Rider completes ride...");
  tx = await rh.connect(signer).completeRide(rideId);
  await tx.wait();
  console.log(`  Ride completed ✅`);

  // 5. Driver confirms M-Pesa
  console.log("[5] Driver confirms M-Pesa received...");
  const FEE = (F * 5n) / 100n;
  await (await usdc.connect(driverWallet).approve(RIDE_HAILING, FEE)).wait();
  tx = await rh.connect(driverWallet).confirmMpesaReceived(rideId, "RBC1A2B3C4D");
  r = await tx.wait();

  for (const l of r.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === "MpesaPaymentConfirmed") {
        console.log(`  ✅ MpesaPaymentConfirmed:`);
        console.log(`     rideId: ${parsed.args.rideId}`);
        console.log(`     driver: ${parsed.args.driver}`);
        console.log(`     fee:    ${ethers.formatUnits(parsed.args.fee, 6)} USDC`);
        console.log(`     code:   ${parsed.args.mpesaCode}`);
      }
    } catch {}
  }

  // 6. Final state
  const finalRide = await rh.getRide(rideId);
  console.log(`\n── Final State ──`);
  const states = ["REQUESTED","ACCEPTED","IN_PROGRESS","COMPLETED","DISPUTED","CANCELLED"];
  const pms = ["USDC","CASH","MPESA"];
  console.log(`  State:          ${states[Number(finalRide.state)]}`);
  console.log(`  Payment:        ${pms[Number(finalRide.paymentMethod)]}`);
  console.log(`  M-Pesa code:    ${finalRide.mpesaCode}`);
  console.log(`  Settlement:     ${finalRide.settlementPending ? "PENDING" : "DONE ✅"}`);

  console.log(`\n✅ Full M-Pesa flow PASSED on Polygon Amoy!`);
}

main().catch(e => { console.error(e); process.exit(1); });
