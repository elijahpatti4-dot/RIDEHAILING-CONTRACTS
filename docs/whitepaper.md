# RideChain: A Decentralized Ride-Hailing Protocol for Emerging Markets

**Version 1.0 | June 2026**
**Author:** Elijah Patti — Nairobi, Kenya

---

## Abstract

RideChain is a decentralized ride-hailing protocol that eliminates central servers entirely. Ride matching, payment escrow, dispute resolution, driver licensing, and surge fare calculation are implemented as auditable Solidity smart contracts on Polygon PoS. The protocol supports both USDC digital payments and cash rides — critical for markets like sub-Saharan Africa where smartphone banking penetration remains partial. A tiered licensing system (City Operator and Regional Master) enables permissionless geographic expansion while generating sustainable protocol revenue. Governance is managed through a quadratic-vote DAO with a 5-year guardian veto window protecting against early-stage hostile capture. This paper describes the protocol architecture, economic design, and technical implementation.

---

## 1. Introduction

Ride-hailing services are structurally extractive. Uber and Bolt — the dominant platforms in African markets — charge drivers 25–30% of each fare. Drivers supply 100% of the physical infrastructure (vehicles, fuel, maintenance, time) and retain 70–75% of revenue, with no ownership stake, no dispute recourse, and no income security when the app is unavailable.

The Web3 ride-hailing space has produced limited alternatives because existing projects either retain centralized matching servers (violating the decentralization premise) or ignore the practical realities of African markets: low smartphone banking penetration, intermittent internet connectivity, and driver demographics unfamiliar with crypto wallets.

RideChain takes a different approach: design for the African market first, build the minimum viable decentralized protocol, and integrate progressive enhancements (Chainlink oracle feeds, quadratic governance, cash settlement) as first-class features rather than afterthoughts.

---

## 2. Protocol Architecture

### 2.1 Core Contracts

RideChain comprises five production contracts and one test utility:

**`RideHailing.sol`** — The core matching and escrow engine. Manages the full ride lifecycle: request → offer → acceptance → in-progress → completion / dispute resolution. Holds USDC in escrow for digital rides. Tracks driver reputation scores on-chain. Supports amendment flows for fare renegotiation mid-ride.

**`RideChainLicence.sol`** — Tiered geographic licensing registry. City Operators register individual cities; Regional Masters register multi-city territories. Both tiers pay a one-time USDC registration fee and a periodic volume-based fee (1% and 1.5% respectively). City Operators receive a 24-month exclusivity window per city after registration.

**`RideChainToken.sol`** — Fixed-supply ERC-20 governance and reward token (RCT, 100M tokens). Driver rewards are claimable via the protocol contract. Pool-based release logic enforces vesting schedules for team, investor, and ecosystem allocations.

**`RideChainGovernor.sol`** — OpenZeppelin Governor Bravo–compatible DAO. Quadratic voting power (`sqrt(balance)`), 7-day voting period, 2-day timelock, 4% quorum, 100K RCT proposal threshold. Guardian council veto active for 5 years post-deployment.

**`PricingOracle.sol`** — Chainlink Automation–compatible fare oracle. Computes recommended USDC fares from distance, duration, and a surge multiplier. Rates and surge are governable; Chainlink Automation triggers hourly upkeep to reset the surge window.

**`MockUSDC.sol`** — Test-only ERC-20 with mint function. Not deployed to mainnet.

### 2.2 Contract Interactions

```
Rider ──requestRide()──► RideHailing ──USDC escrow──► RideHailing balance
                              │
                    ◄──acceptOffer()── Driver
                              │
                    ──completeRide()──► releases escrow to driver
                                        deducts platform fee → treasury
                                        triggers RCT reward → RideChainToken

RideChainLicence ──registerCity()──► stores CityLicence
                                      charges USDC fee → treasury

PricingOracle ──getRecommendedFare()──► frontend pre-fill
RideHailing ──getOracleFare()──────────► delegates to PricingOracle

RideChainGovernor ──propose()──► voting period ──timelock──► execute()
                                                               │
                                              calls target contracts
                                              (e.g., setRates, setFee)
```

