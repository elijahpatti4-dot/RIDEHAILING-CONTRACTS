import { useAccount, useReadContract, useWriteContract } from "wagmi";
import {
  ADDRESSES,
  TOKEN_ABI,
  GOVERNOR_ABI,
  formatRCT,
} from "../config/contracts";

const PROPOSAL_STATE_LABELS = [
  "Pending",
  "Active",
  "Cancelled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

const TOKEN_ALLOCATIONS = [
  { label: "Founder Vesting", pct: 30, colour: "bg-brand-500" },
  { label: "Driver Pool",     pct: 30, colour: "bg-green-500" },
  { label: "Rider Pool",      pct: 25, colour: "bg-yellow-500" },
  { label: "Treasury",        pct: 15, colour: "bg-purple-500" },
];

export default function TokenGovernance() {
  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();

  // Token stats
  const { data: totalSupply }     = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "totalSupply",          args: [] });
  const { data: rctBalance }      = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "balanceOf",             args: [address], query: { enabled: isConnected } });
  const { data: votingPower }     = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "getVotingPower",        args: [address], query: { enabled: isConnected } });
  const { data: driverRemaining } = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "driverPoolRemaining",   args: [] });
  const { data: riderRemaining }  = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "riderPoolRemaining",    args: [] });
  const { data: treasuryLeft }    = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "treasuryRemaining",     args: [] });
  const { data: walletCap }       = useReadContract({ address: ADDRESSES.TOKEN, abi: TOKEN_ABI, functionName: "WALLET_CAP",            args: [] });

  // Governor stats
  const { data: vetoActive }      = useReadContract({ address: ADDRESSES.GOVERNOR, abi: GOVERNOR_ABI, functionName: "isFoundingVetoActive",   args: [] });
  const { data: monthsStreak }    = useReadContract({ address: ADDRESSES.GOVERNOR, abi: GOVERNOR_ABI, functionName: "consecutiveMonthsMet",  args: [] });
  const { data: council }         = useReadContract({ address: ADDRESSES.GOVERNOR, abi: GOVERNOR_ABI, functionName: "council",                args: [] });
  const { data: foundingWallet }  = useReadContract({ address: ADDRESSES.GOVERNOR, abi: GOVERNOR_ABI, functionName: "foundingWallet",         args: [] });
  const { data: deployedAt }      = useReadContract({ address: ADDRESSES.GOVERNOR, abi: GOVERNOR_ABI, functionName: "deployedAt",             args: [] });

  const vetoExpiry = deployedAt
    ? new Date((Number(deployedAt) + 5 * 365 * 24 * 3600) * 1000)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Token & Governance</h1>

      {/* ── Token allocation bar ─────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">RCT Supply Allocation (100M total)</h2>
        <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
          {TOKEN_ALLOCATIONS.map((a) => (
            <div
              key={a.label}
              className={`${a.colour} transition-all`}
              style={{ width: `${a.pct}%` }}
              title={`${a.label}: ${a.pct}%`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {TOKEN_ALLOCATIONS.map((a) => (
            <div key={a.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-sm ${a.colour} shrink-0`} />
              <span className="text-gray-400">
                {a.label} <span className="text-white font-medium">{a.pct}%</span>
              </span>
            </div>
          ))}
        </div>
        <Row label="Total Supply" value={formatRCT(totalSupply)} />
        <Row label="Wallet Cap"   value={formatRCT(walletCap)} />
      </div>

      {/* ── Pool status ──────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Pool Balances</h2>
        <Row label="Driver Pool Remaining"   value={formatRCT(driverRemaining)} />
        <Row label="Rider Pool Remaining"    value={formatRCT(riderRemaining)} />
        <Row label="Treasury Remaining"      value={formatRCT(treasuryLeft)} />
      </div>

      {/* ── My RCT ───────────────────────────────────────────────────────── */}
      {isConnected && (
        <div className="card space-y-3">
          <h2 className="font-semibold">My RCT</h2>
          <Row label="Balance"       value={formatRCT(rctBalance)} />
          <Row
            label="Voting Power"
            value={
              votingPower !== undefined
                ? `${votingPower.toLocaleString()} (quadratic = √balance)`
                : "—"
            }
          />
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
            Self-delegate (activates governance voting)
          </button>
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={() =>
                writeContract({
                  address: ADDRESSES.TOKEN,
                  abi: TOKEN_ABI,
                  functionName: "claimDriverTokens",
                  args: [],
                })
              }
            >
              Claim Driver Tokens
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() =>
                writeContract({
                  address: ADDRESSES.TOKEN,
                  abi: TOKEN_ABI,
                  functionName: "claimRiderTokens",
                  args: [],
                })
              }
            >
              Claim Rider Tokens
            </button>
          </div>
        </div>
      )}

      {/* ── Governor stats ───────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Governance</h2>
        <Row label="Founding Wallet"         value={foundingWallet ?? "—"} mono />
        <Row
          label="Founding Veto Active"
          value={vetoActive === undefined ? "—" : vetoActive ? "✅ Yes" : "❌ Expired"}
        />
        {vetoExpiry && (
          <Row
            label="Veto Expires"
            value={vetoActive ? vetoExpiry.toLocaleDateString() : "Permanently expired"}
          />
        )}
        <Row
          label="Guardian Council"
          value={
            council
              ? council.isActive
                ? "✅ Active (4-of-5 veto)"
                : `Inactive — ${monthsStreak ?? 0}/3 qualifying months`
              : "—"
          }
        />
        <Row label="Timelock"  value="48 hours (all proposals)" />
        <Row label="Quorum"    value="20,000 quadratic votes" />
        <Row label="Voting"    value="Quadratic (power = √balance)" />

        {/* Activate guardian council */}
        {council && !council.isActive && Number(monthsStreak ?? 0) >= 3 && (
          <button
            className="btn-primary w-full"
            onClick={() =>
              writeContract({
                address: ADDRESSES.GOVERNOR,
                abi: GOVERNOR_ABI,
                functionName: "activateGuardianCouncil",
                args: [],
              })
            }
          >
            Activate Guardian Council (3-month income streak met)
          </button>
        )}
      </div>

      {/* ── Testnet helper ───────────────────────────────────────────────── */}
      <div className="card border-yellow-500/30 bg-yellow-500/5 space-y-2">
        <h2 className="font-semibold text-yellow-300">Testnet Helper</h2>
        <p className="text-xs text-gray-400">
          On Polygon Amoy you can mint test USDC via the MockUSDC contract.
          Switch to mainnet before using real USDC.
        </p>
        <p className="text-xs text-gray-500 font-mono break-all">
          MockUSDC: {ADDRESSES.USDC}
        </p>
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
