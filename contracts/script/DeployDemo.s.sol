// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { XYCConcentrateArgsBuilder } from "swap-vm/instructions/XYCConcentrate.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { AquaVault } from "../src/AquaVault.sol";
import { IPoseidonT3, IVerifier } from "../src/libs/pp/PrivateVault.sol";
import { CumPrograms } from "./CumPrograms.sol";

/// Sets up the demo on a local Base fork, in two steps with time travel between them because
/// strategies are timelocked. Use script/demo.sh; the keys below are Anvil's public test keys.
contract DeployDemo is Script {
    address internal constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant ROUTER = 0x111111338c5091E8440b67B168bAe16a668AC0De;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    uint256 internal constant CURATOR_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant SEEDER_KEY = 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e;

    uint256 internal constant SHARE_WETH = 0.3e18;
    uint256 internal constant SHARE_USDC = 900e6;
    uint256 internal constant SHARE_USDT = 900e6;
    uint256 internal constant SEED_NOTES = 5;
    uint256 internal constant STRATEGY_DELAY = 1 days;

    string internal constant STATE_PATH = "../app/lib/deployment.json";

    function deploy(IPoseidonT3 poseidon, IVerifier verifier) external {
        address[] memory tokens = _vaultTokens();
        uint256[] memory share = new uint256[](3);
        share[0] = SHARE_WETH;
        share[1] = SHARE_USDC;
        share[2] = SHARE_USDT;

        vm.startBroadcast(CURATOR_KEY);
        AquaVault vault = new AquaVault(IAqua(AQUA), ROUTER, verifier, poseidon, tokens, share, STRATEGY_DELAY);
        vm.stopBroadcast();

        // Other LPs already in the pool, so a demo deposit has company in the anonymity set.
        vm.startBroadcast(SEEDER_KEY);
        uint256[] memory maxAmounts = new uint256[](3);
        maxAmounts[0] = maxAmounts[1] = maxAmounts[2] = type(uint256).max;
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20(tokens[i]).approve(address(vault), type(uint256).max);
        }
        for (uint256 i = 0; i < SEED_NOTES; i++) {
            vault.deposit(bytes32(poseidon.hash([uint256(keccak256(abi.encode("seed", i))) >> 8, i + 1])), maxAmounts);
        }
        vm.stopBroadcast();

        (ISwapVM.Order memory volatilePair, ISwapVM.Order memory peggedPair) = _orders(address(vault));
        vm.startBroadcast(CURATOR_KEY);
        (address[] memory volatileTokens, uint256[] memory volatileAmounts) = _volatileShipment();
        vault.proposeStrategy(volatilePair, volatileTokens, volatileAmounts);
        (address[] memory peggedTokens, uint256[] memory peggedAmounts) = _peggedShipment();
        vault.proposeStrategy(peggedPair, peggedTokens, peggedAmounts);
        vm.stopBroadcast();

        string memory state = "state";
        vm.serializeAddress(state, "vault", address(vault));
        vm.serializeAddress(state, "poseidon", address(poseidon));
        vm.serializeAddress(state, "verifier", address(verifier));
        vm.serializeAddress(state, "aqua", AQUA);
        vm.serializeAddress(state, "router", ROUTER);
        vm.serializeUint(state, "seedNotes", SEED_NOTES);
        vm.serializeUint(state, "deployBlock", block.number);
        vm.writeJson(_writeStrategies(state, volatilePair, peggedPair), STATE_PATH);
    }

    function ship(address vaultAddress) external {
        AquaVault vault = AquaVault(vaultAddress);
        (ISwapVM.Order memory volatilePair, ISwapVM.Order memory peggedPair) = _orders(vaultAddress);
        (address[] memory volatileTokens, uint256[] memory volatileAmounts) = _volatileShipment();
        (address[] memory peggedTokens, uint256[] memory peggedAmounts) = _peggedShipment();

        vm.startBroadcast(CURATOR_KEY);
        vault.ship(volatilePair, volatileTokens, volatileAmounts);
        vault.ship(peggedPair, peggedTokens, peggedAmounts);
        vm.stopBroadcast();
    }

    function _vaultTokens() internal pure returns (address[] memory tokens) {
        tokens = new address[](3);
        tokens[0] = WETH;
        tokens[1] = USDC;
        tokens[2] = USDT;
    }

    function _orders(address vault) internal returns (ISwapVM.Order memory volatilePair, ISwapVM.Order memory peggedPair) {
        // Off-chain helper only: this is outside any broadcast, so it is never deployed.
        CumPrograms programs = new CumPrograms(AQUA);
        volatilePair = programs.order(vault, programs.volatilePair(2400e6, 3750e6, 300, 30, 1));
        peggedPair = programs.order(
            vault, programs.peggedPair(SEED_NOTES * SHARE_USDC, SEED_NOTES * SHARE_USDT, 100e27, 1, 2)
        );
    }

    /// Spot 3000 USDC per WETH, range 2400 to 3750. WETH sorts below USDC.
    function _volatileShipment() internal pure returns (address[] memory tokens, uint256[] memory amounts) {
        (, uint256 weth, uint256 usdc) = XYCConcentrateArgsBuilder.computeLiquidityFromAmounts(
            SEED_NOTES * SHARE_WETH,
            SEED_NOTES * SHARE_USDC,
            Math.sqrt(3000e6 * 1e18),
            Math.sqrt(2400e6 * 1e18),
            Math.sqrt(3750e6 * 1e18)
        );
        tokens = new address[](2);
        tokens[0] = WETH;
        tokens[1] = USDC;
        amounts = new uint256[](2);
        amounts[0] = weth;
        amounts[1] = usdc;
    }

    function _peggedShipment() internal pure returns (address[] memory tokens, uint256[] memory amounts) {
        tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = USDT;
        amounts = new uint256[](2);
        amounts[0] = SEED_NOTES * SHARE_USDC;
        amounts[1] = SEED_NOTES * SHARE_USDT;
    }

    function _writeStrategies(string memory state, ISwapVM.Order memory volatilePair, ISwapVM.Order memory peggedPair)
        internal
        returns (string memory)
    {
        (, uint256[] memory volatileAmounts) = _volatileShipment();
        (, uint256[] memory peggedAmounts) = _peggedShipment();
        string memory volatileJson = _writeStrategy("volatile", volatilePair, volatileAmounts);
        string memory peggedJson = _writeStrategy("pegged", peggedPair, peggedAmounts);
        // Never shipped here. The app ships these fresh inside reverted snapshots, so that the
        // sandwich comparison starts both curves from the same state.
        CumPrograms programs = new CumPrograms(AQUA);
        ISwapVM.Order memory noDecay = programs.order(
            volatilePair.maker, programs.volatilePair(2400e6, 3750e6, 0, 30, 3)
        );
        ISwapVM.Order memory freshDecay = programs.order(
            volatilePair.maker, programs.volatilePair(2400e6, 3750e6, 300, 30, 4)
        );
        vm.serializeString(state, "noDecayStrategy", _writeStrategy("noDecay", noDecay, volatileAmounts));
        vm.serializeString(state, "freshDecayStrategy", _writeStrategy("freshDecay", freshDecay, volatileAmounts));
        vm.serializeString(state, "volatileStrategy", volatileJson);
        return vm.serializeString(state, "peggedStrategy", peggedJson);
    }

    function _writeStrategy(string memory key, ISwapVM.Order memory order, uint256[] memory amounts)
        internal
        returns (string memory)
    {
        vm.serializeAddress(key, "maker", order.maker);
        vm.serializeString(key, "traits", vm.toString(_traits(order)));
        vm.serializeBytes(key, "data", order.data);
        vm.serializeString(key, "shipped0", vm.toString(amounts[0]));
        return vm.serializeString(key, "shipped1", vm.toString(amounts[1]));
    }

    function _traits(ISwapVM.Order memory order) internal pure returns (uint256) {
        return abi.decode(abi.encode(order.traits), (uint256));
    }
}
