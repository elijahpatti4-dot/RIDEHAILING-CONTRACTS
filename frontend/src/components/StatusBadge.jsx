import { RIDE_STATE_LABELS } from "../config/contracts";

const colours = [
  "bg-yellow-500/20 text-yellow-300",  // 0 REQUESTED
  "bg-blue-500/20   text-blue-300",    // 1 ACCEPTED
  "bg-brand-500/20  text-brand-300",   // 2 IN_PROGRESS
  "bg-green-500/20  text-green-300",   // 3 COMPLETED
  "bg-red-500/20    text-red-300",     // 4 DISPUTED
  "bg-gray-500/20   text-gray-400",    // 5 CANCELLED
];

export default function StatusBadge({ state }) {
  const idx = Number(state ?? 0);
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${colours[idx]}`}>
      {RIDE_STATE_LABELS[idx] ?? "Unknown"}
    </span>
  );
}
