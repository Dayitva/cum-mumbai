"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider } from "wagmi"
import { ReactNode, useState, useMemo } from "react"
import { createConfig, http } from "wagmi"
import { mainnet, sepolia, arbitrum, optimism, polygon, base } from "wagmi/chains"
import { injected, metaMask, walletConnect, coinbaseWallet } from "wagmi/connectors"

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  const config = useMemo(() => {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

    // Build connectors array conditionally
    const connectors = [
      injected(),
      metaMask(),
      coinbaseWallet({ appName: "CUM Protocol" }),
    ]

    // Only add WalletConnect if project ID is provided
    if (projectId) {
      connectors.push(walletConnect({ projectId }) as any)
    }

    return createConfig({
      chains: [mainnet, sepolia, arbitrum, optimism, polygon, base], // base should be 8453 (Base mainnet)
      connectors,
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [arbitrum.id]: http(),
        [optimism.id]: http(),
        [polygon.id]: http(),
        [base.id]: http("https://mainnet.base.org"), // Base mainnet RPC
        // Explicitly exclude Base Sepolia (84532) if it exists
      },
    })
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

