// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Aqua } from "aqua/contracts/Aqua.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { IXYCSwapCallback } from "aqua/examples/apps/interfaces/IXYCSwapCallback.sol";
import { XYCSwap } from "aqua/examples/apps/XYCSwap.sol";
import { CumXYCSwap } from "../src/apps/CumXYCSwap.sol";
import { AquaVault } from "../src/AquaVault.sol";
import { ISwapLock } from "../src/interfaces/ISwapLock.sol";
import { PoseidonT3 } from "../src/libs/pp/Poseidon.sol";
import { IVerifier, PrivateVault } from "../src/libs/pp/PrivateVault.sol";

contract TestToken is ERC20 {
    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Pays for swaps from its own balance, and can act on the vault mid-swap.
contract Taker is IXYCSwapCallback {
    IAqua internal immutable aqua;
    AquaVault internal vault;
    bytes32 public depositDuringSwap;

    constructor(IAqua aqua_, AquaVault vault_) {
        aqua = aqua_;
        vault = vault_;
    }

    function setDepositDuringSwap(bytes32 commitment) external {
        depositDuringSwap = commitment;
    }

    function swap(XYCSwap app, XYCSwap.Strategy calldata strategy, bool zeroForOne, uint256 amountIn)
        external
        returns (uint256)
    {
        return app.swapExactIn(strategy, zeroForOne, amountIn, 0, address(this), "");
    }

    function xycSwapCallback(
        address tokenIn,
        address,
        uint256 amountIn,
        uint256,
        address maker,
        address app,
        bytes32 strategyHash,
        bytes calldata
    ) external {
        if (depositDuringSwap != bytes32(0)) {
            address[] memory tokens = vault.tokens();
            uint256[] memory maxAmounts = new uint256[](tokens.length);
            for (uint256 i = 0; i < tokens.length; i++) {
                maxAmounts[i] = type(uint256).max;
                IERC20(tokens[i]).approve(address(vault), type(uint256).max);
            }
            vault.deposit(depositDuringSwap, maxAmounts);
        }
        IERC20(tokenIn).approve(address(aqua), amountIn);
        aqua.push(maker, app, strategyHash, tokenIn, amountIn);
    }
}

contract AquaVaultTest is Test {
    uint256 internal constant DELAY = 2 days;
    uint256 internal constant SHARE0 = 1_000e18;
    uint256 internal constant SHARE1 = 2_000e18;
    uint256 internal constant FEE_BPS = 30;

    address internal constant RECIPIENT = address(0xA1);
    address internal constant RELAYER = address(0xB2);

    Aqua internal aqua;
    CumXYCSwap internal app;
    AquaVault internal vault;
    TestToken internal token0;
    TestToken internal token1;
    Taker internal taker;
    address[] internal pair;
    address internal lp = makeAddr("lp");

    bytes32 internal commitment0 = _hash(11111111, 22222222);
    bytes32 internal commitment1 = _hash(33333333, 44444444);

    function setUp() public {
        aqua = new Aqua();
        app = new CumXYCSwap(aqua);
        token0 = new TestToken("TK0");
        token1 = new TestToken("TK1");
        pair.push(address(token0));
        pair.push(address(token1));

        uint256[] memory share = new uint256[](2);
        share[0] = SHARE0;
        share[1] = SHARE1;
        vault = new AquaVault(aqua, IVerifier(deployCode("HonkVerifier.sol:HonkVerifier")), pair, share, DELAY);
        taker = new Taker(aqua, vault);

        token0.mint(lp, 1_000_000e18);
        token1.mint(lp, 1_000_000e18);
        token0.mint(address(taker), 1_000_000e18);
        token1.mint(address(taker), 1_000_000e18);
        vm.startPrank(lp);
        token0.approve(address(vault), type(uint256).max);
        token1.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function _hash(uint256 a, uint256 b) internal pure returns (bytes32) {
        return bytes32(PoseidonT3.hash([a, b]));
    }

    function _noMax() internal pure returns (uint256[] memory maxAmounts) {
        maxAmounts = new uint256[](2);
        maxAmounts[0] = type(uint256).max;
        maxAmounts[1] = type(uint256).max;
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

    function _shipStrategy(uint256 amount0, uint256 amount1) internal returns (XYCSwap.Strategy memory strategy) {
        strategy = XYCSwap.Strategy(address(vault), address(token0), address(token1), FEE_BPS, bytes32(amount0));
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount0;
        amounts[1] = amount1;
        bytes memory encoded = abi.encode(strategy);
        vault.proposeStrategy(app, encoded, pair, amounts);
        skip(DELAY);
        vault.ship(app, encoded, pair, amounts);
    }

    // Deposits

    function test_firstDepositPaysInitialAmounts() public {
        _deposit(commitment0);
        assertEq(token0.balanceOf(address(vault)), SHARE0);
        assertEq(token1.balanceOf(address(vault)), SHARE1);
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
        maxAmounts[1] = SHARE1 - 1;
        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(AquaVault.AmountAboveMax.selector, address(token1), SHARE1, SHARE1 - 1));
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

        assertEq(token0.balanceOf(RECIPIENT), SHARE0);
        assertEq(token1.balanceOf(RECIPIENT), SHARE1);
        assertEq(vault.activeNotes(), 1);

        vm.expectRevert(PrivateVault.NullifierAlreadyUsed.selector);
        _withdraw("note0");
    }

    function test_withdrawPaysRelayerFee() public {
        _deposit(commitment0);
        _deposit(commitment1);

        _withdraw("note1");

        assertEq(token0.balanceOf(RELAYER), SHARE0 / 100);
        assertEq(token1.balanceOf(RELAYER), SHARE1 / 100);
        assertEq(token0.balanceOf(RECIPIENT), SHARE0 - SHARE0 / 100);
        assertEq(token1.balanceOf(RECIPIENT), SHARE1 - SHARE1 / 100);
    }

    function test_withdrawCannotBeRedirected() public {
        _deposit(commitment0);
        (bytes memory proof, bytes32[] memory inputs) = _loadProof("note0");
        vm.expectRevert();
        vault.withdraw(proof, inputs[0], inputs[1], address(0xBAD), address(0), 0);
        assertEq(token0.balanceOf(address(0xBAD)), 0);
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
        XYCSwap.Strategy memory strategy = _shipStrategy(2 * SHARE0, 2 * SHARE1);

        taker.swap(app, strategy, true, 200e18);
        taker.swap(app, strategy, false, 400e18);

        uint256[] memory quote = vault.withdrawQuote();
        assertGt(quote[0] * quote[1], SHARE0 * SHARE1, "share value should grow");

        _withdraw("note0");
        assertEq(token0.balanceOf(RECIPIENT), quote[0]);
        assertEq(token1.balanceOf(RECIPIENT), quote[1]);
    }

    function test_lateDepositorDoesNotTakeEarlierYield() public {
        _deposit(commitment0);
        XYCSwap.Strategy memory strategy = _shipStrategy(SHARE0, SHARE1);
        taker.swap(app, strategy, true, 100e18);
        taker.swap(app, strategy, false, 200e18);

        uint256[] memory pricePaid = vault.depositQuote();
        _deposit(commitment1);

        uint256[] memory quote = vault.withdrawQuote();
        assertGe(pricePaid[0], quote[0]);
        assertGe(pricePaid[1], quote[1]);
        assertApproxEqAbs(pricePaid[0], quote[0], 1);
        assertApproxEqAbs(pricePaid[1], quote[1], 1);
    }

    function test_noteStaysWithdrawableAfterSwapsEmptyOneSide() public {
        _deposit(commitment0);
        XYCSwap.Strategy memory strategy = _shipStrategy(SHARE0, SHARE1);
        taker.swap(app, strategy, true, 100_000e18);

        _withdraw("note0");

        assertEq(token0.balanceOf(address(vault)), 0);
        assertEq(token1.balanceOf(address(vault)), 0);
        assertGt(token0.balanceOf(RECIPIENT), SHARE0);
    }

    // Swap in flight

    function test_cannotDepositInsideASwapCallback() public {
        _deposit(commitment0);
        XYCSwap.Strategy memory strategy = _shipStrategy(SHARE0, SHARE1);

        taker.setDepositDuringSwap(commitment1);
        vm.expectRevert(AquaVault.SwapInFlight.selector);
        taker.swap(app, strategy, true, 500e18);
    }

    function test_lockClearsAfterSwap() public {
        _deposit(commitment0);
        XYCSwap.Strategy memory strategy = _shipStrategy(SHARE0, SHARE1);
        taker.swap(app, strategy, true, 100e18);
        assertFalse(app.isSwapping(address(vault), keccak256(abi.encode(strategy))));
        _deposit(commitment1);
    }

    // Strategy control

    function _proposeDefault() internal returns (bytes memory encoded, uint256[] memory amounts, bytes32 id) {
        XYCSwap.Strategy memory strategy =
            XYCSwap.Strategy(address(vault), address(token0), address(token1), FEE_BPS, bytes32(0));
        encoded = abi.encode(strategy);
        amounts = new uint256[](2);
        amounts[0] = SHARE0;
        amounts[1] = SHARE1;
        id = vault.proposeStrategy(app, encoded, pair, amounts);
    }

    function test_strategyCannotShipBeforeDelay() public {
        (bytes memory encoded, uint256[] memory amounts, ) = _proposeDefault();
        vm.expectRevert(abi.encodeWithSelector(AquaVault.StrategyDelayPending.selector, block.timestamp + DELAY));
        vault.ship(app, encoded, pair, amounts);
    }

    function test_cannotShipWhatWasNotProposed() public {
        (bytes memory encoded, uint256[] memory amounts, ) = _proposeDefault();
        skip(DELAY);
        amounts[0] = amounts[0] * 2;
        vm.expectRevert(AquaVault.NotProposed.selector);
        vault.ship(app, encoded, pair, amounts);
    }

    function test_cancelledStrategyCannotShip() public {
        (bytes memory encoded, uint256[] memory amounts, bytes32 id) = _proposeDefault();
        vault.cancelStrategy(id);
        skip(DELAY);
        vm.expectRevert(AquaVault.NotProposed.selector);
        vault.ship(app, encoded, pair, amounts);
    }

    function test_strategyFunctionsAreOwnerOnly() public {
        (bytes memory encoded, uint256[] memory amounts, ) = _proposeDefault();
        vm.startPrank(lp);
        vm.expectRevert();
        vault.proposeStrategy(app, encoded, pair, amounts);
        vm.expectRevert();
        vault.ship(app, encoded, pair, amounts);
        vm.expectRevert();
        vault.dock(app, keccak256(encoded), pair);
        vm.stopPrank();
    }

    function test_dockRemovesStrategy() public {
        _deposit(commitment0);
        XYCSwap.Strategy memory strategy = _shipStrategy(SHARE0, SHARE1);
        bytes32 strategyHash = keccak256(abi.encode(strategy));
        assertEq(vault.activeStrategies().length, 1);

        vault.dock(app, strategyHash, pair);

        assertEq(vault.activeStrategies().length, 0);
        vm.expectRevert(AquaVault.StrategyNotActive.selector);
        vault.dock(app, strategyHash, pair);
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
