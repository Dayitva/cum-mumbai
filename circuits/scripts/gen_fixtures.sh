#!/usr/bin/env bash
# Regenerates the verifier and the real proofs the Foundry tests run against.
# Run from anywhere; needs forge, nargo and bb.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CIRCUITS="$ROOT/circuits"
CONTRACTS="$ROOT/contracts"

(cd "$CONTRACTS" && forge script script/GenNoteInputs.s.sol --silent)

cd "$CIRCUITS"
nargo compile
bb write_vk -b target/cum_circuit.json -o target --oracle_hash keccak
bb write_solidity_verifier -k target/vk -o "$CONTRACTS/src/verifier/HonkVerifier.sol"

for note in note0 note1; do
  nargo execute -p "fixtures/$note" "$note"
  bb prove -b target/cum_circuit.json -w "target/$note.gz" -k target/vk -o target --oracle_hash keccak
  python3 - "$note" "$CONTRACTS/test/fixtures/$note.json" <<'PY'
import json, sys
proof = open("target/proof", "rb").read()
inputs = open("target/public_inputs", "rb").read()
json.dump({
    "proof": "0x" + proof.hex(),
    "publicInputs": ["0x" + inputs[i:i + 32].hex() for i in range(0, len(inputs), 32)],
}, open(sys.argv[2], "w"), indent=2)
PY
done
