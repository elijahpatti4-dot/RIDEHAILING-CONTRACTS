const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RideHailing Contract", function () {

  let rideHailing, usdc;
  let owner, treasury, rider, driver, stranger;

  const USDC = (amount) => ethers.parseUnits(amount.toString(), 6);

  const PICKUP = ethers.keccak256(ethers.toUtf8Bytes("Nairobi CBD"));
  const DROPOFF = ethers.keccak256(ethers.toUtf8Bytes("Westlands"));
  const NEW_DROPOFF = ethers.keccak256(ethers.toUtf8Bytes("Kilimani"));
  const ROUTE_LOG = ethers.keccak256(ethers.toUtf8Bytes("signed_gps_log"));
  const EVIDENCE = ethers.keccak256(ethers.toUtf8Bytes("dispute_evidence"));

  const REC_FARE = USDC(12);
  const EXPECTED_DURATION = 1200;

  beforeEach(async function () {
    [owner, treasury, rider, driver, stranger] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const RideHailing = await ethers.getContractFactory("RideHailing");
    rideHailing = await RideHailing.deploy(
      await usdc.getAddress(),
      treasury.address
    );

    await usdc.mint(rider.address, USDC(1000));
    await usdc.mint(driver.address, USDC(1000));

    await rideHailing.connect(owner).verifyDriver(driver.address);

    await usdc.connect(rider).approve(await rideHailing.getAddress(), USDC(1000));
    await usdc.connect(driver).approve(await rideHailing.getAddress(), USDC(1000));
  });

  async function setupAcceptedRide() {
    await rideHailing.connect(rider).requestRide(
      PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 0
    );
    await rideHailing.connect(driver).acceptOffer(1);
    return 1;
  }

  // ── Cash ride helpers ─────────────────────────────────────────────────────

  async function setupCashRide() {
    await rideHailing.connect(rider).requestRide(
      PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 1
    );
    const rideId = await rideHailing.rideCount();
    await rideHailing.connect(driver).acceptOffer(rideId);
    await rideHailing.connect(rider).startRide(rideId);
    return rideId;
  }

  async function setupInProgressRide() {
    const rideId = await setupAcceptedRide();
    await rideHailing.connect(rider).startRide(rideId);
    return rideId;
  }

  describe("Ride request", function () {

    it("Rider can request a ride with a valid opening offer", async function () {
      await expect(
        rideHailing.connect(rider).requestRide(
          PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 0
        )
      ).to.emit(rideHailing, "RideRequested");
      const ride = await rideHailing.getRide(1);
      expect(ride.rider).to.equal(rider.address);
      expect(ride.state).to.equal(0);
    });

    it("Rejects an opening offer below the band minimum", async function () {
      await expect(
        rideHailing.connect(rider).requestRide(
          PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(5), 0
        )
      ).to.be.revertedWith("Opening offer outside negotiation band");
    });

    it("Rejects an opening offer above the band maximum", async function () {
      await expect(
        rideHailing.connect(rider).requestRide(
          PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(20), 0
        )
      ).to.be.revertedWith("Opening offer outside negotiation band");
    });

    it("Rider can accept the recommended fare outright", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(10), 0
      );
      await rideHailing.connect(rider).acceptRecommended(1);
      const ride = await rideHailing.getRide(1);
      expect(ride.currentOffer).to.equal(REC_FARE);
    });

  });

  describe("Fare negotiation", function () {

    beforeEach(async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(10), 0
      );
    });

    it("Driver can counter within the band", async function () {
      await expect(
        rideHailing.connect(driver).counterOffer(1, USDC(13))
      ).to.emit(rideHailing, "OfferMade");
    });

    it("Rider can counter the driver's offer", async function () {
      await rideHailing.connect(driver).counterOffer(1, USDC(13));
      await expect(
        rideHailing.connect(rider).counterOffer(1, USDC(11))
      ).to.emit(rideHailing, "OfferMade");
    });

    it("Cannot counter your own standing offer", async function () {
      await expect(
        rideHailing.connect(rider).counterOffer(1, USDC(11))
      ).to.be.revertedWith("Cannot counter your own offer");
    });

    it("Counter offer outside band is rejected", async function () {
      await expect(
        rideHailing.connect(driver).counterOffer(1, USDC(20))
      ).to.be.revertedWith("Offer outside negotiation band");
    });

    it("Stranger cannot make an offer", async function () {
      await expect(
        rideHailing.connect(stranger).counterOffer(1, USDC(11))
      ).to.be.revertedWith("Only rider or verified driver can counter");
    });

    it("Negotiation locks deposits when accepted", async function () {
      const riderBefore = await usdc.balanceOf(rider.address);
      const driverBefore = await usdc.balanceOf(driver.address);

      await rideHailing.connect(driver).acceptOffer(1);

      const riderAfter = await usdc.balanceOf(rider.address);
      const driverAfter = await usdc.balanceOf(driver.address);

      expect(riderBefore - riderAfter).to.equal(USDC(10));
      expect(driverBefore - driverAfter).to.equal(USDC(1));

      const ride = await rideHailing.getRide(1);
      expect(ride.state).to.equal(1);
    });

    it("Cancellation before acceptance costs nothing", async function () {
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(rider).cancelNegotiation(1);
      const riderAfter = await usdc.balanceOf(rider.address);
      expect(riderBefore).to.equal(riderAfter);
      const ride = await rideHailing.getRide(1);
      expect(ride.state).to.equal(5);
    });

  });

  describe("Ride start — rider controls pickup confirmation", function () {

    it("Rider can start the ride after driver accepts", async function () {
      const rideId = await setupAcceptedRide();
      await expect(
        rideHailing.connect(rider).startRide(rideId)
      ).to.emit(rideHailing, "RideStarted");
      const ride = await rideHailing.getRide(rideId);
      expect(ride.state).to.equal(2);
    });

    it("Driver cannot start the ride", async function () {
      const rideId = await setupAcceptedRide();
      await expect(
        rideHailing.connect(driver).startRide(rideId)
      ).to.be.revertedWith("Only the rider can do this");
    });

    it("Stranger cannot start the ride", async function () {
      const rideId = await setupAcceptedRide();
      await expect(
        rideHailing.connect(stranger).startRide(rideId)
      ).to.be.revertedWith("Only the rider can do this");
    });

  });

  describe("Mid-ride amendments", function () {

    it("Rider can propose a new dropoff", async function () {
      const rideId = await setupInProgressRide();
      await expect(
        rideHailing.connect(rider).proposeAmendment(rideId, NEW_DROPOFF, USDC(14))
      ).to.emit(rideHailing, "AmendmentProposed");
    });

    it("CompleteRide is blocked while amendment is pending", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).proposeAmendment(rideId, NEW_DROPOFF, USDC(14));
      await expect(
        rideHailing.connect(rider).completeRide(rideId)
      ).to.be.revertedWith("Resolve pending amendment first");
    });

    it("Driver can accept amendment — fare updates atomically", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).proposeAmendment(rideId, NEW_DROPOFF, USDC(14));
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(driver).acceptAmendment(rideId);
      const riderAfter = await usdc.balanceOf(rider.address);
      expect(riderBefore - riderAfter).to.equal(USDC(2));
      const ride = await rideHailing.getRide(rideId);
      expect(ride.agreedFare).to.equal(USDC(14));
    });

    it("Driver can reject amendment — original terms stand", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).proposeAmendment(rideId, NEW_DROPOFF, USDC(14));
      await rideHailing.connect(driver).rejectAmendment(rideId);
      const ride = await rideHailing.getRide(rideId);
      expect(ride.agreedFare).to.equal(REC_FARE);
      expect(ride.amendmentPending).to.equal(false);
    });

  });

  describe("Ride completion — rider controls payment release", function () {

    it("Rider can complete ride — driver receives 95%, treasury 5%", async function () {
      const rideId = await setupInProgressRide();
      const driverBefore = await usdc.balanceOf(driver.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);
      await rideHailing.connect(rider).completeRide(rideId);
      const driverAfter = await usdc.balanceOf(driver.address);
      const treasuryAfter = await usdc.balanceOf(treasury.address);
      const fee = REC_FARE * 5n / 100n;
      const driverPayout = REC_FARE - fee;
      const bond = REC_FARE * 10n / 100n;
      expect(driverAfter - driverBefore).to.equal(driverPayout + bond);
      expect(treasuryAfter - treasuryBefore).to.equal(fee);
      const ride = await rideHailing.getRide(rideId);
      expect(ride.state).to.equal(3);
    });

    it("Driver cannot call completeRide — only rider can", async function () {
      const rideId = await setupInProgressRide();
      await expect(
        rideHailing.connect(driver).completeRide(rideId)
      ).to.be.revertedWith("Only the rider can do this");
    });

    it("Stranger cannot complete the ride", async function () {
      const rideId = await setupInProgressRide();
      await expect(
        rideHailing.connect(stranger).completeRide(rideId)
      ).to.be.revertedWith("Only the rider can do this");
    });

    it("Driver can claim timeout after window passes", async function () {
      const rideId = await setupInProgressRide();
      await time.increase(EXPECTED_DURATION + 31 * 60);
      const driverBefore = await usdc.balanceOf(driver.address);
      await rideHailing.connect(driver).claimTimeout(rideId);
      const driverAfter = await usdc.balanceOf(driver.address);
      expect(driverAfter).to.be.greaterThan(driverBefore);
    });

    it("Driver cannot claim timeout before window passes", async function () {
      const rideId = await setupInProgressRide();
      await expect(
        rideHailing.connect(driver).claimTimeout(rideId)
      ).to.be.revertedWith("Timeout window has not passed yet");
    });

  });

  describe("Dispute system", function () {

    it("Rider can raise a dispute — escrow freezes", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(driver).submitRouteLog(rideId, ROUTE_LOG);
      await expect(
        rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE)
      ).to.emit(rideHailing, "DisputeRaised");
      const ride = await rideHailing.getRide(rideId);
      expect(ride.state).to.equal(4);
    });

    it("Driver cannot claim timeout during active dispute", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(driver).submitRouteLog(rideId, ROUTE_LOG);
      await rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE);
      await time.increase(EXPECTED_DURATION + 31 * 60);
      await expect(
        rideHailing.connect(driver).claimTimeout(rideId)
      ).to.be.revertedWith("Ride is not in the required state");
    });

    it("Tier 1 auto-resolves in rider favour when no route log submitted", async function () {
      const rideId = await setupInProgressRide();
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE);
      const riderAfter = await usdc.balanceOf(rider.address);
      expect(riderAfter - riderBefore).to.equal(REC_FARE);
    });

    it("Tier 2 community panel can resolve in driver favour", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(driver).submitRouteLog(rideId, ROUTE_LOG);
      await rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE);
      const driverBefore = await usdc.balanceOf(driver.address);
      await rideHailing.connect(owner).resolveByPanel(rideId, driver.address);
      const driverAfter = await usdc.balanceOf(driver.address);
      expect(driverAfter).to.be.greaterThan(driverBefore);
    });

    it("Tier 2 community panel can resolve in rider favour", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(driver).submitRouteLog(rideId, ROUTE_LOG);
      await rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE);
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(owner).resolveByPanel(rideId, rider.address);
      const riderAfter = await usdc.balanceOf(rider.address);
      expect(riderAfter).to.be.greaterThan(riderBefore);
    });

    it("Dispute loss increments driver reputation penalty", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).raiseDispute(rideId, EVIDENCE);
      const rep = await rideHailing.getReputation(driver.address);
      expect(rep.disputesLost).to.equal(1);
    });

  });

  describe("Reputation and ratings", function () {

    it("Both parties can rate each other after ride", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(rider).submitRating(rideId, 5)
      ).to.emit(rideHailing, "RatingSubmitted");
      await expect(
        rideHailing.connect(driver).submitRating(rideId, 4)
      ).to.emit(rideHailing, "RatingSubmitted");
    });

    it("Cannot rate with score outside 1–5", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(rider).submitRating(rideId, 6)
      ).to.be.revertedWith("Score must be 1 to 5");
      await expect(
        rideHailing.connect(rider).submitRating(rideId, 0)
      ).to.be.revertedWith("Score must be 1 to 5");
    });

    it("Stranger cannot rate a ride they were not part of", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(stranger).submitRating(rideId, 5)
      ).to.be.revertedWith("Only ride participants can rate");
    });

    it("Completed rides increment total ride count", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).completeRide(rideId);
      const driverRep = await rideHailing.getReputation(driver.address);
      expect(driverRep.totalRides).to.equal(1);
      expect(driverRep.completionCount).to.equal(1);
    });

    it("Average score is computed correctly", async function () {
      for (let i = 0; i < 10; i++) {
        await rideHailing.connect(rider).requestRide(
          PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 0
        );
        const rideId = i + 1;
        await rideHailing.connect(driver).acceptOffer(rideId);
        await rideHailing.connect(rider).startRide(rideId);
        await rideHailing.connect(rider).completeRide(rideId);
        await rideHailing.connect(rider).submitRating(rideId, 5);
      }
      const avg = await rideHailing.getAverageScore(driver.address);
      expect(avg).to.equal(50);
    });

  });

  describe("DAO configuration guardrails", function () {

    it("Owner can update platform fee within the 10% hard ceiling", async function () {
      await rideHailing.connect(owner).setPlatformFee(7);
      expect(await rideHailing.platformFeePct()).to.equal(7);
    });

    it("Platform fee cannot exceed 10% hard ceiling", async function () {
      await expect(
        rideHailing.connect(owner).setPlatformFee(11)
      ).to.be.revertedWith("Fee cannot exceed 10");
    });

    it("Stranger cannot change platform configuration", async function () {
      await expect(
        rideHailing.connect(stranger).setPlatformFee(1)
      ).to.be.reverted;
    });

  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Cash payment support (Section 3)
  // ─────────────────────────────────────────────────────────────────────────

  describe("Cash ride — isCashRide flag", function () {

    it("requestRide stores isCashRide = true when flag is set", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 1
      );
      const ride = await rideHailing.getRide(1);
      expect(ride.paymentMethod).to.equal(1n);
    });

    it("requestRide stores isCashRide = false for digital rides", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 0
      );
      const ride = await rideHailing.getRide(1);
      expect(ride.paymentMethod).to.equal(0n);
    });

  });

  describe("Cash ride — acceptOffer skips rider escrow", function () {

    it("rider USDC balance is unchanged after acceptOffer on cash ride", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 1
      );
      const rideId = await rideHailing.rideCount();
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(driver).acceptOffer(rideId);
      const riderAfter = await usdc.balanceOf(rider.address);
      // Rider pays nothing — cash ride
      expect(riderAfter).to.equal(riderBefore);
    });

    it("driver bond still locks on cash ride acceptOffer", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 1
      );
      const rideId = await rideHailing.rideCount();
      const driverBefore = await usdc.balanceOf(driver.address);
      await rideHailing.connect(driver).acceptOffer(rideId);
      const driverAfter = await usdc.balanceOf(driver.address);
      const expectedBond = REC_FARE * 10n / 100n; // NEW tier — 10%
      expect(driverBefore - driverAfter).to.equal(expectedBond);
    });

    it("contract holds only the driver bond (not the fare) on cash acceptOffer", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, REC_FARE, 1
      );
      const rideId = await rideHailing.rideCount();
      const contractBefore = await usdc.balanceOf(await rideHailing.getAddress());
      await rideHailing.connect(driver).acceptOffer(rideId);
      const contractAfter = await usdc.balanceOf(await rideHailing.getAddress());
      const expectedBond = REC_FARE * 10n / 100n;
      expect(contractAfter - contractBefore).to.equal(expectedBond);
    });

  });

  describe("Cash ride — completeRide sets cashSettlementPending", function () {

    it("completeRide on cash ride sets cashSettlementPending = true", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      const ride = await rideHailing.getRide(rideId);
      expect(ride.settlementPending).to.equal(true);
      expect(ride.state).to.equal(3); // COMPLETED
    });

    it("completeRide on cash ride does NOT transfer USDC to driver immediately", async function () {
      const rideId = await setupCashRide();
      const driverBefore = await usdc.balanceOf(driver.address);
      await rideHailing.connect(rider).completeRide(rideId);
      const driverAfter = await usdc.balanceOf(driver.address);
      // Driver receives nothing yet — bond still locked, no escrow settlement
      expect(driverAfter).to.equal(driverBefore);
    });

    it("completeRide on cash ride does NOT send fee to treasury immediately", async function () {
      const rideId = await setupCashRide();
      const treasuryBefore = await usdc.balanceOf(treasury.address);
      await rideHailing.connect(rider).completeRide(rideId);
      const treasuryAfter = await usdc.balanceOf(treasury.address);
      expect(treasuryAfter).to.equal(treasuryBefore);
    });

    it("completeRide on cash ride still updates driver and rider activity counters", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      const driverRep = await rideHailing.getReputation(driver.address);
      const riderRep  = await rideHailing.getReputation(rider.address);
      expect(driverRep.totalRides).to.equal(1);
      expect(driverRep.completionCount).to.equal(1);
      expect(riderRep.totalRides).to.equal(1);
    });

  });

  describe("Cash ride — confirmCashReceived", function () {

    it("driver can call confirmCashReceived after rider completes cash ride", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(driver).confirmCashReceived(rideId)
      ).to.emit(rideHailing, "CashPaymentConfirmed");
    });

    it("confirmCashReceived deducts exactly 5% platform fee from driver USDC", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      const driverBefore = await usdc.balanceOf(driver.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);
      await rideHailing.connect(driver).confirmCashReceived(rideId);
      const driverAfter  = await usdc.balanceOf(driver.address);
      const treasuryAfter = await usdc.balanceOf(treasury.address);
      const fee = REC_FARE * 5n / 100n;
      const bond = REC_FARE * 10n / 100n;
      // Driver loses the fee but gets bond back: net = bond - fee
      expect(driverBefore - driverAfter).to.equal(fee - bond);
      expect(treasuryAfter - treasuryBefore).to.equal(fee);
    });

    it("confirmCashReceived returns driver bond to driver", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      const driverBefore = await usdc.balanceOf(driver.address);
      await rideHailing.connect(driver).confirmCashReceived(rideId);
      const driverAfter = await usdc.balanceOf(driver.address);
      const fee  = REC_FARE * 5n / 100n;
      const bond = REC_FARE * 10n / 100n;
      // Net change: +bond (returned) −fee (platform) = bond − fee
      expect(driverAfter - driverBefore).to.equal(bond - fee);
    });

    it("confirmCashReceived clears cashSettlementPending", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await rideHailing.connect(driver).confirmCashReceived(rideId);
      const ride = await rideHailing.getRide(rideId);
      expect(ride.settlementPending).to.equal(false);
    });

    it("confirmCashReceived emits RideCompleted event", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(driver).confirmCashReceived(rideId)
      ).to.emit(rideHailing, "RideCompleted");
    });

    it("rider cannot call confirmCashReceived", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(rider).confirmCashReceived(rideId)
      ).to.be.revertedWith("Only the driver can confirm cash received");
    });

    it("stranger cannot call confirmCashReceived", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(stranger).confirmCashReceived(rideId)
      ).to.be.revertedWith("Only the driver can confirm cash received");
    });

    it("confirmCashReceived reverts if called on a digital ride", async function () {
      const rideId = await setupInProgressRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await expect(
        rideHailing.connect(driver).confirmCashReceived(rideId)
      ).to.be.revertedWith("Not a cash ride");
    });

    it("confirmCashReceived cannot be called twice", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await rideHailing.connect(driver).confirmCashReceived(rideId);
      await expect(
        rideHailing.connect(driver).confirmCashReceived(rideId)
      ).to.be.revertedWith("Settlement not pending");
    });

    it("confirmCashReceived cannot be called before rider calls completeRide", async function () {
      const rideId = await setupCashRide();
      // completeRide not yet called — settlementPending is false
      await expect(
        rideHailing.connect(driver).confirmCashReceived(rideId)
      ).to.be.revertedWith("Settlement not pending");
    });

  });

  describe("Cash ride — amendment fare update (no USDC movement)", function () {

    it("amendment on cash ride updates agreedFare without transferring USDC", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).proposeAmendment(rideId, NEW_DROPOFF, USDC(14));
      const riderBefore = await usdc.balanceOf(rider.address);
      await rideHailing.connect(driver).acceptAmendment(rideId);
      const riderAfter = await usdc.balanceOf(rider.address);
      // No USDC should move — cash ride
      expect(riderAfter).to.equal(riderBefore);
      const ride = await rideHailing.getRide(rideId);
      expect(ride.agreedFare).to.equal(USDC(14));
    });

  });

  describe("Cash ride — ratings work identically to digital rides", function () {

    it("both parties can rate each other after cash ride confirmation", async function () {
      const rideId = await setupCashRide();
      await rideHailing.connect(rider).completeRide(rideId);
      await rideHailing.connect(driver).confirmCashReceived(rideId);
      await expect(
        rideHailing.connect(rider).submitRating(rideId, 5)
      ).to.emit(rideHailing, "RatingSubmitted");
      await expect(
        rideHailing.connect(driver).submitRating(rideId, 4)
      ).to.emit(rideHailing, "RatingSubmitted");
    });

  });

  // ── C-1 regression — rider accepts a driver counter-offer ────────────────
  // Guards against the pre-audit Critical: r.driver must be assigned from
  // r.offerFrom when the RIDER is the accepting party, otherwise settlement
  // pays address(0) and all onlyDriver functions brick.

  describe("C-1 regression — rider accepts driver counter-offer", function () {
    beforeEach(async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(10), 0
      );
      await rideHailing.connect(driver).counterOffer(1, USDC(14));
    });

    it("assigns the driver when the rider accepts the counter-offer", async function () {
      await rideHailing.connect(rider).acceptOffer(1);
      const ride = await rideHailing.getRide(1);
      expect(ride.driver).to.equal(driver.address);
      expect(ride.agreedFare).to.equal(USDC(14));
      expect(ride.state).to.equal(1); // ACCEPTED
    });

    it("settles payment to the driver (not address(0)) on completion", async function () {
      await rideHailing.connect(rider).acceptOffer(1);
      await rideHailing.connect(rider).startRide(1);
      const before = await usdc.balanceOf(driver.address);
      await rideHailing.connect(rider).completeRide(1);
      const after = await usdc.balanceOf(driver.address);
      const fee = (USDC(14) * 5n) / 100n;   // 5% platform fee
      const bond = (USDC(14) * 10n) / 100n; // NEW-tier bond returned
      expect(after - before).to.equal(USDC(14) - fee + bond);
      const ride = await rideHailing.getRide(1);
      expect(ride.state).to.equal(3); // COMPLETED
    });

    it("onlyDriver functions work for the assigned driver after rider-accept", async function () {
      await rideHailing.connect(rider).acceptOffer(1);
      await rideHailing.connect(rider).startRide(1);
      await expect(
        rideHailing.connect(driver).submitRouteLog(1, ROUTE_LOG)
      ).to.emit(rideHailing, "RouteLogSubmitted");
    });

    it("rider cannot accept their own standing offer", async function () {
      await rideHailing.connect(rider).requestRide(
        PICKUP, DROPOFF, REC_FARE, EXPECTED_DURATION, USDC(10), 0
      );
      await expect(
        rideHailing.connect(rider).acceptOffer(2)
      ).to.be.revertedWith("Cannot accept your own offer");
    });
  });

});