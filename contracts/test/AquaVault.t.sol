// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Aqua } from "aqua/contracts/Aqua.sol";
import { XYCConcentrateArgsBuilder } from "swap-vm/instructions/XYCConcentrate.sol";
import { ITakerCallbacks } from "swap-vm/interfaces/ITakerCallbacks.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { TakerTraitsLib } from "swap-vm/libs/TakerTraits.sol";
import { AquaSwapVMRouter } from "swap-vm/routers/AquaSwapVMRouter.sol";
import { CumPrograms } from "../script/CumPrograms.sol";
import { AquaVault } from "../src/AquaVault.sol";
import { IPoseidonT3, IVerifier, PrivateVault } from "../src/libs/pp/PrivateVault.sol";

contract TestToken is ERC20 {
    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Trades through the router, and can act on the vault from inside a swap.
contract Taker is ITakerCallbacks {
    enum Attack {
        None,
        Deposit,
        Withdraw
    }

    AquaSwapVMRouter internal immutable router;
    AquaVault internal immutable vault;
    Attack internal attack;
    bytes32 internal attackCommitment;
    bytes internal attackProof;
    bytes32[] internal attackInputs;

    constructor(AquaSwapVMRouter router_, AquaVault vault_) {
        router = router_;
        vault = vault_;
    }

    function attackWithDeposit(bytes32 commitment) external {
        attack = Attack.Deposit;
        attackCommitment = commitment;
    }

    function attackWithWithdraw(bytes calldata proof, bytes32[] calldata inputs) external {
        attack = Attack.Withdraw;
        attackProof = proof;
        attackInputs = inputs;
    }

    function swap(ISwapVM.Order calldata order, address tokenIn, address tokenOut, uint256 amountIn, bool takerPaysFirst)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).approve(address(router), amountIn);
        bytes memory takerData = TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(this),
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: takerPaysFirst,
            useTransferFromAndAquaPush: true,
            threshold: "",
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: attack != Attack.None,
            hasPreTransferOutCallback: attack != Attack.None,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: "",
            signature: ""
        }));
        (, amountOut, ) = router.swap(order, tokenIn, tokenOut, amountIn, takerData);
    }

    function preTransferInCallback(address, address, address, address, uint256, uint256, bytes32, bytes calldata)
        external
    {
        _attack();
    }

    function preTransferOutCallback(address, address, address, address, uint256, uint256, bytes32, bytes calldata)
        external
    {
        _attack();
    }

    function _attack() internal {
        if (attack == Attack.Deposit) {
            address[] memory tokens = vault.tokens();
            uint256[] memory maxAmounts = new uint256[](tokens.length);
            for (uint256 i = 0; i < tokens.length; i++) {
                maxAmounts[i] = type(uint256).max;
                IERC20(tokens[i]).approve(address(vault), type(uint256).max);
            }
            vault.deposit(attackCommitment, maxAmounts);
        } else if (attack == Attack.Withdraw) {
            vault.withdraw(
                attackProof,
                attackInputs[0],
                attackInputs[1],
                address(uint160(uint256(attackInputs[2]))),
                address(uint160(uint256(attackInputs[3]))),
                uint256(attackInputs[4])
            );
        }
    }
}

