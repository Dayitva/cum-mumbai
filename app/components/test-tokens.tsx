"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { chain, faucetAbi, send } from "@/lib/chain"
import { FAUCET } from "@/lib/deployment"
import { errorMessage } from "@/lib/format"
import { IS_SEPOLIA } from "@/lib/network"
import { useConnectedWallet } from "@/lib/wallet"

/** Mock tokens on the testnet. People still need a little Base Sepolia ETH for gas. */
export function TestTokens() {
  const wallet = useConnectedWallet()
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  if (!IS_SEPOLIA) return null
  if (!wallet) {
    return <p className="text-sm text-muted-foreground">Connect a wallet on Base Sepolia to try this.</p>
  }

  const drip = async () => {
    setState("sending")
    setError(null)
    try {
      await send(wallet, { address: FAUCET, abi: faucetAbi, functionName: "drip", account: wallet, chain })
      setState("done")
    } catch (caught) {
      setError(errorMessage(caught))
      setState("idle")
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/5 bg-black/30 p-4">
      <p className="text-sm text-muted-foreground">
        These are mock tokens worth nothing. You also need a little Base Sepolia ETH for gas, from any public faucet.
      </p>
      <Button variant="outline" size="sm" onClick={drip} disabled={state === "sending"}>
        {state === "sending" ? "Minting..." : state === "done" ? "Minted. Get more" : "Get test tokens"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
