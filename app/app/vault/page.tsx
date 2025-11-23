import { VaultCard } from "@/components/vault-card"
import { StatsHeader } from "@/components/stats-header"

export default function VaultPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Liquidity Vault</h1>
        <p className="text-muted-foreground">Manage your private LP positions</p>
      </div>

      <StatsHeader />

      <div className="mt-8 flex justify-center">
        <div className="w-full max-w-xl">
          <VaultCard />
        </div>
      </div>
    </div>
  )
}
