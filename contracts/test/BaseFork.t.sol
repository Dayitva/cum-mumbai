// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { XYCConcentrateArgsBuilder } from "swap-vm/instructions/XYCConcentrate.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "swap-vm/libs/TakerTraits.sol";
import { CumPrograms } from "../script/CumPrograms.sol";
import { AquaVault } from "../src/AquaVault.sol";
import { IPoseidonT3, IVerifier } from "../src/libs/pp/PrivateVault.sol";

/// The whole flow against 1inch's deployed Aqua and SwapVM router and real Base tokens.
/// Run with RUN_FORK_TESTS=true, and BASE_RPC_URL to use something other than the public RPC.
contract BaseForkTest is Test {
    address internal constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant ROUTER = 0x111111338c5091E8440b67B168bAe16a668AC0De;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    uint256 internal constant SHARE_WETH = 0.3e18;
    uint256 internal constant SHARE_USDC = 900e6;
    uint256 internal constant SHARE_USDT = 900e6;

    AquaVault internal vault;
    CumPrograms internal programs;
    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");
    address internal constant RECIPIENT = address(0xA1);

    function setUp() public {
        if (!vm.envOr("RUN_FORK_TESTS", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        programs = new CumPrograms(AQUA);
        IPoseidonT3 poseidon = IPoseidonT3(deployCode("Poseidon.sol:PoseidonT3"));
        address[] memory tokens = new address[](3);
        tokens[0] = WETH;
        tokens[1] = USDC;
        tokens[2] = USDT;
        uint256[] memory share = new uint256[](3);
        share[0] = SHARE_WETH;
        share[1] = SHARE_USDC;
        share[2] = SHARE_USDT;
        vault = new AquaVault(
            IAqua(AQUA), ROUTER, IVerifier(deployCode("HonkVerifier.sol:HonkVerifier")), poseidon, tokens, share, 1 days
        );

        vm.startPrank(lp);
        for (uint256 i = 0; i < tokens.length; i++) {
            deal(tokens[i], lp, 3 * share[i]);
            IERC20(tokens[i]).approve(address(vault), type(uint256).max);
        }
        vm.stopPrank();
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
        skip(1 days);
        vault.ship(order, tokens, amounts);
    }

    function _swap(ISwapVM.Order memory order, address tokenIn, address tokenOut, uint256 amountIn)
        internal
        returns (uint256 amountOut)
    {
        bytes memory takerData = TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: trader,
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
        vm.startPrank(trader);
        IERC20(tokenIn).approve(ROUTER, amountIn);
        (bool ok, bytes memory result) = ROUTER.call(
            abi.encodeCall(ISwapVM.swap, (order, tokenIn, tokenOut, amountIn, takerData))
        );
        vm.stopPrank();
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
        (, amountOut, ) = abi.decode(result, (uint256, uint256, bytes32));
    }

    function test_depositTradeWithdrawOnOfficialContracts() public {
        assertGt(AQUA.code.length, 0, "Aqua is deployed");
        assertGt(ROUTER.code.length, 0, "router is deployed");

        IPoseidonT3 poseidon = vault.poseidon();
        vm.startPrank(lp);
        uint256[] memory noMax = new uint256[](3);
        noMax[0] = noMax[1] = noMax[2] = type(uint256).max;
        vault.deposit(bytes32(poseidon.hash([uint256(11111111), 22222222])), noMax);
        vault.deposit(bytes32(poseidon.hash([uint256(33333333), 44444444])), noMax);
        vm.stopPrank();

        // WETH sorts below USDC. Spot 3000 USDC per WETH, range 2400 to 3750, in raw units.
        uint256 spot = 3000e6;
        (, uint256 shipWeth, uint256 shipUsdc) = XYCConcentrateArgsBuilder.computeLiquidityFromAmounts(
            2 * SHARE_WETH,
            2 * SHARE_USDC,
            Math.sqrt(spot * 1e18),
            Math.sqrt(2400e6 * 1e18),
            Math.sqrt(3750e6 * 1e18)
        );
        ISwapVM.Order memory volatilePair = programs.order(
            address(vault), programs.volatilePair(2400e6, 3750e6, 300, 30, 1)
        );
        _ship(volatilePair, WETH, USDC, shipWeth, shipUsdc);

        ISwapVM.Order memory peggedPair = programs.order(
            address(vault), programs.peggedPair(2 * SHARE_USDC, 2 * SHARE_USDT, 100e27, 1, 2)
        );
        _ship(peggedPair, USDC, USDT, 2 * SHARE_USDC, 2 * SHARE_USDT);

        // The same USDC backs both strategies.
        deal(USDC, trader, 200e6);
        uint256 wethOut = _swap(volatilePair, USDC, WETH, 100e6);
        assertGt(wethOut, 0);
        uint256 usdtOut = _swap(peggedPair, USDC, USDT, 100e6);
        assertGt(usdtOut, 99e6, "pegged pair should be close to 1:1");

        // The recipient is a short address that already holds dust on real Base, so measure the change.
        uint256 usdcBefore = IERC20(USDC).balanceOf(RECIPIENT);
        uint256 usdtBefore = IERC20(USDT).balanceOf(RECIPIENT);
        uint256 wethBefore = IERC20(WETH).balanceOf(RECIPIENT);
        console.log("recipient already held USDC:", usdcBefore);

        string memory json = vm.readFile("test/fixtures/note0.json");
        bytes32[] memory inputs = vm.parseJsonBytes32Array(json, ".publicInputs");
        vault.withdraw(vm.parseJsonBytes(json, ".proof"), inputs[0], inputs[1], RECIPIENT, address(0), 0);

        uint256 paidUsdc = IERC20(USDC).balanceOf(RECIPIENT) - usdcBefore;
        uint256 paidUsdt = IERC20(USDT).balanceOf(RECIPIENT) - usdtBefore;
        uint256 paidWeth = IERC20(WETH).balanceOf(RECIPIENT) - wethBefore;
        console.log("paid WETH:", paidWeth);
        console.log("paid USDC:", paidUsdc);
        console.log("paid USDT:", paidUsdt);

        // Half of each token left in the vault: two notes, 200 USDC traded in.
        assertEq(paidUsdc, SHARE_USDC + 100e6);
        assertEq(paidUsdt, (2 * SHARE_USDT - usdtOut) / 2);
        assertEq(paidWeth, (2 * SHARE_WETH - wethOut) / 2);
    }
}
