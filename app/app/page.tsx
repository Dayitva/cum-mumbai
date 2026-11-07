import Link from "next/link"
import { ArrowRightIcon, LayersIcon, ShieldCheckIcon, SwordsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VaultStats } from "@/components/vault-stats"
import { IS_SEPOLIA } from "@/lib/network"

const FEATURES = [
  {
    icon: ShieldCheckIcon,
    title: "Anonymous LPs",
    body: "Deposit from one wallet, withdraw to a new one. A Noir proof generated on your device shows you own a note without showing which.",
  },
  {
    icon: LayersIcon,
    title: "One balance, several strategies",
    body: "The vault's tokens back a concentrated WETH/USDC pair and a pegged USDC/USDT pair at once, as SwapVM programs on 1inch Aqua. Fees from both raise what a note is worth.",
  },
  {
    icon: SwordsIcon,
    title: "A curve that defends itself",
    body: "Anonymous LPs cannot watch a position and react, so the volatile pair uses decay. The same sandwich that profits on a plain curve loses money here.",
  },
]

export default function Home() {
  return (
    <div className="container mx-auto space-y-16 px-4 py-16">
      <section className="max-w-3xl space-y-6">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary">
          Built on 1inch Aqua and SwapVM
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          Earn on your liquidity.{" "}
          <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">Stay anonymous.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Money in a privacy pool normally sits idle. This vault puts it to work in DeFi strategies, without linking the
          withdrawal to the deposit.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link href="/vault">
            <Button size="lg" className="w-full gap-2 sm:w-auto">
              Open the vault <ArrowRightIcon className="size-4" />
            </Button>
          </Link>
          <Link href="/sandwich">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Watch a sandwich fail
            </Button>
          </Link>
        </div>
      </section>

      <VaultStats />

      <section className="grid gap-6 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-white/5 bg-white/5 p-8">
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
              <feature.icon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
            <p className="text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        Hackathon code, not audited.{" "}
        {IS_SEPOLIA
          ? "This runs on Base Sepolia with mock tokens, seeded notes and unmodified copies of 1inch's Aqua and SwapVM, which 1inch has not deployed on this testnet."
          : "This demo runs on a local fork of Base with test accounts and seeded notes."}
      </p>
    </div>
  )
}
