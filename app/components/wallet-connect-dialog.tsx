"use client"

import { useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useConnect, useDisconnect, useAccount } from "wagmi"
import { WalletIcon, CheckIcon, XIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface WalletConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletConnectDialog({ open, onOpenChange }: WalletConnectDialogProps) {
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { address, isConnected } = useAccount()
  const { toast } = useToast()

  useEffect(() => {
    if (error) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet. Please try again.",
        variant: "destructive",
      })
    }
  }, [error, toast])

  useEffect(() => {
    if (isConnected && address) {
      toast({
        title: "Wallet Connected",
        description: "Your wallet has been successfully connected.",
      })
      onOpenChange(false)
    }
  }, [isConnected, address, toast, onOpenChange])

  const handleConnect = (connector: (typeof connectors)[0]) => {
    connect({ connector })
  }

  const handleDisconnect = () => {
    disconnect()
    toast({
      title: "Wallet Disconnected",
      description: "Your wallet has been disconnected.",
    })
    onOpenChange(false)
  }

  const getWalletName = (connector: (typeof connectors)[0]) => {
    if (connector.name.toLowerCase().includes("metamask")) return "MetaMask"
    if (connector.name.toLowerCase().includes("walletconnect")) return "WalletConnect"
    if (connector.name.toLowerCase().includes("coinbase")) return "Coinbase Wallet"
    if (connector.name.toLowerCase().includes("safe")) return "Safe Wallet"
    if (connector.name.toLowerCase().includes("injected")) return "Browser Wallet"
    return connector.name
  }

  const getWalletIcon = (connector: (typeof connectors)[0]) => {
    const name = connector.name.toLowerCase()
    if (name.includes("metamask")) return "🦊"
    if (name.includes("walletconnect")) return "🔗"
    if (name.includes("coinbase")) return "🔵"
    if (name.includes("safe")) return "🛡️"
    return "💼"
  }

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (isConnected && address) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-white/10 bg-black/40 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Wallet Connected</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Your wallet is connected to the application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <WalletIcon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Connected Wallet</p>
                    <p className="text-xs font-mono text-muted-foreground">{formatAddress(address)}</p>
                  </div>
                </div>
                <div className="flex size-6 items-center justify-center rounded-full bg-green-500/20 text-green-500">
                  <CheckIcon className="size-4" />
                </div>
              </div>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="destructive"
              className="w-full"
            >
              <XIcon className="mr-2 size-4" />
              Disconnect Wallet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-white/10 bg-black/40 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-white">Connect Wallet</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Connect your wallet to interact with CUM Protocol
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              onClick={() => handleConnect(connector)}
              disabled={isPending}
              variant="outline"
              className={cn(
                "w-full justify-start gap-3 border-white/10 bg-white/5 hover:bg-white/10 hover:text-primary",
                isPending && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="text-xl">{getWalletIcon(connector)}</span>
              <span className="flex-1 text-left">{getWalletName(connector)}</span>
              {isPending && (
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

