import { parseUnits, type Address } from "viem"
import { base } from "viem/chains"
import { ACCOUNTS, erc20Abi, publicClient, send, testClient, vaultAbi } from "./chain"
import { NO_DECAY_STRATEGY, USDC, VAULT, VOLATILE_STRATEGY, WETH, type Strategy } from "./deployment"
import { executeSwap } from "./swap"

export const SANDWICH_SIZE = parseUnits("1000", USDC.decimals)

export type SandwichResult = {
  bought: bigint
  sold: bigint
  profit: bigint
  victimOut: bigint
}

const balanceOf = (token: Address, owner: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] })

async function swapAndMeasure(taker: Address, strategy: Strategy, tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  const before = await balanceOf(tokenOut, taker)
  await executeSwap(taker, strategy.order, tokenIn, tokenOut, amountIn, 0n)
  return (await balanceOf(tokenOut, taker)) - before
}

async function sandwich(strategy: Strategy): Promise<SandwichResult> {
  const bought = await swapAndMeasure(ACCOUNTS.attacker, strategy, USDC.address, WETH.address, SANDWICH_SIZE)
  const victimOut = await swapAndMeasure(ACCOUNTS.victim, strategy, USDC.address, WETH.address, SANDWICH_SIZE)
  const sold = await swapAndMeasure(ACCOUNTS.attacker, strategy, WETH.address, USDC.address, bought)
  return { bought, sold, victimOut, profit: sold - SANDWICH_SIZE }
}

async function shipNoDecayStrategy() {
  const tokens = [NO_DECAY_STRATEGY.token0.address, NO_DECAY_STRATEGY.token1.address]
  const amounts = [NO_DECAY_STRATEGY.shipped0, NO_DECAY_STRATEGY.shipped1]
  const call = {
    address: VAULT,
    abi: vaultAbi,
    args: [NO_DECAY_STRATEGY.order, tokens, amounts],
    account: ACCOUNTS.curator,
    chain: base,
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

/** Runs the identical attack on both curves from the same state, and leaves the fork untouched. */
export async function compareSandwiches(): Promise<{ withoutDecay: SandwichResult; withDecay: SandwichResult }> {
  const withoutDecay = await inSnapshot(async () => {
    await shipNoDecayStrategy()
    return sandwich(NO_DECAY_STRATEGY)
  })
  const withDecay = await inSnapshot(() => sandwich(VOLATILE_STRATEGY))
  return { withoutDecay, withDecay }
}
