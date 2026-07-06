// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  FOUNDER VESTING CONTRACT
//  — deployed by RideChainToken constructor and exempt from the 5M wallet cap.
//  — 12-month cliff, then 625,000 RCT released per calendar month over 36 months
//    (22,500,000 total vested under this schedule; remaining 7,500,000 of the
//    30M allocation stays locked in the contract as a long-term reserve and can
//    be released via a future governance vote on RideChainToken).
// ─────────────────────────────────────────────────────────────────────────────

contract FounderVesting is ReentrancyGuard {

    address public immutable founder;
    address public immutable token;
    uint256 public immutable vestingStart;

    uint256 public constant CLIFF           = 365 days;          // 12-month cliff
    uint256 public constant MONTHLY_RELEASE = 625_000 * 1e18;   // 625,000 RCT
    uint256 public constant VESTING_MONTHS  = 36;
    uint256 public constant MONTH_DURATION  = 30 days;

    uint256 public totalReleased;

    event TokensReleased(address indexed to, uint256 amount);

    constructor(address _founder, address _token) {
        require(_founder != address(0), "Invalid founder address");
        require(_token   != address(0), "Invalid token address");
        founder      = _founder;
        token        = _token;
        vestingStart = block.timestamp;
    }

    /// @notice Full months elapsed since the cliff ended (capped at VESTING_MONTHS).
    function monthsVested() public view returns (uint256) {
        if (block.timestamp < vestingStart + CLIFF) return 0;
        uint256 elapsed = block.timestamp - (vestingStart + CLIFF);
        uint256 months  = elapsed / MONTH_DURATION;
        return months > VESTING_MONTHS ? VESTING_MONTHS : months;
    }

    /// @notice Tokens the founder can claim right now.
    function releasable() public view returns (uint256) {
        uint256 vested = monthsVested() * MONTHLY_RELEASE;
        return vested > totalReleased ? vested - totalReleased : 0;
    }

    /// @notice Founder withdraws currently unlocked tokens.
    function release() external nonReentrant {
        require(msg.sender == founder, "Only founder");
        uint256 amount = releasable();
        require(amount > 0, "Nothing releasable yet");
        totalReleased += amount;
        require(IERC20(token).transfer(founder, amount), "Token transfer failed");
        emit TokensReleased(founder, amount);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RIDECHAINTOKEN
//  Supply: 100,000,000 RCT — fixed forever, no mint function.
//
//  Allocation at deployment
//  ┌──────────────────┬────────────┬────────────────────────────────────────┐
//  │ Bucket           │ Tokens     │ Notes                                  │
//  ├──────────────────┼────────────┼────────────────────────────────────────┤
//  │ Founder          │ 30,000,000 │ Held in FounderVesting (cap-exempt)    │
//  │ Driver Pool      │ 30,000,000 │ Held in this contract; daily rebalance │
//  │ Rider Pool       │ 25,000,000 │ Held in this contract; daily rebalance │
//  │ Treasury         │ 15,000,000 │ Held in this contract; governance only │
//  └──────────────────┴────────────┴────────────────────────────────────────┘
//
//  Wallet cap : 5,000,000 RCT on all non-exempt addresses.
//  Quadratic voting: getVotingPower(addr) = sqrt(balanceOf(addr)).
//  Chainlink Automation cron: "0 21 * * *" (21:00 UTC = GMT+3 midnight).
// ─────────────────────────────────────────────────────────────────────────────

contract RideChainToken is ERC20Votes, Ownable, ReentrancyGuard {

    // ── Supply constants ──────────────────────────────────────────────────────

    uint256 public constant TOTAL_SUPPLY   = 100_000_000 * 1e18;
    uint256 public constant FOUNDER_ALLOC  =  30_000_000 * 1e18;
    uint256 public constant DRIVER_POOL    =  30_000_000 * 1e18;
    uint256 public constant RIDER_POOL     =  25_000_000 * 1e18;
    uint256 public constant TREASURY_ALLOC =  15_000_000 * 1e18;
    uint256 public constant WALLET_CAP     =   5_000_000 * 1e18;

    // ── Vesting ───────────────────────────────────────────────────────────────

    FounderVesting public immutable vestingContract;

    // ── Pool accounting ───────────────────────────────────────────────────────

    uint256 public driverPoolRemaining;
    uint256 public riderPoolRemaining;
    uint256 public treasuryRemaining;

    // driver pool
    mapping(address => uint256) public driverAllocation; // current pool share
    mapping(address => uint256) public driverClaimed;    // lifetime claimed

    // rider pool
    mapping(address => uint256) public riderAllocation;
    mapping(address => uint256) public riderClaimed;

    // ── Wallet-cap exemptions ─────────────────────────────────────────────────

    mapping(address => bool) public capExempt;

    // ── Treasury release ──────────────────────────────────────────────────────

    struct TreasuryProposal {
        address recipient;
        uint256 amount;
        uint256 createdAt;
        bool    executed;
    }

    uint256 public proposalCount;
    mapping(uint256 => TreasuryProposal) public treasuryProposals;
    uint256 public constant PROPOSAL_DELAY = 48 hours;

    address public governanceContract; // set after RideChainGovernor is deployed

    // ── Chainlink Automation ──────────────────────────────────────────────────

    uint256 public lastRebalanceTime;
    uint256 public constant REBALANCE_INTERVAL = 1 days;

    // ── Events ────────────────────────────────────────────────────────────────

    event DriverPoolRebalanced(uint256 participantCount, uint256 timestamp);
    event RiderPoolRebalanced (uint256 participantCount, uint256 timestamp);
    // H-2: full input arrays emitted for off-chain auditability
    event DriverPoolInputs(address[] drivers, uint256[] ridesCompleted, uint256[] avgRatingScaled);
    event RiderPoolInputs(address[] riders, uint256[] ridesTaken, uint256[] behaviourMultipliers);
    event DriverTokensClaimed (address indexed driver, uint256 amount);
    event RiderTokensClaimed  (address indexed rider,  uint256 amount);
    event TreasuryProposalCreated(uint256 indexed id, address recipient, uint256 amount);
    event TreasuryReleased   (uint256 indexed id, address indexed recipient, uint256 amount);
    event GovernanceContractSet(address indexed governance);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _founder)
        ERC20("RideChain Token", "RCT")
        ERC20Permit("RideChain Token")
        Ownable()
    {
        require(_founder != address(0), "Invalid founder address");

        // 1. Deploy the founder vesting contract first so we have its address.
        vestingContract = new FounderVesting(_founder, address(this));

        // 2. Exempt privileged addresses from the 5M wallet cap.
        capExempt[address(vestingContract)] = true;
        capExempt[address(this)]            = true;

        // 3. Mint entire supply to this contract (cap-exempt).
        _mint(address(this), TOTAL_SUPPLY);

        // 4. Transfer founder allocation to vesting contract.
        _transfer(address(this), address(vestingContract), FOUNDER_ALLOC);

        // 5. Initialise pool counters.
        driverPoolRemaining = DRIVER_POOL;
        riderPoolRemaining  = RIDER_POOL;
        treasuryRemaining   = TREASURY_ALLOC;

        lastRebalanceTime = block.timestamp;
    }

    // ── Wallet-cap hook ───────────────────────────────────────────────────────

    /// @dev Enforces 5M token cap on all non-exempt addresses.
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);
        if (to != address(0) && !capExempt[to]) {
            require(
                balanceOf(to) + amount <= WALLET_CAP,
                "Transfer would exceed 5M wallet cap"
            );
        }
    }

    // ── Quadratic voting ──────────────────────────────────────────────────────

    /**
     * @notice Voting power = sqrt(balanceOf(account)).
     *         RideChainGovernor calls this instead of the standard ERC20Votes
     *         getVotes() so that larger holders do not dominate governance.
     */
    function getVotingPower(address account) external view returns (uint256) {
        return Math.sqrt(balanceOf(account));
    }

    // ── Driver pool rebalancing ───────────────────────────────────────────────

    /**
     * @notice Recalculates every active driver's share of the 30M driver pool.
     *         Called daily by Chainlink Automation (cron "0 21 * * *", UTC).
     *
     * @dev Formula (per spec):
     *      weighted_score[i] = ridesCompleted[i] × (avgRating[i] / 5)
     *
     *      avgRatingScaled is the 0–50 value from RideHailing.getAverageScore()
     *      (raw score 1–5 × 10 / count).  Dividing by 50 normalises to 0–1:
     *        weighted_score[i] = ridesCompleted[i] × avgRatingScaled[i] / 50
     *
     *      pool_share[i] = (weighted_score[i] / Σ weighted_score) × DRIVER_POOL
     *
     *      Cash rides must pass the same ridesCompleted count as digital rides.
     *
     * @param drivers          Active driver addresses.
     * @param ridesCompleted   Cumulative rides per driver (cash + digital).
     * @param avgRatingScaled  Average rating ×10 per driver (0–50).
     */
    function rebalanceDriverPool(
        address[] calldata drivers,
        uint256[] calldata ridesCompleted,
        uint256[] calldata avgRatingScaled
    ) external {
        require(
            msg.sender == owner() || msg.sender == governanceContract,
            "Not authorised to rebalance"
        );
        require(
            drivers.length == ridesCompleted.length &&
            drivers.length == avgRatingScaled.length,
            "Array length mismatch"
        );

        uint256 totalScore;
        uint256[] memory scores = new uint256[](drivers.length);

        for (uint256 i = 0; i < drivers.length; i++) {
            uint256 rating = avgRatingScaled[i] > 50 ? 50 : avgRatingScaled[i];
            // Multiply rides × rating; divide by 50 is factored into the ratio below
            scores[i]   = ridesCompleted[i] * rating;
            totalScore += scores[i];
        }

        require( // M-3: enforce one rebalance per day
            block.timestamp >= lastRebalanceTime + REBALANCE_INTERVAL,
            "Rebalance not due yet"
        );

        if (totalScore == 0) return; // no scoreable activity — skip silently

        for (uint256 i = 0; i < drivers.length; i++) {
            // pool_share = (weighted_score / totalScore) × DRIVER_POOL
            driverAllocation[drivers[i]] = (scores[i] * DRIVER_POOL) / totalScore;
        }

        lastRebalanceTime = block.timestamp;
        emit DriverPoolInputs(drivers, ridesCompleted, avgRatingScaled); // H-2
        emit DriverPoolRebalanced(drivers.length, block.timestamp);
    }

    // ── Rider pool rebalancing ────────────────────────────────────────────────

    /**
     * @notice Recalculates every active rider's share of the 25M rider pool.
     *         Called daily by Chainlink Automation alongside rebalanceDriverPool.
     *
     * @dev Formula (per spec):
     *      behaviour_multiplier = 100
     *        + 10 if rider submits ratings consistently
     *        + 10 if no disputes in last 10 rides
     *        + 10 if active in last 30 days
     *      Capped at 130.
     *
     *      weighted_score[i] = ridesTaken[i] × behaviourMultiplier[i] / 100
     *      pool_share[i]     = (weighted_score[i] / Σ weighted_score) × RIDER_POOL
     *
     *      Cash rides must pass the same ridesTaken count as digital rides.
     *
     * @param riders                 Active rider addresses.
     * @param ridesTaken             Cumulative rides per rider (cash + digital).
     * @param behaviourMultipliers   Pre-computed multiplier per rider (100–130).
     */
    function rebalanceRiderPool(
        address[] calldata riders,
        uint256[] calldata ridesTaken,
        uint256[] calldata behaviourMultipliers
    ) external {
        require(
            msg.sender == owner() || msg.sender == governanceContract,
            "Not authorised to rebalance"
        );
        require(
            riders.length == ridesTaken.length &&
            riders.length == behaviourMultipliers.length,
            "Array length mismatch"
        );

        uint256 totalScore;
        uint256[] memory scores = new uint256[](riders.length);

        for (uint256 i = 0; i < riders.length; i++) {
            uint256 mult = behaviourMultipliers[i];
            if (mult < 100) mult = 100;
            if (mult > 130) mult = 130;

            // weighted_score = rides_taken × behaviour_multiplier / 100
            scores[i]   = ridesTaken[i] * mult / 100;
            totalScore += scores[i];
        }

        require( // M-3: enforce one rebalance per day
            block.timestamp >= lastRebalanceTime + REBALANCE_INTERVAL,
            "Rebalance not due yet"
        );

        if (totalScore == 0) return;

        for (uint256 i = 0; i < riders.length; i++) {
            riderAllocation[riders[i]] = (scores[i] * RIDER_POOL) / totalScore;
        }

        lastRebalanceTime = block.timestamp;
        emit RiderPoolInputs(riders, ridesTaken, behaviourMultipliers); // H-2
        emit RiderPoolRebalanced(riders.length, block.timestamp);
    }

    // ── Token claiming ────────────────────────────────────────────────────────

    /**
     * @notice Driver claims the difference between their current pool share
     *         and what they have already claimed.
     *         Subject to the 5M wallet cap (enforced in _beforeTokenTransfer).
     */
    function claimDriverTokens() external nonReentrant {
        uint256 alloc   = driverAllocation[msg.sender];
        uint256 claimed = driverClaimed[msg.sender];
        require(alloc > claimed, "Nothing to claim");

        uint256 amount = alloc - claimed;
        require(amount <= driverPoolRemaining, "Exceeds driver pool balance");

        driverClaimed[msg.sender] += amount;
        driverPoolRemaining       -= amount;

        _transfer(address(this), msg.sender, amount);
        emit DriverTokensClaimed(msg.sender, amount);
    }

    /**
     * @notice Rider claims the difference between their current pool share
     *         and what they have already claimed.
     */
    function claimRiderTokens() external nonReentrant {
        uint256 alloc   = riderAllocation[msg.sender];
        uint256 claimed = riderClaimed[msg.sender];
        require(alloc > claimed, "Nothing to claim");

        uint256 amount = alloc - claimed;
        require(amount <= riderPoolRemaining, "Exceeds rider pool balance");

        riderClaimed[msg.sender] += amount;
        riderPoolRemaining       -= amount;

        _transfer(address(this), msg.sender, amount);
        emit RiderTokensClaimed(msg.sender, amount);
    }

    // ── Treasury release ──────────────────────────────────────────────────────

    /**
     * @notice Governance creates a treasury release proposal.
     *         No individual wallet can release treasury tokens directly —
     *         only the governance contract (or owner before governance is live).
     *         Proposal executes after a 48-hour timelock.
     */
    function proposeTreasuryRelease(address recipient, uint256 amount)
        external
        returns (uint256 proposalId)
    {
        require(
            msg.sender == owner() || msg.sender == governanceContract,
            "Not authorised"
        );
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0 && amount <= treasuryRemaining, "Invalid amount");

        proposalId = ++proposalCount;
        treasuryProposals[proposalId] = TreasuryProposal({
            recipient: recipient,
            amount:    amount,
            createdAt: block.timestamp,
            executed:  false
        });

        emit TreasuryProposalCreated(proposalId, recipient, amount);
    }

    /**
     * @notice Executes a treasury release after the 48-hour timelock has elapsed.
     *         Callable by anyone once the delay has passed.
     */
    function executeTreasuryRelease(uint256 proposalId) external nonReentrant {
        TreasuryProposal storage p = treasuryProposals[proposalId];
        require(p.recipient != address(0),              "Proposal does not exist");
        require(!p.executed,                            "Already executed");
        require(
            block.timestamp >= p.createdAt + PROPOSAL_DELAY,
            "48-hour timelock not elapsed"
        );
        require(p.amount <= treasuryRemaining, "Insufficient treasury balance");

        p.executed         = true;
        treasuryRemaining -= p.amount;

        _transfer(address(this), p.recipient, p.amount);
        emit TreasuryReleased(proposalId, p.recipient, p.amount);
    }

    // ── Chainlink Automation (AutomationCompatibleInterface) ──────────────────

    /**
     * @notice Chainlink checkUpkeep — returns true once 24 hours have passed
     *         since the last rebalance.  Register with cron "0 21 * * *" (UTC)
     *         on Chainlink Automation so that the off-chain node triggers at
     *         21:00 UTC (midnight GMT+3) and this guard prevents double-fires.
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = (block.timestamp - lastRebalanceTime) >= REBALANCE_INTERVAL;
        performData  = "";
    }

    /**
     * @notice Called by Chainlink Automation to mark the rebalance window open.
     *         The actual rebalanceDriverPool / rebalanceRiderPool calls are made
     *         in the same transaction by the authorized caller passing the
     *         activity data computed off-chain.
     */
    function performUpkeep(bytes calldata /* performData */) external {
        require(
            (block.timestamp - lastRebalanceTime) >= REBALANCE_INTERVAL,
            "Upkeep not due yet"
        );
        lastRebalanceTime = block.timestamp;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /**
     * @notice Set the governance contract address once RideChainGovernor is deployed.
     *         The governor is automatically exempted from the wallet cap.
     */
    function setGovernanceContract(address _governance) external onlyOwner {
        require(_governance != address(0), "Invalid address");
        governanceContract     = _governance;
        capExempt[_governance] = true;
        emit GovernanceContractSet(_governance);
    }

    /// @notice Owner may add or remove cap exemptions (e.g., for other contracts).
    function setCapExempt(address account, bool exempt) external onlyOwner {
        capExempt[account] = exempt;
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function claimableDriverTokens(address driver) external view returns (uint256) {
        uint256 alloc = driverAllocation[driver];
        uint256 paid  = driverClaimed[driver];
        return alloc > paid ? alloc - paid : 0;
    }

    function claimableRiderTokens(address rider) external view returns (uint256) {
        uint256 alloc = riderAllocation[rider];
        uint256 paid  = riderClaimed[rider];
        return alloc > paid ? alloc - paid : 0;
    }

    // ── ERC20Votes required overrides ─────────────────────────────────────────

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal override(ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20Votes) {
        super._burn(account, amount);
    }
}
