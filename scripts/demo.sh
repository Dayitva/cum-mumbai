#!/usr/bin/env bash
# Starts a local Base fork and sets up the vault on 1inch's deployed Aqua and SwapVM router.
# Stops the fork on Ctrl-C.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC=http://127.0.0.1:8545
# Your own RPC goes in contracts/.env as BASE_RPC_URL. The public one rate-limits forks.
if [ -f "$ROOT/contracts/.env" ]; then source "$ROOT/contracts/.env"; fi
FORK_URL="${BASE_RPC_URL:-https://mainnet.base.org}"

WETH=0x4200000000000000000000000000000000000006
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDT=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
# Anvil's test accounts 0 to 6: curator, LP, trader, relayer, attacker, victim, seeder.
ACCOUNTS=(
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  0x90F79bf6EB2c4f870365E785982E1f101E93b906
  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
  0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
  0x976EA74026E726554dB657fA54763abd0C3a0aa9
)

anvil --fork-url "$FORK_URL" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID' EXIT
until cast block-number --rpc-url "$RPC" >/dev/null 2>&1; do sleep 1; done

for account in "${ACCOUNTS[@]}"; do
  cast rpc --rpc-url "$RPC" anvil_dealERC20 "$account" "$WETH" "$(cast to-hex "$(cast to-wei 100)")" >/dev/null
  cast rpc --rpc-url "$RPC" anvil_dealERC20 "$account" "$USDC" "$(cast to-hex 1000000000000)" >/dev/null
  cast rpc --rpc-url "$RPC" anvil_dealERC20 "$account" "$USDT" "$(cast to-hex 1000000000000)" >/dev/null
done

cd "$ROOT/contracts"
# The verifier and Poseidon need the compiler settings in foundry.toml, which forge create
# ignores, so deploy their built artifacts. The verifier also links a library.
forge build >/dev/null 2>&1
CURATOR_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
create() {
  local bytecode
  bytecode=$(python3 - "$1" "${2:-}" <<'PY'
import json, re, sys
code = json.load(open(sys.argv[1]))["bytecode"]["object"]
print(re.sub(r"__\$[0-9a-f]{34}\$__", sys.argv[2][2:].lower(), code))
PY
)
  cast send --rpc-url "$RPC" --private-key "$CURATOR_KEY" --json --create "$bytecode" \
    | python3 -c "import json,sys;r=json.load(sys.stdin);assert r['status']=='0x1';print(r['contractAddress'])"
}
POSEIDON=$(create out/Poseidon.sol/PoseidonT3.json)
TRANSCRIPT=$(create out/HonkVerifier.sol/ZKTranscriptLib.json)
VERIFIER=$(create out/HonkVerifier.sol/HonkVerifier.json "$TRANSCRIPT")

forge script script/DeployDemo.s.sol --sig "deploy(address,address)" "$POSEIDON" "$VERIFIER" --rpc-url "$RPC" --broadcast --silent
VAULT=$(python3 -c "import json;print(json.load(open('../app/lib/deployment.json'))['vault'])")

# Strategies are timelocked for a day.
cast rpc --rpc-url "$RPC" evm_increaseTime 86401 >/dev/null
cast rpc --rpc-url "$RPC" evm_mine >/dev/null
forge script script/DeployDemo.s.sol --sig "ship(address)" "$VAULT" --rpc-url "$RPC" --broadcast --silent

echo "Vault $VAULT is live on the Base fork at $RPC. Now run: cd app && npm run dev"
wait $ANVIL_PID
