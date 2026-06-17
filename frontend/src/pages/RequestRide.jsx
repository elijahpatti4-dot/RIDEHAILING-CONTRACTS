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

// PaymentMethod enum (must match RideHailing.sol)
const PM = { USDC: 0, CASH: 1, MPESA: 2 };

const PAYMENT_OPTIONS = [
  {
    value: PM.USDC,
    label: "USDC",
    icon: "💳",
    description: "Pay via USDC escrow — secure on-chain settlement",
  },
  {
    value: PM.CASH,
    label: "Cash",
    icon: "💵",
    description: "Pay driver in cash — no USDC deposit from rider",
  },
  {
    value: PM.MPESA,
    label: "M-Pesa",
    icon: "📱",
    description: "Pay via M-Pesa — driver confirms receipt with transaction code",
  },
];

function paymentLabel(pm) {
  if (pm === 1n) return "💵 Cash";
  if (pm === 2n) return "📱 M-Pesa";
  return "💳 USDC";
}

export default function RequestRide() {
  const { address, isConnected } = useAccount();

  // Form state
  const [pickup, setPickup]         = useState("");
  const [dropoff, setDropoff]       = useState("");
  const [fare, setFare]             = useState("");
  const [paymentMethod, setPayment] = useState(PM.USDC);
  const [duration, setDuration]     = useState("1200"); // 20 min default

  // Lookup + M-Pesa confirmation
  const [lookupId, setLookupId]   = useState("");
  const [rideId, setRideId]       = useState(null);
  const [mpesaCode, setMpesaCode] = useState("");

  // Write hooks
  const { writeContract: approve,     data: approveTxHash } = useWriteContract();
  const { writeContract: requestRide, data: requestTxHash } = useWriteContract();
  const { writeContract: startRide  } = useWriteContract();
  const { writeContract: completeRide } = useWriteContract();
  const { writeContract: confirmCash  } = useWriteContract();
  const { writeContract: confirmMpesa } = useWriteContract();
  const { writeContract: cancelRide   } = useWriteContract();

  // Wait for approval tx
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Current ride state
  const { data: ride, refetch: refetchRide } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "getRide",
    args: [rideId ?? 0n],
    query: { enabled: !!rideId },
  });

  // USDC allowance
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
  const isOffChain   = paymentMethod === PM.CASH || paymentMethod === PM.MPESA;
  const needsApproval = !isOffChain && allowance !== undefined && allowance < fareRaw;

  function handleApprove() {
    approve({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.RIDE_HAILING, fareRaw * 2n], // 2× headroom for amendments
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
        // 6th arg is PaymentMethod enum: 0=USDC, 1=CASH, 2=MPESA
        args: [pickupHash, dropoffHash, fareRaw, BigInt(duration), fareRaw, paymentMethod],
      },
      { onSuccess: () => refetchRide() }
    );
  }

  function handleLookup() {
    setRideId(BigInt(lookupId || "0"));
  }

  const canRequest = isConnected && pickup && dropoff && fare && (isOffChain || !needsApproval);
  const isRider  = isConnected && address?.toLowerCase() === ride?.rider?.toLowerCase();
  const isDriver = isConnected && address?.toLowerCase() === ride?.driver?.toLowerCase();
  const settlementPending = ride?.settlementPending;
  const ridePayment = ride?.paymentMethod; // 0n | 1n | 2n

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Request a Ride</h1>

      {/* ── USDC balance ─────────────────────────────────────────────────── */}
      {isConnected && (
        <p className="text-sm text-gray-400">
          USDC balance:{" "}
          <span className="text-white font-medium">{formatUSDC(usdcBalance)}</span>
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

        {/* ── Payment method selector ───────────────────────────────────── */}
        <div>
          <label className="label mb-2">Payment method</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPayment(opt.value)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  paymentMethod === opt.value
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
                }`}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-tight">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Payment method info banners */}
        {paymentMethod === PM.CASH && (
          <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
            Cash ride: no USDC deposit from you. After arrival, pay the driver in cash.
            The driver then confirms receipt on-chain and pays the 5% platform fee from their USDC wallet.
          </p>
        )}
        {paymentMethod === PM.MPESA && (
          <p className="text-xs text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
            M-Pesa ride: no USDC deposit from you. After arrival, send payment to the driver via
            M-Pesa. The driver confirms with their M-Pesa transaction code — stored on-chain for
            auditability — and pays the 5% platform fee from their USDC wallet.
          </p>
        )}

        {/* USDC approve step */}
        {paymentMethod === PM.USDC && needsApproval && (
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
            : paymentMethod === PM.USDC && needsApproval
            ? "Approve USDC first"
            : "Request Ride"}
        </button>

        {requestTxHash && (
          <p className="text-xs text-gray-400 break-all">Tx: {requestTxHash}</p>
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
            <Row label="Payment"     value={paymentLabel(ridePayment)} />

            {/* M-Pesa code (shown after confirmation) */}
            {ridePayment === 2n && ride.mpesaCode && (
              <Row label="M-Pesa Code" value={ride.mpesaCode} mono />
            )}

            {/* Settlement pending banners */}
            {settlementPending && ridePayment === 1n && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded px-3 py-2">
                Awaiting driver to confirm cash received.
              </p>
            )}
            {settlementPending && ridePayment === 2n && (
              <p className="text-xs text-green-400 bg-green-400/10 rounded px-3 py-2">
                Awaiting driver to confirm M-Pesa received with transaction code.
              </p>
            )}

            {/* ── Rider actions ─────────────────────────────────────────── */}
            {isRider && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                {ride.state === 1n /* ACCEPTED */ && (
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
                {ride.state === 2n /* IN_PROGRESS */ && (
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
                {ride.state === 0n /* REQUESTED */ && (
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

            {/* ── Driver: confirm cash ──────────────────────────────────── */}
            {isDriver && ridePayment === 1n && settlementPending && (
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
                Confirm Cash Received (pays 5% platform fee)
              </button>
            )}

            {/* ── Driver: confirm M-Pesa ────────────────────────────────── */}
            {isDriver && ridePayment === 2n && settlementPending && (
              <div className="space-y-2 pt-2 border-t border-gray-800">
                <label className="label">M-Pesa Transaction Code</label>
                <input
                  className="input"
                  placeholder="e.g. RBC1A2B3C4D"
                  value={mpesaCode}
                  onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                />
                <button
                  className="btn-primary w-full"
                  disabled={!mpesaCode}
                  onClick={() =>
                    confirmMpesa({
                      address: ADDRESSES.RIDE_HAILING,
                      abi: RIDE_HAILING_ABI,
                      functionName: "confirmMpesaReceived",
                      args: [rideId, mpesaCode],
                    })
                  }
                >
                  📱 Confirm M-Pesa Received (pays 5% platform fee)
                </button>
                <p className="text-xs text-gray-500">
                  The transaction code is stored on-chain as proof of payment.
                </p>
              </div>
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
