const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time }   = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

// USDC has 6 decimals
const e6 = (n) => ethers.parseUnits(String(n), 6);

// Default constructor rates (Nairobi)
const BASE_FARE    = e6("0.50");  // $0.50 flat
const PER_KM       = e6("0.40");  // $0.40 / km
const PER_MIN      = e6("0.10");  // $0.10 / min
const ONE_HOUR     = 3600;
const UPDATE_INTERVAL = ONE_HOUR;

// ─────────────────────────────────────────────────────────────────────────────
//  Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("PricingOracle", function () {

  let oracle, rideHailing, usdc;
  let owner, stranger;

  beforeEach(async function () {
    [owner, stranger] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("PricingOracle");
    oracle = await Oracle.deploy(BASE_FARE, PER_KM, PER_MIN);
    await oracle.waitForDeployment();

    // Deploy RideHailing so we can test the oracle integration
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const RideHailing = await ethers.getContractFactory("RideHailing");
    rideHailing = await RideHailing.deploy(
      await usdc.getAddress(),
      owner.address  // treasury
    );
    await rideHailing.waitForDeployment();
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {

    it("stores baseFare correctly", async function () {
      expect(await oracle.baseFare()).to.equal(BASE_FARE);
    });

    it("stores baseFarePerKm correctly", async function () {
      expect(await oracle.baseFarePerKm()).to.equal(PER_KM);
    });

    it("stores baseFarePerMinute correctly", async function () {
      expect(await oracle.baseFarePerMinute()).to.equal(PER_MIN);
    });

    it("surge starts at 1.0× (10_000 BPS)", async function () {
      expect(await oracle.surgeMultiplierBps()).to.equal(10_000n);
    });

    it("MAX_SURGE_BPS is 30_000 (3.0×)", async function () {
      expect(await oracle.MAX_SURGE_BPS()).to.equal(30_000n);
    });

    it("reverts with zero base fare", async function () {
      const Oracle = await ethers.getContractFactory("PricingOracle");
      await expect(Oracle.deploy(0, PER_KM, PER_MIN))
        .to.be.revertedWith("Base fare must be > 0");
    });

    it("reverts with zero per-km rate", async function () {
      const Oracle = await ethers.getContractFactory("PricingOracle");
      await expect(Oracle.deploy(BASE_FARE, 0, PER_MIN))
        .to.be.revertedWith("Per-km rate must be > 0");
    });

    it("reverts with zero per-minute rate", async function () {
      const Oracle = await ethers.getContractFactory("PricingOracle");
      await expect(Oracle.deploy(BASE_FARE, PER_KM, 0))
        .to.be.revertedWith("Per-minute rate must be > 0");
    });

  });

  // ── Fare calculation ────────────────────────────────────────────────────────

  describe("getRecommendedFare — no surge", function () {

    it("10 km, 20 min → $6.50", async function () {
      // $0.50 + 10×$0.40 + 20×$0.10 = $0.50 + $4.00 + $2.00 = $6.50
      const fare = await oracle.getRecommendedFare(10_000, 1_200);
      expect(fare).to.equal(e6("6.50"));
    });

    it("0 m, 0 s → returns baseFare as floor", async function () {
      const fare = await oracle.getRecommendedFare(0, 0);
      expect(fare).to.equal(BASE_FARE);
    });

    it("1 km, 5 min → $1.40", async function () {
      // $0.50 + 1×$0.40 + 5×$0.10 = $1.40
      const fare = await oracle.getRecommendedFare(1_000, 300);
      expect(fare).to.equal(e6("1.40"));
    });

    it("distance rounds up to nearest km (500 m → 1 km)", async function () {
      // 500 m rounds up to 1 km: $0.50 + $0.40 + 0×$0.10 = $0.90
      const fare = await oracle.getRecommendedFare(500, 0);
      expect(fare).to.equal(e6("0.90"));
    });

    it("999 m rounds up to 1 km", async function () {
      const fare = await oracle.getRecommendedFare(999, 0);
      expect(fare).to.equal(e6("0.90"));
    });

    it("1000 m is exactly 1 km", async function () {
      const fare = await oracle.getRecommendedFare(1_000, 0);
      expect(fare).to.equal(e6("0.90"));
    });

    it("duration rounds up to nearest minute (30 s → 1 min)", async function () {
      // 30 s rounds up to 1 min: $0.50 + 0 + $0.10 = $0.60
      const fare = await oracle.getRecommendedFare(0, 30);
      expect(fare).to.equal(e6("0.60"));
    });

    it("59 s rounds up to 1 min", async function () {
      const fare = await oracle.getRecommendedFare(0, 59);
      expect(fare).to.equal(e6("0.60"));
    });

    it("60 s is exactly 1 min", async function () {
      const fare = await oracle.getRecommendedFare(0, 60);
      expect(fare).to.equal(e6("0.60"));
    });

    it("getRates returns all four fields", async function () {
      const [bf, pk, pm, surge] = await oracle.getRates();
      expect(bf).to.equal(BASE_FARE);
      expect(pk).to.equal(PER_KM);
      expect(pm).to.equal(PER_MIN);
      expect(surge).to.equal(10_000n);
    });

  });

  // ── Surge multiplier ────────────────────────────────────────────────────────

  describe("Surge multiplier", function () {

    it("1.5× surge gives 50% higher fare", async function () {
      await oracle.setSurgeMultiplier(15_000); // 1.5×
      const base = e6("6.50"); // 10 km, 20 min baseline
      const surged = await oracle.getRecommendedFare(10_000, 1_200);
      // $6.50 × 1.5 = $9.75
      expect(surged).to.equal((base * 15_000n) / 10_000n);
    });

    it("3.0× surge (hard cap) is accepted", async function () {
      await oracle.setSurgeMultiplier(30_000);
      expect(await oracle.surgeMultiplierBps()).to.equal(30_000n);
    });

    it("cannot set surge below 1.0× (10_000)", async function () {
      await expect(
        oracle.setSurgeMultiplier(9_999)
      ).to.be.revertedWith("Surge below 1.0x minimum");
    });

    it("cannot set surge above 3.0× hard cap", async function () {
      await expect(
        oracle.setSurgeMultiplier(30_001)
      ).to.be.revertedWith("Surge exceeds 3.0x hard cap");
    });

    it("setSurgeMultiplier emits SurgeUpdated", async function () {
      await expect(oracle.setSurgeMultiplier(12_000))
        .to.emit(oracle, "SurgeUpdated")
        .withArgs(12_000n);
    });

    it("stranger cannot set surge", async function () {
      await expect(
        oracle.connect(stranger).setSurgeMultiplier(20_000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

  });

  // ── Rate admin ──────────────────────────────────────────────────────────────

  describe("Rate admin (setRates)", function () {

    it("owner can update all three rates", async function () {
      await oracle.setRates(e6("1"), e6("0.50"), e6("0.20"));
      expect(await oracle.baseFare()).to.equal(e6("1"));
      expect(await oracle.baseFarePerKm()).to.equal(e6("0.50"));
      expect(await oracle.baseFarePerMinute()).to.equal(e6("0.20"));
    });

    it("setRates emits RatesUpdated", async function () {
      await expect(oracle.setRates(e6("1"), e6("0.50"), e6("0.20")))
        .to.emit(oracle, "RatesUpdated")
        .withArgs(e6("1"), e6("0.50"), e6("0.20"));
    });

    it("updated rates take effect immediately in getRecommendedFare", async function () {
      // Double the per-km rate
      await oracle.setRates(BASE_FARE, e6("0.80"), PER_MIN);
      // 10 km, 20 min: $0.50 + 10×$0.80 + 20×$0.10 = $0.50 + $8.00 + $2.00 = $10.50
      const fare = await oracle.getRecommendedFare(10_000, 1_200);
      expect(fare).to.equal(e6("10.50"));
    });

    it("stranger cannot update rates", async function () {
      await expect(
        oracle.connect(stranger).setRates(e6("1"), e6("0.50"), e6("0.20"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if any rate is set to zero", async function () {
      await expect(oracle.setRates(0, PER_KM, PER_MIN))
        .to.be.revertedWith("Base fare must be > 0");
      await expect(oracle.setRates(BASE_FARE, 0, PER_MIN))
        .to.be.revertedWith("Per-km rate must be > 0");
      await expect(oracle.setRates(BASE_FARE, PER_KM, 0))
        .to.be.revertedWith("Per-minute rate must be > 0");
    });

  });

  // ── Chainlink Automation ────────────────────────────────────────────────────

  describe("Chainlink Automation", function () {

    it("checkUpkeep returns false immediately after deployment", async function () {
      const [needed] = await oracle.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("checkUpkeep returns false before UPDATE_INTERVAL has elapsed", async function () {
      // Anchor to the oracle's own lastUpdateTime — avoids skew from beforeEach deploys
      const lastUpdate = await oracle.lastUpdateTime();
      await time.setNextBlockTimestamp(Number(lastUpdate) + UPDATE_INTERVAL - 1);
      const [needed] = await oracle.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("checkUpkeep returns true after UPDATE_INTERVAL has elapsed", async function () {
      await time.increase(UPDATE_INTERVAL);
      const [needed] = await oracle.checkUpkeep("0x");
      expect(needed).to.equal(true);
    });

    it("performUpkeep reverts before interval has elapsed", async function () {
      await expect(oracle.performUpkeep("0x"))
        .to.be.revertedWith("Upkeep not needed yet");
    });

    it("performUpkeep succeeds after interval has elapsed", async function () {
      await time.increase(UPDATE_INTERVAL);
      await expect(oracle.performUpkeep("0x"))
        .to.emit(oracle, "OracleUpkeepPerformed");
    });

    it("performUpkeep resets the interval window", async function () {
      await time.increase(UPDATE_INTERVAL);
      await oracle.performUpkeep("0x");
      // Immediately after — should be false again
      const [needed] = await oracle.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("performUpkeep can be called again after the next interval", async function () {
      await time.increase(UPDATE_INTERVAL);
      await oracle.performUpkeep("0x");
      await time.increase(UPDATE_INTERVAL);
      const [needed] = await oracle.checkUpkeep("0x");
      expect(needed).to.equal(true);
    });

  });

  // ── RideHailing integration ─────────────────────────────────────────────────

  describe("RideHailing integration", function () {

    it("setPricingOracle stores the oracle address", async function () {
      await rideHailing.setPricingOracle(await oracle.getAddress());
      expect(await rideHailing.pricingOracle()).to.equal(await oracle.getAddress());
    });

    it("setPricingOracle emits PricingOracleSet", async function () {
      const oracleAddr = await oracle.getAddress();
      await expect(rideHailing.setPricingOracle(oracleAddr))
        .to.emit(rideHailing, "PricingOracleSet")
        .withArgs(oracleAddr);
    });

    it("stranger cannot set pricing oracle on RideHailing", async function () {
      await expect(
        rideHailing.connect(stranger).setPricingOracle(await oracle.getAddress())
      ).to.be.reverted;
    });

    it("getOracleFare returns 0 when no oracle is set", async function () {
      expect(await rideHailing.getOracleFare(10_000, 1_200)).to.equal(0n);
    });

    it("getOracleFare delegates to oracle after wiring", async function () {
      await rideHailing.setPricingOracle(await oracle.getAddress());
      const fareFromRideHailing = await rideHailing.getOracleFare(10_000, 1_200);
      const fareFromOracle      = await oracle.getRecommendedFare(10_000, 1_200);
      expect(fareFromRideHailing).to.equal(fareFromOracle);
    });

    it("getOracleFare reflects surge set on the oracle", async function () {
      await rideHailing.setPricingOracle(await oracle.getAddress());
      await oracle.setSurgeMultiplier(20_000); // 2.0×
      const fare = await rideHailing.getOracleFare(10_000, 1_200);
      // $6.50 × 2.0 = $13.00
      expect(fare).to.equal(e6("13.00"));
    });

    it("oracle can be replaced by setting a new address", async function () {
      await rideHailing.setPricingOracle(await oracle.getAddress());

      // Deploy a second oracle with different rates
      const Oracle2 = await ethers.getContractFactory("PricingOracle");
      const oracle2 = await Oracle2.deploy(e6("1"), e6("0.80"), e6("0.20"));
      await oracle2.waitForDeployment();

      await rideHailing.setPricingOracle(await oracle2.getAddress());
      expect(await rideHailing.pricingOracle()).to.equal(await oracle2.getAddress());
    });

    it("oracle can be disabled by setting address(0)", async function () {
      await rideHailing.setPricingOracle(await oracle.getAddress());
      await rideHailing.setPricingOracle(ethers.ZeroAddress);
      expect(await rideHailing.getOracleFare(10_000, 1_200)).to.equal(0n);
    });

  });

});
