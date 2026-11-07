"use client"

import { useEffect, useState } from "react"
import { ArrowDownUpIcon } from "lucide-react"
import { parseUnits } from "viem"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACCOUNTS } from "@/lib/chain"
import { STRATEGIES } from "@/lib/deployment"
import { errorMessage, formatAmount, shortAddress } from "@/lib/format"
import { executeSwap, quoteSwap } from "@/lib/swap"

const SLIPPAGE_BPS = 50n
const QUOTE_DELAY_MS = 300

export function SwapCard() {
  const [strategyIndex, setStrategyIndex] = useState(0)
  const [reversed, setReversed] = useState(true)
  const [amount, setAmount] = useState("100")
  const [quote, setQuote] = useState<bigint | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const strategy = STRATEGIES[strategyIndex]
  const tokenIn = reversed ? strategy.token1 : strategy.token0
  const tokenOut = reversed ? strategy.token0 : strategy.token1

  const parsedAmount = (() => {
    try {
      return parseUnits(amount || "0", tokenIn.decimals)
    } catch {
      return 0n
    }
  })()

  useEffect(() => {
    setQuote(null)
    setQuoteError(null)
    if (parsedAmount === 0n) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const out = await quoteSwap(strategy.order, tokenIn.address, tokenOut.address, parsedAmount, ACCOUNTS.trader)
        if (!cancelled) setQuote(out)
      } catch (error) {
        if (!cancelled) setQuoteError(errorMessage(error))
      }
    }, QUOTE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [strategy, tokenIn, tokenOut, parsedAmount, refreshKey])

  const minimumOut = quote === null ? null : (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n

  const handleSwap = async () => {
    if (minimumOut === null) return
    setSwapping(true)
    setMessage(null)
    try {
      await executeSwap(ACCOUNTS.trader, strategy.order, tokenIn.address, tokenOut.address, parsedAmount, minimumOut)
      setMessage(`Swapped ${amount} ${tokenIn.symbol} for ${formatAmount(quote!, tokenOut)} ${tokenOut.symbol}.`)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setSwapping(false)
    }
  }

  return (
    <Card className="border-white/5 bg-white/5">
      <CardHeader>
        <CardTitle className="text-white">Trade against the vault</CardTitle>
        <CardDescription>Through 1inch&apos;s deployed SwapVM router. Fees go to note holders.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {STRATEGIES.map((option, i) => (
            <Button
              key={option.name}
              variant={i === strategyIndex ? "default" : "outline"}
              onClick={() => {
                setStrategyIndex(i)
                setReversed(i === 0)
              }}
            >
              {option.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{strategy.description}</p>

        <div className="space-y-2">
          <Label htmlFor="amount">You pay ({tokenIn.symbol})</Label>
          <Input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>

        <div className="flex justify-center">
          <Button variant="outline" size="icon" aria-label="Swap direction" onClick={() => setReversed(!reversed)}>
            <ArrowDownUpIcon className="size-4" />
          </Button>
        </div>

        <div data-testid="quote" className="rounded-lg border border-white/5 bg-black/30 p-4">
          <p className="text-sm text-muted-foreground">You receive ({tokenOut.symbol})</p>
          <p className="mt-1 font-mono text-xl text-white">
            {quote === null ? "..." : formatAmount(quote, tokenOut, tokenOut.decimals === 18 ? 6 : 2)}
          </p>
          {minimumOut !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              At least {formatAmount(minimumOut, tokenOut, tokenOut.decimals === 18 ? 6 : 2)} with 0.5% slippage
            </p>
          )}
          {quoteError && <p className="mt-1 text-sm text-destructive">{quoteError}</p>}
        </div>

        <Button className="w-full" onClick={handleSwap} disabled={swapping || minimumOut === null}>
          {swapping ? "Swapping..." : "Swap"}
        </Button>
        <p className="text-xs text-muted-foreground">Paid from the demo trader wallet {shortAddress(ACCOUNTS.trader)}.</p>
        {message && (
          <p data-testid="swap-message" className="text-sm text-white">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
