# Cleverly Using Money

Anonymous shared liquidity on [1inch Aqua](https://github.com/1inch/aqua). LPs pool funds in a
zero knowledge vault, and the vault provides liquidity to many strategies at once, so earning
yield no longer means giving up privacy.

Started at ETHGlobal Buenos Aires 2025 (1inch "Build an Aqua App", 2nd place). Continuing at
ETHGlobal Mumbai 2026 through the Continuity Track.

| Folder | What it is |
|---|---|
| `contracts/` | The vault, its Merkle tree and the generated proof verifier (Foundry) |
| `circuits/` | The Noir withdrawal circuit and the proof fixture generator |
| `app/` | The Next.js frontend. **Not yet updated for the new vault** |

## How it works

- **Every note is one share of the vault.** Depositing costs one share's worth of every token at
  current balances. Withdrawing pays one share's worth of every token. Notes are identical, so
  they stay in one anonymity set however much the share price moves.
- **Yield needs no oracle.** Swap fees stay in the vault and raise what a share holds.
- **Withdrawals never unwind a strategy.** The vault is the Aqua maker: tokens stay in it, and
  strategies hold only virtual balances.
- **One balance backs several SwapVM programs at once** (`contracts/script/CumPrograms.sol`), on
  1inch's deployed router:
  - **Volatile pair:** concentrated liquidity with decay. Decay prices a reverse trade as if the last
    swap had not happened, so a buy then sell cannot profit from the move it caused. Anonymous LPs
    cannot watch a position and react, so the curve has to protect them. On a 1,000 token strategy
    the same sandwich makes +8.2 tokens without decay and loses 8.1 with it.
  - **Stable pair:** PeggedSwap, low slippage around 1:1.

## New in Mumbai

| | Buenos Aires | Mumbai |
|---|---|---|
| Yield | `TODO: rebalance the denomination` | Share-based notes that pay out real swap fees |
| Late depositors | Would share yield earned before they joined | Pay the current share price |
| Proofs in vault tests | `MockVerifier(true)` | Real Noir proofs from `gen_fixtures.sh` |
| Public deposits | Accepted, but could never be withdrawn | Removed |
| Reading your Merkle path | `getMerklePath(leaf)` told the RPC which deposit was yours | Function removed. Clients rebuild the tree from events (app work pending) |
| Tree storage | Every node, with an unbounded root history | Frontier and a fixed ring of 30 roots |
| Initial Merkle root | Set by the deployer, who could include their own notes | None. Only inserted roots are valid |
| Strategies | One owner key, immediately, on 1inch's example `XYCSwap` | SwapVM programs on 1inch's deployed router, timelocked so LPs can exit first |
| Deposit during a swap | n/a | Blocked through SwapVM maker hooks, since balances are wrong between Aqua's pull and push. The vault rejects any strategy without the hooks |
| Aqua | Repo was a fork of the preview | Official v1.0.1 and SwapVM v1.0.2 as dependencies |
| Deployability | Poseidon library over the 24KB limit under via_ir | Compiled separately, 16KB |

## Security notes

This is hackathon code and has not been audited.

- `recipient`, `relayer` and `fee` are not used in a circuit constraint, but the proof still binds
  them: `test/RealProof.t.sol` shows changing any public input invalidates it.
- The owner is still a single key. The timelock gives LPs time to leave, but does not stop a bad
  strategy from shipping.
- The swap guard assumes plain ERC20 tokens, with no transfer callbacks.
- After large withdrawals, a strategy's virtual depth can overstate the vault's real balance. Prices
  are then too generous on size until the curator docks and ships a resized strategy.
- Gas on the test setup: about 1.3M to 1.9M per deposit (20 on-chain Poseidon hashes) and 3.7M per
  withdrawal (proof verification). That suits an L2 like Base, not mainnet.

## Run it

```bash
git submodule update --init --recursive
cd contracts && forge test

# The whole flow on 1inch's deployed contracts and real Base tokens. Set BASE_RPC_URL to use your own RPC.
RUN_FORK_TESTS=true forge test --match-path test/BaseFork.t.sol -vv

# Needs nargo 1.0.0-beta.14 and bb 3.0.0. Regenerates the verifier and proof fixtures.
../circuits/scripts/gen_fixtures.sh
```

## Licences

MIT (see `LICENSE`), with the agreement of the Buenos Aires team. The generated verifier
`contracts/src/verifier/HonkVerifier.sol` is Apache-2.0. Aqua and SwapVM are dependencies under
their own source-available licences.