contract AquaVaultTest is Test {
    uint256 internal constant DELAY = 2 days;
    uint256 internal constant SHARE = 1_000e18;
    uint32 internal constant FEE_BPS = 30;
    uint16 internal constant DECAY = 300;

    address internal constant RECIPIENT = address(0xA1);
    address internal constant RELAYER = address(0xB2);

    Aqua internal aqua;
    AquaSwapVMRouter internal router;
    CumPrograms internal programs;
    IPoseidonT3 internal poseidon;
    AquaVault internal vault;
    TestToken internal stableA;
    TestToken internal stableB;
    TestToken internal volatileToken;
    Taker internal taker;
    address internal lp = makeAddr("lp");

    bytes32 internal commitment0;
    bytes32 internal commitment1;
    uint64 internal nextSalt = 1;

    function setUp() public {
        aqua = new Aqua();
        router = new AquaSwapVMRouter(address(aqua), address(0), address(this), "SwapVM", "1.0.0");
        programs = new CumPrograms(address(aqua));
        poseidon = IPoseidonT3(deployCode("Poseidon.sol:PoseidonT3"));
        commitment0 = bytes32(poseidon.hash([uint256(11111111), 22222222]));
        commitment1 = bytes32(poseidon.hash([uint256(33333333), 44444444]));

        stableA = new TestToken("STA");
        stableB = new TestToken("STB");
        volatileToken = new TestToken("VOL");

        address[] memory tokens = new address[](3);
        tokens[0] = address(stableA);
        tokens[1] = address(stableB);
        tokens[2] = address(volatileToken);
        uint256[] memory share = new uint256[](3);
        share[0] = SHARE;
        share[1] = SHARE;
        share[2] = SHARE;
        vault = new AquaVault(
            aqua, address(router), IVerifier(deployCode("HonkVerifier.sol:HonkVerifier")), poseidon, tokens, share, DELAY
        );
        taker = new Taker(router, vault);

        for (uint256 i = 0; i < tokens.length; i++) {
            TestToken token = TestToken(tokens[i]);
            token.mint(lp, 1_000_000e18);
            token.mint(address(taker), 1_000_000e18);
            vm.prank(lp);
            token.approve(address(vault), type(uint256).max);
        }
    }

    function _noMax() internal pure returns (uint256[] memory maxAmounts) {
        maxAmounts = new uint256[](3);
        maxAmounts[0] = type(uint256).max;
        maxAmounts[1] = type(uint256).max;
        maxAmounts[2] = type(uint256).max;
    }

    function _deposit(bytes32 commitment) internal {
        vm.prank(lp);
        vault.deposit(commitment, _noMax());
    }

    function _loadProof(string memory note) internal view returns (bytes memory proof, bytes32[] memory inputs) {
        string memory json = vm.readFile(string.concat("test/fixtures/", note, ".json"));
        proof = vm.parseJsonBytes(json, ".proof");
        inputs = vm.parseJsonBytes32Array(json, ".publicInputs");
    }

    function _withdraw(string memory note) internal {
        (bytes memory proof, bytes32[] memory inputs) = _loadProof(note);
        vault.withdraw(
            proof,
            inputs[0],
            inputs[1],
            address(uint160(uint256(inputs[2]))),
            address(uint160(uint256(inputs[3]))),
            uint256(inputs[4])
        );
    }

    function _ship(ISwapVM.Order memory order, address token0, address token1, uint256 amount0, uint256 amount1)
        internal
    {
        address[] memory tokens = new address[](2);
        tokens[0] = token0;
        tokens[1] = token1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount0;
        amounts[1] = amount1;
        vault.proposeStrategy(order, tokens, amounts);
        skip(DELAY);
        vault.ship(order, tokens, amounts);
    }

    function _shipVolatile(uint256 amountEach, uint16 decayPeriod, uint32 feeBps)
        internal
        returns (ISwapVM.Order memory order)
    {
        // Symmetric bounds around a spot of 1 need equal amounts, whichever token sorts first.
        order = programs.order(
            address(vault), programs.volatilePair(0.8e18, 1.25e18, decayPeriod, feeBps, nextSalt++)
        );
        _ship(order, address(stableA), address(volatileToken), amountEach, amountEach);
    }

    function _shipPegged(uint256 amountEach) internal returns (ISwapVM.Order memory order) {
        order = programs.order(address(vault), programs.peggedPair(amountEach, amountEach, 100e27, 1, nextSalt++));
        _ship(order, address(stableA), address(stableB), amountEach, amountEach);
    }

    function _roundTripVolatile(ISwapVM.Order memory order, uint256 amountIn) internal {
        uint256 out = taker.swap(order, address(stableA), address(volatileToken), amountIn, true);
        skip(DECAY);
        taker.swap(order, address(volatileToken), address(stableA), out, true);
        skip(DECAY);
    }

    /// Attacker buys, victim buys, attacker sells. Returns what the attacker gained or lost.
    function _sandwich(ISwapVM.Order memory order) internal returns (int256 profit) {
        address tokenIn = address(stableA);
        address tokenOut = address(volatileToken);
        Taker attacker = new Taker(router, vault);
        Taker victim = new Taker(router, vault);
        stableA.mint(address(attacker), 200e18);
        stableA.mint(address(victim), 200e18);

        uint256 bought = attacker.swap(order, tokenIn, tokenOut, 200e18, true);
        victim.swap(order, tokenIn, tokenOut, 200e18, true);
        uint256 sold = attacker.swap(order, tokenOut, tokenIn, bought, true);
        profit = int256(sold) - int256(200e18);
    }

    // Deposits

    function test_firstDepositPaysInitialAmounts() public {
        _deposit(commitment0);
        assertEq(stableA.balanceOf(address(vault)), SHARE);
        assertEq(stableB.balanceOf(address(vault)), SHARE);
        assertEq(volatileToken.balanceOf(address(vault)), SHARE);
        assertEq(vault.activeNotes(), 1);
    }

    function test_rootsMatchTheProofFixtures() public {
        (, bytes32[] memory inputs0) = _loadProof("note0");
        (, bytes32[] memory inputs1) = _loadProof("note1");
        _deposit(commitment0);
        assertEq(vault.currentRoot(), inputs0[0]);
        _deposit(commitment1);
        assertEq(vault.currentRoot(), inputs1[0]);
    }

    function test_depositRespectsMaxAmounts() public {
        uint256[] memory maxAmounts = _noMax();
        maxAmounts[1] = SHARE - 1;
        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(AquaVault.AmountAboveMax.selector, address(stableB), SHARE, SHARE - 1));
        vault.deposit(commitment0, maxAmounts);
    }

    function test_rejectsBadCommitments() public {
        vm.startPrank(lp);
        vm.expectRevert(PrivateVault.InvalidCommitment.selector);
        vault.deposit(bytes32(0), _noMax());
        vm.expectRevert(PrivateVault.InvalidCommitment.selector);
        vault.deposit(bytes32(type(uint256).max), _noMax());
        vault.deposit(commitment0, _noMax());
        vm.expectRevert(PrivateVault.CommitmentAlreadyUsed.selector);
        vault.deposit(commitment0, _noMax());
        vm.stopPrank();
    }

    function test_oldRootsExpire() public {
        _deposit(commitment0);
        bytes32 first = vault.currentRoot();
        for (uint256 i = 1; i < vault.ROOT_HISTORY_SIZE(); i++) {
            _deposit(bytes32(1000 + i));
        }
        assertTrue(vault.isKnownRoot(first));
        _deposit(bytes32(uint256(5000)));
        assertFalse(vault.isKnownRoot(first));
    }

    // Withdrawals, with real proofs

    function test_withdrawPaysShareAndSpendsNote() public {
        _deposit(commitment0);
        _deposit(commitment1);

        _withdraw("note0");

        assertEq(stableA.balanceOf(RECIPIENT), SHARE);
        assertEq(stableB.balanceOf(RECIPIENT), SHARE);
        assertEq(volatileToken.balanceOf(RECIPIENT), SHARE);
        assertEq(vault.activeNotes(), 1);

        vm.expectRevert(PrivateVault.NullifierAlreadyUsed.selector);
        _withdraw("note0");
    }

    function test_withdrawPaysRelayerFee() public {
        _deposit(commitment0);
        _deposit(commitment1);

        _withdraw("note1");

        assertEq(stableA.balanceOf(RELAYER), SHARE / 100);
        assertEq(stableA.balanceOf(RECIPIENT), SHARE - SHARE / 100);
    }

    function test_withdrawCannotBeRedirected() public {
        _deposit(commitment0);
        (bytes memory proof, bytes32[] memory inputs) = _loadProof("note0");
        vm.expectRevert();
        vault.withdraw(proof, inputs[0], inputs[1], address(0xBAD), address(0), 0);
        assertEq(stableA.balanceOf(address(0xBAD)), 0);
    }

    function test_withdrawRejectsUnknownRoot() public {
        _deposit(commitment0);
        (bytes memory proof, bytes32[] memory inputs) = _loadProof("note1");
        vm.expectRevert(PrivateVault.UnknownRoot.selector);
        vault.withdraw(proof, inputs[0], inputs[1], RECIPIENT, RELAYER, uint256(inputs[4]));
    }

    function test_withdrawRejectsFeeWithoutRelayer() public {
        _deposit(commitment0);
        (bytes memory proof, bytes32[] memory inputs) = _loadProof("note0");
        vm.expectRevert(AquaVault.InvalidFee.selector);
        vault.withdraw(proof, inputs[0], inputs[1], RECIPIENT, address(0), 1);
    }

    // Yield

    function test_swapFeesRaiseWhatANoteIsWorth() public {
        _deposit(commitment0);
        _deposit(commitment1);
        ISwapVM.Order memory order = _shipVolatile(2 * SHARE, DECAY, FEE_BPS);

        _roundTripVolatile(order, 200e18);

        uint256[] memory quote = vault.withdrawQuote();
        assertGt(quote[0] + quote[2], 2 * SHARE, "share value should grow");

        _withdraw("note0");
        assertEq(stableA.balanceOf(RECIPIENT), quote[0]);
        assertEq(volatileToken.balanceOf(RECIPIENT), quote[2]);
    }

    function test_lateDepositorDoesNotTakeEarlierYield() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        _roundTripVolatile(order, 100e18);

        uint256[] memory pricePaid = vault.depositQuote();
        _deposit(commitment1);

        uint256[] memory quote = vault.withdrawQuote();
        for (uint256 i = 0; i < quote.length; i++) {
            assertGe(pricePaid[i], quote[i]);
            assertApproxEqAbs(pricePaid[i], quote[i], 1);
        }
    }

    // Two strategies, one balance

    function test_oneBalanceBacksTwoStrategiesAndEarnsInBoth() public {
        _deposit(commitment0);
        ISwapVM.Order memory volatilePair = _shipVolatile(SHARE, DECAY, FEE_BPS);
        ISwapVM.Order memory peggedPair = _shipPegged(SHARE);

        (uint248 backingVolatile, ) = aqua.rawBalances(
            address(vault), address(router), keccak256(abi.encode(volatilePair)), address(stableA)
        );
        (uint248 backingPegged, ) = aqua.rawBalances(
            address(vault), address(router), keccak256(abi.encode(peggedPair)), address(stableA)
        );
        assertEq(uint256(backingVolatile) + backingPegged, 2 * stableA.balanceOf(address(vault)));

        uint256 valueBefore = _totalValue();
        _roundTripVolatile(volatilePair, 50e18);
        uint256 afterVolatile = _totalValue();
        assertGt(afterVolatile, valueBefore, "volatile strategy should earn");

        uint256 out = taker.swap(peggedPair, address(stableA), address(stableB), 50e18, true);
        taker.swap(peggedPair, address(stableB), address(stableA), out, true);
        assertGt(_totalValue(), afterVolatile, "pegged strategy should earn");
    }

    function _totalValue() internal view returns (uint256) {
        return stableA.balanceOf(address(vault)) + stableB.balanceOf(address(vault))
            + volatileToken.balanceOf(address(vault));
    }

    function test_concentrationTightensThePrice() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, 0);
        uint256 out = taker.swap(order, address(stableA), address(volatileToken), 50e18, true);
        // A plain x*y=k pool with this balance would pay 47.6 for 50.
        assertGt(out, 49e18);
    }

    function test_quoteMatchesSwap() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        bytes memory takerData = TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(taker),
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: true,
            useTransferFromAndAquaPush: true,
            threshold: "",
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: false,
            hasPreTransferOutCallback: false,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: "",
            signature: ""
        }));
        vm.prank(address(taker));
        (, uint256 quoted, ) = router.quote(order, address(stableA), address(volatileToken), 50e18, takerData);
        uint256 out = taker.swap(order, address(stableA), address(volatileToken), 50e18, true);
        assertEq(out, quoted);
    }

    // Sandwich resistance

    function test_decayTurnsAProfitableSandwichIntoALoss() public {
        _deposit(commitment0);
        ISwapVM.Order memory plain = _shipVolatile(SHARE, 0, 1);
        ISwapVM.Order memory protected = _shipVolatile(SHARE, DECAY, 1);

        int256 profitPlain = _sandwich(plain);
        int256 profitProtected = _sandwich(protected);

        console.log("sandwich profit without decay (1e18 = 1 token):");
        console.logInt(profitPlain);
        console.log("sandwich profit with decay:");
        console.logInt(profitProtected);
        assertGt(profitPlain, 0);
        assertLt(profitProtected, 0);
    }

    // Swap in flight

    function test_cannotDepositWhileTakerOwesTokensIn() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        taker.attackWithDeposit(commitment1);
        vm.expectRevert(AquaVault.SwapInFlight.selector);
        taker.swap(order, address(stableA), address(volatileToken), 500e18, false);
    }

    function test_cannotDepositBeforeTokensOutLeave() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        taker.attackWithDeposit(commitment1);
        vm.expectRevert(AquaVault.SwapInFlight.selector);
        taker.swap(order, address(stableA), address(volatileToken), 500e18, true);
    }

    function test_cannotWithdrawInsideASwap() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        (bytes memory proof, bytes32[] memory inputs) = _loadProof("note0");
        taker.attackWithWithdraw(proof, inputs);
        vm.expectRevert(AquaVault.SwapInFlight.selector);
        taker.swap(order, address(stableA), address(volatileToken), 500e18, true);
    }

    function test_guardClearsAfterASwap() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        taker.swap(order, address(stableA), address(volatileToken), 100e18, true);
        _deposit(commitment1);
        assertEq(vault.activeNotes(), 2);
    }

    function test_hooksOnlyRespondToTheRouterRunningAnActiveStrategy() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        bytes32 active = keccak256(abi.encode(order));

        vm.expectRevert(AquaVault.NotFromActiveStrategy.selector);
        vault.postTransferIn(address(vault), address(0), address(0), address(0), 0, 0, active, "", "");

        vm.startPrank(address(router));
        vm.expectRevert(AquaVault.NotFromActiveStrategy.selector);
        vault.postTransferOut(address(this), address(0), address(0), address(0), 0, 0, active, "", "");
        vm.expectRevert(AquaVault.NotFromActiveStrategy.selector);
        vault.postTransferOut(address(vault), address(0), address(0), address(0), 0, 0, bytes32(uint256(1)), "", "");
        vm.stopPrank();
    }

    // Strategy control

    function _defaultProposal()
        internal
        view
        returns (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts)
    {
        order = programs.order(address(vault), programs.volatilePair(0.8e18, 1.25e18, DECAY, FEE_BPS, 99));
        tokens = new address[](2);
        tokens[0] = address(stableA);
        tokens[1] = address(volatileToken);
        amounts = new uint256[](2);
        amounts[0] = SHARE;
        amounts[1] = SHARE;
    }

    function test_strategyCannotShipBeforeDelay() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        vault.proposeStrategy(order, tokens, amounts);
        vm.expectRevert(abi.encodeWithSelector(AquaVault.StrategyDelayPending.selector, block.timestamp + DELAY));
        vault.ship(order, tokens, amounts);
    }

    function test_cannotShipWhatWasNotProposed() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        vault.proposeStrategy(order, tokens, amounts);
        skip(DELAY);
        amounts[0] = amounts[0] * 2;
        vm.expectRevert(AquaVault.NotProposed.selector);
        vault.ship(order, tokens, amounts);
    }

    function test_cancelledStrategyCannotShip() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        bytes32 id = vault.proposeStrategy(order, tokens, amounts);
        vault.cancelStrategy(id);
        skip(DELAY);
        vm.expectRevert(AquaVault.NotProposed.selector);
        vault.ship(order, tokens, amounts);
    }

    function test_rejectsStrategyWithoutTheHooks() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        order.traits = MakerTraits.wrap(
            MakerTraits.unwrap(order.traits) & ~MakerTraitsLib.HAS_POST_TRANSFER_OUT_HOOK_BIT_FLAG
        );
        vm.expectRevert(AquaVault.InvalidStrategy.selector);
        vault.proposeStrategy(order, tokens, amounts);
    }

    function test_rejectsStrategyWhoseHooksPointElsewhere() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        order.traits = MakerTraits.wrap(
            MakerTraits.unwrap(order.traits) | MakerTraitsLib.PRE_TRANSFER_IN_HOOK_HAS_TARGET
        );
        vm.expectRevert(AquaVault.InvalidStrategy.selector);
        vault.proposeStrategy(order, tokens, amounts);
    }

    function test_rejectsStrategyForAnotherMaker() public {
        (, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        ISwapVM.Order memory order = programs.order(address(this), programs.peggedPair(SHARE, SHARE, 0.8e27, 1, 1));
        vm.expectRevert(AquaVault.InvalidStrategy.selector);
        vault.proposeStrategy(order, tokens, amounts);
    }

    function test_strategyFunctionsAreOwnerOnly() public {
        (ISwapVM.Order memory order, address[] memory tokens, uint256[] memory amounts) = _defaultProposal();
        vault.proposeStrategy(order, tokens, amounts);
        vm.startPrank(lp);
        vm.expectRevert();
        vault.proposeStrategy(order, tokens, amounts);
        vm.expectRevert();
        vault.ship(order, tokens, amounts);
        vm.expectRevert();
        vault.dock(keccak256(abi.encode(order)), tokens);
        vm.stopPrank();
    }

    function test_dockClosesStrategy() public {
        _deposit(commitment0);
        ISwapVM.Order memory order = _shipVolatile(SHARE, DECAY, FEE_BPS);
        bytes32 strategyHash = keccak256(abi.encode(order));
        address[] memory tokens = new address[](2);
        tokens[0] = address(stableA);
        tokens[1] = address(volatileToken);

        vault.dock(strategyHash, tokens);

        assertFalse(vault.isActiveStrategy(strategyHash));
        vm.expectRevert(AquaVault.StrategyNotActive.selector);
        vault.dock(strategyHash, tokens);
        vm.expectRevert();
        taker.swap(order, address(stableA), address(volatileToken), 1e18, true);
    }

    function test_gasReport() public {
        uint256 start = gasleft();
        _deposit(commitment0);
        console.log("first deposit gas:", start - gasleft());
        start = gasleft();
        _deposit(commitment1);
        console.log("second deposit gas:", start - gasleft());
        start = gasleft();
        _withdraw("note0");
        console.log("withdraw gas:", start - gasleft());
    }
}
