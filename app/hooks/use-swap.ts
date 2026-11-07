import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient, useWalletClient } from "wagmi"
import { type Address, parseUnits, maxUint256, type Hash } from "viem"
import { SWAP_CONTRACT_ADDRESS, swapAbi } from "@/lib/swap-config"
import { type Stablecoin } from "@/lib/constants"
import { mockERC20Abi } from "./use-token-balance"

// Strategy type matching the contract struct
export interface SwapStrategy {
  maker: Address
  token0: Address
  token1: Address
  feeBps: bigint
  salt: Hash
}

export function useSwap() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const swapExactIn = async (
    appAddress: Address,
    strategy: SwapStrategy,
    fromToken: Stablecoin,
    toToken: Stablecoin,
    amountIn: string,
    amountOutMin: string,
    recipient: Address
  ) => {
    if (!address || !fromToken || !toToken || !publicClient || !walletClient) {
      throw new Error("Wallet not connected or tokens not selected")
    }

    const amountInWei = parseUnits(amountIn, fromToken.decimals)
    const amountOutMinWei = parseUnits(amountOutMin, toToken.decimals)
    
    // Determine zeroForOne: true if swapping token0 -> token1, false otherwise
    // We need to check which token is token0 and which is token1 in the strategy
    const zeroForOne = true;

    try {
      // Get the Aqua address from the swap contract (needed for callback)
      const aquaAddress = await publicClient.readContract({
        address: SWAP_CONTRACT_ADDRESS,
        abi: swapAbi,
        functionName: "AQUA",
      }) as Address

      // Approve Aqua to spend the from token (required for the callback to push tokens)
      const approveAquaHash = await walletClient.writeContract({
        address: fromToken.address as Address,
        abi: mockERC20Abi,
        functionName: "approve",
        args: [aquaAddress, maxUint256],
      })

      // Wait for Aqua approval confirmation
      await publicClient.waitForTransactionReceipt({ hash: approveAquaHash })

      // Approve the swap contract to transfer tokens (for the callback)
      const approveSwapHash = await walletClient.writeContract({
        address: fromToken.address as Address,
        abi: mockERC20Abi,
        functionName: "approve",
        args: [SWAP_CONTRACT_ADDRESS, maxUint256],
      })

      // Wait for swap contract approval confirmation
      await publicClient.waitForTransactionReceipt({ hash: approveSwapHash })

      // Execute the swap on the swap contract (which will call the XYCSwap app)
      // The swap contract will handle the callback to transfer tokens to Aqua
      writeContract({
        address: SWAP_CONTRACT_ADDRESS,
        abi: swapAbi,
        functionName: "swapExactIn",
        args: [
          appAddress,
          strategy as any,
          zeroForOne,
          amountInWei,
          amountOutMinWei,
          recipient,
        ],
      })
    } catch (err: any) {
      // Provide more detailed error messages
      const errorMessage = err?.message || err?.shortMessage || "Swap failed"
      throw new Error(`Swap failed: ${errorMessage}`)
    }
  }

  return {
    swapExactIn,
    hash,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
  }
}

