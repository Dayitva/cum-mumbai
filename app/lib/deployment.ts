import deployment from "./deployment.json"
import type { Address, Hex } from "viem"

export type Order = { maker: Address; traits: bigint; data: Hex }

export type Strategy = {
  name: string
  description: string
  order: Order
  token0: Token
  token1: Token
  shipped0: bigint
  shipped1: bigint
}

export type Token = { symbol: string; address: Address; decimals: number }

export const WETH: Token = { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 }
export const USDC: Token = { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }
export const USDT: Token = { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 }

/** In the order the vault holds them, which is the order its quotes are returned in. */
export const VAULT_TOKENS = [WETH, USDC, USDT]

type RawStrategy = { maker: string; traits: string; data: string; shipped0: string; shipped1: string }

function strategy(
  raw: RawStrategy,
  name: string,
  description: string,
  token0: Token,
  token1: Token,
): Strategy {
  return {
    name,
    description,
    order: { maker: raw.maker as Address, traits: BigInt(raw.traits), data: raw.data as Hex },
    token0,
    token1,
    shipped0: BigInt(raw.shipped0),
    shipped1: BigInt(raw.shipped1),
  }
}

export const VAULT = deployment.vault as Address
export const ROUTER = deployment.router as Address
export const AQUA = deployment.aqua as Address
export const DEPLOY_BLOCK = BigInt(deployment.deployBlock)
export const SEED_NOTES = deployment.seedNotes

export const VOLATILE_STRATEGY = strategy(
  deployment.volatileStrategy,
  "WETH / USDC",
  "Concentrated liquidity from 2,400 to 3,750, with decay against sandwiches. 0.30% fee.",
  WETH,
  USDC,
)
export const PEGGED_STRATEGY = strategy(
  deployment.peggedStrategy,
  "USDC / USDT",
  "PeggedSwap, low slippage around 1:1. 0.01% fee.",
  USDC,
  USDT,
)
export const NO_DECAY_STRATEGY = strategy(
  deployment.noDecayStrategy,
  "WETH / USDC without decay",
  "The same curve and fee with the decay instruction removed.",
  WETH,
  USDC,
)

export const FRESH_DECAY_STRATEGY = strategy(
  deployment.freshDecayStrategy,
  "WETH / USDC with decay",
  "A new copy of the vault's volatile curve, with no trading history.",
  WETH,
  USDC,
)

export const STRATEGIES = [VOLATILE_STRATEGY, PEGGED_STRATEGY]
