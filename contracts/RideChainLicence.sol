// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  RideChainLicence
 * @notice Two-tier licensing registry for RideChain city and regional deployments.
 *
 * Tier 1 — City Operator Licence
 *   Registered by city name and RideHailing contract address.
 *   Upfront fee (USDC) paid directly to the Founder wallet:
 *     COMMUNITY    $5,000
 *     INDEPENDENT  $20,000
 *     ENTERPRISE   $50,000
 *     GOVERNMENT   $100,000
 *   24-month exclusivity, renewable by the owner on performance.
 *   Operators report monthly ride volume; 1 % flows to the Founder — no treasury split.
 *
 * Tier 2 — Regional Master Licence
 *   Covers one or more countries.  $200,000 upfront to Founder.
 *   May sub-license city operators within their region.
 *   Reports aggregated volume from sub-licensed cities; 1.5 % flows to the Founder.
 *   The regional master collects their own margin from city operators before reporting.
 */
contract RideChainLicence is ReentrancyGuard, Ownable {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @dev All licensing fees and ride-volume fees flow exclusively to this address.
    address public constant FOUNDER = 0x8ca402E791bb7FE1a66Bc4e08fE011c789fC2BEb;

    uint256 public constant EXCLUSIVITY_PERIOD = 730 days; // 24 months (2 years)

    // Upfront licence fees in USDC (6 decimals)
    uint256 public constant FEE_COMMUNITY   =   5_000 * 1e6;
    uint256 public constant FEE_INDEPENDENT =  20_000 * 1e6;
    uint256 public constant FEE_ENTERPRISE  =  50_000 * 1e6;
    uint256 public constant FEE_GOVERNMENT  = 100_000 * 1e6;
    uint256 public constant FEE_REGIONAL    = 200_000 * 1e6;

    // Ongoing ride-volume fees in basis points (10 000 = 100 %)
    uint256 public constant CITY_VOLUME_FEE_BPS     = 100; // 1.00 %
    uint256 public constant REGIONAL_VOLUME_FEE_BPS = 150; // 1.50 %

    // ─── Types ────────────────────────────────────────────────────────────────

    enum CityTierType { COMMUNITY, INDEPENDENT, ENTERPRISE, GOVERNMENT }

    struct CityLicence {
        address operator;
        address contractAddress;    // deployed RideHailing contract for this city
        CityTierType tierType;
        uint256 registeredAt;
        uint256 exclusivityExpiry;
        bool    active;
        address regionalMaster;     // address(0) if direct licence
        uint256 totalVolumeReported;
        uint256 totalFeesCollected;
    }

    struct RegionalLicence {
        address  operator;
        string   regionName;
        string[] countries;
        uint256  registeredAt;
        bool     active;
        uint256  totalVolumeReported;
        uint256  totalFeesCollected;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public usdc;

    mapping(string  => CityLicence)     public cityLicences;      // cityName => licence
    mapping(string  => RegionalLicence) public regionalLicences;  // regionName => licence
    mapping(address => string)          public operatorCity;       // operator => cityName
    mapping(address => string)          public operatorRegion;     // operator => regionName

    string[] private _registeredCities;
    string[] private _registeredRegions;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CityLicenceRegistered(
        string   indexed cityName,
        address  indexed operator,
        address          contractAddress,
        CityTierType     tierType,
        uint256          feePaid,
        uint256          exclusivityExpiry
    );

    event RegionalLicenceRegistered(
        string   indexed regionName,
        address  indexed operator,
        string[]         countries,
        uint256          feePaid
    );

    event SubLicenceGranted(
        string  indexed cityName,
        string  indexed regionName,
        address indexed regionalOperator
    );

    event CityFeeCollected(
        string  indexed cityName,
        address indexed operator,
        uint256         rideVolume,
        uint256         feeAmount
    );

    event RegionalFeeCollected(
        string  indexed regionName,
        address indexed operator,
        uint256         rideVolume,
        uint256         feeAmount
    );

    event CityLicenceRevoked(
        string  indexed cityName,
        address indexed operator
    );

    event RegionalLicenceRevoked(
        string  indexed regionName,
        address indexed operator
    );

    event ExclusivityRenewed(
        string  indexed cityName,
        uint256         newExpiry
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc) Ownable() {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _upfrontFee(CityTierType t) internal pure returns (uint256) {
        if (t == CityTierType.COMMUNITY)   return FEE_COMMUNITY;
        if (t == CityTierType.INDEPENDENT) return FEE_INDEPENDENT;
        if (t == CityTierType.ENTERPRISE)  return FEE_ENTERPRISE;
        return FEE_GOVERNMENT;
    }

    function _recordCity(
        string memory  cityName,
        address        operator,
        address        contractAddress,
        CityTierType   tierType,
        address        regionalMaster,
        uint256        feePaid
    ) internal {
        uint256 expiry = block.timestamp + EXCLUSIVITY_PERIOD;
        cityLicences[cityName] = CityLicence({
            operator:             operator,
            contractAddress:      contractAddress,
            tierType:             tierType,
            registeredAt:         block.timestamp,
            exclusivityExpiry:    expiry,
            active:               true,
            regionalMaster:       regionalMaster,
            totalVolumeReported:  0,
            totalFeesCollected:   0
        });
        operatorCity[operator] = cityName;
        _registeredCities.push(cityName);
        emit CityLicenceRegistered(cityName, operator, contractAddress, tierType, feePaid, expiry);
    }

    // ─── Tier 1 — City Operator Registration ──────────────────────────────────

    /**
     * @notice Register a direct City Operator Licence (not under a regional master).
     * @param cityName        Human-readable city name used as the unique registry key.
     * @param contractAddress Address of the city's deployed RideHailing contract.
     * @param tierType        COMMUNITY / INDEPENDENT / ENTERPRISE / GOVERNMENT.
     *
     * Caller must have pre-approved the corresponding USDC upfront fee to this contract.
     * Fee transfers directly to the Founder wallet — no treasury involvement.
     */
    function registerCityLicence(
        string   calldata cityName,
        address           contractAddress,
        CityTierType      tierType
    ) external nonReentrant {
        require(bytes(cityName).length > 0,        "City name required");
        require(contractAddress != address(0),     "Invalid contract address");
        require(!cityLicences[cityName].active,    "City already licenced");

        uint256 fee = _upfrontFee(tierType);
        require(usdc.transferFrom(msg.sender, FOUNDER, fee), "Upfront fee transfer failed");

        _recordCity(cityName, msg.sender, contractAddress, tierType, address(0), fee);
    }

    /**
     * @notice Report monthly ride volume for a directly licenced city.
     *         1 % of `rideVolume` is transferred to the Founder wallet.
     *         No portion goes to any treasury.
     * @param rideVolume Total USDC ride volume (6 decimals) in the reporting period.
     *
     * Caller must be the registered operator and must pre-approve the fee amount.
     */
    function reportCityVolume(uint256 rideVolume) external nonReentrant {
        string memory cityName = operatorCity[msg.sender];
        require(bytes(cityName).length > 0, "Caller has no registered city");
        CityLicence storage c = cityLicences[cityName];
        require(c.active,                    "City licence is not active");
        require(c.regionalMaster == address(0),
                "Sub-licenced city: volume is reported by regional master");

        uint256 fee = (rideVolume * CITY_VOLUME_FEE_BPS) / 10_000;
        require(fee > 0, "Volume too small to generate a fee");
        require(usdc.transferFrom(msg.sender, FOUNDER, fee), "Volume fee transfer failed");

        c.totalVolumeReported += rideVolume;
        c.totalFeesCollected  += fee;

        emit CityFeeCollected(cityName, msg.sender, rideVolume, fee);
    }

    // ─── Tier 2 — Regional Master Registration ────────────────────────────────

    /**
     * @notice Register a Regional Master Licence covering one or more countries.
     * @param regionName Human-readable region name (unique registry key).
     * @param countries  List of country names included in the territory.
     *
     * Caller must pre-approve FEE_REGIONAL (200,000 USDC) to this contract.
     * Fee transfers directly to the Founder wallet.
     */
    function registerRegionalLicence(
        string   calldata regionName,
        string[] calldata countries
    ) external nonReentrant {
        require(bytes(regionName).length > 0,        "Region name required");
        require(countries.length > 0,                "At least one country required");
        require(!regionalLicences[regionName].active, "Region already licenced");

        require(usdc.transferFrom(msg.sender, FOUNDER, FEE_REGIONAL),
                "Upfront fee transfer failed");

        regionalLicences[regionName] = RegionalLicence({
            operator:            msg.sender,
            regionName:          regionName,
            countries:           countries,
            registeredAt:        block.timestamp,
            active:              true,
            totalVolumeReported: 0,
            totalFeesCollected:  0
        });
        operatorRegion[msg.sender] = regionName;
        _registeredRegions.push(regionName);

        emit RegionalLicenceRegistered(regionName, msg.sender, countries, FEE_REGIONAL);
    }

    /**
     * @notice Regional master grants a sub-licence to a city operator within their region.
     * @dev    The regional master collects the city upfront fee from the city operator
     *         through their own commercial agreement.  On-chain we record the sub-licence
     *         and link it to the regional master.
     * @param cityName        Unique city name for the registry.
     * @param cityOperator    Address of the city operator being sub-licenced.
     * @param contractAddress Address of the city's deployed RideHailing contract.
     * @param tierType        Licence tier being granted.
     */
    function grantSubLicence(
        string   calldata cityName,
        address           cityOperator,
        address           contractAddress,
        CityTierType      tierType
    ) external nonReentrant {
        string memory regionName = operatorRegion[msg.sender];
        require(bytes(regionName).length > 0,         "Caller is not a registered regional master");
        require(regionalLicences[regionName].active,  "Regional licence is not active");
        require(bytes(cityName).length > 0,           "City name required");
        require(!cityLicences[cityName].active,       "City already licenced");
        require(cityOperator    != address(0),        "Invalid city operator address");
        require(contractAddress != address(0),        "Invalid contract address");

        // feePaid = 0 because the regional master handles the upfront fee off-chain
        _recordCity(cityName, cityOperator, contractAddress, tierType, msg.sender, 0);
        emit SubLicenceGranted(cityName, regionName, msg.sender);
    }

    /**
     * @notice Regional master reports aggregated ride volume from sub-licensed cities.
     *         1.5 % of `rideVolume` is transferred to the Founder wallet.
     *         The regional master retains their own margin, collected from city operators,
     *         before calling this function.
     * @param rideVolume Total USDC ride volume (6 decimals) across all sub-licensed cities.
     *
     * Caller must be the registered regional operator and pre-approve the fee amount.
     */
    function reportRegionalVolume(uint256 rideVolume) external nonReentrant {
        string memory regionName = operatorRegion[msg.sender];
        require(bytes(regionName).length > 0, "Caller has no registered region");
        RegionalLicence storage r = regionalLicences[regionName];
        require(r.active, "Regional licence is not active");

        uint256 fee = (rideVolume * REGIONAL_VOLUME_FEE_BPS) / 10_000;
        require(fee > 0, "Volume too small to generate a fee");
        require(usdc.transferFrom(msg.sender, FOUNDER, fee), "Volume fee transfer failed");

        r.totalVolumeReported += rideVolume;
        r.totalFeesCollected  += fee;

        emit RegionalFeeCollected(regionName, msg.sender, rideVolume, fee);
    }

    // ─── Revocation ───────────────────────────────────────────────────────────

    /**
     * @notice Owner revokes a city licence.  The city name remains in the registry
     *         (with active = false) so the history is preserved.
     */
    function revokeCityLicence(string calldata cityName) external onlyOwner {
        require(cityLicences[cityName].active, "Licence not active");
        address operator = cityLicences[cityName].operator;
        cityLicences[cityName].active = false;
        emit CityLicenceRevoked(cityName, operator);
    }

    /**
     * @notice Owner revokes a regional master licence.
     */
    function revokeRegionalLicence(string calldata regionName) external onlyOwner {
        require(regionalLicences[regionName].active, "Licence not active");
        address operator = regionalLicences[regionName].operator;
        regionalLicences[regionName].active = false;
        emit RegionalLicenceRevoked(regionName, operator);
    }

    // ─── Renewal ──────────────────────────────────────────────────────────────

    /**
     * @notice Owner extends a city's exclusivity period by a further 24 months
     *         as a performance reward.
     */
    function renewExclusivity(string calldata cityName) external onlyOwner {
        CityLicence storage c = cityLicences[cityName];
        require(c.active, "Licence not active");
        c.exclusivityExpiry = block.timestamp + EXCLUSIVITY_PERIOD;
        emit ExclusivityRenewed(cityName, c.exclusivityExpiry);
    }

    // ─── Public Territory Registry ────────────────────────────────────────────

    function getRegisteredCities() external view returns (string[] memory) {
        return _registeredCities;
    }

    function getRegisteredRegions() external view returns (string[] memory) {
        return _registeredRegions;
    }

    function getCityLicence(string calldata cityName)
        external view returns (CityLicence memory)
    {
        return cityLicences[cityName];
    }

    function getRegionalLicence(string calldata regionName)
        external view returns (RegionalLicence memory)
    {
        return regionalLicences[regionName];
    }

    function isCityActive(string calldata cityName) external view returns (bool) {
        return cityLicences[cityName].active;
    }

    function isRegionActive(string calldata regionName) external view returns (bool) {
        return regionalLicences[regionName].active;
    }

    function cityCount()   external view returns (uint256) { return _registeredCities.length; }
    function regionCount() external view returns (uint256) { return _registeredRegions.length; }
}
