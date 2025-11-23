"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { STABLECOINS, type Stablecoin } from "@/lib/constants"
import { useToast } from "@/hooks/use-toast"
import { useTokenBalance } from "@/hooks/use-token-balance"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { ArrowDownUpIcon, ZapIcon } from "lucide-react"

export function SwapCard() {
  const [fromToken, setFromToken] = useState<Stablecoin>(STABLECOINS[0])
  const [toToken, setToToken] = useState<Stablecoin>(STABLECOINS[1])
  const [fromAmount, setFromAmount] = useState("")
  const [toAmount, setToAmount] = useState("")
  const { toast } = useToast()
  const { address, isConnected } = useAccount()
  const { balance: fromBalance, formatted: fromFormatted, isLoading: fromLoading, error: fromError, switchToBase: switchToBaseFrom } = useTokenBalance(fromToken)
  const { balance: toBalance, formatted: toFormatted, isLoading: toLoading, error: toError, switchToBase: switchToBaseTo } = useTokenBalance(toToken)
  
  const networkError = fromError?.message === "Please switch to Base network" || toError?.message === "Please switch to Base network"
  const switchToBase = switchToBaseFrom || switchToBaseTo

  const handleSwapDirection = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
  }

  const handleSwap = () => {
    if (!fromAmount || Number.parseFloat(fromAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid swap amount",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Swap Initiated",
      description: `Swapping ${fromAmount || "0"} ${fromToken.symbol} for ${toAmount && !isNaN(Number.parseFloat(toAmount)) ? toAmount : "0"} ${toToken.symbol}...`,
    })
    setFromAmount("")
    setToAmount("")
  }

  // Simulate exchange rate calculation
  const calculateExchange = (amount: string) => {
    if (!amount) return ""
    const numAmount = Number.parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) return ""
    const rate = 0.9995 // 0.05% slippage simulation
    const result = numAmount * rate
    return isNaN(result) ? "" : result.toFixed(6)
  }

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value)
    setToAmount(calculateExchange(value))
  }

  return (
    <Card className="border-primary/20 bg-black/40 backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="border-b border-white/5 pb-6">
        <CardTitle className="flex items-center gap-2 text-xl text-white">
          <ArrowDownUpIcon className="size-5 text-primary" />
          Swap Assets
        </CardTitle>
        <CardDescription className="text-sm text-white/70">
          Trade stablecoins through Aqua shared liquidity strategies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <Label htmlFor="from-token" className="text-xs font-medium uppercase text-muted-foreground">
            From
          </Label>
          <div className="flex gap-2">
            <Select
              value={fromToken.symbol}
              onValueChange={(value) => {
                const token = STABLECOINS.find((t) => t.symbol === value)
                if (token) setFromToken(token)
              }}
            >
              <SelectTrigger id="from-token" className="w-[140px] border-white/10 bg-white/5 focus:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STABLECOINS.filter((t) => t.symbol !== toToken.symbol).map((token) => (
                  <SelectItem key={token.symbol} value={token.symbol}>
                    <span className="flex items-center gap-2">
                      <span>{token.icon}</span>
                      <span>{token.symbol}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                className="border-white/10 bg-white/5 pr-16 text-right text-lg font-mono focus-visible:ring-primary/50"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2 text-xs text-muted-foreground hover:text-white"
                onClick={() => {
                  if (fromBalance && fromToken) {
                    try {
                      const maxAmount = formatUnits(fromBalance, fromToken.decimals)
                      const numAmount = Number.parseFloat(maxAmount)
                      handleFromAmountChange(isNaN(numAmount) ? "0" : maxAmount)
                    } catch {
                      handleFromAmountChange("0")
                    }
                  }
                }}
                disabled={!isConnected || fromLoading || !fromBalance}
              >
                MAX
              </Button>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Balance: {isConnected ? (fromLoading ? "Loading..." : `${fromFormatted} ${fromToken.symbol}`) : "Connect wallet"}
          </div>
          {networkError && switchToBase && (
            <Button
              onClick={switchToBase}
              className="w-full mt-2 bg-primary text-black hover:bg-primary/90"
              size="sm"
            >
              Switch to Base Network
            </Button>
          )}
        </div>

        <div className="relative flex justify-center py-2">
          <Button
            variant="outline"
            size="icon"
            className="absolute z-10 h-10 w-10 rounded-full border-primary/30 bg-black text-primary transition-transform hover:rotate-180 hover:bg-primary hover:text-black"
            onClick={handleSwapDirection}
          >
            <ArrowDownUpIcon className="size-5" />
          </Button>
          <div className="w-full border-t border-white/10" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="to-token" className="text-xs font-medium uppercase text-muted-foreground">
            To
          </Label>
          <div className="flex gap-2">
            <Select
              value={toToken.symbol}
              onValueChange={(value) => {
                const token = STABLECOINS.find((t) => t.symbol === value)
                if (token) setToToken(token)
              }}
            >
              <SelectTrigger id="to-token" className="w-[140px] border-white/10 bg-white/5 focus:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STABLECOINS.filter((t) => t.symbol !== fromToken.symbol).map((token) => (
                  <SelectItem key={token.symbol} value={token.symbol}>
                    <span className="flex items-center gap-2">
                      <span>{token.icon}</span>
                      <span>{token.symbol}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="0.00"
              value={toAmount}
              readOnly
              className="flex-1 border-white/10 bg-white/5 text-right text-lg font-mono focus-visible:ring-primary/50"
            />
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Balance: {isConnected ? (toLoading ? "Loading..." : `${toFormatted} ${toToken.symbol}`) : "Connect wallet"}
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rate:</span>
            <span className="font-mono text-white">
              1 {fromToken.symbol} = 0.9995 {toToken.symbol}
            </span>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-muted-foreground">Fee:</span>
            <span className="font-mono text-primary">0.05%</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/5 pt-2">
            <span className="text-muted-foreground">Route:</span>
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <ZapIcon className="size-3" />
              Via Aqua Best Strategy
            </span>
          </div>
        </div>

        <Button
          onClick={handleSwap}
          className="h-12 w-full bg-primary text-lg font-semibold text-black hover:bg-primary/90"
          size="lg"
        >
          <ArrowDownUpIcon className="mr-2 size-5" />
          Execute Swap
        </Button>

        <div className="rounded-lg border border-white/5 bg-white/5 p-4">
          <div className="flex items-start gap-3 text-xs text-muted-foreground">
            <div className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
              <ZapIcon className="size-3" />
            </div>
            <div>
              <p className="font-semibold text-white">Powered by 1inch Aqua</p>
              <p className="mt-1 leading-relaxed opacity-80">
                Swaps are routed through the most efficient shared liquidity strategy for optimal execution.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
