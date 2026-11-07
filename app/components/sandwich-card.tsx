"use client"

import { useState } from "react"
import { ShieldCheckIcon, SkullIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Hex } from "viem"
import { EXPLORER } from "@/lib/chain"
import { USDC, WETH } from "@/lib/deployment"
import { errorMessage, formatAmount } from "@/lib/format"
import { IS_SEPOLIA } from "@/lib/network"
import { compareSandwiches, SANDWICH_SIZE, type SandwichResult } from "@/lib/sandwich"
import recorded from "@/lib/sandwich.sepolia.json"

const STEP_LABELS = ["1. Attacker buys, front-running", "2. Victim buys", "3. Attacker sells it back"]

function Step({ index, value, hash }: { index: number; value: string; hash?: Hex }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">
        {hash && EXPLORER ? (
          <a className="underline" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
            {STEP_LABELS[index]}
          </a>
        ) : (
          STEP_LABELS[index]
        )}
      </dt>
      <dd className="font-mono text-white">{value}</dd>
    </div>
  )
}

function parseRecorded(raw: any): SandwichResult {
  return {
    bought: BigInt(raw.bought),
    sold: BigInt(raw.sold),
    victimOut: BigInt(raw.victimOut),
    profit: BigInt(raw.profit),
    hashes: raw.hashes,
  }
}

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
        <Step index={0} value={`${formatAmount(result.bought, WETH)} ${WETH.symbol}`} hash={result.hashes[0]} />
        <Step index={1} value={`${formatAmount(result.victimOut, WETH)} ${WETH.symbol}`} hash={result.hashes[1]} />
        <Step index={2} value={`${formatAmount(result.sold, USDC)} ${USDC.symbol}`} hash={result.hashes[2]} />
      </dl>
    </Card>
  )
}

/** A public chain cannot be rewound, so the testnet shows one recorded run, with its transactions. */
function RecordedSandwich() {
  const data = recorded as any
  if (!data.withoutDecay) return <p className="text-sm text-muted-foreground">No run has been recorded yet.</p>
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Result title="Same curve, no decay" result={parseRecorded(data.withoutDecay)} protectedCurve={false} />
        <Result title="Same curve, with decay" result={parseRecorded(data.withDecay)} protectedCurve />
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        One recorded run on Base Sepolia, on a separate sandbox vault, with mock tokens at the demo&apos;s prices. Each
        step links to its transaction. Both curves were new copies with the same range, size and fee, differing only in
        decay. One wallet played both attacker and victim, which does not change the prices.
      </p>
    </div>
  )
}

export function SandwichCard() {
  if (IS_SEPOLIA) return <RecordedSandwich />
  return <LiveSandwich />
}

function LiveSandwich() {
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
