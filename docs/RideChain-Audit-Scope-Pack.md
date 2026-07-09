# RideChain — Audit Scope Pack

**Prepared:** 6 July 2026
**Contact:** Elijah — elijahpatti4@gmail.com
**Repository (public):** https://github.com/elijahpatti4-dot/RIDEHAILING-CONTRACTS (audit against `main`)
**Target network:** Polygon PoS mainnet (currently deployed on Amoy testnet, chainId 80002)

---

## Project summary

RideChain is a decentralised ride-hailing protocol. Rides are requested, negotiated, escrowed and settled on-chain; fares are paid in USDC (with cash / M-Pesa recorded on-chain and settled off-chain), the protocol takes a 5% fee, and driver/rider reputation and token incentives are managed by companion contracts. A React Native mobile app (rider + driver) drives the contracts; a full end-to-end ride (request → accept → start → complete → settle → rate) was executed against the current Amoy deployment on 6 July 2026.

---

## Scope — 6 contracts, ~2,040 SLOC

| Contract | File | Lines | Purpose |
|---|---|---|---|
| RideHailing | contracts/RideHailing.sol | 537 | Core ride lifecycle: request, fare negotiation (banded, 5 rounds), escrow, amendments, disputes, ratings, cash/M-Pesa settlement paths |
| RideChainToken (+ FounderVesting) | contracts/RideChainToken.sol | 508 | ERC20Votes token, driver/rider incentive pools with daily rebalancing, founder vesting (both contracts in one file) |
| RideChainGovernor | contracts/RideChainGovernor.sol | 392 | OZ Governor-based DAO (deployed, not yet activated) |
| RideChainLicence | contracts/RideChainLicence.sol | 390 | City/regional licensing with tiered upfront + volume fees |
| PricingOracle | contracts/PricingOracle.sol | 213 | Recommended-fare calculation, surge multiplier, Chainlink Automation hooks |
| MockUSDC | contracts/MockUSDC.sol | 15 | **Out of audit scope** — test-only ERC20 |

Also deployed but out of source scope: **TimelockController** — stock OpenZeppelin v4.x, deployed unmodified (config review only).

**Toolchain:** Solidity 0.8.20, OpenZeppelin 4.x, Hardhat, optimizer enabled (200 runs), `viaIR: true`.

---

## Deployed addresses (Polygon Amoy, chainId 80002)

| Contract | Address |
|---|---|
| RideHailing (**current** — redeployed 6 Jul 2026) | `0x540c9a7ab37Ec383C90080AeE26A251143956db7` |
| RideHailing (deprecated — pre-fix, do not audit) | `0x798ed242E2f1E1D2C2D6D0e2E2e61824A2aAd5fa` |
| MockUSDC | `0xF76aAE142a1EEdaD7215D2f9B9BF164bd55fFfA7` |
| PricingOracle | `0xe218e059bE172Ffb4C40F46675d62a4ac93BD6e1` |
| RideChainToken | `0x93089AaF3c41459AdD56B976D0ca48d03DCd3308` |
| FounderVesting | `0x82Fb955F3B0A6E570a4c273C5204daa804F91c7c` |
| Timelock | `0xc931A41EA842abd542C913Dd7fE8C7D4058d3239` |
| Governor | `0x568AC334d8B492e35C199465D9C6bC47F77030F9` |
| RideChainLicence | `0x4C2d562e124eCdde5419bef51C9A5537a548a77A` |

Owner / treasury (testnet): `0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb`

---

## Test suite

Located in `/test` (Hardhat + chai). Run with:

```
npm install
npx hardhat test
```

| Suite | Status |
|---|---|
| RideHailing.test.js | **62 passing** (verified 6 Jul 2026; includes regression suite for the fixed C-1 issue) |
| PricingOracle.test.js | **44 passing** (verified 6 Jul 2026) |
| Token.test.js / Governor.test.js / Licence.test.js | present in repo; not re-run since latest contract changes |

---

## Known findings already fixed (current `main` + current deployment)

An internal pre-audit review (26 Jun 2026, included in handover docs as `pre-audit-review.md`) surfaced the following, all fixed in `main` and included in the 6 Jul redeployment:

| ID | Severity | Issue | Fix |
|---|---|---|---|
| C-1 | Critical | `acceptOffer`: driver address never set when rider accepts a driver counter-offer → settlement to `address(0)`, all `onlyDriver` functions brick | Driver assigned from `offerFrom`; regression tests added |
| H-1 | High | `submitRating`: no per-address guard → rating spam, bond-requirement gaming | `hasRated` mapping added |
| H-2 | High | Token pool rebalancing accepts unverifiable off-chain inputs | Inputs now emitted on-chain (`DriverPoolInputs` event) for auditability |
| M-3 | Medium | Unbounded rebalance frequency | One rebalance per 24h enforced |
| M-4 | Medium | Unbounded ride amendments | Hard cap (3) + 5-min cooldown per ride |
| L-4 | Low | Unbounded M-Pesa code string | 20-char cap |

Auditors should treat these as context, not as pre-cleared areas — independent re-verification is welcome.

---

## Notes for scoping

- The deprecated RideHailing deployment (`0x798e...d5fa`) predates the fixes above; any scoping performed against repo state before 6 July 2026 is stale.
- Governance (Token/Governor/Timelock) is deployed but not yet activated; no token holders exist. Priority order for audit effort, if tiering is needed: RideHailing > RideChainToken > RideChainLicence > PricingOracle > Governor.
- Off-chain payment flows (cash/M-Pesa) intentionally trust driver confirmation on-chain; economic-design comments on this model are in scope and welcome.
