"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LockKeyholeIcon, WalletIcon } from "lucide-react"
import { WalletConnectDialog } from "@/components/wallet-connect-dialog"
import { useAccount } from "wagmi"

export function NavBar() {
  const pathname = usePathname()
  const [walletDialogOpen, setWalletDialogOpen] = useState(false)
  const { address, isConnected } = useAccount()

  const routes = [
    {
      href: "/",
      label: "Dashboard",
      active: pathname === "/",
    },
    {
      href: "/vault",
      label: "Vault",
      active: pathname === "/vault",
    },
    {
      href: "/swap",
      label: "Swap",
      active: pathname === "/swap",
    },
  ]

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LockKeyholeIcon className="size-5" />
              </div>
              <span className="text-lg font-bold tracking-tight">Cleverly Utilising Money</span>
            </Link>

            <div className="hidden md:flex md:items-center md:gap-1">
              {routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all hover:bg-white/5",
                    route.active ? "bg-white/10 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {route.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setWalletDialogOpen(true)}
              className="hidden gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary sm:flex bg-transparent"
            >
              <WalletIcon className="size-4" />
              {isConnected && address ? formatAddress(address) : "Connect Wallet"}
            </Button>
          </div>
        </div>
      </nav>
      <WalletConnectDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} />
    </>
  )
}
