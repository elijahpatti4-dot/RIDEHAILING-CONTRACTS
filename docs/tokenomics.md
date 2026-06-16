# RideChain (RCT) — Tokenomics

**Version 1.0 | June 2026**

---

## 1. Overview

RideChain Token (RCT) is the governance and incentive token of the RideChain decentralized ride-hailing protocol. It does not represent equity, profit-sharing rights, or a claim on platform revenues. Its purpose is to align long-term protocol participation: drivers earn RCT for completing rides, token holders govern protocol parameters, and the guardian council veto mechanism protects against hostile governance attacks.

---

## 2. Token Supply

| Parameter | Value |
|-----------|-------|
| Symbol | RCT |
| Total Fixed Supply | 100,000,000 RCT |
| Decimals | 18 |
| Standard | ERC-20 (Polygon PoS) |
| Mintable | No — supply is fixed at deployment |

---

## 3. Allocation

| Pool | Tokens | % | Vesting |
|------|--------|---|---------|
| Driver Rewards | 40,000,000 | 40% | Earned per ride; no cliff |
| Ecosystem & Grants | 20,000,000 | 20% | 5-year linear vest from deployment |
| Team & Advisors | 15,000,000 | 15% | 1-year cliff, 4-year linear vest |
| Treasury (DAO-controlled) | 15,000,000 | 15% | Unlocked; governed by DAO vote |
| Seed / Strategic Investors | 10,000,000 | 10% | 6-month cliff, 2-year linear vest |

All vesting enforced on-chain via `RideChainToken.sol` pool release logic. The DAO treasury is a 5-of-9 Gnosis Safe on Polygon, controlled by the Governor contract after the guardian veto window closes (5 years from deployment).

---

## 4. Driver Reward Mechanics

Drivers earn RCT from the **Driver Rewards pool** (40M tokens). Emissions follow a halving schedule:

| Year | Emissions per Completed Ride | Cumulative Issued |
|------|------------------------------|-------------------|
| 1 | 1.00 RCT | ~varies |
| 2 | 0.75 RCT | ~varies |
| 3 | 0.50 RCT | ~varies |
| 4+ | 0.25 RCT | ~varies |

Exact ride counts determine actual drawdown. The pool will sustain driver rewards for a projected 10–15 years at Nairobi's current ~2,000 rides/day baseline, scaling naturally as the pool depletes.

Rewards are claimable via `RideChainToken.claimDriverReward(address driver)`, callable by the RideHailing contract after each completed ride. Drivers accumulate unclaimed rewards on-chain and pull them at their discretion (no gas cost from the protocol side).

---

## 5. Governance

RCT holders govern the protocol through the `RideChainGovernor` contract (OpenZeppelin Governor Bravo–compatible):

- **Proposal threshold:** 100,000 RCT (0.1% of supply)
- **Quorum:** 4% of circulating supply
- **Voting period:** 7 days
- **Timelock delay:** 2 days (all on-chain actions delayed after passing)
- **Voting power:** Quadratic — `sqrt(balance)` to limit whale dominance

Governable parameters include: platform fee rates, oracle base fares, licensing fee tiers, and treasury spending.

### Guardian Council Veto

For 5 years post-deployment, a guardian council of Elijah Patti (founding team) plus up to 4 community-elected members holds veto rights over any governance proposal. This protects against hostile capture before the community is sufficiently distributed. After 5 years, the veto mechanism expires and full on-chain governance takes over.

---

## 6. Platform Fee Flow

All platform fees (ride-volume fees and licence registration fees) flow exclusively to:

**`0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb`** (RideChain operations wallet)

There is no treasury split on platform fees. The DAO treasury operates on its own allocated 15M RCT and any future governance-approved USDC grants.

Fee structure:
- City Operator (Tier 1): 1% of ride volume
- Regional Master (Tier 2): 1.5% of ride volume
- Cash ride platform fee: 5% charged to driver via `confirmCashReceived`

---

## 7. Token Utility Summary

| Use Case | How |
|----------|-----|
| Governance voting | Direct token weight (quadratic) |
| Earning (drivers) | Awarded per completed ride |
| Proposal creation | Requires 100K RCT minimum balance |
| Ecosystem grants | DAO treasury vote |

RCT has no staking yield, no burn mechanism, and no fee rebate in v1. These are future governance decisions.

---

## 8. Contract Addresses (post-Amoy deployment)

| Contract | Address |
|----------|---------|
| RideChainToken (RCT) | TBD — update after Section 7 deployment |
| RideChainGovernor | TBD |
| RideHailing | TBD |
| RideChainLicence | TBD |
| PricingOracle | TBD |

---

*Last updated: June 2026. This document is for informational purposes only and does not constitute a financial instrument prospectus or investment advice.*
