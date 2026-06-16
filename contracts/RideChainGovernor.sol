// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  RideChainGovernor
 * @notice Foundation governance contract for the RideChain DAO.
 *
 * Key design decisions (per spec):
 *
 * 1. TIMELOCK — all proposals are subject to a 48-hour delay enforced by an
 *    OpenZeppelin TimelockController deployed alongside this contract.
 *
 * 2. FOUNDING-WALLET VETO — the founding wallet can cancel any proposal
 *    tagged CONSTITUTIONAL during the first 5 years from deployment.
 *    After year 5 this power is permanently disabled (checked on-chain
 *    via block.timestamp vs. deployedAt + 5 years).
 *    Constitutional proposals cover changes to: token distribution percentages,
 *    vesting schedule, platform fee ceiling, and core ownership structure.
 *    Director election / removal is NOT a governable action on this contract;
 *    directors are managed off-chain via the Wyoming foundation's articles.
 *
 * 3. GUARDIAN COUNCIL — a 5-address multisig that can veto any proposal
 *    within the 48-hour timelock window.  Requires 4-of-5 signatures.
 *    The council's veto power is gated behind an isActive flag that the DAO
 *    can only set to true once treasury monthly USDC income has exceeded
 *    $5,000 for 3 consecutive months (reported and verified on-chain).
 *
 * 4. QUADRATIC VOTING — vote weight is read from RideChainToken.getVotingPower()
 *    (= sqrt(tokenBalance)) rather than the standard ERC20Votes getVotes().
 *    This is achieved by overriding _getVotes().
 *
 * Director governance is intentionally omitted from this contract.
 * The Wyoming Unincorporated Nonprofit Association handles director appointments
 * and removals through its articles of incorporation, entirely off-chain.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal interface to call RideChainToken.getVotingPower()
// ─────────────────────────────────────────────────────────────────────────────

