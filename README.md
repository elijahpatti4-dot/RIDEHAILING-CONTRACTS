# RideChain — Decentralised Ride-Hailing on Polygon

> No central server. No company taking 25%. Rules enforced by code.

RideChain is an open-source smart contract protocol that replaces the backend of a ride-hailing platform. Everything Uber does with servers, databases, and payment processors — RideChain does on the Polygon blockchain automatically.

Built for drivers in emerging markets who lose 25–30% of every fare to platform commissions. With RideChain, drivers keep 100%.

**Target market:** Nairobi, Kenya · **Mainnet launch:** Q3 2026 · **Network:** Polygon PoS

---

## Support this project

RideChain is community-funded open-source infrastructure. We accept crypto donations on Giveth:

**[🔗 Donate on Giveth](https://giveth.io/project/ridechain)** ← _link will be updated when live_

This Giveth project page is the official community fundraising page for RideChain (github.com/elijahpatti4-dot/RIDEHAILING-CONTRACTS).

Funds go directly toward:
- Smart contract audit & remediation ($35K)
- Polygon mainnet deployment ($3K)
- Post-launch bug bounty program ($2K)
- Community onboarding in Nairobi ($10K)

---

## Contracts

| Contract | Purpose |
|---|---|
| RideHailing.sol | Core protocol — fare negotiation, escrow, dispute resolution |
| MockUSDC.sol | Test token (excluded from audit scope) |

**Solidity:** 0.8.20 · **Libraries:** OpenZeppelin · **Payments:** USDC escrow

---

## What the protocol enforces

- Fare recommendation with negotiation band (±25% / +33%)
- Pre-ride negotiation up to 5 rounds within 3 minutes
- Rider-only ride start — physical presence as proof of pickup
- USDC escrow — rider deposit + driver bond locked on acceptance
- Mid-ride amendments — new dropoff with atomic fare adjustment
- Rider-only payment release — driver cannot trigger payment
- Driver timeout protection — payment auto-releases after window
- Two-tier dispute system — auto-resolution then community panel
- Basic reputation tracking — tiers affect bond requirements
- DAO-governed configuration with hard ceilings

---

## Security

A professional smart contract security audit is currently in progress by a top-tier audit firm.

Audit scope: `RideHailing.sol` (main protocol only). `MockUSDC.sol` is excluded — test token only.

---

## Status

- [x] Smart contracts written and tested (38 tests passing)
- [x] Security audit in progress
- [ ] Audit remediation
- [ ] Polygon mainnet deployment (Q3 2026)
- [ ] Bug bounty launch
- [ ] Nairobi pilot

---

## Project structure

```
contracts/
  RideHailing.sol   — main contract (all ride logic)
  MockUSDC.sol      — fake USDC for testing only
test/
  RideHailing.test.js — full test suite (38 tests)
scripts/
  deploy.js         — deployment script
```

---

## Setup

```bash
npm install
npx hardhat compile
npx hardhat test
```

---

## Ride lifecycle

```
REQUESTED → (negotiation) → ACCEPTED → IN_PROGRESS → COMPLETED
                                              ↓
                                          DISPUTED → resolved
```

---

## Built with

- Solidity 0.8.20
- Hardhat
- OpenZeppelin Contracts
- Polygon PoS

---

## Author

Elijah Patti · [elijahpatti4-dot](https://github.com/elijahpatti4-dot)

---

## License

MIT — fork it, build on it, improve it.
