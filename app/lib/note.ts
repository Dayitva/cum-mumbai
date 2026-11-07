import { poseidon2 } from "poseidon-lite"
import { pad, toHex, type Hex } from "viem"

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

/** A private note: whoever holds these two numbers can withdraw one share of the vault. */
export type Note = { secret: bigint; nullifier: bigint }

function randomFieldElement(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31))
  return BigInt(toHex(bytes))
}

export function newNote(): Note {
  return { secret: randomFieldElement() % FIELD, nullifier: randomFieldElement() % FIELD }
}

export const hash2 = (a: bigint, b: bigint): bigint => poseidon2([a, b])

export const toBytes32 = (value: bigint): Hex => pad(toHex(value), { size: 32 })

export const commitmentOf = (note: Note): Hex => toBytes32(hash2(note.secret, note.nullifier))

export const nullifierHashOf = (note: Note): Hex => toBytes32(hash2(note.nullifier, 0n))

export const encodeNote = (note: Note): string =>
  `cum-note-${note.secret.toString(16)}-${note.nullifier.toString(16)}`

export function decodeNote(text: string): Note {
  const match = text.trim().match(/^cum-note-([0-9a-f]+)-([0-9a-f]+)$/)
  if (!match) throw new Error("That is not a valid note")
  return { secret: BigInt(`0x${match[1]}`), nullifier: BigInt(`0x${match[2]}`) }
}