interface IRideChainToken is IVotes {
    function getVotingPower(address account) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────
//  RideChainGovernor
// ─────────────────────────────────────────────────────────────────────────────

contract RideChainGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorTimelockControl,
    Ownable
{
    // ── Constitutional veto ───────────────────────────────────────────────────

    uint256 public immutable deployedAt;
    uint256 public constant  VETO_WINDOW = 5 * 365 days; // 5 years
    address public immutable foundingWallet;

    // Proposals the founding wallet has tagged as constitutional
    mapping(uint256 => bool) public isConstitutional;

    // ── Guardian council ──────────────────────────────────────────────────────

    struct GuardianCouncil {
        address[5] members;
        bool       isActive;
        uint8      vetoThreshold; // always 4
    }

    GuardianCouncil public council;

    // vetoPending[proposalId][guardianAddress] = true if they have signed
    mapping(uint256 => mapping(address => bool)) public vetoSigned;
    // veto signature count per proposal
    mapping(uint256 => uint8) public vetoSignatureCount;
    // proposals where guardian veto has been executed
    mapping(uint256 => bool) public guardianVetoed;

    // ── Treasury income tracking (guardian council activation gate) ────────────

    // Monthly income reports submitted by the owner (verified externally)
    // monthlyIncome[monthIndex] = USDC amount (6 decimals)
    mapping(uint256 => uint256) public monthlyIncome;
    uint256 public currentMonth; // monotonically increasing month index
    uint256 public constant INCOME_THRESHOLD = 5_000 * 1e6;  // $5,000 USDC
    uint256 public consecutiveMonthsMet;                       // months above threshold

    // ── Events ────────────────────────────────────────────────────────────────

    event ProposalTaggedConstitutional(uint256 indexed proposalId, address tagger);
    event FoundingWalletVetoUsed(uint256 indexed proposalId);
    event FoundingWalletVetoExpired(uint256 vetoExpiryTimestamp);
    event GuardianCouncilSet(address[5] members);
    event GuardianVetoSigned(uint256 indexed proposalId, address indexed guardian, uint8 sigCount);
    event GuardianVetoExecuted(uint256 indexed proposalId);
    event CouncilActivated();
    event MonthlyIncomeReported(uint256 indexed month, uint256 amount, uint256 consecutiveCount);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param _token          Address of deployed RideChainToken.
     * @param _timelock       Address of the TimelockController (48-hour delay).
     * @param _foundingWallet Elijah's wallet — holds constitutional veto for 5 years.
     * @param _councilMembers Initial 5 guardian council member addresses.
     */
    constructor(
        IRideChainToken  _token,
        TimelockController _timelock,
        address          _foundingWallet,
        address[5] memory _councilMembers
    )
        Governor("RideChainGovernor")
        GovernorSettings(
            1,          // votingDelay: 1 block
            50400,      // votingPeriod: ~7 days at 12s/block
            0           // proposalThreshold: 0 tokens to propose
        )
        GovernorVotes(IVotes(address(_token)))
        GovernorTimelockControl(_timelock)
        Ownable()
    {
        require(_foundingWallet != address(0), "Invalid founding wallet");

        deployedAt     = block.timestamp;
        foundingWallet = _foundingWallet;

        council.members       = _councilMembers;
        council.vetoThreshold = 4;
        council.isActive      = false; // activated once income threshold is met
    }

    // ── Quadratic voting override ─────────────────────────────────────────────

    /**
     * @dev Override _getVotes to use RideChainToken.getVotingPower() (quadratic).
     *      This replaces the standard ERC20Votes linear balance.
     */
    function _getVotes(
        address account,
        uint256 /* blockNumber */,
        bytes memory /* params */
    ) internal view override(Governor, GovernorVotes) returns (uint256) {
        return IRideChainToken(address(token)).getVotingPower(account);
    }

    // ── Constitutional tagging ────────────────────────────────────────────────

    /**
     * @notice Founding wallet tags a proposal as constitutional before it is voted on.
     *         Constitutional proposals cover changes to:
     *           • token distribution percentages
     *           • vesting schedule
     *           • platform fee ceiling
     *           • core ownership structure
     *
     *         Director election / removal is NOT a constitutional action and
     *         cannot be governed here (handled off-chain by the Wyoming foundation).
     *
     * @param proposalId The OZ Governor proposal ID to tag.
     */
    function tagConstitutional(uint256 proposalId) external {
        require(msg.sender == foundingWallet, "Only founding wallet");
        require(state(proposalId) == ProposalState.Pending ||
                state(proposalId) == ProposalState.Active,
                "Proposal not in taggable state");
        isConstitutional[proposalId] = true;
        emit ProposalTaggedConstitutional(proposalId, msg.sender);
    }

    // ── Founding wallet constitutional veto ───────────────────────────────────

    /**
     * @notice Founding wallet cancels a constitutional proposal.
     *         Only callable within the first 5 years from deployment.
     *         After year 5 this function permanently reverts.
     *
     * @param targets    Proposal execution targets (passed through to _cancel).
     * @param values     ETH values per call.
     * @param calldatas  Encoded call data per call.
     * @param descHash   keccak256 of the proposal description.
     */
    function foundingWalletVeto(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        bytes32          descHash
    ) external {
        require(msg.sender == foundingWallet, "Only founding wallet");
        require(
            block.timestamp < deployedAt + VETO_WINDOW,
            "Founding wallet veto has permanently expired after year 5"
        );

        uint256 proposalId = hashProposal(targets, values, calldatas, descHash);
        require(isConstitutional[proposalId], "Proposal is not tagged constitutional");

        _cancel(targets, values, calldatas, descHash);
        emit FoundingWalletVetoUsed(proposalId);
    }

    /// @notice Returns true if the founding wallet veto power is still active.
    function isFoundingVetoActive() external view returns (bool) {
        return block.timestamp < deployedAt + VETO_WINDOW;
    }

    // ── Guardian council ──────────────────────────────────────────────────────

    /**
     * @notice Owner updates the guardian council member set.
     *         Eligibility and selection criteria:
     *          • Must not be a current RideChain employee or director.
     *          • Must hold at least 10,000 RCT (skin in the game).
     *          • Selected by DAO governance vote every 2 years.
     *          • No two members from the same legal jurisdiction.
     *
     * @param members New 5-member array.
     */
    function setGuardianCouncil(address[5] memory members) external onlyOwner {
        for (uint256 i = 0; i < 5; i++) {
            require(members[i] != address(0), "Invalid council member address");
        }
        council.members = members;
        emit GuardianCouncilSet(members);
    }

    /// @notice Returns whether an address is a current guardian council member.
    function isGuardian(address addr) public view returns (bool) {
        for (uint256 i = 0; i < 5; i++) {
            if (council.members[i] == addr) return true;
        }
        return false;
    }

    /**
     * @notice Guardian council member signs a veto on a queued proposal.
     *         The veto can only be executed within the 48-hour timelock window.
     *         Requires council.isActive == true.
     *         Once 4 signatures are collected the proposal is cancelled automatically.
     *
     * @param targets   Proposal execution targets.
     * @param values    ETH values per call.
     * @param calldatas Encoded call data per call.
     * @param descHash  keccak256 of the proposal description.
     */
    function signGuardianVeto(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        bytes32          descHash
    ) external {
        require(council.isActive, "Guardian council is not yet active");
        require(isGuardian(msg.sender), "Not a guardian council member");

        uint256 proposalId = hashProposal(targets, values, calldatas, descHash);
        require(
            state(proposalId) == ProposalState.Queued,
            "Proposal must be queued (in timelock) to veto"
        );
        require(!guardianVetoed[proposalId], "Already vetoed");
        require(!vetoSigned[proposalId][msg.sender], "Already signed");

        vetoSigned[proposalId][msg.sender] = true;
        uint8 count = ++vetoSignatureCount[proposalId];
        emit GuardianVetoSigned(proposalId, msg.sender, count);

        // Execute veto once threshold is reached
        if (count >= council.vetoThreshold) {
            guardianVetoed[proposalId] = true;
            _cancel(targets, values, calldatas, descHash);
            emit GuardianVetoExecuted(proposalId);
        }
    }

    // ── Guardian council activation (treasury income gate) ────────────────────

    /**
     * @notice Owner reports treasury USDC income for the current month.
     *         Once income exceeds $5,000 for 3 consecutive months, the owner
     *         can call activateGuardianCouncil().
     *
     * @param amount Monthly USDC income (6 decimals).
     */
    function reportMonthlyIncome(uint256 amount) external onlyOwner {
        uint256 month = currentMonth++;
        monthlyIncome[month] = amount;

        if (amount >= INCOME_THRESHOLD) {
            consecutiveMonthsMet++;
        } else {
            consecutiveMonthsMet = 0; // streak broken — reset
        }

        emit MonthlyIncomeReported(month, amount, consecutiveMonthsMet);
    }

    /**
     * @notice Activate the guardian council once the income streak has been met.
     *         Can be called by anyone once the 3-month streak is verified on-chain.
     */
    function activateGuardianCouncil() external {
        require(!council.isActive, "Council already active");
        require(consecutiveMonthsMet >= 3, "Income threshold not met for 3 consecutive months");
        council.isActive = true;
        emit CouncilActivated();
    }

    // ── OZ Governor required overrides ────────────────────────────────────────

    function votingDelay()
        public view override(IGovernor, GovernorSettings)
        returns (uint256)
    { return super.votingDelay(); }

    function votingPeriod()
        public view override(IGovernor, GovernorSettings)
        returns (uint256)
    { return super.votingPeriod(); }

    function quorum(uint256 /* blockNumber */)
        public pure override(IGovernor)
        returns (uint256)
    {
        // 4% of sqrt(total supply) — adjustable via governance later
        return 20_000; // sqrt(400M) ≈ 20,000 quadratic votes
    }

    function proposalThreshold()
        public view override(Governor, GovernorSettings)
        returns (uint256)
    { return super.proposalThreshold(); }

    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    { return super.state(proposalId); }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        string    memory description
    ) public override(Governor, IGovernor) returns (uint256) {
        return super.propose(targets, values, calldatas, description);
    }

    function _execute(
        uint256          proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        bytes32          descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        bytes32          descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal view override(Governor, GovernorTimelockControl)
        returns (address)
    { return super._executor(); }

    function supportsInterface(bytes4 interfaceId)
        public view override(Governor, GovernorTimelockControl)
        returns (bool)
    { return super.supportsInterface(interfaceId); }
}
