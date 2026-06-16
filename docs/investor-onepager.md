# RideChain — Investor One-Pager

**Decentralized Ride-Hailing on Polygon | June 2026**

---

## The Problem

Ride-hailing in sub-Saharan Africa is dominated by Uber and Bolt, which extract 25–30% commissions from drivers earning below minimum wage. Drivers have no ownership stake, no recourse in disputes, and no income when the app is down. Riders overpay. No local operator can build a competing product without tens of millions in capital to match centralized infrastructure.

---

## What RideChain Builds

RideChain is a **serverless ride-hailing protocol** — the matching, escrow, dispute resolution, and driver licensing run entirely on the Polygon blockchain. No central server. No corporate intermediary.

Core components:
- **RideHailing.sol** — on-chain ride matching, USDC escrow, and dispute arbitration
- **RideChainLicence.sol** — tiered city licensing (City Operator + Regional Master) with on-chain exclusivity windows
- **PricingOracle.sol** — Chainlink Automation–connected fare oracle with surge pricing (1.0–3.0×)
- **RideChainToken (RCT)** — governance and driver reward token (100M fixed supply)
- **RideChainGovernor** — quadratic-vote DAO governance with guardian veto protection

Both USDC (digital) and cash rides are natively supported, critical for markets where smartphone banking penetration is low.

---

## Market Opportunity

| Metric | Figure |
|--------|--------|
| Sub-Saharan Africa ride-hailing TAM (2025) | ~$4.5B |
| Nairobi daily rides (pilot market) | ~2M |
| Average commission rate (Uber/Bolt) | 25–30% |
| RideChain platform fee (City Operator) | 1% of volume |
| RideChain platform fee (Regional Master) | 1.5% of volume |

At 1% platform fees, capturing 1% of Nairobi's daily ride volume (~20,000 rides × ~$3 average) generates ~$600/day in fee revenue from a single city — before any Regional Master licence issuance.

---

## Traction & Milestones

| Milestone | Status |
|-----------|--------|
| Core contracts (RideHailing, Licence, Token, Governor) | ✅ Complete |
| 244/244 automated test suite passing | ✅ Complete |
| PricingOracle + Chainlink Automation integration | ✅ Complete |
| Cash ride support (no smartphone banking required) | ✅ Complete |
| React / wagmi / RainbowKit frontend | ✅ Complete |
| Polygon Amoy testnet deployment | 🔜 Section 7 |
| Nairobi pilot (City Operator licence, 10 drivers) | 🔜 Q3 2026 |
| Regional Master onboarding (East Africa expansion) | 🔜 Q4 2026 |

---

## Business Model

**Protocol revenues (all flow to `0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb`):**

1. City Operator licence issuance fee (one-time, per city)
2. Regional Master licence issuance fee (one-time, per region)
3. 1% ride-volume fee (City tier) — collected on-chain per ride
4. 1.5% ride-volume fee (Regional tier) — collected on-chain per ride
5. Cash ride 5% platform fee — charged to driver at cash settlement

**No subscription. No SaaS fees. No VC intermediaries between protocol and operators.**

---

## Competitive Differentiation

| | Uber / Bolt | Existing Web3 Ride Apps | RideChain |
|--|-------------|------------------------|-----------|
| Server dependency | High | Varies | None |
| Driver commission | 25–30% | 10–20% | 1–1.5% |
| Cash rides | No | No | Yes |
| On-chain dispute resolution | No | Partial | Yes |
| Community governance | No | Token-gated | Quadratic DAO |
| Africa-first design | No | No | Yes |

---

## Token & Raise

RideChain is raising a **strategic seed round** to fund:
- Polygon Amoy → Mainnet deployment and audit
- Nairobi pilot: driver onboarding, vehicle inspection, legal (Kenya Traffic Act compliance)
- Chainlink integration (Data Streams for real-time surge pricing)
- Regional Master partnerships (Uganda, Tanzania, Rwanda)

**Token allocation for strategic investors: 10,000,000 RCT (10% of supply)**
6-month cliff, 2-year linear vest.

*Interested investors: contact Elijah Patti — elijahpatti4@gmail.com*

---

## Team

**Elijah Patti** — Founder & Protocol Engineer, Nairobi, Kenya.
Full-stack blockchain developer. Designed and built all RideChain contracts, frontend, and test suite.

*Advisory and co-founder positions open.*

---

*This document is not a prospectus. RCT is a utility/governance token. Nothing herein constitutes an offer of securities.*
