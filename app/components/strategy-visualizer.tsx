"use client"

import { Card, CardContent } from "@/components/ui/card"
import { ZapIcon } from "lucide-react"

export function StrategyVisualizer() {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-black/40 backdrop-blur-xl">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Strategy Performance</h3>
            <p className="text-sm text-muted-foreground">Real-time liquidity tracking</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <div className="size-1.5 animate-pulse rounded-full bg-primary" />
            Live
          </div>
        </div>

        <div className="relative mb-12 flex aspect-[2/1] items-end justify-center gap-1">
          {Array.from({ length: 40 }).map((_, i) => {
            const height = Math.max(20, Math.random() * 100)
            return (
              <div
                key={i}
                className="w-full rounded-t-sm bg-primary/20 transition-all duration-500 hover:bg-primary"
                style={{ height: `${height}%`, opacity: Math.max(0.3, i / 40) }}
              />
            )
          })}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-bold tracking-tighter text-white drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]">
                100x
              </div>
              <div className="text-sm font-medium uppercase tracking-widest text-primary">Liquidity</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/5 bg-white/5 p-4">
            <div className="mb-1 text-xs text-muted-foreground">Active Strategies</div>
            <div className="text-2xl font-bold text-white">100</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-4">
            <div className="mb-1 text-xs text-muted-foreground">Efficiency</div>
            <div className="flex items-center gap-1 text-2xl font-bold text-primary">
              <ZapIcon className="size-5 fill-current" /> Max
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
