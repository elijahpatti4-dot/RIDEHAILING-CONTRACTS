import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import {
  ADDRESSES,
  LICENCE_ABI,
  ERC20_ABI,
  formatUSDC,
  CITY_TIERS,
} from "../config/contracts";

export default function LicenceRegistry() {
  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();

  // ── City registration ─────────────────────────────────────────────────────
  const [cityName, setCityName]         = useState("");
  const [cityContract, setCityContract] = useState("");
  const [cityTier, setCityTier]         = useState(0);

  // ── Regional registration ─────────────────────────────────────────────────
  const [regionName, setRegionName]         = useState("");
  const [countriesInput, setCountriesInput] = useState("");

  // ── Volume reporting ──────────────────────────────────────────────────────
  const [volCity, setVolCity]     = useState("");
  const [volAmount, setVolAmount] = useState("");

  // ── Lookup ────────────────────────────────────────────────────────────────
  const [lookupCity, setLookupCity]   = useState("");
  const [searchCity, setSearchCity]   = useState(null);

  // Reads
  const { data: registeredCities } = useReadContract({
    address: ADDRESSES.LICENCE,
    abi: LICENCE_ABI,
    functionName: "getRegisteredCities",
    args: [],
  });

  const { data: registeredRegions } = useReadContract({
    address: ADDRESSES.LICENCE,
    abi: LICENCE_ABI,
    functionName: "getRegisteredRegions",
    args: [],
  });

  const { data: cityData } = useReadContract({
    address: ADDRESSES.LICENCE,
    abi: LICENCE_ABI,
    functionName: "getCityLicence",
    args: [searchCity ?? ""],
    query: { enabled: !!searchCity },
  });

  const { data: myCity } = useReadContract({
    address: ADDRESSES.LICENCE,
    abi: LICENCE_ABI,
    functionName: "operatorCity",
    args: [address],
    query: { enabled: isConnected },
  });

  const { data: usdcBalance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: isConnected },
  });

  const selectedTier = CITY_TIERS[cityTier];
  const cityFeeRaw = parseUnits(selectedTier.fee.replace(",", ""), 6);
  const regionalFeeRaw = parseUnits("200000", 6);

  function approveCity() {
    writeContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.LICENCE, cityFeeRaw],
    });
  }

  function registerCity() {
    writeContract({
      address: ADDRESSES.LICENCE,
      abi: LICENCE_ABI,
      functionName: "registerCityLicence",
      args: [cityName, cityContract, cityTier],
    });
  }

  function approveRegion() {
    writeContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.LICENCE, regionalFeeRaw],
    });
  }

  function registerRegion() {
    const countries = countriesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    writeContract({
      address: ADDRESSES.LICENCE,
      abi: LICENCE_ABI,
      functionName: "registerRegionalLicence",
      args: [regionName, countries],
    });
  }

  function reportVolume() {
    const usdcVol = parseUnits(volAmount, 6);
    writeContract({
      address: ADDRESSES.LICENCE,
      abi: LICENCE_ABI,
      functionName: "reportCityVolume",
      args: [volCity, usdcVol],
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Licence Registry</h1>

      {isConnected && myCity && (
        <div className="card bg-brand-500/10 border-brand-500/30">
          <p className="text-sm text-brand-300">
            Your registered city: <span className="font-semibold text-white">{myCity}</span>
          </p>
        </div>
      )}

      {/* ── Registered cities ────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Registered Cities ({registeredCities?.length ?? "…"})</h2>
        {registeredCities?.length ? (
          <div className="flex flex-wrap gap-2">
            {registeredCities.map((c) => (
              <span
                key={c}
                className="px-3 py-1 rounded-full bg-gray-800 text-sm text-gray-200 cursor-pointer hover:bg-gray-700"
                onClick={() => setSearchCity(c)}
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No cities registered yet.</p>
        )}
        {registeredRegions?.length > 0 && (
          <>
            <h2 className="font-semibold pt-2">Regional Masters ({registeredRegions.length})</h2>
            <div className="flex flex-wrap gap-2">
              {registeredRegions.map((r) => (
                <span key={r} className="px-3 py-1 rounded-full bg-purple-500/20 text-sm text-purple-300">
                  {r}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── City lookup ──────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Look Up a City Licence</h2>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="City name"
            value={lookupCity}
            onChange={(e) => setLookupCity(e.target.value)}
          />
          <button
            className="btn-secondary shrink-0"
            onClick={() => setSearchCity(lookupCity)}
          >
            Search
          </button>
        </div>
        {cityData && searchCity && (
          <div className="space-y-2 text-sm">
            <Row label="Operator"    value={cityData.operator} mono />
            <Row label="Tier"        value={CITY_TIERS[Number(cityData.tierType)]?.label} />
            <Row label="Active"      value={cityData.active ? "✅ Yes" : "❌ No"} />
            <Row label="Volume Reported" value={formatUSDC(cityData.totalVolumeReported)} />
            <Row
              label="Exclusivity Expires"
              value={
                cityData.exclusivityExpiry
                  ? new Date(Number(cityData.exclusivityExpiry) * 1000).toLocaleDateString()
                  : "—"
              }
            />
            {cityData.regionalMaster !== "0x0000000000000000000000000000000000000000" && (
              <Row label="Regional Master" value={cityData.regionalMaster} mono />
            )}
          </div>
        )}
      </div>

      {/* ── Register city ────────────────────────────────────────────────── */}
      {isConnected && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Register City Operator Licence</h2>
          <p className="text-xs text-gray-400">
            USDC balance: <span className="text-white">{formatUSDC(usdcBalance)}</span>
          </p>
          <div>
            <label className="label">City name</label>
            <input
              className="input"
              placeholder="e.g. Nairobi"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Deployed RideHailing contract address</label>
            <input
              className="input font-mono text-xs"
              placeholder="0x..."
              value={cityContract}
              onChange={(e) => setCityContract(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Licence tier</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {CITY_TIERS.map((t) => (
                <button
                  key={t.value}
                  className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                    cityTier === t.value
                      ? "border-brand-500 bg-brand-500/20 text-brand-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                  onClick={() => setCityTier(t.value)}
                >
                  {t.label}
                  <span className="block text-xs mt-0.5 text-gray-400">${t.fee}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={approveCity}>
              1. Approve ${selectedTier.fee} USDC
            </button>
            <button
              className="btn-primary flex-1"
              disabled={!cityName || !cityContract}
              onClick={registerCity}
            >
              2. Register
            </button>
          </div>
        </div>
      )}

      {/* ── Register region ──────────────────────────────────────────────── */}
      {isConnected && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Register Regional Master Licence — $200,000</h2>
          <div>
            <label className="label">Region name</label>
            <input
              className="input"
              placeholder="e.g. East Africa"
              value={regionName}
              onChange={(e) => setRegionName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Countries covered (comma-separated)</label>
            <input
              className="input"
              placeholder="Kenya, Uganda, Tanzania"
              value={countriesInput}
              onChange={(e) => setCountriesInput(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={approveRegion}>
              1. Approve $200,000 USDC
            </button>
            <button
              className="btn-primary flex-1"
              disabled={!regionName || !countriesInput}
              onClick={registerRegion}
            >
              2. Register Region
            </button>
          </div>
        </div>
      )}

      {/* ── Report volume ────────────────────────────────────────────────── */}
      {isConnected && myCity && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Report Ride Volume (1% fee to founder)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">City name</label>
              <input
                className="input"
                value={volCity}
                onChange={(e) => setVolCity(e.target.value)}
                placeholder="Nairobi"
              />
            </div>
            <div>
              <label className="label">Volume (USDC)</label>
              <input
                className="input"
                type="number"
                value={volAmount}
                onChange={(e) => setVolAmount(e.target.value)}
                placeholder="10000"
              />
            </div>
          </div>
          <button
            className="btn-primary w-full"
            disabled={!volCity || !volAmount}
            onClick={reportVolume}
          >
            Report Volume
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="card text-center py-10 text-gray-400">
          Connect your wallet to register or manage licences.
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-xs text-gray-300" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
