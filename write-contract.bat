@echo off
(
echo // SPDX-License-Identifier: MIT
echo pragma solidity ^0.8.20;
echo.
echo import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
echo import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
echo import "@openzeppelin/contracts/access/Ownable.sol";
echo.
echo contract RideHailing is ReentrancyGuard, Ownable {
echo.
echo     IERC20 public usdc;
echo     address public treasury;
echo     uint256 public platformFeePct = 5;
echo     uint256 public bondPct = 10;
echo     uint256 public timeoutWindow = 30 minutes;
echo     uint256 public negotiationRounds = 5;
echo     uint256 public negotiationWindow = 3 minutes;
echo     uint256 public bandMinPct = 75;
echo     uint256 public bandMaxPct = 133;
echo.
echo     enum RideState { REQUESTED, ACCEPTED, IN_PROGRESS, COMPLETED, DISPUTED, CANCELLED }
echo     enum DisputeTier { NONE, AUTO, COMMUNITY, KLEROS }
echo     enum ReputationTier { NEW, ESTABLISHED, TRUSTED, ELITE }
echo.
echo     struct Ride {
echo         address rider;
echo         address driver;
echo         bytes32 pickupHash;
echo         bytes32 dropoffHash;
echo         uint256 recommendedFare;
echo         uint256 bandMin;
echo         uint256 bandMax;
echo         uint256 currentOffer;
echo         address offerFrom;
echo         uint256 negotiationRoundsUsed;
echo         uint256 negotiationDeadline;
echo         uint256 agreedFare;
echo         uint256 driverBond;
echo         uint256 requestedAt;
echo         uint256 acceptedAt;
echo         uint256 startedAt;
echo         uint256 expectedDuration;
echo         uint256 completedAt;
echo         RideState state;
echo         bool amendmentPending;
echo         bytes32 newDropoffHash;
echo         uint256 newFareProposed;
echo         DisputeTier disputeTier;
echo         bytes32 evidenceHash;
echo         address disputeRaisedBy;
echo         bytes32 routeLogHash;
echo     }
echo.
echo     struct Reputation {
echo         uint256 totalRides;
echo         uint256 ratingSum;
echo         uint256 ratingCount;
echo         uint256 disputesLost;
echo         uint256 completionCount;
echo         bool isVerifiedDriver;
echo         ReputationTier tier;
echo     }
echo.
echo     mapping^(uint256 =^> Ride^) public rides;
echo     mapping^(address =^> Reputation^) public reputations;
echo     uint256 public rideCount;
echo.
echo     event RideRequested^(uint256 indexed rideId, address indexed rider, bytes32 pickupHash, bytes32 dropoffHash, uint256 recommendedFare, uint256 bandMin, uint256 bandMax^);
echo     event OfferMade^(uint256 indexed rideId, address indexed by, uint256 amount^);
echo     event RideAccepted^(uint256 indexed rideId, address indexed driver, uint256 agreedFare^);
echo     event RideStarted^(uint256 indexed rideId, uint256 startedAt^);
echo     event RideCompleted^(uint256 indexed rideId, uint256 driverPayout, uint256 treasuryFee^);
echo     event AmendmentProposed^(uint256 indexed rideId, bytes32 newDropoffHash, uint256 newFare^);
echo     event AmendmentAccepted^(uint256 indexed rideId, bytes32 newDropoffHash, uint256 newFare^);
echo     event AmendmentRejected^(uint256 indexed rideId^);
echo     event TimeoutClaimed^(uint256 indexed rideId, address driver^);
echo     event DisputeRaised^(uint256 indexed rideId, address by, DisputeTier tier^);
echo     event DisputeResolved^(uint256 indexed rideId, address winner, DisputeTier tier^);
echo     event RouteLogSubmitted^(uint256 indexed rideId, bytes32 routeLogHash^);
echo     event RideCancelled^(uint256 indexed rideId^);
echo     event DriverVerified^(address indexed driver^);
echo     event RatingSubmitted^(uint256 indexed rideId, address indexed rater, address indexed rated, uint256 score^);
echo.
echo     constructor^(address _usdc, address _treasury^) Ownable^(msg.sender^) {
echo         usdc = IERC20^(_usdc^);
echo         treasury = _treasury;
echo     }
echo.
echo     modifier onlyRider^(uint256 rideId^) {
echo         require^(msg.sender == rides[rideId].rider, "Only the rider can do this"^);
echo         _;
echo     }
echo.
echo     modifier onlyDriver^(uint256 rideId^) {
echo         require^(msg.sender == rides[rideId].driver, "Only the driver can do this"^);
echo         _;
echo     }
echo.
echo     modifier inState^(uint256 rideId, RideState expected^) {
echo         require^(rides[rideId].state == expected, "Ride is not in the required state"^);
echo         _;
echo     }
echo.
echo     function requestRide^(bytes32 _pickupHash, bytes32 _dropoffHash, uint256 _recommendedFare, uint256 _expectedDuration, uint256 _openingOffer^) external returns ^(uint256^) {
echo         require^(_recommendedFare ^> 0, "Fare must be greater than zero"^);
echo         uint256 bandMin = ^(_recommendedFare * bandMinPct^) / 100;
echo         uint256 bandMax = ^(_recommendedFare * bandMaxPct^) / 100;
echo         require^(_openingOffer ^>= bandMin ^&^& _openingOffer ^<= bandMax, "Opening offer outside negotiation band"^);
echo         rideCount++;
echo         uint256 rideId = rideCount;
echo         Ride storage r = rides[rideId];
echo         r.rider = msg.sender;
echo         r.pickupHash = _pickupHash;
echo         r.dropoffHash = _dropoffHash;
echo         r.recommendedFare = _recommendedFare;
echo         r.bandMin = bandMin;
echo         r.bandMax = bandMax;
echo         r.currentOffer = _openingOffer;
echo         r.offerFrom = msg.sender;
echo         r.negotiationDeadline = block.timestamp + negotiationWindow;
echo         r.requestedAt = block.timestamp;
echo         r.expectedDuration = _expectedDuration;
echo         r.state = RideState.REQUESTED;
echo         emit RideRequested^(rideId, msg.sender, _pickupHash, _dropoffHash, _recommendedFare, bandMin, bandMax^);
echo         emit OfferMade^(rideId, msg.sender, _openingOffer^);
echo         return rideId;
echo     }
echo.
echo     function acceptRecommended^(uint256 rideId^) external onlyRider^(rideId^) inState^(rideId, RideState.REQUESTED^) {
echo         Ride storage r = rides[rideId];
echo         r.currentOffer = r.recommendedFare;
echo         r.offerFrom = msg.sender;
echo         emit OfferMade^(rideId, msg.sender, r.recommendedFare^);
echo     }
echo.
echo     function counterOffer^(uint256 rideId, uint256 newFare^) external inState^(rideId, RideState.REQUESTED^) {
echo         Ride storage r = rides[rideId];
echo         require^(block.timestamp ^<= r.negotiationDeadline, "Negotiation window has closed"^);
echo         require^(r.negotiationRoundsUsed ^< negotiationRounds, "Maximum negotiation rounds reached"^);
echo         require^(newFare ^>= r.bandMin ^&^& newFare ^<= r.bandMax, "Offer outside negotiation band"^);
echo         require^(msg.sender != r.offerFrom, "Cannot counter your own offer"^);
echo         require^(msg.sender == r.rider ^|^| reputations[msg.sender].isVerifiedDriver, "Only rider or verified driver can counter"^);
echo         r.currentOffer = newFare;
echo         r.offerFrom = msg.sender;
echo         r.negotiationRoundsUsed++;
echo         emit OfferMade^(rideId, msg.sender, newFare^);
echo     }
echo.
echo     function acceptOffer^(uint256 rideId^) external nonReentrant inState^(rideId, RideState.REQUESTED^) {
echo         Ride storage r = rides[rideId];
echo         require^(block.timestamp ^<= r.negotiationDeadline, "Negotiation window has closed"^);
echo         require^(msg.sender != r.offerFrom, "Cannot accept your own offer"^);
echo         require^(msg.sender == r.rider ^|^| reputations[msg.sender].isVerifiedDriver, "Only rider or verified driver can accept"^);
echo         if ^(msg.sender != r.rider^) {
echo             require^(r.driver == address^(0^), "Ride already has a driver"^);
echo             r.driver = msg.sender;
echo         }
echo         r.agreedFare = r.currentOffer;
echo         ReputationTier driverTier = reputations[r.driver].tier;
echo         uint256 bond = 0;
echo         if ^(driverTier == ReputationTier.NEW ^|^| driverTier == ReputationTier.ESTABLISHED^) {
echo             bond = ^(r.agreedFare * bondPct^) / 100;
echo         } else if ^(driverTier == ReputationTier.TRUSTED^) {
echo             bond = ^(r.agreedFare * 5^) / 100;
echo         }
echo         r.driverBond = bond;
echo         r.acceptedAt = block.timestamp;
echo         r.state = RideState.ACCEPTED;
echo         require^(usdc.transferFrom^(r.rider, address^(this^), r.agreedFare^), "Rider USDC deposit failed"^);
echo         if ^(bond ^> 0^) { require^(usdc.transferFrom^(r.driver, address^(this^), bond^), "Driver bond deposit failed"^); }
echo         emit RideAccepted^(rideId, r.driver, r.agreedFare^);
echo     }
echo.
echo     function cancelNegotiation^(uint256 rideId^) external inState^(rideId, RideState.REQUESTED^) {
echo         Ride storage r = rides[rideId];
echo         require^(msg.sender == r.rider ^|^| msg.sender == r.driver, "Only rider or driver can cancel"^);
echo         r.state = RideState.CANCELLED;
echo         emit RideCancelled^(rideId^);
echo     }
echo.
echo     function startRide^(uint256 rideId^) external onlyRider^(rideId^) inState^(rideId, RideState.ACCEPTED^) {
echo         Ride storage r = rides[rideId];
echo         r.startedAt = block.timestamp;
echo         r.state = RideState.IN_PROGRESS;
echo         emit RideStarted^(rideId, block.timestamp^);
echo     }
echo.
echo     function submitRouteLog^(uint256 rideId, bytes32 _routeLogHash^) external onlyDriver^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) {
echo         rides[rideId].routeLogHash = _routeLogHash;
echo         emit RouteLogSubmitted^(rideId, _routeLogHash^);
echo     }
echo.
echo     function proposeAmendment^(uint256 rideId, bytes32 _newDropoffHash, uint256 _newFare^) external onlyRider^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) {
echo         Ride storage r = rides[rideId];
echo         require^(!r.amendmentPending, "Amendment already pending"^);
echo         require^(_newFare ^>= r.bandMin ^&^& _newFare ^<= r.bandMax, "New fare outside band"^);
echo         r.amendmentPending = true;
echo         r.newDropoffHash = _newDropoffHash;
echo         r.newFareProposed = _newFare;
echo         emit AmendmentProposed^(rideId, _newDropoffHash, _newFare^);
echo     }
echo.
echo     function acceptAmendment^(uint256 rideId^) external onlyDriver^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) nonReentrant {
echo         Ride storage r = rides[rideId];
echo         require^(r.amendmentPending, "No amendment pending"^);
echo         uint256 oldFare = r.agreedFare;
echo         uint256 newFare = r.newFareProposed;
echo         if ^(newFare ^> oldFare^) { require^(usdc.transferFrom^(r.rider, address^(this^), newFare - oldFare^), "Additional fare payment failed"^); }
echo         else if ^(newFare ^< oldFare^) { require^(usdc.transfer^(r.rider, oldFare - newFare^), "Fare refund failed"^); }
echo         r.agreedFare = newFare;
echo         r.dropoffHash = r.newDropoffHash;
echo         r.amendmentPending = false;
echo         emit AmendmentAccepted^(rideId, r.newDropoffHash, newFare^);
echo     }
echo.
echo     function rejectAmendment^(uint256 rideId^) external onlyDriver^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) {
echo         Ride storage r = rides[rideId];
echo         require^(r.amendmentPending, "No amendment pending"^);
echo         r.amendmentPending = false;
echo         emit AmendmentRejected^(rideId^);
echo     }
echo.
echo     function completeRide^(uint256 rideId^) external onlyRider^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) nonReentrant {
echo         Ride storage r = rides[rideId];
echo         require^(!r.amendmentPending, "Resolve pending amendment first"^);
echo         r.completedAt = block.timestamp;
echo         r.state = RideState.COMPLETED;
echo         _settlePayment^(rideId^);
echo         _updateReputation^(r.driver, r.rider^);
echo     }
echo.
echo     function claimTimeout^(uint256 rideId^) external onlyDriver^(rideId^) inState^(rideId, RideState.IN_PROGRESS^) nonReentrant {
echo         Ride storage r = rides[rideId];
echo         require^(r.state != RideState.DISPUTED, "Cannot timeout a disputed ride"^);
echo         require^(!r.amendmentPending, "Resolve pending amendment first"^);
echo         uint256 deadline = r.startedAt + r.expectedDuration + timeoutWindow;
echo         require^(block.timestamp ^>= deadline, "Timeout window has not passed yet"^);
echo         r.completedAt = block.timestamp;
echo         r.state = RideState.COMPLETED;
echo         _settlePayment^(rideId^);
echo         _updateReputation^(r.driver, r.rider^);
echo         emit TimeoutClaimed^(rideId, msg.sender^);
echo     }
echo.
echo     function _settlePayment^(uint256 rideId^) internal {
echo         Ride storage r = rides[rideId];
echo         uint256 fee = ^(r.agreedFare * platformFeePct^) / 100;
echo         uint256 driverPayout = r.agreedFare - fee;
echo         require^(usdc.transfer^(r.driver, driverPayout^), "Driver payout failed"^);
echo         if ^(r.driverBond ^> 0^) { require^(usdc.transfer^(r.driver, r.driverBond^), "Bond return failed"^); }
echo         require^(usdc.transfer^(treasury, fee^), "Treasury fee transfer failed"^);
echo         emit RideCompleted^(rideId, driverPayout, fee^);
echo     }
echo.
echo     function raiseDispute^(uint256 rideId, bytes32 _evidenceHash^) external inState^(rideId, RideState.IN_PROGRESS^) {
echo         Ride storage r = rides[rideId];
echo         require^(msg.sender == r.rider ^|^| msg.sender == r.driver, "Only rider or driver can raise dispute"^);
echo         r.state = RideState.DISPUTED;
echo         r.evidenceHash = _evidenceHash;
echo         r.disputeRaisedBy = msg.sender;
echo         r.disputeTier = DisputeTier.AUTO;
echo         emit DisputeRaised^(rideId, msg.sender, DisputeTier.AUTO^);
echo         _attemptAutoResolution^(rideId^);
echo     }
echo.
echo     function _attemptAutoResolution^(uint256 rideId^) internal {
echo         Ride storage r = rides[rideId];
echo         if ^(r.routeLogHash == bytes32^(0^)^) { _resolveDispute^(rideId, r.rider, DisputeTier.AUTO^); return; }
echo         r.disputeTier = DisputeTier.COMMUNITY;
echo         emit DisputeRaised^(rideId, r.disputeRaisedBy, DisputeTier.COMMUNITY^);
echo     }
echo.
echo     function resolveByPanel^(uint256 rideId, address winner^) external onlyOwner inState^(rideId, RideState.DISPUTED^) {
echo         _resolveDispute^(rideId, winner, DisputeTier.COMMUNITY^);
echo     }
echo.
echo     function _resolveDispute^(uint256 rideId, address winner, DisputeTier tier^) internal nonReentrant {
echo         Ride storage r = rides[rideId];
echo         r.state = RideState.COMPLETED;
echo         if ^(winner == r.rider^) {
echo             require^(usdc.transfer^(r.rider, r.agreedFare^), "Rider refund failed"^);
echo             if ^(r.driverBond ^> 0^) { require^(usdc.transfer^(treasury, r.driverBond^), "Bond slash failed"^); }
echo             reputations[r.driver].disputesLost++;
echo             _recalculateTier^(r.driver^);
echo         } else {
echo             uint256 fee = ^(r.agreedFare * platformFeePct^) / 100;
echo             uint256 driverPayout = r.agreedFare - fee;
echo             require^(usdc.transfer^(r.driver, driverPayout^), "Driver payout failed"^);
echo             if ^(r.driverBond ^> 0^) { require^(usdc.transfer^(r.driver, r.driverBond^), "Bond return failed"^); }
echo             require^(usdc.transfer^(treasury, fee^), "Treasury fee failed"^);
echo             reputations[r.rider].disputesLost++;
echo             _recalculateTier^(r.rider^);
echo         }
echo         emit DisputeResolved^(rideId, winner, tier^);
echo     }
echo.
echo     function submitRating^(uint256 rideId, uint256 score^) external {
echo         Ride storage r = rides[rideId];
echo         require^(r.state == RideState.COMPLETED, "Ride not completed"^);
echo         require^(score ^>= 1 ^&^& score ^<= 5, "Score must be 1 to 5"^);
echo         require^(msg.sender == r.rider ^|^| msg.sender == r.driver, "Only ride participants can rate"^);
echo         address rated = msg.sender == r.rider ? r.driver : r.rider;
echo         reputations[rated].ratingSum += score;
echo         reputations[rated].ratingCount++;
echo         _recalculateTier^(rated^);
echo         emit RatingSubmitted^(rideId, msg.sender, rated, score^);
echo     }
echo.
echo     function verifyDriver^(address driver^) external onlyOwner {
echo         reputations[driver].isVerifiedDriver = true;
echo         emit DriverVerified^(driver^);
echo     }
echo.
echo     function _updateReputation^(address driver, address rider^) internal {
echo         reputations[driver].totalRides++;
echo         reputations[driver].completionCount++;
echo         reputations[rider].totalRides++;
echo         _recalculateTier^(driver^);
echo         _recalculateTier^(rider^);
echo     }
echo.
echo     function _recalculateTier^(address wallet^) internal {
echo         Reputation storage rep = reputations[wallet];
echo         if ^(rep.totalRides ^< 10^) { rep.tier = ReputationTier.NEW; return; }
echo         if ^(rep.ratingCount == 0^) { rep.tier = ReputationTier.ESTABLISHED; return; }
echo         uint256 avgScore = ^(rep.ratingSum * 10^) / rep.ratingCount;
echo         if ^(rep.disputesLost ^> 2^) { avgScore = avgScore ^> 10 ? avgScore - 10 : 0; }
echo         if ^(avgScore ^>= 48^) { rep.tier = ReputationTier.ELITE; }
echo         else if ^(avgScore ^>= 43^) { rep.tier = ReputationTier.TRUSTED; }
echo         else if ^(avgScore ^>= 35^) { rep.tier = ReputationTier.ESTABLISHED; }
echo         else { rep.tier = ReputationTier.NEW; }
echo     }
echo.
echo     function setPlatformFee^(uint256 _pct^) external onlyOwner {
echo         require^(_pct ^<= 10, "Fee cannot exceed 10%"^);
echo         platformFeePct = _pct;
echo     }
echo.
echo     function setBondPct^(uint256 _pct^) external onlyOwner {
echo         require^(_pct ^<= 20, "Bond cannot exceed 20%"^);
echo         bondPct = _pct;
echo     }
echo.
echo     function setTreasury^(address _treasury^) external onlyOwner {
echo         require^(_treasury != address^(0^), "Invalid treasury address"^);
echo         treasury = _treasury;
echo     }
echo.
echo     function setTimeoutWindow^(uint256 _seconds^) external onlyOwner {
echo         require^(_seconds ^>= 10 minutes, "Timeout too short"^);
echo         timeoutWindow = _seconds;
echo     }
echo.
echo     function getRide^(uint256 rideId^) external view returns ^(Ride memory^) { return rides[rideId]; }
echo     function getReputation^(address wallet^) external view returns ^(Reputation memory^) { return reputations[wallet]; }
echo     function getAverageScore^(address wallet^) external view returns ^(uint256^) {
echo         Reputation memory rep = reputations[wallet];
echo         if ^(rep.ratingCount == 0^) return 0;
echo         return ^(rep.ratingSum * 10^) / rep.ratingCount;
echo     }
echo }
) > "C:\Users\hp\ridehailing-contracts\contracts\RideHailing.sol"
echo Done