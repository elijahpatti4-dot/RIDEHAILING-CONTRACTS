/**
 * Redeploy RideHailing with fresh compilation and test M-Pesa flow
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.chainId);
  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "MATIC\n");

  // Use existing MockUSDC + PricingOracle
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf8"));
  const { MOCK_USDC, PRICING_ORACLE } = data.contracts;

  console.log("Using existing:");
  console.log("  MockUSDC:", MOCK_USDC);
  console.log("  PricingOracle:", PRICING_ORACLE);

  // Deploy fresh RideHailing
  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rh = await RideHailing.deploy(MOCK_USDC, signer.address);
  await rh.waitForDeployment();
  const RH_ADDR = await rh.getAddress();
  console.log("\nNew RideHailing:", RH_ADDR);

  // Wire oracle
  await (await rh.setPricingOracle(PRICING_ORACLE)).wait();
  console.log("  PricingOracle wired ✅");

  // Mint USDC to signer
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach(MOCK_USDC);
  const mintAmt = ethers.parseUnits("200", 6);
  const bal = await usdc.balanceOf(signer.address);
  if (bal < mintAmt) {
    await (await usdc.mint(signer.address, mintAmt)).wait();
    console.log("  USDC minted ✅");
  }

  // ── Test M-Pesa flow ────────────────────────────────────────────────────
  const P = ethers.keccak256(ethers.toUtf8Bytes("A"));
  const D = ethers.keccak256(ethers.toUtf8Bytes("B"));
  const F = ethers.parseUnits("10", 6);

  console.log("\n── M-Pesa Flow Test ──");

  // 1. Request M-Pesa ride
  console.log("\n[1] Requesting M-Pesa ride...");
  let tx = await rh.connect(signer).requestRide(P, D, F, 600n, F, 2);
  let r = await tx.wait();
  let rideId;
  for (const l of r.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === "RideRequested") { rideId = parsed.args.rideId; break; }
    } catch {}
  }
  console.log("  rideId:", rideId?.toString(), "✅");

  // 2. Driver bonds + accepts (same wallet for test)
  const BOND = (F * 10n) / 100n;
  await (await usdc.approve(RH_ADDR, BOND)).wait();
  tx = await rh.connect(signer).acceptOffer(rideId);
  await tx.wait();
  console.log("[2] Driver accepted ✅");

  // 3. Start ride
  tx = await rh.connect(signer).startRide(rideId);
  await tx.wait();
  console.log("[3] Ride started ✅");

  // 4. Complete ride
  tx = await rh.connect(signer).completeRide(rideId);
  await tx.wait();
  console.log("[4] Ride completed (settlement pending) ✅");

  // 5. Confirm M-Pesa
  const FEE = (F * 5n) / 100n;
  await (await usdc.approve(RH_ADDR, FEE)).wait();
  tx = await rh.connect(signer).confirmMpesaReceived(rideId, "RBC1A2B3C4D");
  r = await tx.wait();
  for (const l of r.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === "MpesaPaymentConfirmed") {
        console.log("[5] ✅ MpesaPaymentConfirmed:", {
          rideId: parsed.args.rideId.toString(),
          driver: parsed.args.driver,
          fee: ethers.formatUnits(parsed.args.fee, 6),
          code: parsed.args.mpesaCode,
        });
      }
    } catch {}
  }

  // 6. Final state
  const finalRide = await rh.getRide(rideId);
  console.log("\n── Final State ──");
  console.log("  State:", Number(finalRide.state), ["REQUESTED","ACCEPTED","IN_PROGRESS","COMPLETED","DISPUTED","CANCELLED"][Number(finalRide.state)]);
  console.log("  Payment:", Number(finalRide.paymentMethod), ["USDC","CASH","MPESA"][Number(finalRide.paymentMethod)]);
  console.log("  M-Pesa Code:", finalRide.mpesaCode);
  console.log("  Settlement done:", !finalRide.settlementPending);
  console.log("  Driver bond returned:", Number(finalRide.driverBond));

  // Update addresses file
  data.contracts.RIDE_HAILING = RH_ADDR;
  fs.writeFileSync(path.join(__dirname, "..", "deployed-addresses.json"), JSON.stringify(data, null, 2) + "\n");
  console.log("\n✅ Addresses updated ✓");
  console.log("✅ M-Pesa flow PASSED!");
}

main().catch(e => { console.error(e); process.exit(1); });
