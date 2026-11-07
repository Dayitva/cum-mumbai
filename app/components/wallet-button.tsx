"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { errorMessage, shortAddress } from "@/lib/format"
import { IS_SEPOLIA } from "@/lib/network"
import { connectWallet, useConnectedWallet } from "@/lib/wallet"

export function WalletButton() {
  const wallet = useConnectedWallet()
  const [error, setError] = useState<string | null>(null)

  if (!IS_SEPOLIA) return null
  if (wallet) return <span className="font-mono text-xs text-white">{shortAddress(wallet)}</span>

  return (
    <div className="flex items-center gap-2">
      {error && <span className="max-w-xs text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        onClick={() => {
          setError(null)
          connectWallet().catch((caught) => setError(errorMessage(caught)))
        }}
      >
        Connect wallet
      </Button>
    </div>
  )
}
