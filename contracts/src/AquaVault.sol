// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { ISwapLock } from "./interfaces/ISwapLock.sol";
import { IVerifier, PrivateVault } from "./libs/pp/PrivateVault.sol";

/**
 * @title AquaVault
 * @notice A shared liquidity pool whose LPs are anonymous.
 *
 * Every note is one share of the vault. Depositing costs one share's worth of every token
 * at the vault's current balances; withdrawing pays one share's worth of every token. All
 * notes are identical, so they form one anonymity set however much the share price moves,
 * and no price oracle is needed: fees earned by strategies simply raise what a share holds.
 *
 * The vault is the Aqua maker, so tokens stay here until a swap pulls them. Strategies hold
 * only virtual balances, which means a withdrawal never needs to unwind one. After large
 * withdrawals their virtual depth can overstate what the vault holds; swaps that exceed the
 * real balance revert, and the curator can dock and ship a resized strategy.
 *
 * An Aqua app can pull a strategy's whole virtual balance, so a strategy is a trust decision.
 * Shipping one is delayed by `strategyDelay`, which gives anyone who objects time to withdraw.
 */
contract AquaVault is PrivateVault, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOKENS = 8;
    uint256 public constant MAX_ACTIVE_STRATEGIES = 16;
    uint256 public constant FEE_BASE = 1e18;

    struct ActiveStrategy {
        ISwapLock app;
        bytes32 strategyHash;
    }

    IAqua public immutable aqua;
    uint256 public immutable strategyDelay;

    address[] private _tokens;
    uint256[] private _initialAmounts;
    ActiveStrategy[] private _activeStrategies;

    /// @notice When a proposed strategy may be shipped, keyed by the hash of its whole configuration.
    mapping(bytes32 proposalId => uint256 shippableAt) public proposals;

    event NoteDeposited(bytes32 indexed commitment, uint256[] amounts);
    event NoteWithdrawn(bytes32 indexed nullifierHash, uint256[] amounts);
    event StrategyProposed(bytes32 indexed proposalId, address indexed app, bytes strategy, address[] tokens, uint256[] amounts, uint256 shippableAt);
    event StrategyCancelled(bytes32 indexed proposalId);

    error InvalidTokens();
    error InvalidAmounts();
    error SwapInFlight();
    error AmountAboveMax(address token, uint256 amount, uint256 maxAmount);
    error InvalidRecipient();
    error InvalidFee();
    error AlreadyProposed();
    error NotProposed();
    error StrategyDelayPending(uint256 shippableAt);
    error TooManyStrategies();
    error StrategyNotActive();

    /// Rejects share pricing while any of the vault's strategies is part-way through a swap.
    modifier noSwapInFlight() {
        uint256 count = _activeStrategies.length;
        for (uint256 i = 0; i < count; i++) {
            ActiveStrategy storage active = _activeStrategies[i];
            if (active.app.isSwapping(address(this), active.strategyHash)) revert SwapInFlight();
        }
        _;
    }

    constructor(
        IAqua aqua_,
        IVerifier verifier_,
        address[] memory tokens_,
        uint256[] memory initialAmounts_,
        uint256 strategyDelay_
    ) PrivateVault(verifier_) Ownable(msg.sender) {
        if (tokens_.length == 0 || tokens_.length > MAX_TOKENS) revert InvalidTokens();
        if (tokens_.length != initialAmounts_.length) revert InvalidAmounts();

        aqua = aqua_;
        strategyDelay = strategyDelay_;
        _tokens = tokens_;
        _initialAmounts = initialAmounts_;

        for (uint256 i = 0; i < tokens_.length; i++) {
            if (initialAmounts_[i] == 0) revert InvalidAmounts();
            IERC20(tokens_[i]).forceApprove(address(aqua_), type(uint256).max);
        }
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function activeStrategies() external view returns (ActiveStrategy[] memory) {
        return _activeStrategies;
    }

    /// @notice What one note costs right now.
    function depositQuote() public view returns (uint256[] memory amounts) {
        uint256 shares = activeNotes();
        if (shares == 0) return _initialAmounts;

        amounts = new uint256[](_tokens.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            amounts[i] = Math.ceilDiv(IERC20(_tokens[i]).balanceOf(address(this)), shares);
        }
    }

    /// @notice What one note pays out right now, before any relayer fee.
    function withdrawQuote() public view returns (uint256[] memory amounts) {
        uint256 shares = activeNotes();
        amounts = new uint256[](_tokens.length);
        if (shares == 0) return amounts;

        for (uint256 i = 0; i < amounts.length; i++) {
            amounts[i] = IERC20(_tokens[i]).balanceOf(address(this)) / shares;
        }
    }

    /// @notice Buy one note, paying one share's worth of every token.
    /// @param commitment Poseidon hash of the note's secret and nullifier
    /// @param maxAmounts The most the caller will pay per token, as the price moves with every swap
    function deposit(bytes32 commitment, uint256[] calldata maxAmounts) external nonReentrant noSwapInFlight {
        if (maxAmounts.length != _tokens.length) revert InvalidAmounts();

        uint256[] memory amounts = depositQuote();
        _insertCommitment(commitment);

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > maxAmounts[i]) revert AmountAboveMax(_tokens[i], amounts[i], maxAmounts[i]);
            IERC20(_tokens[i]).safeTransferFrom(msg.sender, address(this), amounts[i]);
        }

        emit NoteDeposited(commitment, amounts);
    }

    /// @notice Spend one note for one share's worth of every token.
    /// @param fee The relayer's cut of each token, where FEE_BASE is everything
    function withdraw(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee
    ) external nonReentrant noSwapInFlight {
        if (recipient == address(0)) revert InvalidRecipient();
        if (fee > FEE_BASE || (fee != 0 && relayer == address(0))) revert InvalidFee();

        uint256[] memory amounts = withdrawQuote();
        _spendNote(proof, merkleRoot, nullifierHash, recipient, relayer, fee);

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 relayerCut = Math.mulDiv(amounts[i], fee, FEE_BASE);
            IERC20(_tokens[i]).safeTransfer(recipient, amounts[i] - relayerCut);
            if (relayerCut != 0) {
                IERC20(_tokens[i]).safeTransfer(relayer, relayerCut);
            }
        }

        emit NoteWithdrawn(nullifierHash, amounts);
    }

    /// @notice Announce a strategy. It can be shipped once `strategyDelay` has passed.
    function proposeStrategy(
        ISwapLock app,
        bytes calldata strategy,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) external onlyOwner returns (bytes32 proposalId) {
        proposalId = _proposalId(app, strategy, strategyTokens, amounts);
        if (proposals[proposalId] != 0) revert AlreadyProposed();

        uint256 shippableAt = block.timestamp + strategyDelay;
        proposals[proposalId] = shippableAt;

        emit StrategyProposed(proposalId, address(app), strategy, strategyTokens, amounts, shippableAt);
    }

    function cancelStrategy(bytes32 proposalId) external onlyOwner {
        if (proposals[proposalId] == 0) revert NotProposed();
        delete proposals[proposalId];
        emit StrategyCancelled(proposalId);
    }

    /// @notice Give a proposed strategy its virtual balances once its delay has passed.
    function ship(
        ISwapLock app,
        bytes calldata strategy,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) external onlyOwner returns (bytes32 strategyHash) {
        bytes32 proposalId = _proposalId(app, strategy, strategyTokens, amounts);
        uint256 shippableAt = proposals[proposalId];
        if (shippableAt == 0) revert NotProposed();
        if (block.timestamp < shippableAt) revert StrategyDelayPending(shippableAt);
        if (_activeStrategies.length == MAX_ACTIVE_STRATEGIES) revert TooManyStrategies();

        delete proposals[proposalId];
        strategyHash = aqua.ship(address(app), strategy, strategyTokens, amounts);
        _activeStrategies.push(ActiveStrategy(app, strategyHash));
    }

    /// @notice Close a strategy. Not delayed, because closing can only reduce what is at risk.
    function dock(ISwapLock app, bytes32 strategyHash, address[] calldata strategyTokens) external onlyOwner {
        uint256 count = _activeStrategies.length;
        for (uint256 i = 0; i < count; i++) {
            ActiveStrategy storage active = _activeStrategies[i];
            if (active.app == app && active.strategyHash == strategyHash) {
                _activeStrategies[i] = _activeStrategies[count - 1];
                _activeStrategies.pop();
                aqua.dock(address(app), strategyHash, strategyTokens);
                return;
            }
        }
        revert StrategyNotActive();
    }

    function _proposalId(
        ISwapLock app,
        bytes calldata strategy,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(app, strategy, strategyTokens, amounts));
    }
}
