import { createPublicClient, createTestClient, createWalletClient, http, parseAbi, type Address } from "viem"
import { base } from "viem/chains"

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"

// A fork fetches state it has not seen from its upstream RPC, which can be slow the first time.
const transport = http(RPC_URL, { timeout: 120_000 })

export const publicClient = createPublicClient({ chain: base, transport })
export const testClient = createTestClient({ chain: base, mode: "anvil", transport })

/**
 * The fork's unlocked test accounts, so the demo needs no wallet set up and no keys in the
 * browser: Anvil signs for them. See scripts/demo.sh, which funds these.
 */
export const ACCOUNTS = {
  curator: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  lp: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  trader: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  relayer: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  attacker: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  victim: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
} as const satisfies Record<string, Address>

export function walletFor(account: Address) {
  return createWalletClient({ account, chain: base, transport })
}

const ORDER = "(address maker, uint256 traits, bytes data)"

export const vaultAbi = parseAbi([
  "function activeNotes() view returns (uint256)",
  "function nextLeafIndex() view returns (uint256)",
  "function currentRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32 root) view returns (bool)",
  "function nullifierUsed(bytes32 nullifierHash) view returns (bool)",
  "function isActiveStrategy(bytes32 orderHash) view returns (bool)",
  "function depositQuote() view returns (uint256[])",
  "function withdrawQuote() view returns (uint256[])",
  "function deposit(bytes32 commitment, uint256[] maxAmounts)",
  "function withdraw(bytes proof, bytes32 merkleRoot, bytes32 nullifierHash, address recipient, address relayer, uint256 fee)",
  `function proposeStrategy(${ORDER} order, address[] strategyTokens, uint256[] amounts) returns (bytes32)`,
  `function ship(${ORDER} order, address[] strategyTokens, uint256[] amounts) returns (bytes32)`,
  "event PrivateDeposit(bytes32 indexed commitment, uint256 leafIndex, bytes32 newRoot)",
])

export const routerAbi = parseAbi([
  `function quote(${ORDER} order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)`,
  `function swap(${ORDER} order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)`,
])

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])

export async function send(account: Address, request: Parameters<ReturnType<typeof walletFor>["writeContract"]>[0]) {
  const hash = await walletFor(account).writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted`)
  return receipt
}

export async function approveIfNeeded(owner: Address, token: Address, spender: Address, amount: bigint) {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })
  if (allowance >= amount) return
  await send(owner, {
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account: owner,
    chain: base,
  })
}
