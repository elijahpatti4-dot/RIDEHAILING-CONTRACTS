const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const e18 = (n) => ethers.parseUnits(String(n), 18);

const CLIFF         = 365 * 24 * 3600;          // 12 months in seconds
const MONTH         = 30  * 24 * 3600;           // 30-day month

const TOTAL_SUPPLY  = e18(100_000_000);
const FOUNDER_ALLOC = e18( 30_000_000);
const DRIVER_POOL   = e18( 30_000_000);
const RIDER_POOL    = e18( 25_000_000);
const TREASURY      = e18( 15_000_000);
const WALLET_CAP    = e18(  5_000_000);
const MONTHLY_RCT   = e18(    625_000);

// ─────────────────────────────────────────────────────────────────────────────
//  Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("RideChainToken", function () {

  let token, vesting;
  let owner, founder, driver1, driver2, rider1, rider2, stranger;

  beforeEach(async function () {
    [owner, founder, driver1, driver2, rider1, rider2, stranger] =
      await ethers.getSigners();

    const Token = await ethers.getContractFactory("RideChainToken");
    token = await Token.deploy(founder.address);
    await token.waitForDeployment();

    const vestingAddr = await token.vestingContract();
    vesting = await ethers.getContractAt("FounderVesting", vestingAddr);
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {

    it("total supply is exactly 100,000,000 RCT", async function () {
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("vesting contract holds the 30M founder allocation", async function () {
      const vestingAddr = await token.vestingContract();
      expect(await token.balanceOf(vestingAddr)).to.equal(FOUNDER_ALLOC);
    });

    it("token contract holds the remaining 70M (pools + treasury)", async function () {
      const tokenAddr = await token.getAddress();
      expect(await token.balanceOf(tokenAddr))
        .to.equal(DRIVER_POOL + RIDER_POOL + TREASURY);
    });

    it("pool counters initialised correctly", async function () {
      expect(await token.driverPoolRemaining()).to.equal(DRIVER_POOL);
      expect(await token.riderPoolRemaining()) .to.equal(RIDER_POOL);
      expect(await token.treasuryRemaining())  .to.equal(TREASURY);
    });

  });

  // ── Vesting ─────────────────────────────────────────────────────────────────

  describe("Vesting", function () {

    it("nothing is releasable before the cliff", async function () {
      expect(await vesting.releasable()).to.equal(0n);
    });

    it("nothing is releasable at 11 months", async function () {
      await time.increase(11 * MONTH);
      expect(await vesting.releasable()).to.equal(0n);
    });

    it("nothing is releasable at exactly 12 months (cliff, no vesting month yet)", async function () {
      await time.increase(CLIFF);
      expect(await vesting.releasable()).to.equal(0n);
    });

    it("625,000 RCT releasable after cliff + 1 month", async function () {
      await time.increase(CLIFF + MONTH);
      expect(await vesting.releasable()).to.equal(MONTHLY_RCT);
    });

    it("6 × 625,000 RCT releasable after cliff + 6 months", async function () {
      await time.increase(CLIFF + 6 * MONTH);
      expect(await vesting.releasable()).to.equal(MONTHLY_RCT * 6n);
    });

    it("capped at 36 months worth after the full vesting period", async function () {
      await time.increase(CLIFF + 40 * MONTH); // well past 36 months
      expect(await vesting.releasable()).to.equal(MONTHLY_RCT * 36n);
    });

    it("founder can release unlocked tokens", async function () {
      await time.increase(CLIFF + MONTH);
      await vesting.connect(founder).release();
      expect(await token.balanceOf(founder.address)).to.equal(MONTHLY_RCT);
    });

    it("released amount is deducted — cannot double-claim", async function () {
      await time.increase(CLIFF + MONTH);
      await vesting.connect(founder).release();
      expect(await vesting.releasable()).to.equal(0n);
    });

    it("stranger cannot release vesting tokens", async function () {
      await time.increase(CLIFF + MONTH);
      await expect(vesting.connect(stranger).release())
        .to.be.revertedWith("Only founder");
    });

    it("totalReleased tracks cumulative releases", async function () {
      await time.increase(CLIFF + 3 * MONTH);
      await vesting.connect(founder).release();
      expect(await vesting.totalReleased()).to.equal(MONTHLY_RCT * 3n);
    });

  });

  // ── Driver pool rebalancing ─────────────────────────────────────────────────

  describe("Driver pool rebalancing formula", function () {

    it("equal scores split the pool 50 / 50", async function () {
      // driver1: 10 rides × rating 50 → score 500
      // driver2: 20 rides × rating 25 → score 500  (same)
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [10, 20],
        [50, 25]
      );
      const s1 = await token.driverAllocation(driver1.address);
      const s2 = await token.driverAllocation(driver2.address);
      expect(s1).to.equal(DRIVER_POOL / 2n);
      expect(s2).to.equal(DRIVER_POOL / 2n);
    });

    it("2:1 score ratio splits the pool 2:1", async function () {
      // driver1: 20 rides × 50 = 1000
      // driver2: 10 rides × 50 = 500   → 2:1 ratio
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [20, 10],
        [50, 50]
      );
      const s1 = await token.driverAllocation(driver1.address);
      const s2 = await token.driverAllocation(driver2.address);
      // s1 should be ~2/3 of DRIVER_POOL
      expect(s1).to.equal((DRIVER_POOL * 2n) / 3n);
      expect(s2).to.equal(DRIVER_POOL / 3n);
    });

    it("zero total score → no allocation change", async function () {
      await token.rebalanceDriverPool([driver1.address], [0], [0]);
      expect(await token.driverAllocation(driver1.address)).to.equal(0n);
    });

    it("avgRating capped at 50", async function () {
      // Passing 999 should behave the same as 50
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [10, 10],
        [999, 50]
      );
      const s1 = await token.driverAllocation(driver1.address);
      const s2 = await token.driverAllocation(driver2.address);
      expect(s1).to.equal(s2); // 50 === 50 after cap
    });

    it("only owner or governance can rebalance", async function () {
      await expect(
        token.connect(stranger).rebalanceDriverPool(
          [driver1.address], [10], [50]
        )
      ).to.be.revertedWith("Not authorised to rebalance");
    });

    it("driver claims tokens after rebalance", async function () {
      // driver1 score=1, driver2 score=5 → driver1 gets 1/6 × 30M = 5M (exactly at cap)
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address], [1, 5], [1, 1]
      );
      const alloc = await token.driverAllocation(driver1.address);

      await token.connect(driver1).claimDriverTokens();
      expect(await token.balanceOf(driver1.address)).to.equal(alloc);
    });

    it("driver cannot double-claim", async function () {
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address], [1, 5], [1, 1]
      );
      await token.connect(driver1).claimDriverTokens();
      await expect(
        token.connect(driver1).claimDriverTokens()
      ).to.be.revertedWith("Nothing to claim");
    });

    it("driver pool remaining decreases after claim", async function () {
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address], [1, 5], [1, 1]
      );
      const alloc  = await token.driverAllocation(driver1.address);
      const before = await token.driverPoolRemaining();
      await token.connect(driver1).claimDriverTokens();
      expect(await token.driverPoolRemaining()).to.equal(before - alloc);
    });

    it("mismatched array lengths revert", async function () {
      await expect(
        token.rebalanceDriverPool([driver1.address], [10, 20], [50])
      ).to.be.revertedWith("Array length mismatch");
    });

  });

  // ── Rider pool rebalancing ──────────────────────────────────────────────────

  describe("Rider pool rebalancing formula", function () {

    it("equal weighted scores split the pool evenly", async function () {
      // rider1: 10 rides × multiplier 100 / 100 = 10
      // rider2: 10 rides × multiplier 100 / 100 = 10
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address],
        [10, 10],
        [100, 100]
      );
      const s1 = await token.riderAllocation(rider1.address);
      const s2 = await token.riderAllocation(rider2.address);
      expect(s1).to.equal(RIDER_POOL / 2n);
      expect(s2).to.equal(RIDER_POOL / 2n);
    });

    it("full multiplier (130) gives 30% boost vs baseline (100)", async function () {
      // rider1: 10 rides × 130 = 1300
      // rider2: 10 rides × 100 = 1000  → total 2300
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address],
        [10, 10],
        [130, 100]
      );
      const s1 = await token.riderAllocation(rider1.address);
      const s2 = await token.riderAllocation(rider2.address);
      expect(s1).to.equal((RIDER_POOL * 1300n) / 2300n);
      expect(s2).to.equal((RIDER_POOL * 1000n) / 2300n);
    });

    it("multiplier below 100 is floored to 100", async function () {
      // Passing 50 should behave same as 100
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address],
        [10, 10],
        [50, 100]
      );
      const s1 = await token.riderAllocation(rider1.address);
      const s2 = await token.riderAllocation(rider2.address);
      expect(s1).to.equal(s2);
    });

    it("multiplier above 130 is capped to 130", async function () {
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address],
        [10, 10],
        [999, 130]
      );
      const s1 = await token.riderAllocation(rider1.address);
      const s2 = await token.riderAllocation(rider2.address);
      expect(s1).to.equal(s2);
    });

    it("zero total score → no allocation change", async function () {
      await token.rebalanceRiderPool([rider1.address], [0], [100]);
      expect(await token.riderAllocation(rider1.address)).to.equal(0n);
    });

    it("rider claims tokens after rebalance", async function () {
      // rider1 score=1×100/100=1, rider2 score=4×100/100=4 → rider1 gets 1/5 × 25M = 5M (at cap)
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address], [1, 4], [100, 100]
      );
      const alloc = await token.riderAllocation(rider1.address);
      await token.connect(rider1).claimRiderTokens();
      expect(await token.balanceOf(rider1.address)).to.equal(alloc);
    });

    it("rider cannot double-claim", async function () {
      await token.rebalanceRiderPool(
        [rider1.address, rider2.address], [1, 4], [100, 100]
      );
      await token.connect(rider1).claimRiderTokens();
      await expect(
        token.connect(rider1).claimRiderTokens()
      ).to.be.revertedWith("Nothing to claim");
    });

    it("only owner or governance can rebalance", async function () {
      await expect(
        token.connect(stranger).rebalanceRiderPool(
          [rider1.address], [10], [100]
        )
      ).to.be.revertedWith("Not authorised to rebalance");
    });

  });

  // ── Wallet cap ──────────────────────────────────────────────────────────────

  describe("Wallet cap (5M RCT)", function () {

    // Helper: give driver1 an allocation close to the cap and let them claim
    async function allocateNearCap(amount) {
      // Use a single-driver rebalance to set a specific allocation
      // We exploit the formula: score/totalScore × DRIVER_POOL = amount
      // => score = amount; totalScore = DRIVER_POOL; so score/totalScore = amount/DRIVER_POOL
      // Simpler: set driver1 score = 1, driver2 score such that driver1 gets `amount`
      // pool_share[driver1] = (1 / totalScore) × DRIVER_POOL = amount
      // => totalScore = DRIVER_POOL / amount
      // Use rides=1, rating=1 for driver1; rides=X, rating=1 for driver2 as padding
      // Easier: just set solo rebalance so driver1 gets 100%
      const amountInWei = amount;
      // Give driver1 all score (100%) then we cap at wallet cap automatically
      // But we want exactly `amount`, so we need ratio:
      // amount/DRIVER_POOL * totalScore = driver1_score
      // Use totalScore = DRIVER_POOL (big number), driver1_score = amount
      // In rides×rating terms: rides=1, rating=1 → score = 1
      // That gives 1/1 × DRIVER_POOL = DRIVER_POOL (too much)
      // Just give driver1 solo score
      const driverPool = await token.DRIVER_POOL();
      // We want pool_share = amount
      // pool_share = (score / totalScore) * DRIVER_POOL
      // Set score = amount, totalScore = DRIVER_POOL
      // score = rides × rating; use rides = amount/1e18, rating = 1e18... no, these are plain ints
      // Instead: use driver1 alone with score proportional to desired amount
      // If driver1 alone: pool_share = DRIVER_POOL (all of it)
      // Then we cap at WALLET_CAP in _beforeTokenTransfer
      // So just do single-driver rebalance and try to claim
    }

    it("transfer exceeding the 5M cap is rejected", async function () {
      // Give driver1 a solo rebalance → full 30M allocation
      await token.rebalanceDriverPool([driver1.address], [1], [50]);

      // First claim of WALLET_CAP should succeed
      // But 30M > 5M, so the hook should revert
      await expect(
        token.connect(driver1).claimDriverTokens()
      ).to.be.revertedWith("Transfer would exceed 5M wallet cap");
    });

    it("transfer up to 5M is accepted", async function () {
      // driver1 gets exactly WALLET_CAP allocation: 2 drivers, 1:5 ratio
      // driver1 score = 5, driver2 score = 25 → driver1 gets 5/30 × 30M = 5M
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [1, 5],
        [50, 50]    // scores: 50 and 250
      );
      // driver1 share = (50/300) × 30M = 5,000,000
      await token.connect(driver1).claimDriverTokens();
      expect(await token.balanceOf(driver1.address)).to.equal(WALLET_CAP);
    });

    it("vesting contract is exempt from the wallet cap", async function () {
      const vestingAddr = await token.vestingContract();
      // Vesting holds 30M, which is 6× the cap — this is allowed because it is exempt
      expect(await token.balanceOf(vestingAddr)).to.equal(FOUNDER_ALLOC);
      expect(await token.capExempt(vestingAddr)).to.equal(true);
    });

    it("token contract itself is exempt from the wallet cap", async function () {
      const tokenAddr = await token.getAddress();
      expect(await token.capExempt(tokenAddr)).to.equal(true);
    });

    it("normal wallet-to-wallet transfer that would breach cap is rejected", async function () {
      // driver1 gets 4M from driver pool: score 4 of 30 → 4/30 × 30M = 4M
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [4, 26],
        [1, 1]
      );
      await token.connect(driver1).claimDriverTokens(); // driver1 holds 4M

      // driver2 gets 2M from rider pool: score 2 of 25 → 2/25 × 25M = 2M
      // Use extra padding riders to dilute driver2's share below cap
      await token.rebalanceRiderPool(
        [driver2.address, rider1.address, rider2.address],
        [2, 13, 10],
        [100, 100, 100]   // scores: 2, 13, 10 → total 25
      );
      await token.connect(driver2).claimRiderTokens(); // driver2 holds 2M

      // Try to send 2M from driver2 to driver1 (4M + 2M = 6M > 5M cap)
      await expect(
        token.connect(driver2).transfer(driver1.address, e18(2_000_000))
      ).to.be.revertedWith("Transfer would exceed 5M wallet cap");
    });

  });

  // ── Quadratic voting ────────────────────────────────────────────────────────

  describe("Quadratic voting", function () {

    it("voting power is sqrt(balance)", async function () {
      // driver1 gets exactly WALLET_CAP (5,000,000 × 1e18)
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address],
        [1, 5],
        [50, 50]
      );
      await token.connect(driver1).claimDriverTokens();

      const balance = await token.balanceOf(driver1.address);
      const power   = await token.getVotingPower(driver1.address);
      // Math.sqrt in Solidity returns the integer square root
      const expected = BigInt(Math.floor(Math.sqrt(Number(balance))));
      // Allow ±1 for integer sqrt precision
      expect(power).to.be.closeTo(expected, 1n);
    });

    it("smaller balance gives proportionally smaller voting power (quadratic)", async function () {
      // Use a padding address (stranger) to dilute total so driver1 and driver2
      // get small allocations (under 5M cap) while maintaining a 4:1 ratio.
      // scores: driver1=4, driver2=1, stranger=95 → total 100
      // driver1: 4/100 × 30M = 1.2M, driver2: 1/100 × 30M = 0.3M
      await token.rebalanceDriverPool(
        [driver1.address, driver2.address, stranger.address],
        [4, 1, 95],
        [1, 1, 1]
      );
      await token.connect(driver1).claimDriverTokens();
      await token.connect(driver2).claimDriverTokens();

      const vp1 = await token.getVotingPower(driver1.address);
      const vp2 = await token.getVotingPower(driver2.address);

      // sqrt(1.2M) / sqrt(0.3M) = sqrt(4) = 2 — linear 4:1 becomes quadratic 2:1
      const ratio = Number(vp1) / Number(vp2);
      expect(ratio).to.be.closeTo(2, 0.05);
    });

    it("wallet with zero balance has zero voting power", async function () {
      expect(await token.getVotingPower(stranger.address)).to.equal(0n);
    });

  });

  // ── Treasury release ────────────────────────────────────────────────────────

  describe("Treasury release", function () {

    it("owner can create a treasury release proposal", async function () {
      await expect(
        token.proposeTreasuryRelease(stranger.address, e18(1_000_000))
      ).to.emit(token, "TreasuryProposalCreated");
    });

    it("proposal cannot be executed before 48 hours", async function () {
      await token.proposeTreasuryRelease(stranger.address, e18(1_000_000));
      await expect(
        token.executeTreasuryRelease(1)
      ).to.be.revertedWith("48-hour timelock not elapsed");
    });

    it("proposal executes after 48 hours", async function () {
      await token.proposeTreasuryRelease(stranger.address, e18(1_000_000));
      await time.increase(48 * 3600 + 1);
      await token.executeTreasuryRelease(1);
      expect(await token.balanceOf(stranger.address)).to.equal(e18(1_000_000));
    });

    it("proposal cannot be executed twice", async function () {
      await token.proposeTreasuryRelease(stranger.address, e18(1_000_000));
      await time.increase(48 * 3600 + 1);
      await token.executeTreasuryRelease(1);
      await expect(
        token.executeTreasuryRelease(1)
      ).to.be.revertedWith("Already executed");
    });

    it("stranger cannot create a treasury proposal", async function () {
      await expect(
        token.connect(stranger).proposeTreasuryRelease(stranger.address, e18(1_000_000))
      ).to.be.revertedWith("Not authorised");
    });

    it("treasuryRemaining decreases after release", async function () {
      const before = await token.treasuryRemaining();
      const amount = e18(1_000_000);
      await token.proposeTreasuryRelease(stranger.address, amount);
      await time.increase(48 * 3600 + 1);
      await token.executeTreasuryRelease(1);
      expect(await token.treasuryRemaining()).to.equal(before - amount);
    });

    it("amount exceeding treasury balance is rejected", async function () {
      await expect(
        token.proposeTreasuryRelease(stranger.address, e18(16_000_000))
      ).to.be.revertedWith("Invalid amount");
    });

  });

  // ── Governance contract integration ────────────────────────────────────────

  describe("Governance contract", function () {

    it("owner can set the governance contract", async function () {
      await token.setGovernanceContract(stranger.address);
      expect(await token.governanceContract()).to.equal(stranger.address);
    });

    it("governance contract is automatically cap-exempt", async function () {
      await token.setGovernanceContract(stranger.address);
      expect(await token.capExempt(stranger.address)).to.equal(true);
    });

    it("governance contract can trigger rebalance", async function () {
      await token.setGovernanceContract(stranger.address);
      await expect(
        token.connect(stranger).rebalanceDriverPool(
          [driver1.address], [10], [50]
        )
      ).to.not.be.reverted;
    });

  });

});
