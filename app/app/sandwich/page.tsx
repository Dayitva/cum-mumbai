import { SandwichCard } from "@/components/sandwich-card"

export default function SandwichPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Why the curve protects you</h1>
        <p className="max-w-2xl text-muted-foreground">
          Anonymous LPs cannot watch a position and react to an attack, so the strategy has to defend itself.
        </p>
      </div>
      <SandwichCard />
    </div>
  )
}
