# Chainlink Grant Application — RideChain Protocol

**Applicant:** Elijah Patti | elijahpatti4@gmail.com | Nairobi, Kenya
**Project:** RideChain — Decentralized Ride-Hailing on Polygon
**Date:** June 2026
**Grant Category:** Build — DeFi / Real-World Asset Infrastructure / Emerging Markets

---

## 1. Project Summary

RideChain is a fully on-chain ride-hailing protocol built on Polygon PoS. It eliminates the central server entirely: ride matching, USDC escrow, dispute resolution, driver licensing, and surge fare calculation all run in smart contracts. There is no Uber-style intermediary extracting 25–30% commissions. RideChain's platform fee is 1–1.5% of ride volume, governed by a quadratic DAO.

RideChain currently integrates Chainlink Automation to trigger hourly fare oracle updates. This grant application requests support to extend that integration to Chainlink Data Streams (real-time demand signals) and Chainlink Functions (off-chain computation for dynamic surge pricing), making the PricingOracle fully autonomous and manipulation-resistant.

---

## 2. Problem Statement

Ride-hailing in sub-Saharan Africa runs entirely through centralized apps. Drivers in Nairobi pay 25–30% commissions to Uber and Bolt, earn below minimum wage on most trips, have no dispute recourse, and receive no ownership stake despite supplying 100% of the physical infrastructure (vehicles, fuel, time).

Web3 alternatives have not meaningfully competed because:
1. They still require central servers for matching and pricing
2. They ignore the 60–70% of African riders who pay with cash
3. Surge pricing is either absent or centrally controlled — neither fair nor transparent

RideChain solves (1) and (2) in the current codebase. Solving (3) requires Chainlink.

---

## 3. Current Chainlink Integration

**`PricingOracle.sol`** is Chainlink Automation–compatible today:

```solidity
function checkUpkeep(bytes calldata)
    external view
    returns (bool upkeepNeeded, bytes memory)
{
    upkeepNeeded = (block.timestamp - lastUpdateTime) >= UPDATE_INTERVAL; // 1 hour
}

function performUpkeep(bytes calldata) external {
    require((block.timestamp - lastUpdateTime) >= UPDATE_INTERVAL, "Upkeep not needed yet");
    lastUpdateTime = block.timestamp;
    emit OracleUpkeepPerformed(block.timestamp);
}
```

The `checkUpkeep` / `performUpkeep` interface is implemented and tested (35 passing tests, including time-boundary edge cases). Chainlink Automation registration on Amoy testnet is the next deployment step.

**Current fare formula:**
```
fare = baseFare
     + ceil(distanceMeters / 1000) × baseFarePerKm
     + ceil(durationSeconds / 60) × baseFarePerMinute

recommended = fare × surgeMultiplierBps / 10_000   (floored to baseFare)
```

Surge (`surgeMultiplierBps`) is currently set by the contract owner manually. The grant integration would make this autonomous.

---

## 4. Proposed Chainlink Integration (Grant Scope)

### 4.1 Chainlink Automation (already integrated — extend scope)

Current: triggers `performUpkeep` hourly. Proposed: `performUpkeep` calls a Chainlink Function inside the same transaction to recompute `surgeMultiplierBps` based on:
- Active ride count (queried from `RideHailing.sol` on-chain via cross-contract call)
- Time-of-day weight (rush-hour multiplier: 7–9am, 5–7pm Nairobi EAT)
- Day-of-week weight (Friday evening +20% baseline)

### 4.2 Chainlink Functions

A JavaScript source script (deployed to Chainlink DON) will:
1. Read `RideHailing.rideCount()` and `RideHailing.activeRideCount()` (new view function to add)
2. Fetch real-time traffic data from Google Maps Distance Matrix API (Nairobi-specific)
3. Compute a demand score: `(activeRides / historicalBaseline) × trafficIndex`
4. Return a `surgeMultiplierBps` value clamped to [10_000, 30_000]

