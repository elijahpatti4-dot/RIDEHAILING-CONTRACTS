import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWatchContractEvent,
} from "wagmi";
import { parseUnits } from "viem";
import {
  ADDRESSES,
  RIDE_HAILING_ABI,
  ERC20_ABI,
  formatUSDC,
  RIDE_STATE_LABELS,
} from "../config/contracts";
import StatusBadge from "../components/StatusBadge";

const RIDE_STATE = { REQUESTED: 0n, ACCEPTED: 1n, IN_PROGRESS: 2n, COMPLETED: 3n, DISPUTED: 4n, CANCELLED: 5n };
const PM        = { USDC: 0n, CASH: 1n, MPESA: 2n };
const SCAN_SIZE = 50; // how many recent rides to show

function paymentLabel(pm) {
  if (pm === 1n) return "💵 Cash";
  if (pm === 2n) return "📱 M-Pesa";
  return "💳 USDC";
}

export default function DriverDashboard() {
  const { address, isConnected } = useAccount();

  const [counterFares, setCounterFares] = useState({});  // rideId -> string
  const [mpesaCodes,   setMpesaCodes]   = useState({});  // rideId -> string
  const [newRideIds,   setNewRideIds]   = useState([]);  // live event feed

  const { writeContract } = useWriteContract();

  // 1. Total ride count
  const { data: rideCount } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "rideCount",
  });

  // 2. USDC allowance (for driver bond on acceptOffer)
  const { data: allowance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address, ADDRESSES.RIDE_HAILING],
    query: { enabled: isConnected },
  });

  // 3. Driver reputation (to show verified status)
  const { data: rep } = useReadContract({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "reputations",
    args: [address],
    query: { enabled: isConnected },
  });

  // 4. Batch read the last SCAN_SIZE rides
  const count = rideCount ? Number(rideCount) : 0;
  const startId = Math.max(1, count - SCAN_SIZE + 1);
  const rideIds = count > 0 ? Array.from({ length: count - startId + 1 }, (_, i) => BigInt(startId + i)) : [];

  const contracts = rideIds.map((id) => ({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    functionName: "rides",
    args: [id],
  }));

  const { data: ridesRaw, refetch } = useReadContracts({
    contracts,
    query: { enabled: rideIds.length > 0 },
  });

  // 5. Live event listener — prepend new ride IDs
  useWatchContractEvent({
    address: ADDRESSES.RIDE_HAILING,
    abi: RIDE_HAILING_ABI,
    eventName: "RideRequested",
    onLogs: (logs) => {
      const ids = logs.map((l) => l.args.rideId);
      setNewRideIds((prev) => [...ids, ...prev].slice(0, 20));
      setTimeout(() => refetch(), 2000);
    },
  });

  const rides = (ridesRaw ?? [])
    .map((r, i) => (r.status === "success" ? { id: rideIds[i], ...r.result } : null))
    .filter(Boolean);

  const openRides = rides.filter(
    (r) => r.state === RIDE_STATE.REQUESTED && r.rider?.toLowerCase() !== address?.toLowerCase()
  );

  const myRides = rides.filter(
    (r) => r.driver?.toLowerCase() === address?.toLowerCase()
  );

  function send(functionName, args) {
    writeContract(
      { address: ADDRESSES.RIDE_HAILING, abi: RIDE_HAILING_ABI, functionName, args },
      { onSuccess: () => setTimeout(() => refetch(), 3000) }
    );
  }

  function approve(amount) {
    writeContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.RIDE_HAILING, amount * 2n],
    });
  }

  if (!isConnected) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400 text-lg">Connect your wallet to access the driver dashboard.</p>
      </div>
    );
  }

  const isVerified = rep?.isVerifiedDriver ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Driver Dashboard</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${isVerified ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
          {isVerified ? "✓ Verified Driver" : "⚠ Not Verified"}
        </span>
      </div>

      {!isVerified && (
        <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
          You must be verified by the protocol admin before you can accept or counter rides.
          Contact the RideChain operator to get verified.
        </p>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Rides on Network" value={count} />
        <StatCard label="Open Requests" value={openRides.length} />
        <StatCard label="My Active Rides" value={myRides.filter(r => r.state < 3n).length} />
      </div>

      {/* ── Open ride requests ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Open Ride Requests</h2>
        {openRides.length === 0 ? (
          <p className="text-gray-500 text-sm card py-6 text-center">No open rides right now. New requests appear automatically.</p>
        ) : (
          openRides.map((r) => (
            <OpenRideCard
              key={r.id}
              ride={r}
              address={address}
              allowance={allowance}
              counterFare={counterFares[r.id] ?? ""}
              onCounterChange={(v) => setCounterFares((p) => ({ ...p, [r.id]: v }))}
              onCounter={() => {
                const fare = parseUnits(counterFares[r.id] || "0", 6);
                send("counterOffer", [r.id, fare]);
              }}
              onAccept={() => {
                const bond = (r.currentOffer * 10n) / 100n;
                if ((allowance ?? 0n) < bond) {
                  approve(bond);
                } else {
                  send("acceptOffer", [r.id]);
                }
              }}
              onApprove={() => approve((r.currentOffer * 10n) / 100n)}
            />
          ))
        )}
      </section>

      {/* ── My rides ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">My Rides</h2>
        {myRides.length === 0 ? (
          <p className="text-gray-500 text-sm card py-6 text-center">No rides assigned to you yet.</p>
        ) : (
          myRides.map((r) => (
            <MyRideCard
              key={r.id}
              ride={r}
              address={address}
              mpesaCode={mpesaCodes[r.id] ?? ""}
              onMpesaChange={(v) => setMpesaCodes((p) => ({ ...p, [r.id]: v }))}
              onConfirmCash={() => send("confirmCashReceived", [r.id])}
              onConfirmMpesa={() => send("confirmMpesaReceived", [r.id, mpesaCodes[r.id]])}
              onTimeout={() => send("claimTimeout", [r.id])}
              onAcceptAmendment={() => send("acceptAmendment", [r.id])}
              onRejectAmendment={() => send("rejectAmendment", [r.id])}
              onSubmitRouteLog={() => {
                // Hash of empty string as placeholder — in production use real GPS hash
                send("submitRouteLog", [r.id, "0x" + "0".repeat(64)]);
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="card text-center py-4">
      <div className="text-2xl font-bold text-brand-400">{value ?? "…"}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function OpenRideCard({ ride, address, allowance, counterFare, onCounterChange, onCounter, onAccept, onApprove }) {
  const offerFromRider = ride.offerFrom?.toLowerCase() === ride.rider?.toLowerCase();
  const myOffer = ride.offerFrom?.toLowerCase() === address?.toLowerCase();
  const bond = (ride.currentOffer * 10n) / 100n;
  const hasAllowance = (allowance ?? 0n) >= bond;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-gray-400">Ride #{ride.id.toString()}</span>
        <StatusBadge state={ride.state} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Row label="Rider"        value={`${ride.rider?.slice(0,6)}...${ride.rider?.slice(-4)}`} />
        <Row label="Payment"      value={paymentLabel(ride.paymentMethod)} />
        <Row label="Opening offer" value={formatUSDC(ride.currentOffer)} />
        <Row label="Band"         value={`${formatUSDC(ride.bandMin)} – ${formatUSDC(ride.bandMax)}`} />
        <Row label="Rec. fare"    value={formatUSDC(ride.recommendedFare)} />
        <Row label="Rounds left"  value={String(3n - (ride.negotiationRoundsUsed ?? 0n))} />
      </div>

      {myOffer ? (
        <p className="text-xs text-blue-400 bg-blue-400/10 rounded px-2 py-1">Your offer is pending — waiting for rider response.</p>
      ) : offerFromRider ? (
        <div className="flex gap-2 pt-1">
          {!hasAllowance ? (
            <button className="btn-secondary flex-1 text-sm" onClick={onApprove}>
              Approve USDC Bond First
            </button>
          ) : (
            <button className="btn-primary flex-1 text-sm" onClick={onAccept}>
              Accept at {formatUSDC(ride.currentOffer)}
            </button>
          )}
        </div>
      ) : null}

      <div className="flex gap-2 pt-1 border-t border-gray-800">
        <input
          className="input text-sm flex-1"
          type="number"
          placeholder={`Counter fare (${formatUSDC(ride.bandMin)}–${formatUSDC(ride.bandMax)})`}
          value={counterFare}
          onChange={(e) => onCounterChange(e.target.value)}
        />
        <button
          className="btn-secondary text-sm shrink-0"
          disabled={!counterFare}
          onClick={onCounter}
        >
          Counter
        </button>
      </div>
    </div>
  );
}

function MyRideCard({ ride, address, mpesaCode, onMpesaChange, onConfirmCash, onConfirmMpesa, onTimeout, onAcceptAmendment, onRejectAmendment, onSubmitRouteLog }) {
  const pm = ride.paymentMethod;
  const isPending = ride.settlementPending;
  const hasAmendment = ride.amendmentPending;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-gray-400">Ride #{ride.id.toString()}</span>
        <StatusBadge state={ride.state} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Row label="Rider"   value={`${ride.rider?.slice(0,6)}...${ride.rider?.slice(-4)}`} />
        <Row label="Payment" value={paymentLabel(pm)} />
        <Row label="Agreed fare" value={formatUSDC(ride.agreedFare)} />
        <Row label="Bond"    value={formatUSDC(ride.driverBond)} />
        {ride.state === 3n && ride.mpesaCode && (
          <Row label="M-Pesa code" value={ride.mpesaCode} />
        )}
      </div>

      {/* Amendment pending */}
      {hasAmendment && (
        <div className="bg-yellow-400/10 rounded-lg px-3 py-2 space-y-2">
          <p className="text-xs text-yellow-400 font-medium">Rider proposed a route amendment</p>
          <p className="text-xs text-gray-400">New fare: {formatUSDC(ride.newFareProposed)}</p>
          <div className="flex gap-2">
            <button className="btn-primary text-xs flex-1" onClick={onAcceptAmendment}>Accept</button>
            <button className="btn-danger  text-xs flex-1" onClick={onRejectAmendment}>Reject</button>
          </div>
        </div>
      )}

      {/* In-progress actions */}
      {ride.state === 2n && !hasAmendment && (
        <div className="flex gap-2 pt-1 border-t border-gray-800">
          <button className="btn-secondary text-xs" onClick={onSubmitRouteLog}>
            Submit Route Log
          </button>
          <button className="btn-secondary text-xs" onClick={onTimeout}>
            Claim Timeout
          </button>
        </div>
      )}

      {/* Settlement actions */}
      {isPending && pm === 1n && (
        <button className="btn-primary w-full text-sm" onClick={onConfirmCash}>
          💵 Confirm Cash Received (pays 5% fee)
        </button>
      )}

      {isPending && pm === 2n && (
        <div className="space-y-2 pt-1 border-t border-gray-800">
          <label className="label text-xs">M-Pesa Transaction Code</label>
          <input
            className="input text-sm"
            placeholder="e.g. RBC1A2B3C4D"
            value={mpesaCode}
            onChange={(e) => onMpesaChange(e.target.value.toUpperCase())}
          />
          <button
            className="btn-primary w-full text-sm"
            disabled={!mpesaCode}
            onClick={onConfirmMpesa}
          >
            📱 Confirm M-Pesa Received (pays 5% fee)
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <>
      <span className="text-gray-400">{label}</span>
      <span className="text-white text-right truncate">{value}</span>
    </>
  );
}
