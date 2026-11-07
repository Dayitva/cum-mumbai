import type { Hex } from "viem"
import { DEPLOY_BLOCK, VAULT } from "./deployment"
import { publicClient, vaultAbi } from "./chain"
import { hash2, toBytes32 } from "./note"

export const TREE_DEPTH = 20

export type MerklePath = { pathIndices: number[]; pathElements: bigint[]; root: Hex; leafCount: number }

/** Every deposit's commitment in tree order. Everyone asks for all of them, so the RPC learns nothing. */
export async function fetchCommitments(): Promise<bigint[]> {
  const logs = await publicClient.getContractEvents({
    address: VAULT,
    abi: vaultAbi,
    eventName: "PrivateDeposit",
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  })
  return logs
    .sort((a, b) => Number(a.args.leafIndex! - b.args.leafIndex!))
    .map((log) => BigInt(log.args.commitment!))
}

/** Builds the path on this device. Unfilled nodes are zero, as in PrivateVault and the circuit. */
export function buildPath(leaves: bigint[], leafIndex: number): MerklePath {
  const pathIndices: number[] = []
  const pathElements: bigint[] = []
  let level = leaves
  let index = leafIndex

  for (let depth = 0; depth < TREE_DEPTH; depth++) {
    pathIndices.push(index % 2)
    pathElements.push(level[index % 2 === 0 ? index + 1 : index - 1] ?? 0n)

    const parents: bigint[] = []
    for (let i = 0; i < level.length; i += 2) {
      parents.push(hash2(level[i], level[i + 1] ?? 0n))
    }
    level = parents
    index = Math.floor(index / 2)
  }

  return { pathIndices, pathElements, root: toBytes32(level[0]), leafCount: leaves.length }
}
