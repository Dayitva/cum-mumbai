#!/usr/bin/env bash
# Deploys everything to Base Sepolia, waits out the timelock, ships the strategies and records
# the sandwich comparison on-chain. Needs DEPLOYER_PRIVATE_KEY in contracts/.env, funded with a
# little Base Sepolia ETH. Optional there: BASE_SEPOLIA_RPC_URL, RELAYER_ADDRESS, STRATEGY_DELAY.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "${ENV_FILE:-$ROOT/contracts/.env}"; set +a

RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
DELAY="${STRATEGY_DELAY:-300}"
DEPLOYER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
RELAYER="${RELAYER_ADDRESS:-$DEPLOYER}"

CHAIN=$(cast chain-id --rpc-url "$RPC")
[ "$CHAIN" = "84532" ] || { echo "Expected chain 84532 (Base Sepolia), got $CHAIN"; exit 1; }
echo "Deployer $DEPLOYER has $(cast balance --ether "$DEPLOYER" --rpc-url "$RPC") ETH"

cd "$ROOT/contracts"
forge build >/dev/null 2>&1

# Deploys built artifacts. The verifier and Poseidon need the compiler settings in foundry.toml,
# which forge create ignores, the verifier links a library, and forge script fails to decode the
# router's constructor arguments when it broadcasts.
create() {
  local bytecode
  bytecode=$(python3 - "$1" "${2:-}" <<'PY'
import json, re, sys
code = json.load(open(sys.argv[1]))["bytecode"]["object"]
print(re.sub(r"__\$[0-9a-f]{34}\$__", sys.argv[2][2:].lower(), code))
PY
)
  cast send --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --json --create "$bytecode${3:-}" \
    | python3 -c "import json,sys;r=json.load(sys.stdin);assert r['status']=='0x1';print(r['contractAddress'])"
}
args() { cast abi-encode "$@" | cut -c3-; }
TOKEN_SIG="f(string,string,uint8)"

POSEIDON=$(create out/Poseidon.sol/PoseidonT3.json)
TRANSCRIPT=$(create out/HonkVerifier.sol/ZKTranscriptLib.json)
VERIFIER=$(create out/HonkVerifier.sol/HonkVerifier.json "$TRANSCRIPT")
AQUA=$(create out/Aqua.sol/Aqua.json)
WETH=$(create out/MockToken.sol/MockToken.json "" "$(args "$TOKEN_SIG" "Mock Wrapped Ether" mWETH 18)")
USDC=$(create out/MockToken.sol/MockToken.json "" "$(args "$TOKEN_SIG" "Mock USD Coin" mUSDC 6)")
USDT=$(create out/MockToken.sol/MockToken.json "" "$(args "$TOKEN_SIG" "Mock Tether" mUSDT 6)")
ROUTER=$(create out/AquaSwapVMRouter.sol/AquaSwapVMRouter.json "" \
  "$(args "f(address,address,address,string,string)" "$AQUA" "$WETH" "$DEPLOYER" SwapVM 1.0.0)")
echo "Aqua $AQUA, router $ROUTER"

forge script script/DeploySepolia.s.sol \
  --sig "deploy(address,address,address,uint256,address,address,address,address,address)" \
  "$POSEIDON" "$VERIFIER" "$RELAYER" "$DELAY" "$AQUA" "$ROUTER" "$WETH" "$USDC" "$USDT" \
  --rpc-url "$RPC" --broadcast --slow --silent
VAULT=$(python3 -c "import json;print(json.load(open('../app/lib/deployment.sepolia.json'))['vault'])")
echo "Vault $VAULT deployed. Waiting ${DELAY}s for the strategy timelock."
sleep "$((DELAY + 15))"

forge script script/DeploySepolia.s.sol --sig "ship(address)" "$VAULT" --rpc-url "$RPC" --broadcast --slow --silent
echo "Strategies shipped."

cd "$ROOT/app"
NEXT_PUBLIC_NETWORK=sepolia NEXT_PUBLIC_RPC_URL="$RPC" npx tsx scripts/record-sandwich.ts
echo "Done. Addresses are in app/lib/deployment.sepolia.json"
