import { VaultCard } from "@/components/vault-card"
import { VaultStats } from "@/components/vault-stats"

export default function VaultPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Liquidity Vault</h1>
        <p className="text-muted-foreground">Provide liquidity without anyone knowing which position is yours.</p>
      </div>
      <VaultStats />
      <div className="mt-8 flex justify-center">
        <div className="w-full max-w-xl">
          <VaultCard />
        </div>
      </div>
    </div>
  )
}
