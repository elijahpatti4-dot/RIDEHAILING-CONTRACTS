// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  PricingOracle
 * @notice On-chain fare calculator for RideChain city deployments.
 *
 * Fare formula (USDC, 6 decimals):
 *
 *   raw = baseFare
 *         + ceil(distanceMeters / 1000) × baseFarePerKm
 *         + ceil(durationSeconds / 60) × baseFarePerMinute
 *
 *   recommended = raw × surgeMultiplierBps / 10_000
 *   (floored to baseFare)
 *
 * Example defaults (Nairobi, KES → USDC approximation):
 *   baseFare        = $0.50  (500_000)
 *   baseFarePerKm   = $0.40  (400_000)
 *   baseFarePerMinute = $0.10 (100_000)
 *
 *   10 km, 20 min, no surge → $0.50 + $4.00 + $2.00 = $6.50
 *
 * Surge:
 *   - Minimum 1.0× (10_000 BPS) — owner cannot set below 1.0×
 *   - Hard cap  3.0× (30_000 BPS) — protects riders
 *   - Set by owner or Chainlink Automation (performUpkeep)
 *
 * Chainlink Automation:
 *   - checkUpkeep returns true every UPDATE_INTERVAL
 *   - performUpkeep records the timestamp; owner sets surge separately
 *     (production: replace with Chainlink Data Streams / Functions call)
 *
 * Integration:
 *   RideHailing.setPricingOracle(address) wires this contract.
 *   RideHailing.getOracleFare(distanceMeters, durationSeconds) delegates here.
 *   The frontend calls getOracleFare to pre-fill the recommendedFare field.
 */
contract PricingOracle is Ownable {

    // ── Rate parameters (USDC, 6 decimals) ───────────────────────────────────

    uint256 public baseFare;           // Flat minimum fare
    uint256 public baseFarePerKm;      // Added per full kilometre
    uint256 public baseFarePerMinute;  // Added per full minute

    // ── Surge multiplier ──────────────────────────────────────────────────────

    /// @dev 10_000 = 1.0× (no surge), 15_000 = 1.5× surge.
    uint256 public surgeMultiplierBps = 10_000;
    uint256 public constant MIN_SURGE_BPS = 10_000; // 1.0× — cannot go below baseline
    uint256 public constant MAX_SURGE_BPS = 30_000; // 3.0× hard cap — protects riders

    // ── Chainlink Automation ──────────────────────────────────────────────────

    uint256 public lastUpdateTime;
    uint256 public constant UPDATE_INTERVAL = 1 hours;

    // ── Events ────────────────────────────────────────────────────────────────

    event RatesUpdated(
        uint256 baseFare,
        uint256 baseFarePerKm,
        uint256 baseFarePerMinute
    );
    event SurgeUpdated(uint256 surgeMultiplierBps);
    event OracleUpkeepPerformed(uint256 timestamp);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param _baseFare          Flat minimum fare (USDC, 6 decimals).
     * @param _baseFarePerKm     Per-kilometre rate (USDC, 6 decimals).
     * @param _baseFarePerMinute Per-minute rate    (USDC, 6 decimals).
     */
    constructor(
        uint256 _baseFare,
        uint256 _baseFarePerKm,
        uint256 _baseFarePerMinute
    ) Ownable() {
        require(_baseFare > 0,          "Base fare must be > 0");
        require(_baseFarePerKm > 0,     "Per-km rate must be > 0");
        require(_baseFarePerMinute > 0, "Per-minute rate must be > 0");
        baseFare          = _baseFare;
        baseFarePerKm     = _baseFarePerKm;
        baseFarePerMinute = _baseFarePerMinute;
        lastUpdateTime    = block.timestamp;
    }

    // ── Core view ─────────────────────────────────────────────────────────────

    /**
     * @notice Calculate the recommended USDC fare for a trip.
     *
     * @param distanceMeters   Trip distance in metres (e.g. 10_000 = 10 km).
     * @param durationSeconds  Expected trip duration in seconds (e.g. 1_200 = 20 min).
     * @return fare            Recommended USDC amount (6 decimals).
     */
    function getRecommendedFare(
        uint256 distanceMeters,
        uint256 durationSeconds
    ) external view returns (uint256 fare) {
        // Round distances / durations up to nearest whole unit
        uint256 distanceKm  = (distanceMeters  + 999) / 1_000; // ceil to km
        uint256 durationMin = (durationSeconds +  59) /    60;  // ceil to minute

        uint256 rawFare = baseFare
            + (distanceKm  * baseFarePerKm)
            + (durationMin * baseFarePerMinute);

        fare = (rawFare * surgeMultiplierBps) / 10_000;

        // Floor: never quote below the base fare
        if (fare < baseFare) fare = baseFare;
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    /**
     * @notice Update all three rate parameters in one transaction.
     *         Callable via DAO governance (Timelock → Governor).
     */
    function setRates(
        uint256 _baseFare,
        uint256 _baseFarePerKm,
        uint256 _baseFarePerMinute
    ) external onlyOwner {
        require(_baseFare > 0,          "Base fare must be > 0");
        require(_baseFarePerKm > 0,     "Per-km rate must be > 0");
        require(_baseFarePerMinute > 0, "Per-minute rate must be > 0");
        baseFare          = _baseFare;
        baseFarePerKm     = _baseFarePerKm;
        baseFarePerMinute = _baseFarePerMinute;
        emit RatesUpdated(_baseFare, _baseFarePerKm, _baseFarePerMinute);
    }

    /**
     * @notice Set the surge multiplier.
     *         10_000 = 1.0× (no surge), 15_000 = 1.5×, 30_000 = 3.0× (hard cap).
     */
    function setSurgeMultiplier(uint256 _surgeMultiplierBps) external onlyOwner {
        require(_surgeMultiplierBps >= MIN_SURGE_BPS, "Surge below 1.0x minimum");
        require(_surgeMultiplierBps <= MAX_SURGE_BPS, "Surge exceeds 3.0x hard cap");
        surgeMultiplierBps = _surgeMultiplierBps;
        emit SurgeUpdated(_surgeMultiplierBps);
    }

    // ── Chainlink Automation compatible interface ──────────────────────────────

    /**
     * @notice Chainlink Automation calls this off-chain to decide whether to
     *         trigger performUpkeep.  Returns true every UPDATE_INTERVAL.
     */
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory /* performData */)
    {
        upkeepNeeded = (block.timestamp - lastUpdateTime) >= UPDATE_INTERVAL;
    }

    /**
     * @notice Called by Chainlink Automation once checkUpkeep returns true.
     *
     *         Records the timestamp so the next window starts.
     *         In production, extend this to call a Chainlink Function that
     *         reads real-time demand (active rides, time-of-day traffic score)
     *         and writes the new surgeMultiplierBps in the same transaction.
     */
    function performUpkeep(bytes calldata) external {
        require(
            (block.timestamp - lastUpdateTime) >= UPDATE_INTERVAL,
            "Upkeep not needed yet"
        );
        lastUpdateTime = block.timestamp;
        emit OracleUpkeepPerformed(block.timestamp);
    }

    // ── Convenience view ──────────────────────────────────────────────────────

    /**
     * @notice Returns all current rate parameters in one call.
     */
    function getRates()
        external
        view
        returns (
            uint256 _baseFare,
            uint256 _baseFarePerKm,
            uint256 _baseFarePerMinute,
            uint256 _surgeMultiplierBps
        )
    {
        return (baseFare, baseFarePerKm, baseFarePerMinute, surgeMultiplierBps);
    }
}
