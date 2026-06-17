const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const fs = require("fs");
  const d = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  const { MOCK_USDC, RIDE_HAILING } = d.contracts;

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach(MOCK_USDC);
  const RideHailing = await ethers.getContractFactory("RideHailing");
  const rh = RideHailing.attach(RIDE_HAILING);

  // Ensure USDC balance
  const bal = await usdc.balanceOf(signer.address);
  console.log("USDC:", ethers.formatUnits(bal, 6));
  if (bal < ethers.parseUnits("50", 6)) {
    const tx = await usdc.mint(signer.address, ethers.parseUnits("200", 6));
    await tx.wait();
    console.log("Minted USDC");
  }

  // Request MPESA ride
  const P = ethers.keccak256(ethers.toUtf8Bytes("A"));
  const D = ethers.keccak256(ethers.toUtf8Bytes("B"));
  const F = ethers.parseUnits("12.50", 6);

  console.log("\nRequesting MPESA ride...");
  const tx = await rh.connect(signer).requestRide(P, D, F, 1200n, F, 2, { gasLimit: 200000 });
  const r = await tx.wait();
  let rideId;
  for (const log of r.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "RideRequested") {
        rideId = parsed.args.rideId;
        break;
      }
    } catch {}
  }
  console.log(`✅ MPESA ride requested! rideId=${rideId}, tx=${tx.hash}`);

  // Verify ride state
  const ride = await rh.getRide(rideId);
  console.log(`  State: ${ride.state}`);
  console.log(`  Payment: ${ride.paymentMethod}`);
  console.log(`  Fare: ${ethers.formatUnits(ride.recommendedFare, 6)} USDC`);
  console.log(`  Pickup: ${ride.pickupHash.slice(0, 20)}...`);

  // Request CASH ride for comparison
  console.log("\nRequesting CASH ride...");
  const tx2 = await rh.connect(signer).requestRide(P, D, F, 1200n, F, 1, { gasLimit: 200000 });
  const r2 = await tx2.wait();
  let rideId2;
  for (const log of r2.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "RideRequested") { rideId2 = parsed.args.rideId; break; }
    } catch {}
  }
  console.log(`✅ CASH ride requested! rideId=${rideId2}`);

  // Request USDC ride for comparison 
  console.log("\nRequesting USDC ride...");
  await usdc.approve(RIDE_HAILING, F * 2n);
  const tx3 = await rh.connect(signer).requestRide(P, D, F, 1200n, F, 0, { gasLimit: 200000 });
  await tx3.wait();
  // Get rideId from event
  const r3 = await tx3.wait();
  let rideId3;
  for (const log of r3.logs) {
    try {
      const parsed = rh.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "RideRequested") { rideId3 = parsed.args.rideId; break; }
    } catch {}
  }
  console.log(`✅ USDC ride requested! rideId=${rideId3}`);

  console.log("\n✅ All 3 payment methods work on Amoy!");
}

main().catch(e => console.error(e));
