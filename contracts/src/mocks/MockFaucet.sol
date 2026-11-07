// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { MockToken } from "./MockToken.sol";

/// One transaction for enough mock tokens to try the vault.
contract MockFaucet {
    MockToken public immutable weth;
    MockToken public immutable usdc;
    MockToken public immutable usdt;

    constructor(MockToken weth_, MockToken usdc_, MockToken usdt_) {
        weth = weth_;
        usdc = usdc_;
        usdt = usdt_;
    }

    function drip() external {
        weth.mint(msg.sender, 1e18);
        usdc.mint(msg.sender, 5_000e6);
        usdt.mint(msg.sender, 5_000e6);
    }
}
