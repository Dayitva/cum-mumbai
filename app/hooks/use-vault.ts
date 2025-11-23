import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient, useWalletClient } from "wagmi"
import { type Address, parseUnits, type Hash, maxUint256 } from "viem"
import { VAULT_ADDRESS, vaultAbi } from "@/lib/vault-config"
import { type Stablecoin } from "@/lib/constants"
import { mockERC20Abi } from "./use-token-balance"

export function useVault() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const deposit = async (token: Stablecoin, amount: string, commitment: string) => {
    if (!address || !token || !publicClient || !walletClient) {
      throw new Error("Wallet not connected or token not selected")
    }

    const amountWei = parseUnits(amount, token.decimals)
    const commitmentBytes = commitment as Hash

    try {
      // First, approve the token (approve max to avoid multiple approvals)
      const approveHash = await walletClient.writeContract({
        address: token.address as Address,
        abi: mockERC20Abi,
        functionName: "approve",
        args: [VAULT_ADDRESS, maxUint256],
      })

      // Wait for approval confirmation
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      // Then deposit
      writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "deposit",
        args: [token.address as Address, amountWei, commitmentBytes],
      })
    } catch (err: any) {
      throw new Error(err?.message || "Deposit failed")
    }
  }

  const withdraw = async (
    token: Stablecoin,
    proof: string,
    merkleRoot: string,
    nullifierHash: string,
    recipient: Address,
    relayer: Address = "0x0000000000000000000000000000000000000000" as Address,
    fee: bigint = BigInt(0)
  ) => {
    if (!address || !token) {
      throw new Error("Wallet not connected or token not selected")
    }

    const proofBytes = proof as `0x${string}`

    try {
      await writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [
          proofBytes,
          token.address as Address,
          merkleRoot as Hash,
          nullifierHash as Hash,
          recipient,
          relayer,
          fee,
        ],
      })
    } catch (err: any) {
      throw new Error(err?.message || "Withdrawal failed")
    }
  }

  return {
    deposit,
    withdraw,
    hash,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
  }
}

