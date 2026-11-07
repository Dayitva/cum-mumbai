import { parseUnits, type Address, type Hex } from "viem"
import { ACCOUNTS, chain, erc20Abi, publicClient, send, testClient, vaultAbi } from "./chain"
import { FRESH_DECAY_STRATEGY, NO_DECAY_STRATEGY, USDC, VAULT, WETH, type Strategy } from "./deployment"
import { executeSwap } from "./swap"

export const SANDWICH_SIZE = parseUnits("1000", USDC.decimals)

export type SandwichResult = {
  bought: bigint
  sold: bigint
  profit: bigint
  victimOut: bigint
  /** The attacker's buy, the victim's buy and the attacker's sell. */
  hashes: Hex[]
}

const balanceOf = (token: Address, owner: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] })

async function swapAndMeasure(taker: Address, strategy: Strategy, tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  const before = await balanceOf(tokenOut, taker)
  const receipt = await executeSwap(taker, strategy.order, tokenIn, tokenOut, amountIn, 0n)
  return { out: (await balanceOf(tokenOut, taker)) - before, hash: receipt.transactionHash }
}

export async function runSandwich(strategy: Strategy): Promise<SandwichResult> {
  const buy = await swapAndMeasure(ACCOUNTS.attacker, strategy, USDC.address, WETH.address, SANDWICH_SIZE)
  const victim = await swapAndMeasure(ACCOUNTS.victim, strategy, USDC.address, WETH.address, SANDWICH_SIZE)
  const sell = await swapAndMeasure(ACCOUNTS.attacker, strategy, WETH.address, USDC.address, buy.out)
  return {
    bought: buy.out,
    victimOut: victim.out,
    sold: sell.out,
    profit: sell.out - SANDWICH_SIZE,
    hashes: [buy.hash, victim.hash, sell.hash],
  }
}

async function shipFresh(strategy: Strategy) {
  const tokens = [strategy.token0.address, strategy.token1.address]
  const amounts = [strategy.shipped0, strategy.shipped1]
  const call = {
    address: VAULT,
    abi: vaultAbi,
    args: [strategy.order, tokens, amounts],
    account: ACCOUNTS.curator,
    chain,
  } as const
  await send(ACCOUNTS.curator, { ...call, functionName: "proposeStrategy" })
  await testClient.increaseTime({ seconds: 86_401 })
  await testClient.mine({ blocks: 1 })
  await send(ACCOUNTS.curator, { ...call, functionName: "ship" })
}

async function inSnapshot<T>(run: () => Promise<T>): Promise<T> {
  const id = await testClient.snapshot()
  const result = await run().then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await testClient.revert({ id })
  if ("error" in result) throw result.error
  return result.value
}

/**
 * Runs the identical attack on two new copies of the curve that differ only in decay, so past
 * trading on the vault cannot skew the comparison. The fork is rewound after each.
 */
export async function compareSandwiches(): Promise<{ withoutDecay: SandwichResult; withDecay: SandwichResult }> {
  const attack = (strategy: Strategy) =>
    inSnapshot(async () => {
      await shipFresh(strategy)
      return runSandwich(strategy)
    })
  const withoutDecay = await attack(NO_DECAY_STRATEGY)
  const withDecay = await attack(FRESH_DECAY_STRATEGY)
  return { withoutDecay, withDecay }
}
