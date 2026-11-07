// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Lets the vault see that a swap is part-way through. Between Aqua's pull and push the
/// vault's balances are temporarily wrong, so shares cannot be priced from them.
interface ISwapLock {
    function isSwapping(address maker, bytes32 strategyHash) external view returns (bool);
}