The Chainlink Function response is fed back into `performUpkeep`, which calls `_setSurgeFromAutomation(uint256 newSurgeBps)` — an internal function not callable by the owner, only by the Automation registry address. This makes surge manipulation impossible even by the contract owner.

### 4.3 Chainlink Data Streams (Phase 2)

For USDC/KES exchange rate to auto-adjust fare baselines when the shilling moves more than 5% in a session. This ensures drivers in Nairobi aren't under-earning during FX volatility.

---

## 5. Technical Architecture

```
[Chainlink Automation Registry]
        │  every hour
        ▼
PricingOracle.performUpkeep()
        │  calls
        ▼
[Chainlink Functions DON]
        │  JS: reads on-chain activeRides + Google Traffic API
        ▼
PricingOracle._setSurgeFromAutomation(newSurgeBps)
        │
        ▼
RideHailing.getOracleFare(distance, duration)
        │  used by frontend to pre-fill recommendedFare
        ▼
[Rider sees transparent, on-chain surge price]
```

All computation is verifiable: the Chainlink DON signs the response, `performUpkeep` verifies the signature before writing `surgeMultiplierBps`. The hard cap (30_000 BPS = 3.0×) is enforced in Solidity regardless of what the DON returns.

---

## 6. Grant Deliverables

| # | Deliverable | Timeline |
|---|-------------|----------|
| 1 | Chainlink Automation registration on Polygon Amoy | Week 1 |
| 2 | `activeRideCount()` view function in RideHailing.sol | Week 1 |
| 3 | Chainlink Functions JS source (surge calculator) | Week 2 |
| 4 | `_setSurgeFromAutomation()` internal function + forwarder address guard | Week 2 |
| 5 | Updated `performUpkeep` integrating Functions callback | Week 3 |
| 6 | End-to-end test: Amoy testnet — Automation triggers → Functions → surge updated | Week 3 |
| 7 | Chainlink Data Streams integration for USDC/KES | Week 4–5 |
| 8 | Polygon Mainnet deployment + Polygonscan verification | Week 5–6 |
| 9 | Public documentation: integration guide for other African city operators | Week 6 |

---

## 7. Impact

**Immediate (Nairobi pilot):**
- 10 drivers, ~200 rides/week
- First fully on-chain ride-hailing deployment in East Africa
- Surge pricing transparent and verifiable by any rider on Polygonscan

**12-month projection:**
- Regional Master licences in Kampala, Dar es Salaam, Kigali
- ~50,000 rides/month across the network
- Each ride's fare computed by Chainlink — demonstrating real-world consumer utility at scale

**Chainlink ecosystem value:**
- First Chainlink Automation + Functions deployment in African transport infrastructure
- Open-source codebase — forkable by ride-hailing operators in Lagos, Accra, Addis Ababa

---

## 8. Grant Amount Requested

**$15,000 USD equivalent in LINK**

Breakdown:
- Chainlink Functions subscription (DON computation costs, 6-month runway): $4,000
- Chainlink Automation upkeep funding (1-hour cadence, 6 months): $2,000
- Smart contract audit (Sherlock or Code4rena): $7,000
- Developer time (Functions JS source + contract updates): $2,000

---

## 9. About the Applicant

**Elijah Patti** is a blockchain developer based in Nairobi, Kenya. He designed and built the entire RideChain protocol — 5 Solidity contracts, 244 automated tests, a full React/wagmi frontend, and the Chainlink Automation–compatible PricingOracle — independently. RideChain is production-ready for testnet deployment and is targeting Nairobi as its launch market.

GitHub: [github.com/elijahpatti/ridechain] *(update with actual repo)*
Contact: elijahpatti4@gmail.com

---

## 10. Supporting Materials

- `contracts/PricingOracle.sol` — Chainlink Automation interface implementation
- `test/PricingOracle.test.js` — 35 tests covering Automation time-boundary edge cases
- `docs/whitepaper.md` — Full protocol specification
- `docs/tokenomics.md` — RCT token design

---

*Application submitted June 2026. All contract code is original and MIT-licensed.*
