// ─────────────────────────────────────────────────────────────────────────────
//  Contract addresses
//  Replace with real addresses after `npx hardhat run scripts/deploy.js --network amoy`
// ─────────────────────────────────────────────────────────────────────────────

export const ADDRESSES = {
  RIDE_HAILING:   "0x798ed242E2f1E1D2C2D6D0e2E2e61824A2aAd5fa",
  LICENCE:        "0x4C2d562e124eCdde5419bef51C9A5537a548a77A",
  TOKEN:          "0x93089AaF3c41459AdD56B976D0ca48d03DCd3308",
  GOVERNOR:       "0x568AC334d8B492e35C199465D9C6bC47F77030F9",
  TIMELOCK:       "0xc931A41EA842abd542C913Dd7fE8C7D4058d3239",
  PRICING_ORACLE: "0xe218e059bE172Ffb4C40F46675d62a4ac93BD6e1",
  USDC:           "0xF76aAE142a1EEdaD7215D2f9B9BF164bd55fFfA7",
};

// ─────────────────────────────────────────────────────────────────────────────
//  RideHailing ABI (key functions only)
// ─────────────────────────────────────────────────────────────────────────────

export const RIDE_HAILING_ABI = [
  // State-changing
  {
    name: "requestRide",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_pickupHash",       type: "bytes32" },
      { name: "_dropoffHash",      type: "bytes32" },
      { name: "_recommendedFare",  type: "uint256" },
      { name: "_expectedDuration", type: "uint256" },
      { name: "_openingOffer",     type: "uint256" },
      { name: "_paymentMethod",     type: "uint8"   },
    ],
    outputs: [{ name: "rideId", type: "uint256" }],
  },
  {
    name: "counterOffer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rideId",  type: "uint256" },
      { name: "newFare", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "acceptOffer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancelNegotiation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "startRide",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "proposeAmendment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rideId",         type: "uint256" },
      { name: "_newDropoffHash", type: "bytes32" },
      { name: "_newFare",        type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "acceptAmendment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "rejectAmendment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "completeRide",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "confirmCashReceived",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "confirmMpesaReceived",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rideId",    type: "uint256" },
      { name: "mpesaCode", type: "string"  },
    ],
    outputs: [],
  },
  {
    name: "claimTimeout",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "raiseDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rideId",        type: "uint256" },
      { name: "_evidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "submitRating",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rideId", type: "uint256" },
      { name: "score",  type: "uint256" },
    ],
    outputs: [],
  },
  // Views
  {
    name: "getRide",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "rideId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "rider",               type: "address" },
          { name: "driver",              type: "address" },
          { name: "pickupHash",          type: "bytes32" },
          { name: "dropoffHash",         type: "bytes32" },
          { name: "recommendedFare",     type: "uint256" },
          { name: "bandMin",             type: "uint256" },
          { name: "bandMax",             type: "uint256" },
          { name: "currentOffer",        type: "uint256" },
          { name: "offerFrom",           type: "address" },
          { name: "negotiationRoundsUsed", type: "uint256" },
          { name: "negotiationDeadline", type: "uint256" },
          { name: "agreedFare",          type: "uint256" },
          { name: "driverBond",          type: "uint256" },
          { name: "requestedAt",         type: "uint256" },
          { name: "acceptedAt",          type: "uint256" },
          { name: "startedAt",           type: "uint256" },
          { name: "expectedDuration",    type: "uint256" },
          { name: "completedAt",         type: "uint256" },
          { name: "state",               type: "uint8"   },
          { name: "amendmentPending",    type: "bool"    },
          { name: "newDropoffHash",      type: "bytes32" },
          { name: "newFareProposed",     type: "uint256" },
          { name: "disputeTier",         type: "uint8"   },
          { name: "evidenceHash",        type: "bytes32" },
          { name: "disputeRaisedBy",     type: "address" },
          { name: "routeLogHash",        type: "bytes32" },
          { name: "paymentMethod",    type: "uint8"  },
          { name: "settlementPending", type: "bool"  },
          { name: "mpesaCode",        type: "string" },
        ],
      },
    ],
  },
  {
    name: "getReputation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalRides",       type: "uint256" },
          { name: "ratingSum",        type: "uint256" },
          { name: "ratingCount",      type: "uint256" },
          { name: "disputesLost",     type: "uint256" },
          { name: "completionCount",  type: "uint256" },
          { name: "isVerifiedDriver", type: "bool"    },
          { name: "tier",             type: "uint8"   },
        ],
      },
    ],
  },
  {
    name: "getAverageScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "rideCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "platformFeePct",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pricingOracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getOracleFare",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "distanceMeters",  type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
    ],
    outputs: [{ name: "fare", type: "uint256" }],
  },
  // Events
  {
    name: "RideRequested",
    type: "event",
    inputs: [
      { name: "rideId",          type: "uint256", indexed: true  },
      { name: "rider",           type: "address", indexed: true  },
      { name: "pickupHash",      type: "bytes32", indexed: false },
      { name: "dropoffHash",     type: "bytes32", indexed: false },
      { name: "recommendedFare", type: "uint256", indexed: false },
      { name: "bandMin",         type: "uint256", indexed: false },
      { name: "bandMax",         type: "uint256", indexed: false },
    ],
  },
  {
    name: "RideAccepted",
    type: "event",
    inputs: [
      { name: "rideId",     type: "uint256", indexed: true  },
      { name: "driver",     type: "address", indexed: true  },
      { name: "agreedFare", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RideCompleted",
    type: "event",
    inputs: [
      { name: "rideId",       type: "uint256", indexed: true  },
      { name: "driverPayout", type: "uint256", indexed: false },
      { name: "treasuryFee",  type: "uint256", indexed: false },
    ],
  },
  {
    name: "CashPaymentConfirmed",
    type: "event",
    inputs: [
      { name: "rideId",  type: "uint256", indexed: true  },
      { name: "driver",  type: "address", indexed: true  },
      { name: "fee",     type: "uint256", indexed: false },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  RideChainLicence ABI
// ─────────────────────────────────────────────────────────────────────────────

export const LICENCE_ABI = [
  {
    name: "registerCityLicence",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cityName",        type: "string"  },
      { name: "contractAddress", type: "address" },
      { name: "tierType",        type: "uint8"   },
    ],
    outputs: [],
  },
  {
    name: "registerRegionalLicence",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "regionName", type: "string"   },
      { name: "countries",  type: "string[]" },
    ],
    outputs: [],
  },
  {
    name: "reportCityVolume",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cityName",   type: "string"  },
      { name: "usdcVolume", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "reportRegionalVolume",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "regionName", type: "string"  },
      { name: "usdcVolume", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "isCityActive",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "cityName", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isRegionActive",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "regionName", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getCityLicence",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "cityName", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "operator",            type: "address" },
          { name: "contractAddress",     type: "address" },
          { name: "tierType",            type: "uint8"   },
          { name: "registeredAt",        type: "uint256" },
          { name: "exclusivityExpiry",   type: "uint256" },
          { name: "active",              type: "bool"    },
          { name: "regionalMaster",      type: "address" },
          { name: "totalVolumeReported", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getRegisteredCities",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    name: "getRegisteredRegions",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    name: "operatorCity",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "FEE_COMMUNITY",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "FEE_INDEPENDENT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "FEE_ENTERPRISE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "FEE_GOVERNMENT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "FEE_REGIONAL",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "CityLicenceRegistered",
    type: "event",
    inputs: [
      { name: "cityName",   type: "string",  indexed: false },
      { name: "operator",   type: "address", indexed: true  },
      { name: "tierType",   type: "uint8",   indexed: false },
      { name: "fee",        type: "uint256", indexed: false },
    ],
  },
  {
    name: "RegionalLicenceRegistered",
    type: "event",
    inputs: [
      { name: "regionName", type: "string",  indexed: false },
      { name: "operator",   type: "address", indexed: true  },
      { name: "fee",        type: "uint256", indexed: false },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  RideChainToken ABI
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getVotingPower",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "driverPoolRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "riderPoolRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "treasuryRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "driverAllocation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "riderAllocation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "driverClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "riderClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimDriverTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "claimRiderTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "delegate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegatee", type: "address" }],
    outputs: [],
  },
  {
    name: "WALLET_CAP",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  RideChainGovernor ABI
// ─────────────────────────────────────────────────────────────────────────────

export const GOVERNOR_ABI = [
  {
    name: "propose",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets",     type: "address[]" },
      { name: "values",      type: "uint256[]" },
      { name: "calldatas",   type: "bytes[]"   },
      { name: "description", type: "string"    },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  {
    name: "castVote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "support",    type: "uint8"   },
    ],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "queue",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets",          type: "address[]" },
      { name: "values",           type: "uint256[]" },
      { name: "calldatas",        type: "bytes[]"   },
      { name: "descriptionHash",  type: "bytes32"   },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "targets",          type: "address[]" },
      { name: "values",           type: "uint256[]" },
      { name: "calldatas",        type: "bytes[]"   },
      { name: "descriptionHash",  type: "bytes32"   },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  {
    name: "state",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "proposalVotes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "againstVotes", type: "uint256" },
      { name: "forVotes",     type: "uint256" },
      { name: "abstainVotes", type: "uint256" },
    ],
  },
  {
    name: "isFoundingVetoActive",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "consecutiveMonthsMet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "council",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "members",       type: "address[5]" },
          { name: "isActive",      type: "bool"       },
          { name: "vetoThreshold", type: "uint8"      },
        ],
      },
    ],
  },
  {
    name: "foundingWallet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "deployedAt",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tagConstitutional",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "activateGuardianCouncil",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  ERC-20 (USDC / RCT) ABI — minimal
// ─────────────────────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  // MockUSDC only — remove before mainnet
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a raw USDC uint256 (6 decimals) to "$12.50" */
export function formatUSDC(raw) {
  if (raw === undefined || raw === null) return "—";
  const n = Number(raw) / 1e6;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a raw RCT uint256 (18 decimals) to "1,000,000 RCT" */
export function formatRCT(raw) {
  if (raw === undefined || raw === null) return "—";
  const n = Number(raw) / 1e18;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " RCT";
}

/** Hash a string to bytes32 (keccak256) using the browser's SubtleCrypto */
export async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return "0x" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
//  PricingOracle ABI
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING_ORACLE_ABI = [
  {
    name: "getRecommendedFare",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "distanceMeters",  type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
    ],
    outputs: [{ name: "fare", type: "uint256" }],
  },
  {
    name: "getRates",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_baseFare",          type: "uint256" },
      { name: "_baseFarePerKm",     type: "uint256" },
      { name: "_baseFarePerMinute", type: "uint256" },
      { name: "_surgeMultiplierBps", type: "uint256" },
    ],
  },
  {
    name: "surgeMultiplierBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "baseFare",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "lastUpdateTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "setSurgeMultiplier",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_surgeMultiplierBps", type: "uint256" }],
    outputs: [],
  },
  {
    name: "setRates",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_baseFare",          type: "uint256" },
      { name: "_baseFarePerKm",     type: "uint256" },
      { name: "_baseFarePerMinute", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "checkUpkeep",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes" }],
    outputs: [
      { name: "upkeepNeeded", type: "bool"  },
      { name: "",             type: "bytes" },
    ],
  },
  {
    name: "SurgeUpdated",
    type: "event",
    inputs: [{ name: "surgeMultiplierBps", type: "uint256", indexed: false }],
  },
];

// Also expose getOracleFare on RideHailing — append to RIDE_HAILING_ABI below
// (already included in RIDE_HAILING_ABI via the view helpers section)

export const RIDE_STATE_LABELS = [
  "Requested",
  "Accepted",
  "In Progress",
  "Completed",
  "Disputed",
  "Cancelled",
];

export const CITY_TIERS = [
  { label: "Community",   value: 0, fee: "5,000"   },
  { label: "Independent", value: 1, fee: "20,000"  },
  { label: "Enterprise",  value: 2, fee: "50,000"  },
  { label: "Government",  value: 3, fee: "100,000" },
];
