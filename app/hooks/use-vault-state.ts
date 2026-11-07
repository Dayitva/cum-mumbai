"use client"

import { useCallback, useEffect, useState } from "react"
import { publicClient, vaultAbi } from "@/lib/chain"
import { STRATEGIES, VAULT } from "@/lib/deployment"
import { errorMessage } from "@/lib/format"
import { readDepositQuote, readVaultBalances, readWithdrawQuote } from "@/lib/vault"

export type VaultState = {
  notes: bigint
  balances: bigint[]
  depositQuote: bigint[]
  withdrawQuote: bigint[]
}

const POLL_MS = 4_000

export function useVaultState() {
  const [state, setState] = useState<VaultState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [notes, balances, depositQuote, withdrawQuote] = await Promise.all([
        publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "activeNotes" }),
        readVaultBalances(),
        readDepositQuote(),
        readWithdrawQuote(),
      ])
      setState({ notes, balances, depositQuote, withdrawQuote })
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return { state, error, refresh, strategyCount: STRATEGIES.length }
}
