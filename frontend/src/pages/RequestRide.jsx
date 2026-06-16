import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, keccak256, toHex } from "viem";
import {
  ADDRESSES,
  RIDE_HAILING_ABI,
  ERC20_ABI,
  formatUSDC,
  RIDE_STATE_LABELS,
} from "../config/contracts";
import StatusBadge from "../components/StatusBadge";

// Helper: keccak256 a plain string via viem
function hashLocation(str) {
  return keccak256(toHex(str));
}

// USDC has 6 decimals
const USDC = (n) => parseUnits(String(n), 6);

export default function RequestRide() {
  const { address, isConnected } = useAccount();

  // Form state
  const [pickup, setPickup]   = useState("");
  const [dropoff, setDropoff] = useState("");
  const [fare, setFare]       = useState("");
  const [isCash, setIsCash]   = useState(false);
  const [duration, setDuration] = useState("1200"); // 20 min default

  // Lookup state
  const [lookupId, setLookupId] = useState("");
  const [rideId, setRideId]     = useState(null);

  // Write hooks
  const { writeContract: approve,    data: approveTxHash } = useWriteContract();
  const { writeContract: requestRide, data: requestTxHash } = useWriteContract();
  const { writeContract: startRide,   data: startTxHash   } = useWriteContract();
  const { writeContract: completeRide } = useWriteContract();
  const { writeContract: confirmCash  } = useWriteContract();
  const { writeContract: cancelRide   } = useWriteContract();

  // Wait for approval tx to confirm before allowing request
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Current ride state read
  const { data: ride, refetch: refetchRide } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "getRide",
    args: [rideId ?? 0n],
    query: { enabled: !!rideId },
  });

  // USDC allowance check
  const { data: allowance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address, ADDRESSES.RIDE_HAILING],
    query: { enabled: isConnected },
  });

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: isConnected },
  });

  const fareRaw = fare ? USDC(fare) : 0n;
  const needsApproval = !isCash && allowance !== undefined && allowance < fareRaw;

  function handleApprove() {
    approve({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.RIDE_HAILING, fareRaw * 2n], // approve 2× for amendments
    });
  }

  function handleRequest() {
    const pickupHash  = hashLocation(pickup);
    const dropoffHash = hashLocation(dropoff);
    requestRide(
      {
        address: ADDRESSES.RIDE_HAILING,
        abi: RIDE_HAILING_ABI,
        functionName: "requestRide",
        args: [pickupHash, dropoffHash, fareRaw, BigInt(duration), fareRaw, isCash],
      },
      {
        onSuccess: () => refetchRide(),
      }
    );
  }

  function handleLookup() {
    const id = BigInt(lookupId || "0");
    setRideId(id);
  }

  const canRequest = isConnected && pickup && dropoff && fare && (isCash || !needsApproval);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Request a Ride</h1>

      {/* ── USDC balance ─────────────────────────────────────────────────── */}
      {isConnected && (
        <p className="text-sm text-gray-400">
          USDC balance: <span className="text-white font-medium">{formatUSDC(usdcBalance)}</span>
        </p>
      )}

      {/* ── Request form ─────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg">New Ride</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Pickup location</label>
            <input
              className="input"
              placeholder="e.g. Nairobi CBD, KICC"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Dropoff location</label>
            <input
              className="input"
              placeholder="e.g. Westlands, Sarit Centre"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fare (USDC)</label>
            <input
              className="input"
              type="number"
              placeholder="e.g. 12"
              min="0"
              step="0.01"
              value={fare}
              onChange={(e) => setFare(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Expected duration (seconds)</label>
            <input
              className="input"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        {/* Cash ride toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setIsCash((v) => !v)}
            className={`w-11 h-6 rounded-full relative transition-colors ${
              isCash ? "bg-brand-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                isCash ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
          <span className="text-sm font-medium">
            {isCash ? "Cash ride — driver collects fare in cash" : "Digital ride — USDC escrow"}
          </span>
        </label>

        {isCash && (
          <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
            Cash ride: no USDC deposit from you. After completion, the driver pays the 5%
            platform fee from their USDC wallet when they call "Confirm Cash Received".
          </p>
        )}

        {/* Approve step for digital rides */}
        {!isCash && needsApproval && (
          <button className="btn-secondary w-full" onClick={handleApprove}>
            Step 1: Approve USDC spending
          </button>
        )}

        <button
          className="btn-primary w-full"
          disabled={!canRequest}
          onClick={handleRequest}
        >
          {!isConnected
            ? "Connect wallet first"
            : isCash || !needsApproval
            ? "Request Ride"
            : "Approve USDC first"}
        </button>

        {requestTxHash && (
          <p className="text-xs text-gray-400 break-all">
            Tx: {requestTxHash}
          </p>
        )}
      </div>

      {/* ── Ride lookup ──────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg">Track / Manage a Ride</h2>
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            placeholder="Ride ID"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          <button className="btn-secondary shrink-0" onClick={handleLookup}>
            Load
          </button>
        </div>

        {ride && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">State</span>
              <StatusBadge state={ride.state} />
            </div>
            <Row label="Rider"       value={ride.rider} mono />
            <Row label="Driver"      value={ride.driver || "—"} mono />
            <Row label="Agreed Fare" value={formatUSDC(ride.agreedFare)} />
            <Row label="Type"        value={ride.isCashRide ? "💵 Cash" : "💳 Digital"} />
            {ride.cashSettlementPending && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded px-3 py-2">
                Awaiting driver to confirm cash received.
              </p>
            )}

            {/* Rider actions */}
            {isConnected && address?.toLowerCase() === ride.rider?.toLowerCase() && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                {ride.state === 1 /* ACCEPTED */ && (
                  <button
                    className="btn-primary"
                    onClick={() =>
                      startRide({
                        address: ADDRESSES.RIDE_HAILING,
                        abi: RIDE_HAILING_ABI,
                        functionName: "startRide",
                        args: [rideId],
                      })
                    }
                  >
                    Start Ride
                  </button>
                )}
                {ride.state === 2 /* IN_PROGRESS */ && (
                  <button
                    className="btn-primary"
                    onClick={() =>
                      completeRide({
                        address: ADDRESSES.RIDE_HAILING,
                        abi: RIDE_HAILING_ABI,
                        functionName: "completeRide",
                        args: [rideId],
                      })
                    }
                  >
                    Complete Ride
                  </button>
                )}
                {ride.state === 0 /* REQUESTED */ && (
                  <button
                    className="btn-danger"
                    onClick={() =>
                      cancelRide({
                        address: ADDRESSES.RIDE_HAILING,
                        abi: RIDE_HAILING_ABI,
                        functionName: "cancelNegotiation",
                        args: [rideId],
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* Driver: confirm cash */}
            {isConnected &&
              address?.toLowerCase() === ride.driver?.toLowerCase() &&
              ride.isCashRide &&
              ride.cashSettlementPending && (
                <button
                  className="btn-primary w-full"
                  onClick={() =>
                    confirmCash({
                      address: ADDRESSES.RIDE_HAILING,
                      abi: RIDE_HAILING_ABI,
                      functionName: "confirmCashReceived",
                      args: [rideId],
                    })
                  }
                >
                  Confirm Cash Received (pays 5% fee)
                </button>
              )}
          </div>
        )}
      </div>
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
