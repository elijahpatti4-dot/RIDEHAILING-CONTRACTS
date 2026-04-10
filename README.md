# ridehailing-contracts

Decentralised ride-hailing smart contracts built on Polygon.
No central server. No company taking 25%. Rules enforced by code.

## What this is

A complete smart contract system replacing the backend of a ride-hailing
platform. Everything Uber does with servers, databases, and payment processors
— this contract does on the blockchain automatically.

## What the contract enforces

- Fare recommendation with negotiation band (±25%/+33%)
- Pre-ride negotiation up to 5 rounds within 3 minutes
- Rider-only ride start — physical presence as proof of pickup
- USDC escrow — rider deposit + driver bond locked on acceptance
- Mid-ride amendments — new dropoff with atomic fare adjustment
- Rider-only payment release — driver cannot trigger payment
- Driver timeout protection — payment auto-releases after window
- Two-tier dispute system — auto-resolution then community panel
- Basic reputation tracking — tiers affect bond requirements
- DAO-governed configuration with hard ceilings

## Project structure

```
contracts/
  RideHailing.sol   — main contract (all ride logic)
  MockUSDC.sol      — fake USDC for testing only
test/
  RideHailing.test.js — full test suite (38 tests)
scripts/
  deploy.js         — deployment script for Mumbai testnet
```

## Setup

You need Node.js installed. Download from https://nodejs.org (LTS version).

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test
```

## Running tests

```bash
npx hardhat test
```

All 38 tests should pass with green ticks.

## Deploying to Mumbai testnet

1. Install MetaMask: https://metamask.io
2. Add Polygon Mumbai network to MetaMask
3. Get free test MATIC: https://faucet.polygon.technology
4. Export your wallet private key from MetaMask
5. Set environment variable: set PRIVATE_KEY=your_key_here (Windows)
6. Run: npx hardhat run scripts/deploy.js --network mumbai

## Ride lifecycle

```
REQUESTED → (negotiation) → ACCEPTED → IN_PROGRESS → COMPLETED
                                              ↓
                                          DISPUTED → resolved
```

## Key rules

| Rule | Enforced by |
|------|-------------|
| Only rider starts ride | require(msg.sender == ride.rider) |
| Only rider completes ride | require(msg.sender == ride.rider) |
| Fare must be within band | require(fare >= bandMin && fare <= bandMax) |
| Platform fee max 10% | require(_pct <= 10) |
| Amendment blocks completion | require(!amendmentPending) |
| Dispute blocks timeout | require(state != DISPUTED) |

## Built with

- Solidity 0.8.20
- Hardhat
- OpenZeppelin Contracts
- Polygon PoS (deployment target)

## Author

Elijah Patti — elijahpatti4-dot (GitHub)
Repository: https://github.com/elijahpatti4-dot/ridehailing-contracts
