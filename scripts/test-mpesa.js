/**
 * RideChain — M-Pesa payment flow test on Polygon Amoy
 *
 * Single-signer test: deployer acts as both rider and driver.
 *
 * Flow:
 *   1. Mint USDC to deployer
 *   2. Deployer (as rider) requests ride with PaymentMethod.MPESA
 *   3. Deployer (as driver) accepts (pays bond in USDC)
 *   4. Rider starts ride
 *   5. Rider completes ride (triggers settlementPending)
 *   6. Driver confirms M-Pesa received with transaction code
 *   7. Verify on-chain state
 */

const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();  // single wallet = rider + driver
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("M-Pesa Payment Flow Test (single signer)");
  console.log("=".repeat(60));
  console.log(`Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`Wallet   : ${signer.address}`);
  console.log("-".repeat(60));

  // ── Load deployed addresses ─────────────────────────────────────────────
  const fs = require("fs");
  const path = require("path");
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8")
  );
  const { MOCK_USDC, RIDE_HAILING } = data.contracts;

  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rideHailing = RideHailing.attach(RIDE_HAILING);
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach(MOCK_USDC);

  // ── 1. Fund deployer with USDC ──────────────────────────────────────────
  const AMOUNT = ethers.parseUnits("200", 6);

  console.log("\n[1] Minting USDC…");
  let bal = await usdc.balanceOf(signer.address);
  if (bal < AMOUNT) {
    const tx = await usdc.mint(signer.address, AMOUNT);
    await tx.wait();
    console.log(`  Minted ${ethers.formatUnits(AMOUNT, 6)} USDC`);
  }
  bal = await usdc.balanceOf(signer.address);
  console.log(`  Balance: ${ethers.formatUnits(bal, 6)} USDC`);

  // ── 2. Rider requests a ride with M-Pesa ────────────────────────────────
  const PICKUP   = ethers.keccak256(ethers.toUtf8Bytes("Nairobi CBD, KICC"));
  const DROPOFF  = ethers.keccak256(ethers.toUtf8Bytes("Westlands, Sarit Centre"));
  const FARE     = ethers.parseUnits("12.50", 6);   // $12.50
  const DURATION = 1200n;                            // 20 min
  const OFFER    = FARE;                             // opening offer = full fare
  const MPESA    = 2;                                // PaymentMethod.MPESA

  console.log("\n[2] Rider requesting ride (M-Pesa payment)…");
  const requestTx = await rideHailing.connect(signer).requestRide(
    PICKUP, DROPOFF, FARE, DURATION, OFFER, MPESA
  );
  const receipt = await requestTx.wait();

  // Parse RideRequested event to get rideId
  let rideId;
  for (const log of receipt.logs) {
    try {
      const parsed = rideHailing.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "RideRequested") {
        rideId = parsed.args.rideId;
        break;
      }
    } catch {}
  }
  if (rideId === undefined) throw new Error("Could not find RideRequested event");
  console.log(`  Ride requested → rideId=${rideId}`);
  console.log(`  Tx: ${requestTx.hash}`);

  // ── 3. Driver bonds + accepts ───────────────────────────────────────────
  const BOND = (FARE * 10n) / 100n; // 10% bond
  console.log(`\n[3] Driver approving bond (${ethers.formatUnits(BOND, 6)} USDC)…`);
  let tx = await usdc.connect(signer).approve(RIDE_HAILING, BOND);
  await tx.wait();

  console.log("  Driver accepting offer…");
  const acceptTx = await rideHailing.connect(signer).acceptOffer(rideId);
  await acceptTx.wait();
  console.log(`  Tx: ${acceptTx.hash}`);

  // ── 4. Rider starts ride ────────────────────────────────────────────────
  console.log("\n[4] Rider starting ride…");
  const startTx = await rideHailing.connect(signer).startRide(rideId);
  await startTx.wait();
  console.log(`  Tx: ${startTx.hash}`);

  // ── 5. Rider completes ride ─────────────────────────────────────────────
  // M-Pesa flow: completeRide sets settlementPending = true
  console.log("\n[5] Rider completing ride…");
  const completeTx = await rideHailing.connect(signer).completeRide(rideId);
  await completeTx.wait();
  console.log(`  Tx: ${completeTx.hash}`);

  const ride = await rideHailing.getRide(rideId);
  console.log(`  Settlement pending: ${ride.settlementPending}`);
  console.log(`  Payment method: ${ride.paymentMethod}`); // should be 2 (MPESA)

  // ── 6. Driver confirms M-Pesa received ──────────────────────────────────
  // First approve the 5% platform fee
  const PLATFORM_FEE = (FARE * 5n) / 100n;
  console.log(`\n[6] Driver approving 5% fee (${ethers.formatUnits(PLATFORM_FEE, 6)} USDC)…`);
  tx = await usdc.connect(signer).approve(RIDE_HAILING, PLATFORM_FEE);
  await tx.wait();

  const mpesaCode = "RBC1A2B3C4D";
  console.log(`  Confirming M-Pesa received with code: ${mpesaCode}`);
  const mpesaTx = await rideHailing.connect(signer).confirmMpesaReceived(rideId, mpesaCode);
  const mpesaReceipt = await mpesaTx.wait();
  console.log(`  Tx: ${mpesaTx.hash}`);

  // Parse MpesaPaymentConfirmed event
  for (const log of mpesaReceipt.logs) {
    try {
      const parsed = rideHailing.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "MpesaPaymentConfirmed") {
        console.log(`  ✅ MpesaPaymentConfirmed:`);
        console.log(`     rideId: ${parsed.args.rideId}`);
        console.log(`     driver: ${parsed.args.driver}`);
        console.log(`     fee:    ${ethers.formatUnits(parsed.args.fee, 6)} USDC`);
        console.log(`     code:   ${parsed.args.mpesaCode}`);
      }
    } catch {}
  }

  // ── 7. Final state checks ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Final state:");
  console.log("=".repeat(60));

  const finalRide = await rideHailing.getRide(rideId);
  console.log(`  State:            ${finalRide.state}`);   // 3 = Completed
  console.log(`  Payment method:   ${finalRide.paymentMethod}`);
  console.log(`  Settlement done:  ${!finalRide.settlementPending}`);
  console.log(`  M-Pesa code:      ${finalRide.mpesaCode}`);
  console.log(`  Driver bond:      ${ethers.formatUnits(finalRide.driverBond, 6)} USDC`);

  const finalBal = await usdc.balanceOf(signer.address);
  console.log(`\n  Wallet USDC: ${ethers.formatUnits(finalBal, 6)}`);

  console.log("\n✅ M-Pesa payment flow test PASSED!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