---

## 3. Ride Lifecycle

### 3.1 Digital Ride (USDC escrow)

1. **Request** — Rider calls `requestRide(pickup, dropoff, offeredFare, maxFare, timeout, false)`. USDC (`offeredFare`) is transferred from rider to contract escrow.

2. **Offer / Counteroffer** — Driver calls `makeOffer(rideId, fare)`. If `fare == offeredFare`, proceeds to acceptance. Otherwise, rider may accept the amendment via `acceptAmendment` (additional USDC deposited if fare increased, excess refunded if decreased). Drivers may not counter-offer above `maxFare`.

3. **Acceptance** — Driver calls `acceptOffer(rideId)`. Driver's bond (configurable USDC amount) is locked from driver's wallet. Ride state transitions to `InProgress`.

4. **Completion** — Driver calls `completeRide(rideId)`. Platform fee is deducted; remainder released to driver. Driver bond returned. Ride state transitions to `Completed`. Both parties may submit ratings (1–5 stars).

5. **Dispute** — Either party calls `raiseDispute(rideId)`. An on-chain arbitration window opens. Owner (or future DAO-appointed arbiters) calls `resolveDispute(rideId, favourDriver)`. Driver bond is slashable; rider escrow is refundable depending on outcome.

6. **Timeout** — If driver does not call `completeRide` within the timeout window, rider calls `claimTimeout(rideId)` to recover escrow.

### 3.2 Cash Ride

Cash rides pass `_isCashRide = true` to `requestRide`. No USDC is locked from the rider (they pay cash to the driver physically). The driver's bond is still locked at acceptance, providing accountability.

After the physical cash exchange:
1. Driver calls `confirmCashReceived(rideId)`.
2. Contract calls `USDC.transferFrom(driver, treasury, fee)` — the 5% platform fee is pulled directly from the driver's wallet (driver must have pre-approved the contract).
3. Driver bond is returned.
4. Event `CashPaymentConfirmed` is emitted.

In disputes on cash rides, no rider refund is possible (no escrow exists). The driver bond remains slashable as a penalty mechanism.

### 3.3 Reputation

Every completed or timeout-resolved ride updates the driver's on-chain reputation score. Ratings are stored as cumulative sums (`ratingSum / ratingCount`). The frontend displays the average as a 1–5 star score. Ratings are immutable once submitted.

---

## 4. Licensing System

### 4.1 Two-Tier Structure

**City Operator (Tier 1):**
- Registers a single named city (e.g., "Nairobi")
- 24-month exclusivity window per city after registration
- 1% volume fee on all rides in that city
- Registration fee set by protocol owner

**Regional Master (Tier 2):**
- Registers a geographic region (e.g., "East Africa")
- Covers multiple cities
- 1.5% volume fee
- Higher registration fee reflecting broader territory

Both tiers associate a deployed `RideHailing` contract address with their licence, enabling multi-city deployments of the core protocol.

### 4.2 Revenue Flow

All registration fees and ride-volume fees flow exclusively to:

**`0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb`**

There is no split to a DAO treasury on licence or fee payments. The DAO treasury operates separately on its RCT allocation and any future governance-approved grants.

### 4.3 Volume Reporting

Licence holders call `reportVolume(city, volumeUSDC)` to report and pay their periodic volume fee. On-chain enforcement of volume accuracy is a v2 feature (requires Chainlink proof-of-activity or zero-knowledge ride count attestation).

---

## 5. Pricing Oracle

### 5.1 Fare Formula

```
rawFare = baseFare
        + ceil(distanceMeters / 1000) × baseFarePerKm
        + ceil(durationSeconds / 60) × baseFarePerMinute

recommendedFare = rawFare × surgeMultiplierBps / 10_000

if recommendedFare < baseFare: recommendedFare = baseFare
```

Default Nairobi rates (USDC, 6 decimals):
- `baseFare`: $0.50
- `baseFarePerKm`: $0.40
- `baseFarePerMinute`: $0.10
- `surgeMultiplierBps`: 10,000 (1.0× — no surge)

