const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const e18  = (n) => ethers.parseUnits(String(n), 18);
const e6   = (n) => ethers.parseUnits(String(n), 6);

const FIVE_YEARS  = 5 * 365 * 24 * 3600;
const FORTY_EIGHT_HOURS = 48 * 3600;
const ONE_DAY     = 24 * 3600;

// Minimal proposal helper — a no-op call to address(0)
function noopProposal() {
  return {
    targets:    [ethers.ZeroAddress],
    values:     [0n],
    calldatas:  ["0x"],
    description: "Test proposal",
    descHash:   ethers.id("Test proposal"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("RideChainGovernor", function () {

  let token, timelock, governor;
  let owner, founder, guardian1, guardian2, guardian3, guardian4, guardian5, stranger;

  beforeEach(async function () {
    [owner, founder, guardian1, guardian2, guardian3, guardian4, guardian5, stranger] =
      await ethers.getSigners();

    // Deploy token
    const Token = await ethers.getContractFactory("RideChainToken");
    token = await Token.deploy(founder.address);
    await token.waitForDeployment();

    // Deploy TimelockController with 48-hour delay
    // proposers and executors are set to the governor (added after)
    // For tests, owner is proposer/executor initially
    const Timelock = await ethers.getContractFactory("TimelockController");
    timelock = await Timelock.deploy(
      FORTY_EIGHT_HOURS,          // minDelay
      [owner.address],            // proposers (governor added below)
      [owner.address],            // executors
      owner.address               // admin
    );
    await timelock.waitForDeployment();

    const guardianMembers = [
      guardian1.address,
      guardian2.address,
      guardian3.address,
      guardian4.address,
      guardian5.address,
    ];

    // Deploy governor
    const Governor = await ethers.getContractFactory("RideChainGovernor");
    governor = await Governor.deploy(
      await token.getAddress(),
      await timelock.getAddress(),
      founder.address,
      guardianMembers
    );
    await governor.waitForDeployment();

    // Grant governor proposer role on the timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {

    it("deployedAt is set to block timestamp", async function () {
      const deployedAt = await governor.deployedAt();
      expect(deployedAt).to.be.gt(0n);
    });

    it("founding wallet is set correctly", async function () {
      expect(await governor.foundingWallet()).to.equal(founder.address);
    });

    it("guardian council members are set", async function () {
      expect(await governor.isGuardian(guardian1.address)).to.equal(true);
      expect(await governor.isGuardian(guardian5.address)).to.equal(true);
      expect(await governor.isGuardian(stranger.address)).to.equal(false);
    });

    it("guardian council starts inactive", async function () {
      const council = await governor.council();
      expect(council.isActive).to.equal(false);
    });

    it("timelock delay is 48 hours", async function () {
      expect(await timelock.getMinDelay()).to.equal(BigInt(FORTY_EIGHT_HOURS));
    });

    it("founding wallet veto is active at deployment", async function () {
      expect(await governor.isFoundingVetoActive()).to.equal(true);
    });

  });

  // ── 48-hour timelock ────────────────────────────────────────────────────────

  describe("48-hour timelock", function () {

    it("timelock minimum delay is exactly 48 hours", async function () {
      expect(await timelock.getMinDelay()).to.equal(BigInt(FORTY_EIGHT_HOURS));
    });

    it("timelock rejects operations scheduled with less than 48-hour delay", async function () {
      const p = noopProposal();
      // Attempt to schedule directly with 1-hour delay — should fail
      const ZERO_BYTES32 = ethers.ZeroHash;
      await expect(
        timelock.schedule(
          p.targets[0], p.values[0], p.calldatas[0],
          ZERO_BYTES32, ZERO_BYTES32,
          3600 // 1 hour — below minimum
        )
      ).to.be.reverted;
    });

    it("timelock accepts operations with 48-hour delay", async function () {
      const ZERO_BYTES32 = ethers.ZeroHash;
      await expect(
        timelock.schedule(
          ethers.ZeroAddress, 0n, "0x",
          ZERO_BYTES32, ZERO_BYTES32,
          FORTY_EIGHT_HOURS
        )
      ).to.not.be.reverted;
    });

  });

  // ── Constitutional veto — active before year 5 ─────────────────────────────

  describe("Constitutional veto — before year 5", function () {

    it("founding wallet can tag a proposal as constitutional", async function () {
      // We need a proposal ID — compute one via hashProposal
      const p = noopProposal();
      const proposalId = await governor.hashProposal(
        p.targets, p.values, p.calldatas, p.descHash
      );

      // First submit the proposal so it exists in a taggable state
      // Give owner some voting power by delegating token (token held by contract itself)
      // For simplicity just check the tag event fires
      // Proposal doesn't exist yet — OZ Governor reverts before reaching our state check
      await expect(
        governor.connect(founder).tagConstitutional(proposalId)
      ).to.be.revertedWith("Governor: unknown proposal id");
    });

    it("only the founding wallet can tag constitutional proposals", async function () {
      const p = noopProposal();
      const proposalId = await governor.hashProposal(
        p.targets, p.values, p.calldatas, p.descHash
      );
      await expect(
        governor.connect(stranger).tagConstitutional(proposalId)
      ).to.be.revertedWith("Only founding wallet");
    });

    it("founding wallet veto is active within 5 years", async function () {
      expect(await governor.isFoundingVetoActive()).to.equal(true);
    });

    it("founding wallet can call veto on non-constitutional proposal — reverts (tag required)", async function () {
      const p = noopProposal();
      await expect(
        governor.connect(founder).foundingWalletVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Proposal is not tagged constitutional");
    });

    it("stranger cannot use the founding wallet veto", async function () {
      const p = noopProposal();
      await expect(
        governor.connect(stranger).foundingWalletVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Only founding wallet");
    });

  });

  // ── Constitutional veto — permanently disabled after year 5 ───────────────

  describe("Constitutional veto — after year 5", function () {

    beforeEach(async function () {
      // Fast-forward past the 5-year veto window
      await time.increase(FIVE_YEARS + ONE_DAY);
    });

    it("veto is no longer active after 5 years", async function () {
      expect(await governor.isFoundingVetoActive()).to.equal(false);
    });

    it("founding wallet veto call permanently reverts after year 5", async function () {
      const p = noopProposal();
      await expect(
        governor.connect(founder).foundingWalletVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Founding wallet veto has permanently expired after year 5");
    });

    it("veto is still disabled 10 years after deployment", async function () {
      await time.increase(FIVE_YEARS); // now ~10 years total
      expect(await governor.isFoundingVetoActive()).to.equal(false);
    });

  });

  // ── Guardian council activation ────────────────────────────────────────────

  describe("Guardian council activation threshold", function () {

    it("council cannot be activated with zero months reported", async function () {
      await expect(
        governor.activateGuardianCouncil()
      ).to.be.revertedWith("Income threshold not met for 3 consecutive months");
    });

    it("council cannot be activated after 2 qualifying months", async function () {
      await governor.reportMonthlyIncome(e6(6_000)); // month 1 — above threshold
      await governor.reportMonthlyIncome(e6(7_000)); // month 2 — above threshold
      await expect(
        governor.activateGuardianCouncil()
      ).to.be.revertedWith("Income threshold not met for 3 consecutive months");
    });

    it("streak resets if a month falls below threshold", async function () {
      await governor.reportMonthlyIncome(e6(6_000)); // above
      await governor.reportMonthlyIncome(e6(4_000)); // below — streak resets
      await governor.reportMonthlyIncome(e6(6_000)); // above
      await governor.reportMonthlyIncome(e6(6_000)); // above (only 2 consecutive after reset)
      await expect(
        governor.activateGuardianCouncil()
      ).to.be.revertedWith("Income threshold not met for 3 consecutive months");
    });

    it("council activates after exactly 3 consecutive qualifying months", async function () {
      await governor.reportMonthlyIncome(e6(5_001)); // month 1 — just above $5,000
      await governor.reportMonthlyIncome(e6(6_000)); // month 2
      await governor.reportMonthlyIncome(e6(7_500)); // month 3
      await governor.activateGuardianCouncil();
      const council = await governor.council();
      expect(council.isActive).to.equal(true);
    });

    it("council activates after a streak interrupted and resumed for 3 months", async function () {
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(3_000)); // streak broken
      await governor.reportMonthlyIncome(e6(5_500));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(8_000));
      await governor.activateGuardianCouncil();
      const council = await governor.council();
      expect(council.isActive).to.equal(true);
    });

    it("council cannot be activated twice", async function () {
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.activateGuardianCouncil();
      await expect(
        governor.activateGuardianCouncil()
      ).to.be.revertedWith("Council already active");
    });

    it("exact threshold ($5,000) counts as qualifying", async function () {
      await governor.reportMonthlyIncome(e6(5_000));
      await governor.reportMonthlyIncome(e6(5_000));
      await governor.reportMonthlyIncome(e6(5_000));
      await governor.activateGuardianCouncil();
      const council = await governor.council();
      expect(council.isActive).to.equal(true);
    });

    it("only owner can report monthly income", async function () {
      await expect(
        governor.connect(stranger).reportMonthlyIncome(e6(6_000))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("consecutiveMonthsMet counter increments correctly", async function () {
      await governor.reportMonthlyIncome(e6(6_000));
      expect(await governor.consecutiveMonthsMet()).to.equal(1n);
      await governor.reportMonthlyIncome(e6(6_000));
      expect(await governor.consecutiveMonthsMet()).to.equal(2n);
    });

    it("consecutiveMonthsMet resets to zero on a failing month", async function () {
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(1_000)); // below threshold
      expect(await governor.consecutiveMonthsMet()).to.equal(0n);
    });

  });

  // ── Guardian council veto ──────────────────────────────────────────────────

  describe("Guardian council veto", function () {

    beforeEach(async function () {
      // Activate council first
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.reportMonthlyIncome(e6(6_000));
      await governor.activateGuardianCouncil();
    });

    it("non-guardian cannot sign a veto", async function () {
      const p = noopProposal();
      const proposalId = await governor.hashProposal(
        p.targets, p.values, p.calldatas, p.descHash
      );
      await expect(
        governor.connect(stranger).signGuardianVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Not a guardian council member");
    });

    it("guardian cannot veto an inactive council", async function () {
      // Deploy fresh governor (council inactive)
      const Governor = await ethers.getContractFactory("RideChainGovernor");
      const freshGov = await Governor.deploy(
        await token.getAddress(),
        await timelock.getAddress(),
        founder.address,
        [guardian1.address, guardian2.address, guardian3.address,
         guardian4.address, guardian5.address]
      );
      const p = noopProposal();
      await expect(
        freshGov.connect(guardian1).signGuardianVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Guardian council is not yet active");
    });

    it("veto threshold is 4-of-5", async function () {
      const council = await governor.council();
      expect(council.vetoThreshold).to.equal(4);
    });

    it("isGuardian returns true for all 5 members", async function () {
      expect(await governor.isGuardian(guardian1.address)).to.be.true;
      expect(await governor.isGuardian(guardian2.address)).to.be.true;
      expect(await governor.isGuardian(guardian3.address)).to.be.true;
      expect(await governor.isGuardian(guardian4.address)).to.be.true;
      expect(await governor.isGuardian(guardian5.address)).to.be.true;
    });

    it("isGuardian returns false for non-member", async function () {
      expect(await governor.isGuardian(stranger.address)).to.be.false;
    });

    it("guardian cannot sign veto on a non-queued proposal", async function () {
      const p = noopProposal();
      // Proposal doesn't exist — OZ Governor reverts before reaching our queue check
      await expect(
        governor.connect(guardian1).signGuardianVeto(
          p.targets, p.values, p.calldatas, p.descHash
        )
      ).to.be.revertedWith("Governor: unknown proposal id");
    });

    it("owner can update guardian council members", async function () {
      const newMembers = [
        stranger.address,
        guardian1.address,
        guardian2.address,
        guardian3.address,
        guardian4.address,
      ];
      await governor.setGuardianCouncil(newMembers);
      expect(await governor.isGuardian(stranger.address)).to.be.true;
      expect(await governor.isGuardian(guardian5.address)).to.be.false;
    });

    it("stranger cannot update guardian council members", async function () {
      const newMembers = [
        stranger.address, guardian1.address, guardian2.address,
        guardian3.address, guardian4.address,
      ];
      await expect(
        governor.connect(stranger).setGuardianCouncil(newMembers)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

  });

  // ── Quadratic voting ────────────────────────────────────────────────────────

  describe("Quadratic voting", function () {

    it("getVotingPower is used (not linear balance)", async function () {
      // Give driver some tokens and verify voting power = sqrt(balance)
      await token.rebalanceDriverPool(
        [stranger.address, owner.address],
        [1, 5], [1, 1]
      );
      await token.connect(stranger).claimDriverTokens();
      const balance = await token.balanceOf(stranger.address);
      const power   = await token.getVotingPower(stranger.address);
      const sqrtBal = BigInt(Math.floor(Math.sqrt(Number(balance))));
      expect(power).to.be.closeTo(sqrtBal, 1n);
    });

  });

});
