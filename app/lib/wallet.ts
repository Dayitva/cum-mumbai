"use client"

import { useSyncExternalStore } from "react"
import { createWalletClient, custom, numberToHex, type Address, type EIP1193Provider } from "viem"
import { ACCOUNTS, chain, setSigner } from "./chain"
import { IS_SEPOLIA } from "./network"

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

let connected: Address | null = null
const listeners = new Set<() => void>()

function setConnected(address: Address | null) {
  connected = address
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function switchToChain(provider: EIP1193Provider) {
  const chainId = numberToHex(chain.id)
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] })
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    })
  }
}

export async function connectWallet() {
  const provider = window.ethereum
  if (!provider) throw new Error("No browser wallet found. Install MetaMask or a similar wallet.")

  const [address] = await provider.request({ method: "eth_requestAccounts" })
  await switchToChain(provider)
  setSigner((account) => createWalletClient({ account, chain, transport: custom(provider) }))
  setConnected(address)
  ;(provider as unknown as { on?: (event: string, run: (accounts: Address[]) => void) => void }).on?.(
    "accountsChanged",
    (accounts) => setConnected(accounts[0] ?? null),
  )
}

export function useConnectedWallet(): Address | null {
  return useSyncExternalStore(subscribe, () => connected, () => null)
}

/** Who acts on a screen: a demo account on the fork, or the person's own wallet on the testnet. */
export function useActor(role: keyof typeof ACCOUNTS): Address | null {
  const wallet = useConnectedWallet()
  return IS_SEPOLIA ? wallet : ACCOUNTS[role]
}
