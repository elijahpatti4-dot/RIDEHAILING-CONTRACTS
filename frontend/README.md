# RideChain Frontend

React + Vite + RainbowKit + wagmi v2 + Tailwind CSS.

## Setup

```bash
cd frontend
npm install
```

### Before running

1. **WalletConnect Project ID** — get a free one at https://cloud.walletconnect.com and paste it into `src/config/wagmi.js`

2. **Contract addresses** — after deploying with `npx hardhat run scripts/deploy.js --network amoy`, paste the addresses into `src/config/contracts.js`:
   ```js
   export const ADDRESSES = {
     RIDE_HAILING: "0x...",
     LICENCE:      "0x...",
     TOKEN:        "0x...",
     GOVERNOR:     "0x...",
     TIMELOCK:     "0x...",
     USDC:         "0x...", // MockUSDC on Amoy
   };
   ```

### Run dev server

```bash
npm run dev
```

Opens at http://localhost:5173

### Build for production

```bash
npm run build
```

Output in `dist/`. Deploy to Vercel, Netlify, or IPFS.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Request Ride | `/ride` | Rider requests a ride (USDC or cash), tracks status, starts/completes |
| Driver Dashboard | `/driver` | Accept offers, claim RCT, confirm cash received, rate riders |
| Licence Registry | `/licence` | Register city/regional licences, report volume, look up any city |
| Token & Governance | `/token` | RCT balances, pool stats, veto status, guardian council, claim tokens |

## Architecture

- **Wallet**: RainbowKit handles MetaMask, WalletConnect, Coinbase Wallet
- **Chain**: Polygon Amoy (testnet), Polygon PoS (mainnet)
- **Reads**: `useReadContract` from wagmi (auto-refreshes)
- **Writes**: `useWriteContract` from wagmi — returns tx hash, you can poll with `useWaitForTransactionReceipt`
- **ABIs**: Defined inline in `src/config/contracts.js` — only the functions each page needs
- **No backend**: All state is on-chain; no central server
