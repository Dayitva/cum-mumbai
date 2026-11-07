"use client"

import { Card } from "@/components/ui/card"
import { useVaultState } from "@/hooks/use-vault-state"
import { VAULT_TOKENS, type Token } from "@/lib/deployment"
import { formatAmount } from "@/lib/format"

function TokenRows({ amounts }: { amounts: bigint[] }) {
  return (
    <div className="mt-2 space-y-1 text-sm">
      {VAULT_TOKENS.map((token: Token, i) => (
        <div key={token.symbol} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{token.symbol}</span>
          <span className="font-mono text-white">{formatAmount(amounts[i], token)}</span>
        </div>
      ))}
    </div>
  )
}

/** Everything here is read from the vault on the fork. */
export function VaultStats() {
  const { state, error } = useVaultState()

  if (error) {
    return <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-white">{error}</Card>
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-white/5 bg-white/5 p-5">
        <p className="text-sm text-muted-foreground">Notes in the anonymity set</p>
        <p className="mt-2 text-3xl font-bold text-white">{state ? state.notes.toString() : "..."}</p>
        <p className="mt-2 text-xs text-muted-foreground">Every note is identical, so none can be told apart.</p>
      </Card>
      <Card className="border-white/5 bg-white/5 p-5">
        <p className="text-sm text-muted-foreground">One note is worth</p>
        {state && <TokenRows amounts={state.withdrawQuote} />}
      </Card>
      <Card className="border-white/5 bg-white/5 p-5">
        <p className="text-sm text-muted-foreground">Held by the vault</p>
        {state && <TokenRows amounts={state.balances} />}
      </Card>
    </div>
  )
}
