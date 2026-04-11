// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RideHailing is ReentrancyGuard, Ownable {

    IERC20 public usdc;
    address public treasury;
    uint256 public platformFeePct = 5;
    uint256 public bondPct = 10;
    uint256 public timeoutWindow = 30 minutes;
    uint256 public negotiationRounds = 5;
    uint256 public negotiationWindow = 3 minutes;
    uint256 public bandMinPct = 75;
    uint256 public bandMaxPct = 133;

    enum RideState { REQUESTED, ACCEPTED, IN_PROGRESS, COMPLETED, DISPUTED, CANCELLED }
    enum DisputeTier { NONE, AUTO, COMMUNITY, KLEROS }
    enum ReputationTier { NEW, ESTABLISHED, TRUSTED, ELITE }

    struct Ride {
        address rider;
        address driver;
        bytes32 pickupHash;
        bytes32 dropoffHash;
        uint256 recommendedFare;
        uint256 bandMin;
        uint256 bandMax;
        uint256 currentOffer;
        address offerFrom;
        uint256 negotiationRoundsUsed;
        uint256 negotiationDeadline;
        uint256 agreedFare;
        uint256 driverBond;
        uint256 requestedAt;
        uint256 acceptedAt;
        uint256 startedAt;
        uint256 expectedDuration;
        uint256 completedAt;
        RideState state;
        bool amendmentPending;
        bytes32 newDropoffHash;
        uint256 newFareProposed;
        DisputeTier disputeTier;
        bytes32 evidenceHash;
        address disputeRaisedBy;
        bytes32 routeLogHash;
    }

    struct Reputation {
        uint256 totalRides;
        uint256 ratingSum;
        uint256 ratingCount;
        uint256 disputesLost;
        uint256 completionCount;
        bool isVerifiedDriver;
        ReputationTier tier;
    }

    mapping(uint256 => Ride) public rides;
    mapping(address => Reputation) public reputations;
    uint256 public rideCount;

    event RideRequested(uint256 indexed rideId, address indexed rider, bytes32 pickupHash, bytes32 dropoffHash, uint256 recommendedFare, uint256 bandMin, uint256 bandMax);
    event OfferMade(uint256 indexed rideId, address indexed by, uint256 amount);
    event RideAccepted(uint256 indexed rideId, address indexed driver, uint256 agreedFare);
    event RideStarted(uint256 indexed rideId, uint256 startedAt);
    event RideCompleted(uint256 indexed rideId, uint256 driverPayout, uint256 treasuryFee);
    event AmendmentProposed(uint256 indexed rideId, bytes32 newDropoffHash, uint256 newFare);
    event AmendmentAccepted(uint256 indexed rideId, bytes32 newDropoffHash, uint256 newFare);
    event AmendmentRejected(uint256 indexed rideId);
    event TimeoutClaimed(uint256 indexed rideId, address driver);
    event DisputeRaised(uint256 indexed rideId, address by, DisputeTier tier);
    event DisputeResolved(uint256 indexed rideId, address winner, DisputeTier tier);
    event RouteLogSubmitted(uint256 indexed rideId, bytes32 routeLogHash);
    event RideCancelled(uint256 indexed rideId);
    event DriverVerified(address indexed driver);
    event RatingSubmitted(uint256 indexed rideId, address indexed rater, address indexed rated, uint256 score);

    constructor(address _usdc, address _treasury) Ownable() {
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    modifier onlyRider(uint256 rideId) {
        require(msg.sender == rides[rideId].rider, "Only the rider can do this");
        _;
    }

    modifier onlyDriver(uint256 rideId) {
        require(msg.sender == rides[rideId].driver, "Only the driver can do this");
        _;
    }

    modifier inState(uint256 rideId, RideState expected) {
        require(rides[rideId].state == expected, "Ride is not in the required state");
        _;
    }

    function requestRide(bytes32 _pickupHash, bytes32 _dropoffHash, uint256 _recommendedFare, uint256 _expectedDuration, uint256 _openingOffer) external returns (uint256) {
        require(_recommendedFare > 0, "Fare must be greater than zero");
        uint256 bandMin = (_recommendedFare * bandMinPct) / 100;
        uint256 bandMax = (_recommendedFare * bandMaxPct) / 100;
        require(_openingOffer >= bandMin && _openingOffer <= bandMax, "Opening offer outside negotiation band");
        rideCount++;
        uint256 rideId = rideCount;
        Ride storage r = rides[rideId];
        r.rider = msg.sender;
        r.pickupHash = _pickupHash;
        r.dropoffHash = _dropoffHash;
        r.recommendedFare = _recommendedFare;
        r.bandMin = bandMin;
        r.bandMax = bandMax;
        r.currentOffer = _openingOffer;
        r.offerFrom = msg.sender;
        r.negotiationDeadline = block.timestamp + negotiationWindow;
        r.requestedAt = block.timestamp;
        r.expectedDuration = _expectedDuration;
        r.state = RideState.REQUESTED;
        emit RideRequested(rideId, msg.sender, _pickupHash, _dropoffHash, _recommendedFare, bandMin, bandMax);
        emit OfferMade(rideId, msg.sender, _openingOffer);
        return rideId;
    }

    function acceptRecommended(uint256 rideId) external onlyRider(rideId) inState(rideId, RideState.REQUESTED) {
        Ride storage r = rides[rideId];
        r.currentOffer = r.recommendedFare;
        r.offerFrom = msg.sender;
        emit OfferMade(rideId, msg.sender, r.recommendedFare);
    }

    function counterOffer(uint256 rideId, uint256 newFare) external inState(rideId, RideState.REQUESTED) {
        Ride storage r = rides[rideId];
        require(block.timestamp <= r.negotiationDeadline, "Negotiation window has closed");
        require(r.negotiationRoundsUsed < negotiationRounds, "Maximum negotiation rounds reached");
        require(newFare >= r.bandMin && newFare <= r.bandMax, "Offer outside negotiation band");
        require(msg.sender != r.offerFrom, "Cannot counter your own offer");
        require(msg.sender == r.rider || reputations[msg.sender].isVerifiedDriver, "Only rider or verified driver can counter");
        r.currentOffer = newFare;
        r.offerFrom = msg.sender;
        r.negotiationRoundsUsed++;
        emit OfferMade(rideId, msg.sender, newFare);
    }

    function acceptOffer(uint256 rideId) external nonReentrant inState(rideId, RideState.REQUESTED) {
        Ride storage r = rides[rideId];
        require(block.timestamp <= r.negotiationDeadline, "Negotiation window has closed");
        require(msg.sender != r.offerFrom, "Cannot accept your own offer");
        require(msg.sender == r.rider || reputations[msg.sender].isVerifiedDriver, "Only rider or verified driver can accept");
        if (msg.sender != r.rider) {
            require(r.driver == address(0), "Ride already has a driver");
            r.driver = msg.sender;
        }
        r.agreedFare = r.currentOffer;
        ReputationTier driverTier = reputations[r.driver].tier;
        uint256 bond = 0;
        if (driverTier == ReputationTier.NEW || driverTier == ReputationTier.ESTABLISHED) {
            bond = (r.agreedFare * bondPct) / 100;
        } else if (driverTier == ReputationTier.TRUSTED) {
            bond = (r.agreedFare * 5) / 100;
        }
        r.driverBond = bond;
        r.acceptedAt = block.timestamp;
        r.state = RideState.ACCEPTED;
        require(usdc.transferFrom(r.rider, address(this), r.agreedFare), "Rider USDC deposit failed");
        if (bond > 0) { require(usdc.transferFrom(r.driver, address(this), bond), "Driver bond deposit failed"); }
        emit RideAccepted(rideId, r.driver, r.agreedFare);
    }

    function cancelNegotiation(uint256 rideId) external inState(rideId, RideState.REQUESTED) {
        Ride storage r = rides[rideId];
        require(msg.sender == r.rider || msg.sender == r.driver, "Only rider or driver can cancel");
        r.state = RideState.CANCELLED;
        emit RideCancelled(rideId);
    }

    function startRide(uint256 rideId) external onlyRider(rideId) inState(rideId, RideState.ACCEPTED) {
        Ride storage r = rides[rideId];
        r.startedAt = block.timestamp;
        r.state = RideState.IN_PROGRESS;
        emit RideStarted(rideId, block.timestamp);
    }

    function submitRouteLog(uint256 rideId, bytes32 _routeLogHash) external onlyDriver(rideId) inState(rideId, RideState.IN_PROGRESS) {
        rides[rideId].routeLogHash = _routeLogHash;
        emit RouteLogSubmitted(rideId, _routeLogHash);
    }

    function proposeAmendment(uint256 rideId, bytes32 _newDropoffHash, uint256 _newFare) external onlyRider(rideId) inState(rideId, RideState.IN_PROGRESS) {
        Ride storage r = rides[rideId];
        require(!r.amendmentPending, "Amendment already pending");
        require(_newFare >= r.bandMin && _newFare <= r.bandMax, "New fare outside band");
        r.amendmentPending = true;
        r.newDropoffHash = _newDropoffHash;
        r.newFareProposed = _newFare;
        emit AmendmentProposed(rideId, _newDropoffHash, _newFare);
    }

    function acceptAmendment(uint256 rideId) external onlyDriver(rideId) inState(rideId, RideState.IN_PROGRESS) nonReentrant {
        Ride storage r = rides[rideId];
        require(r.amendmentPending, "No amendment pending");
        uint256 oldFare = r.agreedFare;
        uint256 newFare = r.newFareProposed;
        if (newFare > oldFare) { require(usdc.transferFrom(r.rider, address(this), newFare - oldFare), "Additional fare payment failed"); }
        else if (newFare < oldFare) { require(usdc.transfer(r.rider, oldFare - newFare), "Fare refund failed"); }
        r.agreedFare = newFare;
        r.dropoffHash = r.newDropoffHash;
        r.amendmentPending = false;
        emit AmendmentAccepted(rideId, r.newDropoffHash, newFare);
    }

    function rejectAmendment(uint256 rideId) external onlyDriver(rideId) inState(rideId, RideState.IN_PROGRESS) {
        Ride storage r = rides[rideId];
        require(r.amendmentPending, "No amendment pending");
        r.amendmentPending = false;
        emit AmendmentRejected(rideId);
    }

    function completeRide(uint256 rideId) external onlyRider(rideId) inState(rideId, RideState.IN_PROGRESS) nonReentrant {
        Ride storage r = rides[rideId];
        require(!r.amendmentPending, "Resolve pending amendment first");
        r.completedAt = block.timestamp;
        r.state = RideState.COMPLETED;
        _settlePayment(rideId);
        _updateReputation(r.driver, r.rider);
    }

    function claimTimeout(uint256 rideId) external onlyDriver(rideId) inState(rideId, RideState.IN_PROGRESS) nonReentrant {
        Ride storage r = rides[rideId];
        require(r.state != RideState.DISPUTED, "Cannot timeout a disputed ride");
        require(!r.amendmentPending, "Resolve pending amendment first");
        uint256 deadline = r.startedAt + r.expectedDuration + timeoutWindow;
        require(block.timestamp >= deadline, "Timeout window has not passed yet");
        r.completedAt = block.timestamp;
        r.state = RideState.COMPLETED;
        _settlePayment(rideId);
        _updateReputation(r.driver, r.rider);
        emit TimeoutClaimed(rideId, msg.sender);
    }

    function _settlePayment(uint256 rideId) internal {
        Ride storage r = rides[rideId];
        uint256 fee = (r.agreedFare * platformFeePct) / 100;
        uint256 driverPayout = r.agreedFare - fee;
        require(usdc.transfer(r.driver, driverPayout), "Driver payout failed");
        if (r.driverBond > 0) { require(usdc.transfer(r.driver, r.driverBond), "Bond return failed"); }
        require(usdc.transfer(treasury, fee), "Treasury fee transfer failed");
        emit RideCompleted(rideId, driverPayout, fee);
    }

    function raiseDispute(uint256 rideId, bytes32 _evidenceHash) external inState(rideId, RideState.IN_PROGRESS) {
        Ride storage r = rides[rideId];
        require(msg.sender == r.rider || msg.sender == r.driver, "Only rider or driver can raise dispute");
        r.state = RideState.DISPUTED;
        r.evidenceHash = _evidenceHash;
        r.disputeRaisedBy = msg.sender;
        r.disputeTier = DisputeTier.AUTO;
        emit DisputeRaised(rideId, msg.sender, DisputeTier.AUTO);
        _attemptAutoResolution(rideId);
    }

    function _attemptAutoResolution(uint256 rideId) internal {
        Ride storage r = rides[rideId];
        if (r.routeLogHash == bytes32(0)) { _resolveDispute(rideId, r.rider, DisputeTier.AUTO); return; }
        r.disputeTier = DisputeTier.COMMUNITY;
        emit DisputeRaised(rideId, r.disputeRaisedBy, DisputeTier.COMMUNITY);
    }

    function resolveByPanel(uint256 rideId, address winner) external onlyOwner inState(rideId, RideState.DISPUTED) {
        _resolveDispute(rideId, winner, DisputeTier.COMMUNITY);
    }

    function _resolveDispute(uint256 rideId, address winner, DisputeTier tier) internal nonReentrant {
        Ride storage r = rides[rideId];
        r.state = RideState.COMPLETED;
        if (winner == r.rider) {
            require(usdc.transfer(r.rider, r.agreedFare), "Rider refund failed");
            if (r.driverBond > 0) { require(usdc.transfer(treasury, r.driverBond), "Bond slash failed"); }
            reputations[r.driver].disputesLost++;
            _recalculateTier(r.driver);
        } else {
            uint256 fee = (r.agreedFare * platformFeePct) / 100;
            uint256 driverPayout = r.agreedFare - fee;
            require(usdc.transfer(r.driver, driverPayout), "Driver payout failed");
            if (r.driverBond > 0) { require(usdc.transfer(r.driver, r.driverBond), "Bond return failed"); }
            require(usdc.transfer(treasury, fee), "Treasury fee failed");
            reputations[r.rider].disputesLost++;
            _recalculateTier(r.rider);
        }
        emit DisputeResolved(rideId, winner, tier);
    }

    function submitRating(uint256 rideId, uint256 score) external {
        Ride storage r = rides[rideId];
        require(r.state == RideState.COMPLETED, "Ride not completed");
        require(score >= 1 && score <= 5, "Score must be 1 to 5");
        require(msg.sender == r.rider || msg.sender == r.driver, "Only ride participants can rate");
        address rated = msg.sender == r.rider ? r.driver : r.rider;
        reputations[rated].ratingSum += score;
        reputations[rated].ratingCount++;
        _recalculateTier(rated);
        emit RatingSubmitted(rideId, msg.sender, rated, score);
    }

    function verifyDriver(address driver) external onlyOwner {
        reputations[driver].isVerifiedDriver = true;
        emit DriverVerified(driver);
    }

    function _updateReputation(address driver, address rider) internal {
        reputations[driver].totalRides++;
        reputations[driver].completionCount++;
        reputations[rider].totalRides++;
        _recalculateTier(driver);
        _recalculateTier(rider);
    }

    function _recalculateTier(address wallet) internal {
        Reputation storage rep = reputations[wallet];
        if (rep.totalRides < 10) { rep.tier = ReputationTier.NEW; return; }
        if (rep.ratingCount == 0) { rep.tier = ReputationTier.ESTABLISHED; return; }
        uint256 avgScore = (rep.ratingSum * 10) / rep.ratingCount;
        if (rep.disputesLost > 2) { avgScore = avgScore > 10 ? avgScore - 10 : 0; }
        if (avgScore >= 48) { rep.tier = ReputationTier.ELITE; }
        else if (avgScore >= 43) { rep.tier = ReputationTier.TRUSTED; }
        else if (avgScore >= 35) { rep.tier = ReputationTier.ESTABLISHED; }
        else { rep.tier = ReputationTier.NEW; }
    }

    function setPlatformFee(uint256 _pct) external onlyOwner {
        require(_pct <= 10, "Fee cannot exceed 10");
        platformFeePct = _pct;
    }

    function setBondPct(uint256 _pct) external onlyOwner {
        require(_pct <= 20, "Bond cannot exceed 20");
        bondPct = _pct;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    function setTimeoutWindow(uint256 _seconds) external onlyOwner {
        require(_seconds >= 10 minutes, "Timeout too short");
        timeoutWindow = _seconds;
    }

    function getRide(uint256 rideId) external view returns (Ride memory) { return rides[rideId]; }
    function getReputation(address wallet) external view returns (Reputation memory) { return reputations[wallet]; }
    function getAverageScore(address wallet) external view returns (uint256) {
        Reputation memory rep = reputations[wallet];
        if (rep.ratingCount == 0) return 0;
        return (rep.ratingSum * 10) / rep.ratingCount;
    }
}
