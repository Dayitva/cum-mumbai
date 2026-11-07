// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Controls, ControlsArgsBuilder } from "swap-vm/instructions/Controls.sol";
import { Decay, DecayArgsBuilder } from "swap-vm/instructions/Decay.sol";
import { Fee, FeeArgsBuilder } from "swap-vm/instructions/Fee.sol";
import { PeggedSwap, PeggedSwapArgsBuilder } from "swap-vm/instructions/PeggedSwap.sol";
import { XYCConcentrate, XYCConcentrateArgsBuilder } from "swap-vm/instructions/XYCConcentrate.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { AquaOpcodes } from "swap-vm/opcodes/AquaOpcodes.sol";
import { Program, ProgramBuilder } from "swap-vm-test/utils/ProgramBuilder.sol";

/// Builds the SwapVM programs the vault ships. Off-chain tooling only; never deployed for real.
contract CumPrograms is AquaOpcodes {
    using ProgramBuilder for Program;

    /// One basis point, on the 1e9 scale SwapVM fees use.
    uint32 public constant BPS = 1e5;

    constructor(address aqua) AquaOpcodes(aqua) {}

    /// Concentrated liquidity for a volatile pair, resistant to sandwiching. Decay prices the
    /// reverse trade as if the last swap had not happened, so a buy then sell cannot profit
    /// from the move it caused. Anonymous LPs cannot watch and react, so the curve has to.
    function volatilePair(
        uint256 priceMin,
        uint256 priceMax,
        uint16 decayPeriod,
        uint32 feeBps,
        uint64 salt
    ) public view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(
                XYCConcentrate._xycConcentrateGrowLiquidity2D,
                XYCConcentrateArgsBuilder.build2D(Math.sqrt(priceMin * 1e18), Math.sqrt(priceMax * 1e18))
            ),
            decayPeriod == 0 ? bytes("") : p.build(Decay._decayXD, DecayArgsBuilder.build(decayPeriod)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(feeBps * BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(salt))
        );
    }

    /// Low slippage around 1:1 for a pair of same-decimals stablecoins.
    function peggedPair(uint256 x0, uint256 y0, uint256 linearWidth, uint32 feeBps, uint64 salt)
        public
        view
        returns (bytes memory)
    {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(feeBps * BPS)),
            p.build(
                PeggedSwap._peggedSwapGrowPriceRange2D,
                PeggedSwapArgsBuilder.build(
                    PeggedSwapArgsBuilder.Args({ x0: x0, y0: y0, linearWidth: linearWidth, rateLt: 1, rateGt: 1 })
                )
            ),
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(salt))
        );
    }

    /// Wraps a program as an Aqua order whose four maker hooks call the vault.
    function order(address vault, bytes memory program) public pure returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: vault,
            receiver: address(0),
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            hasPreTransferInHook: true,
            hasPostTransferInHook: true,
            hasPreTransferOutHook: true,
            hasPostTransferOutHook: true,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));
    }
}
