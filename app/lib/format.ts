import { formatUnits } from "viem"
import type { Token } from "./deployment"

export function formatAmount(amount: bigint, token: Token, digits = token.decimals === 18 ? 4 : 2): string {
  return Number(formatUnits(amount, token.decimals)).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

export function errorMessage(error: unknown): string {
  const anyError = error as { shortMessage?: string; message?: string; name?: string }
  if (anyError?.name === "HttpRequestError" || /fetch failed|Failed to fetch/.test(anyError?.message ?? "")) {
    return "Cannot reach the local fork. Start it with scripts/demo.sh."
  }
  return anyError?.shortMessage ?? anyError?.message ?? "Something went wrong"
}
