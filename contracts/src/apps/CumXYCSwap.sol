// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { TransientLock, TransientLockLib } from "@1inch/solidity-utils/contracts/libraries/TransientLock.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { XYCSwap } from "aqua/examples/apps/XYCSwap.sol";
import { ISwapLock } from "../interfaces/ISwapLock.sol";

/// Aqua's constant product app, with its per-strategy swap lock made readable.
contract CumXYCSwap is XYCSwap, ISwapLock {
    using TransientLockLib for TransientLock;

    constructor(IAqua aqua_) XYCSwap(aqua_) {}

    function isSwapping(address maker, bytes32 strategyHash) external view returns (bool) {
        return _reentrancyLocks[maker][strategyHash].isLocked();
    }
}
