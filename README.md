# RideChain — Decentralised Ride-Hailing on Polygon

**No central server. No company taking 25%. Rules enforced by code.**

RideChain is an open-source smart contract protocol that replaces the backend of a ride-hailing platform. Everything Uber does with servers, databases, and payment processors — RideChain does on the Polygon blockchain automatically.

Built for drivers in emerging markets who lose 25–30% of every fare to platform commissions. With RideChain, drivers keep 95% (a 5% protocol fee funds the platform — no other cuts).

**Target market:** Nairobi, Kenya · **Mainnet launch:** Q3 2026 · **Network:** Polygon PoS

---

## Support this project

RideChain is community-funded open-source infrastructure. We accept crypto donations on Giveth:

🔗 [Donate on Giveth](https://giveth.io/project/ridechain)

Funds go directly toward:

- Smart contract audit & remediation ($35K)
- Polygon mainnet deployment ($3K)
- Post-launch bug bounty program ($2K)
- Community onboarding in Nairobi ($10K)

---

## Contracts

| Contract | Lines | Purpose |
|---|---|---|
| `RideHailing.sol` | 537 | Core protocol — ride lifecycle, fare negotiation, USDC escrow, amendments, disputes, ratings, cash/M-Pesa settlement |
| `RideChainToken.sol` | 508 | ERC20Votes governance token, driver/rider incentive pools, founder vesting (FounderVesting contract in same file) |
| `RideChainGovernor.sol` | 392 | DAO governance (OpenZeppelin Governor; deployed, not yet activated) |
| `RideChainLicence.sol` | 390 | City/regional licensing with tiered fees |
| `PricingOracle.sol` | 213 | Recommended fares, surge multiplier, Chainlink Automation hooks |
| `MockUSDC.sol` | 15 | Test token — excluded from audit scope |

**Solidity:** 0.8.20 · **Libraries:** OpenZeppelin 4.x · **Payments:** USDC escrow · **Tooling:** Hardhat, optimizer + viaIR

### Deployed on Polygon Amoy testnet (chainId 80002)

| Contract | Address |
|---|---|
| RideHailing | `0x540c9a7ab37Ec383C90080AeE26A251143956db7` |
| MockUSDC | `0xF76aAE142a1EEdaD7215D2f9B9BF164bd55fFfA7` |
| PricingOracle | `0xe218e059bE172Ffb4C40F46675d62a4ac93BD6e1` |
| RideChainToken | `0x93089AaF3c41459AdD56B976D0ca48d03DCd3308` |
| RideChainLicence | `0x4C2d562e124eCdde5419bef51C9A5537a548a77A` |
| Governor / Timelock | `0x568AC334d8B492e35C199465D9C6bC47F77030F9` / `0xc931A41EA842abd542C913Dd7fE8C7D4058d3239` |

---

## What the protocol enforces

- Fare recommendation with negotiation band (−25% / +33%)
- Pre-ride negotiation up to 5 rounds within 3 minutes
- Rider-only ride start — physical presence as proof of pickup
- USDC escrow — rider deposit + driver bond locked on acceptance
- Mid-ride amendments — new dropoff with atomic fare adjustment (capped, rate-limited)
- Rider-only payment release — driver cannot trigger payment
- Driver timeout protection — payment auto-releases after window
- Cash and M-Pesa rides recorded on-chain with driver-confirmed settlement
- Two-tier dispute system — auto-resolution then community panel
- Reputation tracking with one-rating-per-ride enforcement — tiers affect bond requirements
- DAO-governed configuration with hard ceilings

---

## Security

The protocol is in **audit scoping with multiple independent firms** (July 2026). Full scope, deployed addresses, toolchain, and previously fixed findings are documented in the **[Audit Scope Pack](docs/RideChain-Audit-Scope-Pack.md)**.

An internal pre-audit review (June 2026) surfaced and fixed six issues, including one Critical in the counter-offer acceptance path — all fixes are in `main`, covered by regression tests, and included in the current Amoy deployment (redeployed 6 July 2026).

## Status

- ✅ Smart contracts written and tested — 5 test suites covering all contracts (`npx hardhat test`)
- ✅ Pre-audit review complete; all findings fixed and redeployed
- ✅ Full end-to-end ride executed on-chain via the mobile app (6 July 2026)
- 🔄 Security audit — scoping with multiple firms
- ⬜ Audit remediation
- ⬜ Polygon mainnet deployment (Q3 2026)
- ⬜ Bug bounty launch
- ⬜ Nairobi pilot

---

## Project structure

```
contracts/            All six protocol contracts (see table above)
test/                 Hardhat test suites — one per contract
scripts/              Deployment and maintenance scripts
docs/                 Whitepaper, tokenomics, audit scope pack
frontend/             Web dashboard (Vercel)
```

## Setup

```
npm install
npx hardhat compile
npx hardhat test
```

## Ride lifecycle

```
REQUESTED → (negotiation) → ACCEPTED → IN_PROGRESS → COMPLETED
                                            ↓
                                        DISPUTED → resolved
```

## Built with

- Solidity 0.8.20
- Hardhat
- OpenZeppelin Contracts
- Polygon PoS

## Author

Elijah Patti · [elijahpatti4-dot](https://github.com/elijahpatti4-dot)

## License

MIT — fork it, build on it, improve it.
