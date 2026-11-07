// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IAqua } from "aqua/contracts/interfaces/IAqua.sol";
import { IMakerHooks } from "swap-vm/interfaces/IMakerHooks.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { IPoseidonT3, IVerifier, PrivateVault } from "./libs/pp/PrivateVault.sol";

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
 * Strategies are SwapVM programs run by one router fixed at deployment. A program decides how
 * much of the vault's virtual balances a taker can have, so a strategy is a trust decision:
 * shipping one is delayed by `strategyDelay`, which gives anyone who objects time to withdraw.
 *
 * Shares cannot be priced while a swap is part-way through, because the vault's balances are
 * wrong between Aqua's pull and push. Every strategy must therefore call the vault's maker
 * hooks, and the vault refuses deposits and withdrawals until the hooks say the swap is done.
 * This relies on tokens being plain ERC20s, with no transfer callbacks.
 */
contract AquaVault is PrivateVault, ReentrancyGuard, Ownable, IMakerHooks {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOKENS = 8;
    uint256 public constant FEE_BASE = 1e18;

    uint256 private constant REQUIRED_TRAITS = MakerTraitsLib.USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG
        | MakerTraitsLib.HAS_PRE_TRANSFER_IN_HOOK_BIT_FLAG
        | MakerTraitsLib.HAS_POST_TRANSFER_IN_HOOK_BIT_FLAG
        | MakerTraitsLib.HAS_PRE_TRANSFER_OUT_HOOK_BIT_FLAG
        | MakerTraitsLib.HAS_POST_TRANSFER_OUT_HOOK_BIT_FLAG;
    uint256 private constant FORBIDDEN_TRAITS = MakerTraitsLib.SHOULD_UNWRAP_BIT_FLAG
        | MakerTraitsLib.PRE_TRANSFER_IN_HOOK_HAS_TARGET
        | MakerTraitsLib.POST_TRANSFER_IN_HOOK_HAS_TARGET
        | MakerTraitsLib.PRE_TRANSFER_OUT_HOOK_HAS_TARGET
        | MakerTraitsLib.POST_TRANSFER_OUT_HOOK_HAS_TARGET;

    IAqua public immutable aqua;
    address public immutable router;
    uint256 public immutable strategyDelay;

    address[] private _tokens;
    uint256[] private _initialAmounts;
    uint256 private transient _swapsInFlight;

    mapping(bytes32 orderHash => bool) public isActiveStrategy;

    /// @notice When a proposed strategy may be shipped, keyed by the hash of its whole configuration.
    mapping(bytes32 proposalId => uint256 shippableAt) public proposals;

    event NoteDeposited(bytes32 indexed commitment, uint256[] amounts);
    event NoteWithdrawn(bytes32 indexed nullifierHash, uint256[] amounts);
    event StrategyProposed(bytes32 indexed proposalId, ISwapVM.Order order, address[] tokens, uint256[] amounts, uint256 shippableAt);
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
    error InvalidStrategy();
    error StrategyNotActive();
    error NotFromActiveStrategy();

    modifier noSwapInFlight() {
        if (_swapsInFlight != 0) revert SwapInFlight();
        _;
    }

    /// Only the router, running a shipped strategy of this vault, can move the swap counter.
    /// Otherwise a taker could call a post hook mid-swap and clear the guard.
    modifier onlyActiveStrategy(address maker, bytes32 orderHash) {
        if (msg.sender != router || maker != address(this) || !isActiveStrategy[orderHash]) {
            revert NotFromActiveStrategy();
        }
        _;
    }

    constructor(
        IAqua aqua_,
        address router_,
        IVerifier verifier_,
        IPoseidonT3 poseidon_,
        address[] memory tokens_,
        uint256[] memory initialAmounts_,
        uint256 strategyDelay_
    ) PrivateVault(verifier_, poseidon_) Ownable(msg.sender) {
        if (tokens_.length == 0 || tokens_.length > MAX_TOKENS) revert InvalidTokens();
        if (tokens_.length != initialAmounts_.length) revert InvalidAmounts();

        aqua = aqua_;
        router = router_;
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
        ISwapVM.Order calldata order,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) external onlyOwner returns (bytes32 proposalId) {
        _requireHooksWired(order);

        proposalId = _proposalId(order, strategyTokens, amounts);
        if (proposals[proposalId] != 0) revert AlreadyProposed();

        uint256 shippableAt = block.timestamp + strategyDelay;
        proposals[proposalId] = shippableAt;

        emit StrategyProposed(proposalId, order, strategyTokens, amounts, shippableAt);
    }

    function cancelStrategy(bytes32 proposalId) external onlyOwner {
        if (proposals[proposalId] == 0) revert NotProposed();
        delete proposals[proposalId];
        emit StrategyCancelled(proposalId);
    }

    /// @notice Give a proposed strategy its virtual balances once its delay has passed.
    function ship(
        ISwapVM.Order calldata order,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) external onlyOwner returns (bytes32 strategyHash) {
        bytes32 proposalId = _proposalId(order, strategyTokens, amounts);
        uint256 shippableAt = proposals[proposalId];
        if (shippableAt == 0) revert NotProposed();
        if (block.timestamp < shippableAt) revert StrategyDelayPending(shippableAt);

        delete proposals[proposalId];
        strategyHash = aqua.ship(router, abi.encode(order), strategyTokens, amounts);
        isActiveStrategy[strategyHash] = true;
    }

    /// @notice Close a strategy. Not delayed, because closing can only reduce what is at risk.
    function dock(bytes32 strategyHash, address[] calldata strategyTokens) external onlyOwner {
        if (!isActiveStrategy[strategyHash]) revert StrategyNotActive();
        delete isActiveStrategy[strategyHash];
        aqua.dock(router, strategyHash, strategyTokens);
    }

    function preTransferIn(address maker, address, address, address, uint256, uint256, bytes32 orderHash, bytes calldata, bytes calldata)
        external
        onlyActiveStrategy(maker, orderHash)
    {
        _swapsInFlight++;
    }

    function postTransferIn(address maker, address, address, address, uint256, uint256, bytes32 orderHash, bytes calldata, bytes calldata)
        external
        onlyActiveStrategy(maker, orderHash)
    {
        _swapsInFlight--;
    }

    function preTransferOut(address maker, address, address, address, uint256, uint256, bytes32 orderHash, bytes calldata, bytes calldata)
        external
        onlyActiveStrategy(maker, orderHash)
    {
        _swapsInFlight++;
    }

    function postTransferOut(address maker, address, address, address, uint256, uint256, bytes32 orderHash, bytes calldata, bytes calldata)
        external
        onlyActiveStrategy(maker, orderHash)
    {
        _swapsInFlight--;
    }

    function _requireHooksWired(ISwapVM.Order calldata order) private view {
        uint256 traits = MakerTraits.unwrap(order.traits);
        if (
            order.maker != address(this)
                || traits & REQUIRED_TRAITS != REQUIRED_TRAITS
                || traits & FORBIDDEN_TRAITS != 0
        ) revert InvalidStrategy();
    }

    function _proposalId(
        ISwapVM.Order calldata order,
        address[] calldata strategyTokens,
        uint256[] calldata amounts
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(order, strategyTokens, amounts));
    }
}
