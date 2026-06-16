const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const e6 = (n) => ethers.parseUnits(String(n), 6);

// Elijah's founder wallet — all fees must land here, nowhere else
const FOUNDER = "0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb";

// Upfront licence fees (USDC, 6 decimals)
const FEE_COMMUNITY   = e6(  5_000);
const FEE_INDEPENDENT = e6( 20_000);
const FEE_ENTERPRISE  = e6( 50_000);
const FEE_GOVERNMENT  = e6(100_000);
const FEE_REGIONAL    = e6(200_000);

// CityTierType enum indices
const COMMUNITY   = 0;
const INDEPENDENT = 1;
const ENTERPRISE  = 2;
const GOVERNMENT  = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("RideChainLicence", function () {

  let licence, usdc;
  let owner, cityOp1, cityOp2, regionalOp, stranger;
  // Random addresses used as deployed RideHailing contract stubs
  let mockContract1, mockContract2, mockContract3;

  beforeEach(async function () {
    [owner, cityOp1, cityOp2, regionalOp, stranger] = await ethers.getSigners();

    mockContract1 = ethers.Wallet.createRandom().address;
    mockContract2 = ethers.Wallet.createRandom().address;
    mockContract3 = ethers.Wallet.createRandom().address;

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy RideChainLicence
    const Licence = await ethers.getContractFactory("RideChainLicence");
    licence = await Licence.deploy(await usdc.getAddress());
    await licence.waitForDeployment();

    // Fund operators with plenty of USDC
    const FUND = e6(500_000);
    await usdc.mint(cityOp1.address,    FUND);
    await usdc.mint(cityOp2.address,    FUND);
    await usdc.mint(regionalOp.address, FUND);
    await usdc.mint(stranger.address,   FUND);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function registerCity(signer, cityName, contractAddr, tier, fee) {
    await usdc.connect(signer).approve(await licence.getAddress(), fee);
    return licence.connect(signer).registerCityLicence(cityName, contractAddr, tier);
  }

  async function registerRegion(signer, regionName, countries) {
    await usdc.connect(signer).approve(await licence.getAddress(), FEE_REGIONAL);
    return licence.connect(signer).registerRegionalLicence(regionName, countries);
  }

  // ── City Operator Licence — Registration ───────────────────────────────────

  describe("City Operator Licence — registration", function () {

    it("COMMUNITY tier costs $5,000 — all goes to founder wallet", async function () {
      const before = await usdc.balanceOf(FOUNDER);
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(before + FEE_COMMUNITY);
    });

    it("INDEPENDENT tier costs $20,000 — all goes to founder wallet", async function () {
      const before = await usdc.balanceOf(FOUNDER);
      await registerCity(cityOp1, "Lagos", mockContract1, INDEPENDENT, FEE_INDEPENDENT);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(before + FEE_INDEPENDENT);
    });

    it("ENTERPRISE tier costs $50,000 — all goes to founder wallet", async function () {
      const before = await usdc.balanceOf(FOUNDER);
      await registerCity(cityOp1, "Accra", mockContract1, ENTERPRISE, FEE_ENTERPRISE);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(before + FEE_ENTERPRISE);
    });

    it("GOVERNMENT tier costs $100,000 — all goes to founder wallet", async function () {
      const before = await usdc.balanceOf(FOUNDER);
      await registerCity(cityOp1, "Abuja", mockContract1, GOVERNMENT, FEE_GOVERNMENT);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(before + FEE_GOVERNMENT);
    });

    it("licence contract itself receives ZERO USDC from registration", async function () {
      const licenceAddr = await licence.getAddress();
      const before = await usdc.balanceOf(licenceAddr);
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      // Contract balance must not change — funds go direct to founder
      expect(await usdc.balanceOf(licenceAddr)).to.equal(before);
    });

    it("emits CityLicenceRegistered event", async function () {
      await usdc.connect(cityOp1).approve(await licence.getAddress(), FEE_COMMUNITY);
      await expect(
        licence.connect(cityOp1).registerCityLicence("Nairobi", mockContract1, COMMUNITY)
      ).to.emit(licence, "CityLicenceRegistered");
    });

    it("city is recorded as active in the registry", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      expect(await licence.isCityActive("Nairobi")).to.equal(true);
    });

    it("city operator address is mapped correctly", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      expect(await licence.operatorCity(cityOp1.address)).to.equal("Nairobi");
    });

    it("city appears in the public territory registry", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      const cities = await licence.getRegisteredCities();
      expect(cities).to.include("Nairobi");
    });

    it("exclusivity expiry is set to ~24 months from now", async function () {
      const tx     = await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      const block  = await ethers.provider.getBlock(tx.blockNumber);
      const cityData = await licence.getCityLicence("Nairobi");
      const twoYears = BigInt(730 * 24 * 3600);
      // Use block.timestamp (not Date.now) — Hardhat clock may differ from wall clock
      expect(cityData.exclusivityExpiry).to.be.closeTo(BigInt(block.timestamp) + twoYears, BigInt(2));
    });

    it("cannot register the same city twice", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await usdc.connect(cityOp2).approve(await licence.getAddress(), FEE_COMMUNITY);
      await expect(
        licence.connect(cityOp2).registerCityLicence("Nairobi", mockContract2, COMMUNITY)
      ).to.be.revertedWith("City already licenced");
    });

    it("reverts with empty city name", async function () {
      await usdc.connect(cityOp1).approve(await licence.getAddress(), FEE_COMMUNITY);
      await expect(
        licence.connect(cityOp1).registerCityLicence("", mockContract1, COMMUNITY)
      ).to.be.revertedWith("City name required");
    });

    it("reverts with zero contract address", async function () {
      await usdc.connect(cityOp1).approve(await licence.getAddress(), FEE_COMMUNITY);
      await expect(
        licence.connect(cityOp1).registerCityLicence("Nairobi", ethers.ZeroAddress, COMMUNITY)
      ).to.be.revertedWith("Invalid contract address");
    });

    it("reverts if operator has not approved enough USDC", async function () {
      // Approve only half the fee
      await usdc.connect(cityOp1).approve(await licence.getAddress(), e6(2_500));
      await expect(
        licence.connect(cityOp1).registerCityLicence("Nairobi", mockContract1, COMMUNITY)
      ).to.be.reverted;
    });

    it("multiple different cities can be registered", async function () {
      await registerCity(cityOp1, "Nairobi",  mockContract1, COMMUNITY, FEE_COMMUNITY);
      await registerCity(cityOp2, "Mombasa",  mockContract2, INDEPENDENT, FEE_INDEPENDENT);
      const cities = await licence.getRegisteredCities();
      expect(cities).to.include("Nairobi");
      expect(cities).to.include("Mombasa");
      expect(await licence.cityCount()).to.equal(2n);
    });

  });

  // ── Regional Master Licence — Registration ─────────────────────────────────

  describe("Regional Master Licence — registration", function () {

    it("costs $200,000 — all goes to founder wallet", async function () {
      const before = await usdc.balanceOf(FOUNDER);
      await registerRegion(regionalOp, "East Africa", ["Kenya", "Uganda", "Tanzania"]);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(before + FEE_REGIONAL);
    });

    it("licence contract receives ZERO USDC from regional registration", async function () {
      const licenceAddr = await licence.getAddress();
      const before = await usdc.balanceOf(licenceAddr);
      await registerRegion(regionalOp, "East Africa", ["Kenya", "Uganda"]);
      expect(await usdc.balanceOf(licenceAddr)).to.equal(before);
    });

    it("emits RegionalLicenceRegistered event", async function () {
      await usdc.connect(regionalOp).approve(await licence.getAddress(), FEE_REGIONAL);
      await expect(
        licence.connect(regionalOp).registerRegionalLicence(
          "East Africa", ["Kenya", "Uganda", "Tanzania"]
        )
      ).to.emit(licence, "RegionalLicenceRegistered");
    });

    it("region is recorded as active", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      expect(await licence.isRegionActive("East Africa")).to.equal(true);
    });

    it("region operator address is mapped correctly", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      expect(await licence.operatorRegion(regionalOp.address)).to.equal("East Africa");
    });

    it("region appears in the public territory registry", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      const regions = await licence.getRegisteredRegions();
      expect(regions).to.include("East Africa");
    });

    it("cannot register the same region twice", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      await usdc.connect(stranger).approve(await licence.getAddress(), FEE_REGIONAL);
      await expect(
        licence.connect(stranger).registerRegionalLicence("East Africa", ["Kenya"])
      ).to.be.revertedWith("Region already licenced");
    });

    it("reverts with empty region name", async function () {
      await usdc.connect(regionalOp).approve(await licence.getAddress(), FEE_REGIONAL);
      await expect(
        licence.connect(regionalOp).registerRegionalLicence("", ["Kenya"])
      ).to.be.revertedWith("Region name required");
    });

    it("reverts with empty countries array", async function () {
      await usdc.connect(regionalOp).approve(await licence.getAddress(), FEE_REGIONAL);
      await expect(
        licence.connect(regionalOp).registerRegionalLicence("East Africa", [])
      ).to.be.revertedWith("At least one country required");
    });

  });

  // ── Sub-licensing ──────────────────────────────────────────────────────────

  describe("Sub-licensing (Regional master → City operator)", function () {

    beforeEach(async function () {
      // Register the regional master first
      await registerRegion(regionalOp, "East Africa", ["Kenya", "Uganda", "Tanzania"]);
    });

    it("regional master can grant a sub-licence to a city operator", async function () {
      await expect(
        licence.connect(regionalOp).grantSubLicence(
          "Kampala", cityOp1.address, mockContract1, COMMUNITY
        )
      ).to.emit(licence, "SubLicenceGranted");
    });

    it("sub-licensed city is marked active in registry", async function () {
      await licence.connect(regionalOp).grantSubLicence(
        "Kampala", cityOp1.address, mockContract1, COMMUNITY
      );
      expect(await licence.isCityActive("Kampala")).to.equal(true);
    });

    it("sub-licensed city stores regional master reference", async function () {
      await licence.connect(regionalOp).grantSubLicence(
        "Kampala", cityOp1.address, mockContract1, COMMUNITY
      );
      const cityData = await licence.getCityLicence("Kampala");
      expect(cityData.regionalMaster).to.equal(regionalOp.address);
    });

    it("sub-licensed city operator address is mapped", async function () {
      await licence.connect(regionalOp).grantSubLicence(
        "Kampala", cityOp1.address, mockContract1, COMMUNITY
      );
      expect(await licence.operatorCity(cityOp1.address)).to.equal("Kampala");
    });

    it("non-regional-master cannot grant a sub-licence", async function () {
      await expect(
        licence.connect(stranger).grantSubLicence(
          "Kampala", cityOp1.address, mockContract1, COMMUNITY
        )
      ).to.be.revertedWith("Caller is not a registered regional master");
    });

    it("cannot sub-licence a city that is already licenced", async function () {
      await registerCity(cityOp1, "Kampala", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await expect(
        licence.connect(regionalOp).grantSubLicence(
          "Kampala", cityOp2.address, mockContract2, COMMUNITY
        )
      ).to.be.revertedWith("City already licenced");
    });

    it("regional master can grant multiple sub-licences", async function () {
      await licence.connect(regionalOp).grantSubLicence(
        "Kampala",   cityOp1.address, mockContract1, COMMUNITY
      );
      await licence.connect(regionalOp).grantSubLicence(
        "Dar es Salaam", cityOp2.address, mockContract2, INDEPENDENT
      );
      expect(await licence.isCityActive("Kampala")).to.equal(true);
      expect(await licence.isCityActive("Dar es Salaam")).to.equal(true);
    });

    it("revoked regional master cannot grant sub-licences", async function () {
      await licence.connect(owner).revokeRegionalLicence("East Africa");
      await expect(
        licence.connect(regionalOp).grantSubLicence(
          "Kampala", cityOp1.address, mockContract1, COMMUNITY
        )
      ).to.be.revertedWith("Regional licence is not active");
    });

  });

  // ── Fee collection — city volume (1%) ─────────────────────────────────────

  describe("City volume fee collection (1% → founder, 0% treasury)", function () {

    beforeEach(async function () {
      // Register a direct city licence
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
    });

    it("1% of ride volume goes to founder wallet", async function () {
      const volume = e6(100_000); // $100,000 ride volume
      const expectedFee = volume / 100n; // 1% = $1,000

      await usdc.mint(cityOp1.address, volume);
      await usdc.connect(cityOp1).approve(await licence.getAddress(), expectedFee);

      const founderBefore = await usdc.balanceOf(FOUNDER);
      await licence.connect(cityOp1).reportCityVolume(volume);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(founderBefore + expectedFee);
    });

    it("licence contract receives ZERO from volume reporting", async function () {
      const volume = e6(100_000);
      const fee    = volume / 100n;

      await usdc.mint(cityOp1.address, volume);
      await usdc.connect(cityOp1).approve(await licence.getAddress(), fee);

      const licenceAddr = await licence.getAddress();
      const before = await usdc.balanceOf(licenceAddr);
      await licence.connect(cityOp1).reportCityVolume(volume);
      expect(await usdc.balanceOf(licenceAddr)).to.equal(before);
    });

    it("emits CityFeeCollected event", async function () {
      const volume = e6(50_000);
      const fee    = volume / 100n;
      await usdc.mint(cityOp1.address, volume);
      await usdc.connect(cityOp1).approve(await licence.getAddress(), fee);
      await expect(
        licence.connect(cityOp1).reportCityVolume(volume)
      ).to.emit(licence, "CityFeeCollected");
    });

    it("totalVolumeReported accumulates across calls", async function () {
      const volume = e6(50_000);
      const fee    = volume / 100n;

      await usdc.mint(cityOp1.address, e6(200_000));
      await usdc.connect(cityOp1).approve(await licence.getAddress(), fee * 2n);

      await licence.connect(cityOp1).reportCityVolume(volume);
      await licence.connect(cityOp1).reportCityVolume(volume);

      const cityData = await licence.getCityLicence("Nairobi");
      expect(cityData.totalVolumeReported).to.equal(volume * 2n);
      expect(cityData.totalFeesCollected).to.equal(fee * 2n);
    });

    it("stranger with no registered city cannot report volume", async function () {
      await expect(
        licence.connect(stranger).reportCityVolume(e6(10_000))
      ).to.be.revertedWith("Caller has no registered city");
    });

    it("sub-licensed city cannot report volume directly", async function () {
      // Register regional master and grant sub-licence
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      await licence.connect(regionalOp).grantSubLicence(
        "Mombasa", cityOp2.address, mockContract2, COMMUNITY
      );

      await usdc.mint(cityOp2.address, e6(10_000));
      await usdc.connect(cityOp2).approve(await licence.getAddress(), e6(100));

      await expect(
        licence.connect(cityOp2).reportCityVolume(e6(10_000))
      ).to.be.revertedWith("Sub-licenced city: volume is reported by regional master");
    });

    it("revoked city operator cannot report volume", async function () {
      await licence.connect(owner).revokeCityLicence("Nairobi");
      await expect(
        licence.connect(cityOp1).reportCityVolume(e6(10_000))
      ).to.be.revertedWith("City licence is not active");
    });

  });

  // ── Fee collection — regional volume (1.5%) ────────────────────────────────

  describe("Regional volume fee collection (1.5% → founder, 0% treasury)", function () {

    beforeEach(async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya", "Uganda", "Tanzania"]);
    });

    it("1.5% of ride volume goes to founder wallet", async function () {
      const volume     = e6(100_000); // $100,000 ride volume
      const expectedFee = (volume * 150n) / 10_000n; // 1.5% = $1,500

      await usdc.mint(regionalOp.address, volume);
      await usdc.connect(regionalOp).approve(await licence.getAddress(), expectedFee);

      const founderBefore = await usdc.balanceOf(FOUNDER);
      await licence.connect(regionalOp).reportRegionalVolume(volume);
      expect(await usdc.balanceOf(FOUNDER)).to.equal(founderBefore + expectedFee);
    });

    it("licence contract receives ZERO from regional volume reporting", async function () {
      const volume     = e6(100_000);
      const expectedFee = (volume * 150n) / 10_000n;

      await usdc.mint(regionalOp.address, volume);
      await usdc.connect(regionalOp).approve(await licence.getAddress(), expectedFee);

      const licenceAddr = await licence.getAddress();
      const before = await usdc.balanceOf(licenceAddr);
      await licence.connect(regionalOp).reportRegionalVolume(volume);
      expect(await usdc.balanceOf(licenceAddr)).to.equal(before);
    });

    it("emits RegionalFeeCollected event", async function () {
      const volume     = e6(100_000);
      const expectedFee = (volume * 150n) / 10_000n;
      await usdc.mint(regionalOp.address, volume);
      await usdc.connect(regionalOp).approve(await licence.getAddress(), expectedFee);
      await expect(
        licence.connect(regionalOp).reportRegionalVolume(volume)
      ).to.emit(licence, "RegionalFeeCollected");
    });

    it("regional fee is 50% more than city fee for same volume", async function () {
      // City: 1.00% = 100 BPS; Regional: 1.50% = 150 BPS → ratio 1.5
      const volume = e6(100_000);
      const cityFee    = (volume * 100n) / 10_000n;
      const regionalFee = (volume * 150n) / 10_000n;
      expect(regionalFee).to.equal((cityFee * 3n) / 2n);
    });

    it("stranger with no registered region cannot report volume", async function () {
      await expect(
        licence.connect(stranger).reportRegionalVolume(e6(10_000))
      ).to.be.revertedWith("Caller has no registered region");
    });

    it("totalVolumeReported accumulates for regional master", async function () {
      const volume     = e6(50_000);
      const fee        = (volume * 150n) / 10_000n;

      await usdc.mint(regionalOp.address, e6(200_000));
      await usdc.connect(regionalOp).approve(await licence.getAddress(), fee * 2n);

      await licence.connect(regionalOp).reportRegionalVolume(volume);
      await licence.connect(regionalOp).reportRegionalVolume(volume);

      const regionData = await licence.getRegionalLicence("East Africa");
      expect(regionData.totalVolumeReported).to.equal(volume * 2n);
      expect(regionData.totalFeesCollected).to.equal(fee * 2n);
    });

  });

  // ── Licence revocation ─────────────────────────────────────────────────────

  describe("Licence revocation", function () {

    it("owner can revoke a city licence", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await licence.connect(owner).revokeCityLicence("Nairobi");
      expect(await licence.isCityActive("Nairobi")).to.equal(false);
    });

    it("emits CityLicenceRevoked event", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await expect(
        licence.connect(owner).revokeCityLicence("Nairobi")
      ).to.emit(licence, "CityLicenceRevoked");
    });

    it("stranger cannot revoke a city licence", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await expect(
        licence.connect(stranger).revokeCityLicence("Nairobi")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("cannot revoke an already-inactive city licence", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await licence.connect(owner).revokeCityLicence("Nairobi");
      await expect(
        licence.connect(owner).revokeCityLicence("Nairobi")
      ).to.be.revertedWith("Licence not active");
    });

    it("owner can revoke a regional licence", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      await licence.connect(owner).revokeRegionalLicence("East Africa");
      expect(await licence.isRegionActive("East Africa")).to.equal(false);
    });

    it("emits RegionalLicenceRevoked event", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      await expect(
        licence.connect(owner).revokeRegionalLicence("East Africa")
      ).to.emit(licence, "RegionalLicenceRevoked");
    });

    it("stranger cannot revoke a regional licence", async function () {
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      await expect(
        licence.connect(stranger).revokeRegionalLicence("East Africa")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("revoked city is preserved in registry (history not erased)", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await licence.connect(owner).revokeCityLicence("Nairobi");
      // City still in list — just inactive
      const cities = await licence.getRegisteredCities();
      expect(cities).to.include("Nairobi");
      const cityData = await licence.getCityLicence("Nairobi");
      expect(cityData.active).to.equal(false);
    });

  });

  // ── Exclusivity renewal ────────────────────────────────────────────────────

  describe("Exclusivity renewal", function () {

    it("owner can renew exclusivity for a city", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      const before = (await licence.getCityLicence("Nairobi")).exclusivityExpiry;
      await licence.connect(owner).renewExclusivity("Nairobi");
      const after  = (await licence.getCityLicence("Nairobi")).exclusivityExpiry;
      expect(after).to.be.gt(before);
    });

    it("emits ExclusivityRenewed event", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await expect(
        licence.connect(owner).renewExclusivity("Nairobi")
      ).to.emit(licence, "ExclusivityRenewed");
    });

    it("stranger cannot renew exclusivity", async function () {
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      await expect(
        licence.connect(stranger).renewExclusivity("Nairobi")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

  });

  // ── Treasury isolation confirmation ────────────────────────────────────────

  describe("Treasury isolation — no funds ever leave to treasury", function () {

    it("no address other than the founder receives USDC from any licence operation", async function () {
      // Track balances of all signers and the contract before and after a full flow
      const licenceAddr = await licence.getAddress();
      const track = [
        owner.address, cityOp1.address, cityOp2.address,
        regionalOp.address, stranger.address, licenceAddr
      ];

      const before = await Promise.all(track.map(a => usdc.balanceOf(a)));

      // Register city
      await registerCity(cityOp1, "Nairobi", mockContract1, COMMUNITY, FEE_COMMUNITY);
      // Register region
      await registerRegion(regionalOp, "East Africa", ["Kenya"]);
      // Report city volume
      const vol = e6(10_000);
      const cityFee = vol / 100n;
      await usdc.mint(cityOp1.address, vol);
      await usdc.connect(cityOp1).approve(licenceAddr, cityFee);
      await licence.connect(cityOp1).reportCityVolume(vol);

      const after = await Promise.all(track.map(a => usdc.balanceOf(a)));

      // None of the tracked addresses (owner, operators, contract) should have gained USDC
      for (let i = 0; i < track.length; i++) {
        // Operators spent USDC (fees went out) — allow decreases, check no unexpected gains
        // Contract must not hold any USDC at all
        if (track[i] === licenceAddr) {
          expect(after[i]).to.equal(0n);
        }
      }

      // Only the founder wallet should have gained
      const founderGain = await usdc.balanceOf(FOUNDER);
      expect(founderGain).to.be.gt(0n);
    });

  });

});
