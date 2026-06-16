import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import {
  ADDRESSES,
  RIDE_HAILING_ABI,
  ERC20_ABI,
  TOKEN_ABI,
  formatUSDC,
  formatRCT,
} from "../config/contracts";
import StatusBadge from "../components/StatusBadge";

const USDC = (n) => parseUnits(String(n), 6);

const REPUTATION_TIERS = ["New", "Established", "Trusted", "Elite"];

export default function DriverDashboard() {
  const { address, isConnected } = useAccount();

  const [rideId, setRideId]   = useState("");
  const [rideData, setRideData] = useState(null);
  const [counterAmt, setCounterAmt] = useState("");

  const { writeContract } = useWriteContract();

  // Read reputation
  const { data: rep } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "getReputation",
    args: [address],
    query: { enabled: isConnected },
  });

  // Average rating
  const { data: avgScore } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "getAverageScore",
    args: [address],
    query: { enabled: isConnected },
  });

  // RCT balance
  const { data: rctBalance } = useReadContract({
    address: ADDRESSES.TOKEN,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: isConnected },
  });

  // RCT driver allocation
  const { data: driverAlloc } = useReadContract({
    address: ADDRESSES.TOKEN,
    abi: TOKEN_ABI,
    functionName: "driverAllocation",
    args: [address],
    query: { enabled: isConnected },
  });

  const { data: driverClaimed } = useReadContract({
    address: ADDRESSES.TOKEN,
    abi: TOKEN_ABI,
    functionName: "driverClaimed",
    args: [address],
    query: { enabled: isConnected },
  });

  // USDC balance (for cash rides — driver needs USDC for platform fee)
  const { data: usdcBalance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: isConnected },
  });

  // Load ride
  const { data: ride, refetch } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "getRide",
    args: [BigInt(rideId || "0")],
    query: { enabled: !!rideId },
  });

  const claimable =
    driverAlloc !== undefined && driverClaimed !== undefined
      ? driverAlloc - driverClaimed
      : 0n;

  function tx(functionName, args, extraArgs = {}) {
    writeContract(
      { address: ADDRESSES.RIDE_HAILING, abi: RIDE_HAILING_ABI, functionName, args },
      { onSuccess: () => setTimeout(() => refetch(), 2000), ...extraArgs }
    );
  }

  function approveBond(bondAmt) {
    writeContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.RIDE_HAILING, bondAmt * 2n],
    });
  }

  function approveForCashFee() {
    // Approve USDC for confirmCashReceived (5% of agreed fare)
    if (!ride) return;
    const fee = (ride.agreedFare * 5n) / 100n;
    writeContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.RIDE_HAILING, fee],
    });
  }

  if (!isConnected) {
    return (
      <div className="card text-center py-12 text-gray-400">
        Connect your wallet to view your driver dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Driver Dashboard</h1>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Reputation Tier"
          value={rep ? REPUTATION_TIERS[Number(rep.tier)] : "—"}
        />
        <StatCard
          label="Total Rides"
          value={rep ? String(rep.totalRides) : "—"}
        />
        <StatCard
          label="Avg Rating"
          value={avgScore !== undefined ? (Number(avgScore) / 10).toFixed(1) + " / 5" : "—"}
        />
        <StatCard
          label="Disputes Lost"
          value={rep ? String(rep.disputesLost) : "—"}
        />
      </div>

      {/* ── Token balances ───────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Token & USDC</h2>
        <Row label="RCT Balance"    value={formatRCT(rctBalance)} />
        <Row label="USDC Balance"   value={formatUSDC(usdcBalance)} />
        <Row label="RCT Claimable"  value={formatRCT(claimable)} />
        {claimable > 0n && (
          <button
            className="btn-primary w-full"
            onClick={() =>
              writeContract({
                address: ADDRESSES.TOKEN,
                abi: TOKEN_ABI,
                functionName: "claimDriverTokens",
                args: [],
              })
            }
          >
            Claim {formatRCT(claimable)}
          </button>
        )}
        <button
          className="btn-secondary w-full"
          onClick={() =>
            writeContract({
              address: ADDRESSES.TOKEN,
              abi: TOKEN_ABI,
              functionName: "delegate",
              args: [address],
            })
          }
        >
          Self-delegate RCT (required for governance voting)
        </button>
      </div>

      {/* ── Ride actions ─────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <h2 className="font-semibold">Manage a Ride</h2>
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            placeholder="Ride ID"
            value={rideId}
            onChange={(e) => setRideId(e.target.value)}
          />
          <button className="btn-secondary shrink-0" onClick={() => refetch()}>
            Load
          </button>
        </div>

        {ride && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">State</span>
              <StatusBadge state={ride.state} />
            </div>
            <Row label="Type"        value={ride.isCashRide ? "💵 Cash" : "💳 Digital"} />
            <Row label="Agreed Fare" value={formatUSDC(ride.agreedFare)} />
            <Row label="Bond"        value={formatUSDC(ride.driverBond)} />
            <Row label="Rider"       value={ride.rider} mono />

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
              {/* Accept open offer */}
              {ride.state === 0 /* REQUESTED */ &&
                ride.offerFrom?.toLowerCase() !== address?.toLowerCase() && (
                  <>
                    <button
                      className="btn-secondary"
                      onClick={() => approveBond((ride.currentOffer * 10n) / 100n)}
                    >
                      Approve Bond (step 1)
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => tx("acceptOffer", [BigInt(rideId)])}
                    >
                      Accept Offer ({formatUSDC(ride.currentOffer)})
                    </button>
                  </>
                )}

              {/* Counter offer */}
              {ride.state === 0 && (
                <div className="flex gap-2 w-full">
                  <input
                    className="input"
                    type="number"
                    placeholder="Counter fare (USDC)"
                    value={counterAmt}
                    onChange={(e) => setCounterAmt(e.target.value)}
                  />
                  <button
                    className="btn-secondary shrink-0"
                    disabled={!counterAmt}
                    onClick={() =>
                      tx("counterOffer", [BigInt(rideId), USDC(counterAmt)])
                    }
                  >
                    Counter
                  </button>
                </div>
              )}

              {/* Timeout */}
              {ride.state === 2 /* IN_PROGRESS */ && (
                <button
                  className="btn-secondary"
                  onClick={() => tx("claimTimeout", [BigInt(rideId)])}
                >
                  Claim Timeout
                </button>
              )}

              {/* Confirm cash */}
              {ride.isCashRide && ride.cashSettlementPending && (
                <>
                  <button
                    className="btn-secondary w-full"
                    onClick={approveForCashFee}
                  >
                    Approve USDC for platform fee (step 1)
                  </button>
                  <button
                    className="btn-primary w-full"
                    onClick={() => tx("confirmCashReceived", [BigInt(rideId)])}
                  >
                    Confirm Cash Received (deducts 5% fee)
                  </button>
                </>
              )}

              {/* Rate rider */}
              {ride.state === 3 /* COMPLETED */ && (
                <RatingWidget
                  label="Rate rider"
                  onSubmit={(score) =>
                    writeContract({
                      address: ADDRESSES.RIDE_HAILING,
                      abi: RIDE_HAILING_ABI,
                      functionName: "submitRating",
                      args: [BigInt(rideId), BigInt(score)],
                    })
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-xs text-gray-300" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

function RatingWidget({ label, onSubmit }) {
  const [score, setScore] = useState(0);
  return (
    <div className="w-full space-y-2">
      <p className="text-sm text-gray-400">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            className={`w-9 h-9 rounded-lg font-bold transition-colors ${
              score === s
                ? "bg-yellow-400 text-gray-900"
                : "bg-gray-700 hover:bg-gray-600 text-white"
            }`}
            onClick={() => setScore(s)}
          >
            {s}
          </button>
        ))}
        <button
          className="btn-primary px-3"
          disabled={score === 0}
          onClick={() => onSubmit(score)}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
