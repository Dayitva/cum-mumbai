import { useReadContract, useAccount, useSwitchChain } from "wagmi"
import { type Address, formatUnits } from "viem"
import { type Stablecoin } from "@/lib/constants"
import { base } from "wagmi/chains"

// Mock ERC20 ABI - balanceOf and approve functions
export const mockERC20Abi = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

export function useTokenBalance(token: Stablecoin | null) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: balance, isLoading, error } = useReadContract({
    address: token?.address as Address | undefined,
    abi: mockERC20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!token && !!address && !!token.address && isConnected && chainId === base.id,
    },
  })

  // Prompt to switch to Base if on wrong network
  if (isConnected && chainId !== undefined && chainId !== base.id) {
    return {
      balance: BigInt(0),
      formatted: "0",
      isLoading: false,
      error: new Error("Please switch to Base network"),
      switchToBase: () => switchChain({ chainId: base.id }),
    }
  }

  if (!token || !address || !isConnected) {
    return { balance: BigInt(0), formatted: "0", isLoading: false, error: null }
  }

  if (isLoading) {
    return { balance: BigInt(0), formatted: "Loading...", isLoading: true, error: null }
  }

  if (error) {
    return { balance: BigInt(0), formatted: "0", isLoading: false, error }
  }

  if (balance === undefined || balance === null) {
    return { balance: BigInt(0), formatted: "0", isLoading: false, error: null }
  }

  try {
    const formattedValue = formatUnits(balance, token.decimals)
    const numericValue = Number.parseFloat(formattedValue)
    
    const formatted = isNaN(numericValue) || !isFinite(numericValue)
      ? "0"
      : numericValue.toLocaleString("en-US", {
          maximumFractionDigits: 6,
        })

    return {
      balance: balance,
      formatted,
      isLoading: false,
      error: null,
    }
  } catch (err) {
    return { balance: BigInt(0), formatted: "0", isLoading: false, error: err as Error }
  }
}
