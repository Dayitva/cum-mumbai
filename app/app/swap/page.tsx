import { SwapCard } from "@/components/swap-card"

export default function SwapPage() {
  return (
    <div className="container mx-auto flex min-h-[calc(100vh-100px)] flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white">Swap Assets</h1>
        <p className="text-muted-foreground">Best execution routing via Aqua Protocol</p>
      </div>

      <div className="w-full max-w-md">
        <SwapCard />
      </div>
    </div>
  )
}
