// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Aqua } from "aqua/contracts/Aqua.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { XYCConcentrateArgsBuilder } from "swap-vm/instructions/XYCConcentrate.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { AquaSwapVMRouter } from "swap-vm/routers/AquaSwapVMRouter.sol";
import { AquaVault } from "../src/AquaVault.sol";
import { IPoseidonT3, IVerifier } from "../src/libs/pp/PrivateVault.sol";
import { MockFaucet } from "../src/mocks/MockFaucet.sol";
import { MockToken } from "../src/mocks/MockToken.sol";
import { CumPrograms } from "./CumPrograms.sol";

/// Deploys everything on Base Sepolia, where 1inch has not deployed Aqua or SwapVM, so this uses
/// unmodified copies of both, and mock tokens. Use scripts/deploy-sepolia.sh.
contract DeploySepolia is Script {
    uint256 internal constant SHARE_WETH = 0.3e18;
    uint256 internal constant SHARE_USDC = 900e6;
    uint256 internal constant SHARE_USDT = 900e6;
    uint256 internal constant SEED_NOTES = 5;
    uint16 internal constant DECAY = 300;
    uint32 internal constant FEE_BPS = 30;

    string internal constant STATE_PATH = "../app/lib/deployment.sepolia.json";

    struct Tokens {
        MockToken weth;
        MockToken usdc;
        MockToken usdt;
    }

    /// The main vault, timelocked, and a separate sandbox for the recorded sandwich comparison.
    function deploy(
        IPoseidonT3 poseidon,
        IVerifier verifier,
        address relayer,
        uint256 strategyDelay,
        Aqua aqua,
        AquaSwapVMRouter router,
        MockToken weth,
        MockToken usdc,
        MockToken usdt
    ) external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        Tokens memory tokens = Tokens(weth, usdc, usdt);

        vm.startBroadcast(key);
        MockFaucet faucet = new MockFaucet(tokens.weth, tokens.usdc, tokens.usdt);

        AquaVault vault = _newVault(aqua, router, verifier, poseidon, tokens, strategyDelay);
        AquaVault sandbox = _newVault(aqua, router, verifier, poseidon, tokens, 0);

        tokens.weth.mint(deployer, 1_000e18);
        tokens.usdc.mint(deployer, 10_000_000e6);
        tokens.usdt.mint(deployer, 10_000_000e6);
        _seed(vault, poseidon, tokens, "seed");
        _seed(sandbox, poseidon, tokens, "sandbox");
        vm.stopBroadcast();

        // Off-chain helper only: outside any broadcast, so it is never deployed.
        CumPrograms programs = new CumPrograms(address(aqua));
        (ISwapVM.Order memory volatilePair, uint256[] memory volatileAmounts) =
            _volatileStrategy(programs, address(vault), tokens, DECAY, 1);
        (ISwapVM.Order memory peggedPair, uint256[] memory peggedAmounts) =
            _peggedStrategy(programs, address(vault), 2);
        (ISwapVM.Order memory sandboxPlain, ) = _volatileStrategy(programs, address(sandbox), tokens, 0, 3);
        (ISwapVM.Order memory sandboxDecay, ) = _volatileStrategy(programs, address(sandbox), tokens, DECAY, 4);

        address[] memory volatileTokens = _pair(address(tokens.weth), address(tokens.usdc));
        address[] memory peggedTokens = _pair(address(tokens.usdc), address(tokens.usdt));

        vm.startBroadcast(key);
        vault.proposeStrategy(volatilePair, volatileTokens, volatileAmounts);
        vault.proposeStrategy(peggedPair, peggedTokens, peggedAmounts);
        sandbox.proposeStrategy(sandboxPlain, volatileTokens, volatileAmounts);
        sandbox.ship(sandboxPlain, volatileTokens, volatileAmounts);
        sandbox.proposeStrategy(sandboxDecay, volatileTokens, volatileAmounts);
        sandbox.ship(sandboxDecay, volatileTokens, volatileAmounts);
        vm.stopBroadcast();

        string memory state = "state";
        vm.serializeUint(state, "chainId", block.chainid);
        vm.serializeAddress(state, "deployer", deployer);
        vm.serializeAddress(state, "relayer", relayer);
        vm.serializeAddress(state, "faucet", address(faucet));
        vm.serializeAddress(state, "aqua", address(aqua));
        vm.serializeAddress(state, "router", address(router));
        vm.serializeAddress(state, "poseidon", address(poseidon));
        vm.serializeAddress(state, "verifier", address(verifier));
        vm.serializeAddress(state, "vault", address(vault));
        vm.serializeAddress(state, "sandbox", address(sandbox));
        vm.serializeAddress(state, "weth", address(tokens.weth));
        vm.serializeAddress(state, "usdc", address(tokens.usdc));
        vm.serializeAddress(state, "usdt", address(tokens.usdt));
        vm.serializeUint(state, "seedNotes", SEED_NOTES);
        vm.serializeUint(state, "strategyDelay", strategyDelay);
        vm.serializeString(state, "volatileStrategy", _strategyJson("volatile", volatilePair, volatileAmounts));
        vm.serializeString(state, "peggedStrategy", _strategyJson("pegged", peggedPair, peggedAmounts));
        vm.serializeString(state, "noDecayStrategy", _strategyJson("noDecay", sandboxPlain, volatileAmounts));
        string memory json =
            vm.serializeString(state, "freshDecayStrategy", _strategyJson("freshDecay", sandboxDecay, volatileAmounts));
        vm.writeJson(json, STATE_PATH);
    }

    /// Run once the main vault's timelock has passed.
    function ship(AquaVault vault) external {
        address[] memory held = vault.tokens();
        Tokens memory tokens = Tokens(MockToken(held[0]), MockToken(held[1]), MockToken(held[2]));
        CumPrograms programs = new CumPrograms(address(vault.aqua()));
        (ISwapVM.Order memory volatilePair, uint256[] memory volatileAmounts) =
            _volatileStrategy(programs, address(vault), tokens, DECAY, 1);
        (ISwapVM.Order memory peggedPair, uint256[] memory peggedAmounts) =
            _peggedStrategy(programs, address(vault), 2);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        vault.ship(volatilePair, _pair(held[0], held[1]), volatileAmounts);
        vault.ship(peggedPair, _pair(held[1], held[2]), peggedAmounts);
        vm.stopBroadcast();
    }

    function _newVault(
        Aqua aqua,
        AquaSwapVMRouter router,
        IVerifier verifier,
        IPoseidonT3 poseidon,
        Tokens memory tokens,
        uint256 strategyDelay
    ) internal returns (AquaVault) {
        address[] memory held = new address[](3);
        held[0] = address(tokens.weth);
        held[1] = address(tokens.usdc);
        held[2] = address(tokens.usdt);
        uint256[] memory share = new uint256[](3);
        share[0] = SHARE_WETH;
        share[1] = SHARE_USDC;
        share[2] = SHARE_USDT;
        return new AquaVault(IAqua(address(aqua)), address(router), verifier, poseidon, held, share, strategyDelay);
    }

    function _seed(AquaVault vault, IPoseidonT3 poseidon, Tokens memory tokens, string memory label) internal {
        tokens.weth.approve(address(vault), type(uint256).max);
        tokens.usdc.approve(address(vault), type(uint256).max);
        tokens.usdt.approve(address(vault), type(uint256).max);
        uint256[] memory maxAmounts = new uint256[](3);
        maxAmounts[0] = maxAmounts[1] = maxAmounts[2] = type(uint256).max;
        for (uint256 i = 0; i < SEED_NOTES; i++) {
            vault.deposit(bytes32(poseidon.hash([uint256(keccak256(abi.encode(label, i))) >> 8, i + 1])), maxAmounts);
        }
    }

    /// Spot 3000 USDC per WETH, range 2400 to 3750. SwapVM prices tokenGt in tokenLt, and which
    /// mock sorts lower depends on where it deployed, so both orders are handled.
    function _volatileStrategy(CumPrograms programs, address maker, Tokens memory tokens, uint16 decay, uint64 salt)
        internal
        returns (ISwapVM.Order memory order, uint256[] memory amounts)
    {
        bool wethIsLower = address(tokens.weth) < address(tokens.usdc);
        (uint256 priceMin, uint256 spot, uint256 priceMax) = wethIsLower
            ? (uint256(2400e6), uint256(3000e6), uint256(3750e6))
            : (uint256(1e36) / 3750e6, uint256(1e36) / 3000e6, uint256(1e36) / 2400e6);

        uint256 availableWeth = SEED_NOTES * SHARE_WETH;
        uint256 availableUsdc = SEED_NOTES * SHARE_USDC;
        (, uint256 lower, uint256 higher) = XYCConcentrateArgsBuilder.computeLiquidityFromAmounts(
            wethIsLower ? availableWeth : availableUsdc,
            wethIsLower ? availableUsdc : availableWeth,
            Math.sqrt(spot * 1e18),
            Math.sqrt(priceMin * 1e18),
            Math.sqrt(priceMax * 1e18)
        );

        amounts = new uint256[](2);
        amounts[0] = wethIsLower ? lower : higher;
        amounts[1] = wethIsLower ? higher : lower;
        order = programs.order(maker, programs.volatilePair(priceMin, priceMax, decay, FEE_BPS, salt));
    }

    function _peggedStrategy(CumPrograms programs, address maker, uint64 salt)
        internal
        returns (ISwapVM.Order memory order, uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[0] = SEED_NOTES * SHARE_USDC;
        amounts[1] = SEED_NOTES * SHARE_USDT;
        order = programs.order(maker, programs.peggedPair(amounts[0], amounts[1], 100e27, 1, salt));
    }

    function _pair(address a, address b) internal pure returns (address[] memory pair) {
        pair = new address[](2);
        pair[0] = a;
        pair[1] = b;
    }

    function _strategyJson(string memory key, ISwapVM.Order memory order, uint256[] memory amounts)
        internal
        returns (string memory)
    {
        vm.serializeAddress(key, "maker", order.maker);
        vm.serializeString(key, "traits", vm.toString(abi.decode(abi.encode(order.traits), (uint256))));
        vm.serializeBytes(key, "data", order.data);
        vm.serializeString(key, "shipped0", vm.toString(amounts[0]));
        return vm.serializeString(key, "shipped1", vm.toString(amounts[1]));
    }
}
