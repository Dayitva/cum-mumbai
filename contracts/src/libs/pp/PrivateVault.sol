// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { PoseidonT3 } from "./Poseidon.sol";

interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external returns (bool);
}

/**
 * @title PrivateVault
 * @notice Merkle tree of note commitments, spent by zero knowledge proof.
 * @dev The contract keeps only the tree's right-hand frontier. There is deliberately no
 * function that returns a Merkle path: asking an RPC node for your path tells it which
 * deposit is yours. Clients rebuild the tree from PrivateDeposit events instead.
 */
abstract contract PrivateVault {
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant ROOT_HISTORY_SIZE = 30;
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IVerifier public immutable verifier;

    uint256 public nextLeafIndex;
    uint256 public withdrawalCount;
    bytes32 public currentRoot;

    bytes32[TREE_DEPTH] private _frontier;
    bytes32[ROOT_HISTORY_SIZE] private _rootHistory;
    mapping(bytes32 root => bool) private _knownRoots;
    mapping(bytes32 commitment => bool) public commitmentUsed;
    mapping(bytes32 nullifierHash => bool) public nullifierUsed;

    event PrivateDeposit(bytes32 indexed commitment, uint256 leafIndex, bytes32 newRoot);
    event PrivateWithdrawal(bytes32 indexed nullifierHash, address indexed recipient, address indexed relayer, uint256 fee);

    error InvalidVerifier();
    error InvalidCommitment();
    error CommitmentAlreadyUsed();
    error TreeFull();
    error UnknownRoot();
    error NullifierAlreadyUsed();
    error InvalidProof();

    constructor(IVerifier verifier_) {
        if (address(verifier_) == address(0)) revert InvalidVerifier();
        verifier = verifier_;
    }

    function isKnownRoot(bytes32 root) public view returns (bool) {
        return _knownRoots[root];
    }

    /// @notice Notes that have been deposited and not yet withdrawn.
    function activeNotes() public view returns (uint256) {
        return nextLeafIndex - withdrawalCount;
    }

    function _insertCommitment(bytes32 commitment) internal {
        if (commitment == bytes32(0) || uint256(commitment) >= FIELD_MODULUS) revert InvalidCommitment();
        if (commitmentUsed[commitment]) revert CommitmentAlreadyUsed();

        uint256 leafIndex = nextLeafIndex;
        if (leafIndex == 1 << TREE_DEPTH) revert TreeFull();

        // Unfilled siblings are zero, which is what the circuit's test vectors and the fixtures assume.
        uint256 node = uint256(commitment);
        uint256 index = leafIndex;
        for (uint256 level = 0; level < TREE_DEPTH; level++) {
            if (index % 2 == 0) {
                _frontier[level] = bytes32(node);
                node = PoseidonT3.hash([node, 0]);
            } else {
                node = PoseidonT3.hash([uint256(_frontier[level]), node]);
            }
            index /= 2;
        }

        bytes32 newRoot = bytes32(node);
        uint256 slot = leafIndex % ROOT_HISTORY_SIZE;
        delete _knownRoots[_rootHistory[slot]];
        _rootHistory[slot] = newRoot;
        _knownRoots[newRoot] = true;

        commitmentUsed[commitment] = true;
        currentRoot = newRoot;
        nextLeafIndex = leafIndex + 1;

        emit PrivateDeposit(commitment, leafIndex, newRoot);
    }

    function _spendNote(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee
    ) internal {
        if (!_knownRoots[merkleRoot]) revert UnknownRoot();
        if (nullifierUsed[nullifierHash]) revert NullifierAlreadyUsed();

        bytes32[] memory publicInputs = new bytes32[](5);
        publicInputs[0] = merkleRoot;
        publicInputs[1] = nullifierHash;
        publicInputs[2] = bytes32(uint256(uint160(recipient)));
        publicInputs[3] = bytes32(uint256(uint160(relayer)));
        publicInputs[4] = bytes32(fee);
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        nullifierUsed[nullifierHash] = true;
        withdrawalCount++;

        emit PrivateWithdrawal(nullifierHash, recipient, relayer, fee);
    }
}
