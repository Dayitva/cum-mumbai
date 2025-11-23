import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRightIcon, ShieldCheckIcon, ZapIcon, LayersIcon } from "lucide-react"
import { StrategyVisualizer } from "@/components/strategy-visualizer"

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 lg:py-32">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              <span className="mr-2 flex size-2 rounded-full bg-primary"></span>
              Powered by 1inch Aqua
            </div>

            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Get <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">100x</span>{" "}
              Leverage.
            </h1>

            <p className="max-w-xl text-lg text-muted-foreground">
              The privacy-preserving shared liquidity protocol that lets you keep assets in your wallet while
              participating in 100 strategies at once.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href="/vault">
                <Button size="lg" className="h-12 w-full gap-2 rounded-full text-base font-semibold sm:w-auto">
                  Start Earning <ArrowRightIcon className="size-4" />
                </Button>
              </Link>
              <Link href="/swap">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full rounded-full border-white/10 bg-white/5 text-base font-semibold hover:bg-white/10 sm:w-auto"
                >
                  Swap Assets
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-primary/20 to-cyan-500/20 opacity-50 blur-3xl" />
            <StrategyVisualizer />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-24">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-8 transition-all hover:border-primary/20 hover:bg-white/10">
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
              <LayersIcon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">Shared Liquidity</h3>
            <p className="text-muted-foreground">
              Your single deposit backs multiple strategies simultaneously using 1inch Aqua's virtual accounting.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-8 transition-all hover:border-primary/20 hover:bg-white/10">
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
              <ShieldCheckIcon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">Privacy Preserved</h3>
            <p className="text-muted-foreground">
              Keep assets in your wallet. No more depositing into public AMMs where your positions are exposed.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-8 transition-all hover:border-primary/20 hover:bg-white/10">
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
              <ZapIcon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">Capital Efficient</h3>
            <p className="text-muted-foreground">
              Maximize your yield with n-x leverage logic. 100 strategies means 100x the earning potential.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