Example: 10 km, 20 min, no surge → $0.50 + $4.00 + $2.00 = **$6.50**

### 5.2 Surge Pricing

The surge multiplier is bounded:
- **Minimum:** 10,000 BPS (1.0× — cannot suppress fares below baseline)
- **Maximum:** 30,000 BPS (3.0× hard cap — prevents price gouging)

In v1, surge is set by the contract owner. In v2 (Chainlink Functions integration), surge is computed autonomously by a Chainlink DON reading live ride demand and traffic data, and written by `performUpkeep` — making it ungovernable by any single party including the protocol owner.

### 5.3 Chainlink Automation

`PricingOracle` implements the Chainlink Automation interface:
- `checkUpkeep()` returns `true` every 3,600 seconds (1 hour)
- `performUpkeep()` records the timestamp and emits `OracleUpkeepPerformed`

In production, `performUpkeep` will be extended to call a Chainlink Function that computes the new surge value.

---

## 6. Governance

### 6.1 Quadratic Voting

Voting power = `sqrt(RCT balance)`. This reduces the influence of large token holders relative to linear voting, without excluding them entirely. A holder with 10,000 RCT has 100 votes. A holder with 1,000,000 RCT has 1,000 votes — 10×, not 100×.

### 6.2 Proposal Lifecycle

1. Proposer (≥100K RCT) submits `propose(targets, values, calldatas, description)`
2. 7-day voting period
3. If quorum (4% circulating) met and majority in favor: proposal queued in Timelock
4. 2-day Timelock delay
5. Proposal executable by anyone after delay

### 6.3 Guardian Council Veto

For 5 years post-deployment, the guardian council may veto any queued proposal before execution. The veto is exercised by a multisig (`cancel()` on the Governor). This mechanism exists because:
- Early token distribution is concentrated in founders and early drivers
- Hostile acquisition of proposal rights is cheap if token price is low
- The community needs time to develop sufficient distribution before pure on-chain governance is safe

After 5 years, the guardian role expires and is not renewable. Full on-chain governance takes over.

---

## 7. Token Design

See `docs/tokenomics.md` for the full supply schedule, allocation table, and vesting mechanics.

Summary: 100M RCT fixed supply. 40% to driver rewards (earned per ride). 15% treasury (DAO-controlled). 15% team (4-year vest). 10% seed investors (2-year vest). 20% ecosystem grants (5-year vest).

---

## 8. Security Model

### 8.1 Escrow Safety

USDC escrow is held by the `RideHailing` contract itself (not a separate vault). Only three code paths release escrowed funds:
1. `completeRide` — to driver (minus fee) and bond return
2. `claimTimeout` — to rider (refund) and bond return
3. `resolveDispute` — to either party per arbitration outcome

All three paths verify `msg.sender` roles and ride state transitions. Re-entrancy is guarded by `ReentrancyGuard` (OpenZeppelin).

### 8.2 Oracle Manipulation Resistance

In v1, oracle rates are set by the owner — trust is centralized. In v2, the Chainlink Functions integration moves rate-setting authority to a decentralized oracle network. The Solidity hard cap (30,000 BPS) enforces a ceiling regardless of oracle output.

### 8.3 Governance Attack Surface

- Proposal threshold (100K RCT) prevents spam
- Timelock (2 days) gives community time to react to malicious proposals
- Guardian veto is the backstop for the first 5 years
- Quadratic voting limits plutocratic dominance

### 8.4 Known Limitations (v1)

- Volume reporting is self-reported (no on-chain verification)
- Dispute arbitration is centralized (owner decides) — future DAO arbitration panel planned
- No slippage protection on USDC transfers (price assumed stable)
- `MockUSDC` is not an audited stablecoin — production deployments must use Circle's USDC

---

## 9. Deployment

### 9.1 Target Network

Polygon PoS (Mainnet) — low gas fees (~$0.001–0.01 per transaction) essential for sub-$10 rides to remain economically viable. Polygon Amoy testnet for pre-production testing.

