import type { Address, Hex } from "viem"
import { bytesToHex, pad } from "viem"
import type { MerklePath } from "./merkle"
import { nullifierHashOf, type Note } from "./note"

export type WithdrawalInputs = {
  note: Note
  path: MerklePath
  recipient: Address
  relayer: Address
  fee: bigint
}

export type WithdrawalProof = { proof: Hex; merkleRoot: Hex; nullifierHash: Hex }

/** Proves membership on this device. The secret and the Merkle path never leave it. */
export async function proveWithdrawal(circuit: any, inputs: WithdrawalInputs): Promise<WithdrawalProof> {
  const [{ Noir }, { UltraHonkBackend }] = await Promise.all([import("@noir-lang/noir_js"), import("@aztec/bb.js")])
  const nullifierHash = nullifierHashOf(inputs.note)

  const { witness } = await new Noir(circuit).execute({
    secret: inputs.note.secret.toString(),
    nullifier: inputs.note.nullifier.toString(),
    path_indices: inputs.path.pathIndices.map(String),
    path_elements: inputs.path.pathElements.map(String),
    merkle_root: inputs.path.root,
    nullifier_hash: nullifierHash,
    recipient: pad(inputs.recipient),
    relayer: pad(inputs.relayer),
    fee: inputs.fee.toString(),
  })

  const backend = new UltraHonkBackend(circuit.bytecode)
  try {
    const { proof } = await backend.generateProof(witness, { keccakZK: true })
    return { proof: bytesToHex(proof), merkleRoot: inputs.path.root, nullifierHash }
  } finally {
    await backend.destroy()
  }
}
