import { concat, numberToHex, pad, toHex, type Address, type Hex } from "viem"
import { base } from "viem/chains"
import { approveIfNeeded, publicClient, routerAbi, send } from "./chain"
import { ROUTER, type Order } from "./deployment"

const IS_EXACT_IN = 0x0001
const IS_FIRST_TRANSFER_FROM_TAKER = 0x0020
const USE_TRANSFER_FROM_AND_AQUA_PUSH = 0x0040

/** SwapVM's taker data for an exact-in swap paid from the taker's wallet, per TakerTraitsLib.build. */
export function takerData(minAmountOut: bigint): Hex {
  const threshold = minAmountOut === 0n ? "0x" : pad(toHex(minAmountOut), { size: 32 })
  const thresholdLength = minAmountOut === 0n ? 0n : 32n

  // Ten 16-bit offsets, packed low to high. Only the threshold slice has any bytes in it.
  let slices = 0n
  for (let i = 0n; i < 10n; i++) {
    slices |= thresholdLength << (i * 16n)
  }

  const flags = IS_EXACT_IN | IS_FIRST_TRANSFER_FROM_TAKER | USE_TRANSFER_FROM_AND_AQUA_PUSH
  return concat([numberToHex(slices, { size: 20 }), numberToHex(flags, { size: 2 }), threshold])
}

export async function quoteSwap(order: Order, tokenIn: Address, tokenOut: Address, amountIn: bigint, taker: Address) {
  const { result } = await publicClient.simulateContract({
    account: taker,
    address: ROUTER,
    abi: routerAbi,
    functionName: "quote",
    args: [order, tokenIn, tokenOut, amountIn, takerData(0n)],
  })
  return result[1]
}

export async function executeSwap(
  taker: Address,
  order: Order,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  minAmountOut: bigint,
) {
  await approveIfNeeded(taker, tokenIn, ROUTER, amountIn)
  return send(taker, {
    address: ROUTER,
    abi: routerAbi,
    functionName: "swap",
    args: [order, tokenIn, tokenOut, amountIn, takerData(minAmountOut)],
    account: taker,
    chain: base,
  })
}
