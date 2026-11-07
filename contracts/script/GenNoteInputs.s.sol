// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { IPoseidonT3 } from "../src/libs/pp/PrivateVault.sol";

/// Writes the Prover.toml inputs for the fixture notes. Hashing here, with the same
/// Poseidon the vault uses, means a fixture only verifies if Solidity and Noir agree.
contract GenNoteInputs is Script {
    uint256 internal constant DEPTH = 20;

    address internal constant RECIPIENT = address(0xA1);
    address internal constant RELAYER = address(0xB2);
    uint256 internal constant FEE = 0.01e18;

    IPoseidonT3 internal poseidon;

    function run() external {
        poseidon = IPoseidonT3(vm.deployCode("Poseidon.sol:PoseidonT3"));
        uint256 commitment0 = _hash(11111111, 22222222);
        uint256 commitment1 = _hash(33333333, 44444444);

        uint256[] memory siblings0 = new uint256[](DEPTH);
        _write("note0", 11111111, 22222222, 0, siblings0, _rootOf(commitment0, 0), RECIPIENT, address(0), 0);

        uint256[] memory siblings1 = new uint256[](DEPTH);
        siblings1[0] = commitment0;
        uint256 root1 = _hash(commitment0, commitment1);
        for (uint256 i = 1; i < DEPTH; i++) {
            root1 = _hash(root1, 0);
        }
        _write("note1", 33333333, 44444444, 1, siblings1, root1, RECIPIENT, RELAYER, FEE);
    }

    function _rootOf(uint256 leaf, uint256 sibling) internal view returns (uint256 node) {
        node = _hash(leaf, sibling);
        for (uint256 i = 1; i < DEPTH; i++) {
            node = _hash(node, 0);
        }
    }

    function _hash(uint256 a, uint256 b) internal view returns (uint256) {
        return poseidon.hash([a, b]);
    }

    function _write(
        string memory name,
        uint256 secret,
        uint256 nullifier,
        uint256 leafIndex,
        uint256[] memory siblings,
        uint256 root,
        address recipient,
        address relayer,
        uint256 fee
    ) internal {
        string memory indices;
        string memory elements;
        for (uint256 i = 0; i < DEPTH; i++) {
            string memory sep = i == 0 ? "" : ", ";
            indices = string.concat(indices, sep, '"', vm.toString((leafIndex >> i) & 1), '"');
            elements = string.concat(elements, sep, '"', vm.toString(bytes32(siblings[i])), '"');
        }
        string memory toml = string.concat(
            'secret = "', vm.toString(bytes32(secret)), '"\n',
            'nullifier = "', vm.toString(bytes32(nullifier)), '"\n',
            "path_indices = [", indices, "]\n",
            "path_elements = [", elements, "]\n"
        );
        toml = string.concat(
            toml,
            'merkle_root = "', vm.toString(bytes32(root)), '"\n',
            'nullifier_hash = "', vm.toString(bytes32(_hash(nullifier, 0))), '"\n',
            'recipient = "', vm.toString(bytes32(uint256(uint160(recipient)))), '"\n',
            'relayer = "', vm.toString(bytes32(uint256(uint160(relayer)))), '"\n',
            'fee = "', vm.toString(bytes32(fee)), '"\n'
        );
        vm.writeFile(string.concat("../circuits/fixtures/", name, ".toml"), toml);
    }
}