### 9.2 Deployment Order

1. `MockUSDC` (testnet only) / configure real USDC address (mainnet)
2. `RideChainToken` — pass supply parameters
3. `RideChainGovernor` — pass token address, guardian addresses, veto expiry
4. `RideHailing` — pass USDC address, treasury address (`0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb`)
5. `RideChainLicence` — pass token address, treasury address
6. `PricingOracle` — pass baseFare, perKm, perMinute
7. `RideHailing.setPricingOracle(oracle address)`
8. Chainlink Automation registration for PricingOracle

### 9.3 Contract Verification

All contracts verified on Polygonscan via `hardhat-etherscan` plugin with `--network amoy` flag and Polygonscan API key.

---

## 10. Roadmap

| Phase | Target | Milestone |
|-------|--------|-----------|
| v1.0 | Q3 2026 | Polygon Amoy deployment, Nairobi pilot (10 drivers) |
| v1.1 | Q4 2026 | Chainlink Functions surge automation, East Africa Regional Masters |
| v1.2 | Q1 2027 | Chainlink Data Streams (USDC/KES rate feed), mobile app (React Native) |
| v2.0 | Q2 2027 | On-chain dispute arbiter DAO, volume verification (ZK proofs), Layer 2 zkEVM migration evaluation |

---

## 11. Conclusion

RideChain demonstrates that the core functions of a ride-hailing platform — matching, escrow, licensing, and pricing — can be implemented entirely on-chain without sacrificing usability. The cash ride support, tiered licensing model, and Chainlink oracle integration are specifically designed for the African market context. At 1% platform fees vs. the industry standard of 25–30%, RideChain has the potential to structurally shift income from extractive intermediaries to drivers and local operators.

The complete source code is available at the project repository. All 244 automated tests pass. The protocol is ready for testnet deployment.

---

## Appendix A — Contract Function Reference

### RideHailing.sol

| Function | Access | Description |
|----------|--------|-------------|
| `requestRide` | Rider | Open a ride request; locks USDC escrow |
| `makeOffer` | Driver | Submit or counter a fare |
| `acceptOffer` | Driver | Lock bond and begin ride |
| `acceptAmendment` | Rider | Accept driver counter-offer |
| `completeRide` | Driver | Finalize ride and release escrow |
| `confirmCashReceived` | Driver | Settle cash ride; pay 5% fee |
| `claimTimeout` | Rider | Recover escrow after timeout |
| `raiseDispute` | Either | Open dispute window |
| `resolveDispute` | Owner | Arbitrate dispute outcome |
| `submitRating` | Either | Submit 1–5 star rating |
| `setPricingOracle` | Owner | Wire PricingOracle address |
| `getOracleFare` | View | Get oracle-recommended fare |

### PricingOracle.sol

| Function | Access | Description |
|----------|--------|-------------|
| `getRecommendedFare` | View | Compute USDC fare from distance + duration |
| `getRates` | View | Return all rate parameters |
| `setRates` | Owner | Update baseFare, perKm, perMinute |
| `setSurgeMultiplier` | Owner | Set surge (10,000–30,000 BPS) |
| `checkUpkeep` | External view | Chainlink Automation: should upkeep run? |
| `performUpkeep` | External | Chainlink Automation: record update timestamp |

---

## Appendix B — Event Reference

### RideHailing.sol Events

`RideRequested`, `OfferMade`, `RideAccepted`, `AmendmentProposed`, `AmendmentAccepted`, `RideCompleted`, `CashPaymentConfirmed`, `DisputeRaised`, `DisputeResolved`, `TimeoutClaimed`, `RatingSubmitted`, `PricingOracleSet`

### PricingOracle.sol Events

`RatesUpdated(baseFare, baseFarePerKm, baseFarePerMinute)`, `SurgeUpdated(surgeMultiplierBps)`, `OracleUpkeepPerformed(timestamp)`

---

*This whitepaper describes the RideChain protocol as implemented. It is not a financial instrument prospectus. RCT is a utility and governance token. This document is MIT-licensed along with the protocol source code.*
