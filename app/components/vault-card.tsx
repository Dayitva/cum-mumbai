"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react"
import { formatEther, isAddress, type Address, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useVaultState } from "@/hooks/use-vault-state"
import { TestTokens } from "@/components/test-tokens"
import { erc20Abi, EXPLORER, publicClient, RELAYER_FEE } from "@/lib/chain"
import { VAULT_TOKENS } from "@/lib/deployment"
import { errorMessage, formatAmount, shortAddress } from "@/lib/format"
import { decodeNote, encodeNote, newNote } from "@/lib/note"
import { depositNote, withdrawNote, type WithdrawStage } from "@/lib/vault"
import { useActor } from "@/lib/wallet"

const STAGE_LABELS: Record<WithdrawStage, string> = {
  scanning: "Rebuilding the Merkle tree on this device...",
  proving: "Generating the proof on this device...",
  submitting: "Relayer is submitting the withdrawal...",
}

const freshAddress = () => privateKeyToAddress(generatePrivateKey())

type WithdrawResult = {
  hash: Hex
  recipient: Address
  paid: bigint[]
  ethBalance: bigint
  provingMs: number
  leafCount: number
}

export function VaultCard() {
  const { state, refresh } = useVaultState()
  const depositor = useActor("lp")

  const [depositing, setDepositing] = useState(false)
  const [depositedNote, setDepositedNote] = useState<string | null>(null)
  const [depositError, setDepositError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [noteText, setNoteText] = useState("")
  const [recipient, setRecipient] = useState<string>("")
  const [stage, setStage] = useState<WithdrawStage | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [result, setResult] = useState<WithdrawResult | null>(null)

  // Random, so generated after mount to keep the server and client render the same.
  useEffect(() => setRecipient(freshAddress()), [])

  const handleDeposit = async () => {
    if (!depositor) return
    setDepositing(true)
    setDepositError(null)
    setDepositedNote(null)
    try {
      const note = newNote()
      await depositNote(depositor, note)
      const encoded = encodeNote(note)
      setDepositedNote(encoded)
      setNoteText(encoded)
      await refresh()
    } catch (error) {
      setDepositError(errorMessage(error))
    } finally {
      setDepositing(false)
    }
  }

  const handleCopy = async () => {
    if (!depositedNote) return
    await navigator.clipboard.writeText(depositedNote)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  const handleWithdraw = async () => {
    setWithdrawError(null)
    setResult(null)
    try {
      const note = decodeNote(noteText)
      if (!isAddress(recipient)) throw new Error("That recipient is not a valid address")

      const circuit = await fetch("/circuit/cum_circuit.json").then((response) => response.json())
      const { hash, provingMs, leafCount } = await withdrawNote({
        circuit,
        note,
        recipient,
        fee: RELAYER_FEE,
        onStage: setStage,
      })

      const [paid, ethBalance] = await Promise.all([
        Promise.all(
          VAULT_TOKENS.map((token) =>
            publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [recipient],
            }),
          ),
        ),
        publicClient.getBalance({ address: recipient }),
      ])
      setResult({ hash, recipient, paid, ethBalance, provingMs, leafCount })
      setRecipient(freshAddress())
      setNoteText("")
      await refresh()
    } catch (error) {
      setWithdrawError(errorMessage(error))
    } finally {
      setStage(null)
    }
  }

  return (
    <Card className="border-white/5 bg-white/5">
      <CardHeader>
        <CardTitle className="text-white">Your private position</CardTitle>
        <CardDescription>One note is one share of the vault, in every token it holds.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deposit">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4 pt-4">
            <div className="rounded-lg border border-white/5 bg-black/30 p-4">
              <p className="mb-2 text-sm text-muted-foreground">One note costs, right now</p>
              {VAULT_TOKENS.map((token, i) => (
                <div key={token.symbol} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{token.symbol}</span>
                  <span className="font-mono text-white">
                    {state ? formatAmount(state.depositQuote[i], token) : "..."}
                  </span>
                </div>
              ))}
            </div>
            <TestTokens />
            <p className="text-xs text-muted-foreground">
              {depositor ? `Paid from ${shortAddress(depositor)}. ` : ""}Everyone can see this wallet joined. The
              withdrawal does not reveal which deposit it came from.
            </p>
            <Button className="w-full" onClick={handleDeposit} disabled={depositing || !depositor}>
              {depositing ? "Depositing..." : "Deposit one note"}
            </Button>
            {depositError && <p className="text-sm text-destructive">{depositError}</p>}

            {depositedNote && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-white">Save this note. It is the only way to withdraw.</p>
                <p data-testid="note" className="break-all font-mono text-xs text-white">
                  {depositedNote}
                </p>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy}>
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  {copied ? "Copied" : "Copy note"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="note">Your note</Label>
              <Input
                id="note"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="cum-note-..."
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient">Send to</Label>
              <div className="flex gap-2">
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Generate a new address"
                  onClick={() => setRecipient(freshAddress())}
                >
                  <RefreshCwIcon className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A brand new address with no ETH. A relayer pays the gas and keeps 0.5%.
              </p>
            </div>
            <Button className="w-full" onClick={handleWithdraw} disabled={stage !== null || !noteText}>
              {stage ? STAGE_LABELS[stage] : "Withdraw"}
            </Button>
            {withdrawError && <p className="text-sm text-destructive">{withdrawError}</p>}

            {result && (
              <div data-testid="withdraw-result" className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-white">Withdrawn to {shortAddress(result.recipient)}</p>
                {VAULT_TOKENS.map((token, i) => (
                  <div key={token.symbol} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{token.symbol}</span>
                    <span className="font-mono text-white">{formatAmount(result.paid[i], token)}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  ETH held by the recipient: {formatEther(result.ethBalance)}. Proved on this device in{" "}
                  {(result.provingMs / 1000).toFixed(1)}s, hiding among {result.leafCount} deposits.
                </p>
                {EXPLORER && (
                  <p className="flex gap-4 text-xs">
                    <a className="text-primary underline" href={`${EXPLORER}/tx/${result.hash}`} target="_blank" rel="noreferrer">
                      Withdrawal on Basescan
                    </a>
                    <a className="text-primary underline" href={`${EXPLORER}/address/${result.recipient}`} target="_blank" rel="noreferrer">
                      Recipient on Basescan
                    </a>
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
