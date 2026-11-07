import { parseEventLogs, type Address, type Hex } from "viem"
import { approveIfNeeded, chain, erc20Abi, publicClient, RELAYER, send, vaultAbi } from "./chain"
import { VAULT, VAULT_TOKENS } from "./deployment"
import { IS_SEPOLIA } from "./network"
import { buildPath, fetchCommitments } from "./merkle"
import { commitmentOf, type Note } from "./note"
import { proveWithdrawal } from "./prover"

/** Allowed price rise between quoting a deposit and it landing, as swaps move the share price. */
const DEPOSIT_SLIPPAGE_BPS = 50n

export const FEE_BASE = 10n ** 18n

export async function readDepositQuote() {
  return [...(await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "depositQuote" }))]
}

export async function readWithdrawQuote() {
  return [...(await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "withdrawQuote" }))]
}

export async function readVaultBalances() {
  return Promise.all(
    VAULT_TOKENS.map((token) =>
      publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [VAULT] }),
    ),
  )
}

export async function depositNote(depositor: Address, note: Note) {
  const quote = await readDepositQuote()
  const maxAmounts = quote.map((amount) => amount + (amount * DEPOSIT_SLIPPAGE_BPS) / 10_000n + 1n)

  for (let i = 0; i < VAULT_TOKENS.length; i++) {
    await approveIfNeeded(depositor, VAULT_TOKENS[i].address, VAULT, maxAmounts[i])
  }

  const receipt = await send(depositor, {
    address: VAULT,
    abi: vaultAbi,
    functionName: "deposit",
    args: [commitmentOf(note), maxAmounts],
    account: depositor,
    chain,
  })
  const [deposit] = parseEventLogs({ abi: vaultAbi, logs: receipt.logs, eventName: "PrivateDeposit" })
  return { receipt, leafIndex: Number(deposit.args.leafIndex), amountsPaid: quote }
}

export type WithdrawStage = "scanning" | "proving" | "submitting"

type WithdrawalCall = { proof: Hex; merkleRoot: Hex; nullifierHash: Hex; recipient: Address }

/** On the testnet the relayer's key lives on the server. On the fork the node signs for it. */
async function relayWithdrawal(call: WithdrawalCall, fee: bigint): Promise<Hex> {
  if (IS_SEPOLIA) {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...call, fee: fee.toString() }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? "The relayer refused the withdrawal")
    return body.hash
  }
  const receipt = await send(RELAYER, {
    address: VAULT,
    abi: vaultAbi,
    functionName: "withdraw",
    args: [call.proof, call.merkleRoot, call.nullifierHash, call.recipient, RELAYER, fee],
    account: RELAYER,
    chain,
  })
  return receipt.transactionHash
}

/** Rebuilds the tree locally, proves locally, and has the relayer pay the gas. */
export async function withdrawNote(args: {
  circuit: unknown
  note: Note
  recipient: Address
  fee: bigint
  onStage?: (stage: WithdrawStage) => void
}): Promise<{ hash: Hex; provingMs: number; leafCount: number }> {
  args.onStage?.("scanning")
  const commitments = await fetchCommitments()
  const leafIndex = commitments.indexOf(BigInt(commitmentOf(args.note)))
  if (leafIndex === -1) throw new Error("This note was never deposited in this vault")

  const path = buildPath(commitments, leafIndex)
  const isKnown = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "isKnownRoot",
    args: [path.root],
  })
  if (!isKnown) throw new Error("The tree built on this device does not match the vault")

  args.onStage?.("proving")
  const started = performance.now()
  const { proof, merkleRoot, nullifierHash } = await proveWithdrawal(args.circuit, {
    note: args.note,
    path,
    recipient: args.recipient,
    relayer: RELAYER,
    fee: args.fee,
  })
  const provingMs = performance.now() - started

  args.onStage?.("submitting")
  const hash = await relayWithdrawal({ proof, merkleRoot, nullifierHash, recipient: args.recipient }, args.fee)
  return { hash, provingMs, leafCount: path.leafCount }
}
