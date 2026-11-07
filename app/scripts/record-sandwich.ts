// Runs the sandwich comparison on Base Sepolia's sandbox vault and saves the transactions for the
// app to show. A public chain cannot be rewound, so this runs once, from scripts/deploy-sepolia.sh.
import { writeFileSync } from "node:fs"
import { createWalletClient, formatUnits, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { chain, RPC_URL, setSigner } from "../lib/chain"
import { FRESH_DECAY_STRATEGY, NO_DECAY_STRATEGY, USDC } from "../lib/deployment"
import { runSandwich, type SandwichResult } from "../lib/sandwich"

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`)
setSigner(() => createWalletClient({ account, chain, transport: http(RPC_URL) }))

const serialize = (result: SandwichResult) => ({
  bought: result.bought.toString(),
  sold: result.sold.toString(),
  victimOut: result.victimOut.toString(),
  profit: result.profit.toString(),
  hashes: result.hashes,
})

async function main() {
  const withoutDecay = await runSandwich(NO_DECAY_STRATEGY)
  const withDecay = await runSandwich(FRESH_DECAY_STRATEGY)
  console.log("sandwich without decay, profit:", formatUnits(withoutDecay.profit, USDC.decimals))
  console.log("sandwich with decay, profit:", formatUnits(withDecay.profit, USDC.decimals))
  writeFileSync(
    "lib/sandwich.sepolia.json",
    `${JSON.stringify({ withoutDecay: serialize(withoutDecay), withDecay: serialize(withDecay) }, null, 2)}\n`,
  )
  if (withoutDecay.profit <= 0n || withDecay.profit >= 0n) {
    throw new Error("The recorded comparison does not show what the app says it shows")
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
