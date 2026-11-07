"use client"

import { useState } from "react"
import { ShieldCheckIcon, SkullIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { USDC, WETH } from "@/lib/deployment"
import { errorMessage, formatAmount } from "@/lib/format"
import { compareSandwiches, SANDWICH_SIZE, type SandwichResult } from "@/lib/sandwich"

function Result({ title, result, protectedCurve }: { title: string; result: SandwichResult; protectedCurve: boolean }) {
  const lost = result.profit < 0n
  const magnitude = lost ? -result.profit : result.profit
  return (
    <Card className={`p-6 ${protectedCurve ? "border-primary/40 bg-primary/10" : "border-destructive/40 bg-destructive/10"}`}>
      <div className="mb-3 flex items-center gap-2 text-white">
        {protectedCurve ? <ShieldCheckIcon className="size-5" /> : <SkullIcon className="size-5" />}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">The attacker {lost ? "loses" : "makes"}</p>
      <p data-testid={protectedCurve ? "profit-protected" : "profit-plain"} className="font-mono text-4xl font-bold text-white">
        {lost ? "-" : "+"}${formatAmount(magnitude, USDC)}
      </p>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">1. Attacker buys, front-running</dt>
          <dd className="font-mono text-white">{formatAmount(result.bought, WETH)} WETH</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">2. Victim buys</dt>
          <dd className="font-mono text-white">{formatAmount(result.victimOut, WETH)} WETH</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">3. Attacker sells it back</dt>
          <dd className="font-mono text-white">{formatAmount(result.sold, USDC)} USDC</dd>
        </div>
      </dl>
    </Card>
  )
}

export function SandwichCard() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Awaited<ReturnType<typeof compareSandwiches>> | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    setResults(null)
    try {
      setResults(await compareSandwiches())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Button size="lg" onClick={run} disabled={running}>
        {running ? "Running the attack on both curves..." : `Run a $${formatAmount(SANDWICH_SIZE, USDC, 0)} sandwich`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && (
        <div className="grid gap-6 md:grid-cols-2">
          <Result title="Same curve, no decay" result={results.withoutDecay} protectedCurve={false} />
          <Result title="Same curve, with decay" result={results.withDecay} protectedCurve />
        </div>
      )}
      <p className="max-w-2xl text-sm text-muted-foreground">
        These are real transactions on the fork, through 1inch&apos;s router. Both curves are new copies with the same
        range, size and fee, differing only in decay, and the fork is rewound afterwards so nothing here changes the
        vault. Decay prices a reverse trade as if the previous swap had not happened, so the attacker cannot sell into
        the move their own buy caused. Prices are the demo&apos;s, not the live market&apos;s.
      </p>
    </div>
  )
}
