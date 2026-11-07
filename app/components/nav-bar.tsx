"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LockKeyholeIcon } from "lucide-react"
import { WalletButton } from "@/components/wallet-button"
import { IS_SEPOLIA } from "@/lib/network"
import { cn } from "@/lib/utils"

const ROUTES = [
  { href: "/", label: "Overview" },
  { href: "/vault", label: "Vault" },
  { href: "/swap", label: "Swap" },
  { href: "/sandwich", label: "Sandwich test" },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-4 px-4 py-2">
        <div className="flex flex-wrap items-center gap-8">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LockKeyholeIcon className="size-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Cleverly Using Money</span>
          </Link>
          <div className="flex items-center gap-4">
            {ROUTES.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === route.href ? "text-white" : "text-muted-foreground",
                )}
              >
                {route.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <WalletButton />
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            {IS_SEPOLIA ? "Base Sepolia testnet" : "Local Base fork"}
          </span>
        </div>
      </div>
    </nav>
  )
}
