// Runs every client flow against the demo fork: npx tsx scripts/e2e.ts (after scripts/demo.sh).
import { readFileSync } from "node:fs"
import { formatUnits, parseEther, parseUnits, type Address } from "viem"
import { privateKeyToAddress, generatePrivateKey } from "viem/accounts"
import { ACCOUNTS, erc20Abi, publicClient, vaultAbi } from "../lib/chain"
import { PEGGED_STRATEGY, USDC, USDT, VAULT, VAULT_TOKENS, VOLATILE_STRATEGY, WETH } from "../lib/deployment"
import { hash2, newNote, nullifierHashOf } from "../lib/note"
import { compareSandwiches } from "../lib/sandwich"
import { executeSwap, quoteSwap } from "../lib/swap"
import { depositNote, readDepositQuote, readWithdrawQuote, withdrawNote } from "../lib/vault"

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAILED: ${message}`)
  console.log(`ok - ${message}`)
}

const balanceOf = (token: Address, owner: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] })

const show = (amounts: readonly bigint[]) =>
  VAULT_TOKENS.map((token, i) => `${formatUnits(amounts[i], token.decimals)} ${token.symbol}`).join(", ")

async function main() {
  const circuit = JSON.parse(readFileSync("public/circuit/cum_circuit.json", "utf8"))

  check(
    hash2(1n, 2n) === 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an,
    "JS Poseidon matches the circuit's test vector",
  )

  const sandwiches = await compareSandwiches()
  console.log("sandwich without decay, profit USDC:", formatUnits(sandwiches.withoutDecay.profit, USDC.decimals))
  console.log("sandwich with decay, profit USDC:", formatUnits(sandwiches.withDecay.profit, USDC.decimals))
  check(sandwiches.withoutDecay.profit > 0n, "the sandwich profits without decay")
  check(sandwiches.withDecay.profit < 0n, "the same sandwich loses with decay")
  // Decay depends on the seconds between the transactions, so allow a dollar of timing noise.
  const withinADollar = (a: bigint, b: bigint) => (a > b ? a - b : b - a) <= parseUnits("1", USDC.decimals)
  const again = await compareSandwiches()
  check(
    withinADollar(again.withoutDecay.profit, sandwiches.withoutDecay.profit) &&
      withinADollar(again.withDecay.profit, sandwiches.withDecay.profit),
    "the comparison gives the same result every run",
  )

  const note = newNote()
  const { leafIndex, amountsPaid } = await depositNote(ACCOUNTS.lp, note)
  console.log(`deposited as leaf ${leafIndex}: ${show(amountsPaid)}`)

  const usdcIn = parseUnits("500", USDC.decimals)
  const expected = await quoteSwap(VOLATILE_STRATEGY.order, USDC.address, WETH.address, usdcIn, ACCOUNTS.trader)
  const before = await balanceOf(WETH.address, ACCOUNTS.trader)
  await executeSwap(ACCOUNTS.trader, VOLATILE_STRATEGY.order, USDC.address, WETH.address, usdcIn, expected)
  check((await balanceOf(WETH.address, ACCOUNTS.trader)) - before === expected, "the volatile swap pays its quote")

  const pegged = await quoteSwap(PEGGED_STRATEGY.order, USDC.address, USDT.address, usdcIn, ACCOUNTS.trader)
  await executeSwap(ACCOUNTS.trader, PEGGED_STRATEGY.order, USDC.address, USDT.address, usdcIn, pegged)
  check(pegged > parseUnits("499", USDT.decimals), "the pegged swap is close to 1:1")

  let rejected = false
  try {
    await executeSwap(ACCOUNTS.trader, PEGGED_STRATEGY.order, USDT.address, USDC.address, usdcIn, parseUnits("600", USDC.decimals))
  } catch {
    rejected = true
  }
  check(rejected, "a swap below its minimum output reverts")

  // A brand new address, with no ETH and no history.
  const recipient = privateKeyToAddress(generatePrivateKey())
  check((await publicClient.getBalance({ address: recipient })) === 0n, "the recipient has no ETH")

  const fee = parseEther("0.005")
  const quote = await readWithdrawQuote()
  console.log(`one note is worth: ${show(quote)}`)
  const relayerGasBefore = await publicClient.getBalance({ address: ACCOUNTS.relayer })
  const { provingMs, leafCount } = await withdrawNote({ circuit, note, recipient, fee })
  console.log(`proved in ${Math.round(provingMs)}ms against ${leafCount} notes`)

  const paid = await Promise.all(VAULT_TOKENS.map((token) => balanceOf(token.address, recipient)))
  console.log(`recipient received: ${show(paid)}`)
  VAULT_TOKENS.forEach((token, i) => {
    const relayerCut = (quote[i] * fee) / 10n ** 18n
    check(paid[i] === quote[i] - relayerCut, `the recipient got its share of ${token.symbol}, less the relayer fee`)
  })
  check((await publicClient.getBalance({ address: ACCOUNTS.relayer })) < relayerGasBefore, "the relayer paid the gas")

  const spent = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "nullifierUsed",
    args: [nullifierHashOf(note)],
  })
  check(spent, "the note is spent")

  let doubleSpent = true
  try {
    await withdrawNote({ circuit, note, recipient, fee })
  } catch {
    doubleSpent = false
  }
  check(!doubleSpent, "the same note cannot be withdrawn twice")

  const afterTrading = await compareSandwiches()
  check(
    withinADollar(afterTrading.withDecay.profit, sandwiches.withDecay.profit),
    "trading on the vault does not skew the comparison",
  )

  const nextPrice = await readDepositQuote()
  console.log(`a new deposit now costs: ${show(nextPrice)}`)
  console.log("all flows passed")
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
