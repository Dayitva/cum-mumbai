import { formatUnits } from "viem"
import type { Token } from "./deployment"

export function formatAmount(amount: bigint, token: Token, digits = token.decimals === 18 ? 4 : 2): string {
  return Number(formatUnits(amount, token.decimals)).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

const REVERT_MESSAGES: Record<string, string> = {
  NullifierAlreadyUsed: "This note has already been withdrawn.",
  UnknownRoot: "The vault has moved on since this proof was made. Please try again.",
  InvalidProof: "The vault rejected this proof.",
  SwapInFlight: "A swap is in progress. Please try again.",
  AmountAboveMax: "The share price moved. Please try again.",
}

export function errorMessage(error: unknown): string {
  const revert = (error as { walk?: (match: (e: unknown) => boolean) => unknown })?.walk?.(
    (cause) => (cause as { data?: { errorName?: string } })?.data?.errorName !== undefined,
  ) as { data?: { errorName?: string } } | undefined
  const known = revert?.data?.errorName && REVERT_MESSAGES[revert.data.errorName]
  if (known) return known

  const anyError = error as { shortMessage?: string; message?: string; name?: string }
  if (anyError?.name === "HttpRequestError" || /fetch failed|Failed to fetch/.test(anyError?.message ?? "")) {
    return "Cannot reach the local fork. Start it with scripts/demo.sh."
  }
  return anyError?.shortMessage ?? anyError?.message ?? "Something went wrong"
}
