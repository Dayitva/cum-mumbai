import { SwapCard } from "@/components/swap-card"

export default function SwapPage() {
  return (
    <div className="container mx-auto flex min-h-[calc(100vh-100px)] flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white">Swap</h1>
        <p className="text-muted-foreground">Every trade earns fees for the anonymous LPs.</p>
      </div>

      <div className="w-full max-w-md">
        <SwapCard />
      </div>
    </div>
  )
}
