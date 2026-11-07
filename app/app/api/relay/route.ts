import { NextResponse } from "next/server"
import { createWalletClient, http, isAddress, isHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { chain, publicClient, RELAYER, RELAYER_FEE, RPC_URL, vaultAbi } from "@/lib/chain"
import { VAULT } from "@/lib/deployment"
import { errorMessage } from "@/lib/format"
import { IS_SEPOLIA } from "@/lib/network"

/**
 * Pays the gas for a withdrawal so the money can go to an address with no ETH. It only learns what
 * the transaction would reveal anyway, and the proof binds the recipient, so it cannot redirect it.
 */
export async function POST(request: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined
  if (!IS_SEPOLIA || !key) return NextResponse.json({ error: "No relayer is configured" }, { status: 503 })

  const account = privateKeyToAccount(key)
  if (account.address !== RELAYER) {
    return NextResponse.json({ error: "The relayer key does not match this deployment" }, { status: 503 })
  }

  try {
    const { proof, merkleRoot, nullifierHash, recipient, fee: feeText } = await request.json()
    if (!isHex(proof) || !isHex(merkleRoot) || !isHex(nullifierHash) || !isAddress(recipient)) {
      return NextResponse.json({ error: "Malformed withdrawal" }, { status: 400 })
    }
    const fee = BigInt(feeText)
    if (fee < RELAYER_FEE) return NextResponse.json({ error: "The relayer fee is too low" }, { status: 400 })

    // Simulating first means an invalid proof costs the relayer nothing.
    const { request: call } = await publicClient.simulateContract({
      account,
      address: VAULT,
      abi: vaultAbi,
      functionName: "withdraw",
      args: [proof, merkleRoot, nullifierHash, recipient, RELAYER, fee],
    })
    const wallet = createWalletClient({ account, chain, transport: http(process.env.RELAYER_RPC_URL ?? RPC_URL) })
    const hash = await wallet.writeContract(call)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== "success") throw new Error("The withdrawal reverted")
    return NextResponse.json({ hash })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
