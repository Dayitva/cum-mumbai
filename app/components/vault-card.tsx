"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { STABLECOINS, type Stablecoin } from "@/lib/constants"
import { useToast } from "@/hooks/use-toast"
import { useTokenBalance } from "@/hooks/use-token-balance"
import { useVault } from "@/hooks/use-vault"
import { useAccount } from "wagmi"
import { LockIcon, UnlockIcon, CopyIcon, CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { formatUnits } from "viem"

const FIXED_DEPOSIT_AMOUNT = "10" // Fixed deposit amount in tokens

export function VaultCard() {
  const [selectedToken, setSelectedToken] = useState<Stablecoin>(STABLECOINS[0])
  const [depositCommitment, setDepositCommitment] = useState("")
  const [depositedCommitment, setDepositedCommitment] = useState<string | null>(null)
  const [withdrawNote, setWithdrawNote] = useState("")
  const [noteCopied, setNoteCopied] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const { toast } = useToast()
  const { address, isConnected } = useAccount()
  const { balance, formatted, isLoading, error, switchToBase } = useTokenBalance(selectedToken)
  const { deposit: vaultDeposit, withdraw: vaultWithdraw, isPending: isVaultPending, isSuccess: isVaultSuccess, error: vaultError, hash } = useVault()

  // Handle transaction success
  useEffect(() => {
    if (isVaultSuccess && hash && depositedCommitment) {
      toast({
        title: "Deposit Successful",
        description: `Deposited ${FIXED_DEPOSIT_AMOUNT} ${selectedToken.symbol}. Save your commitment note!`,
      })
    }
  }, [isVaultSuccess, hash, selectedToken, depositedCommitment, toast])

  // Handle transaction errors
  useEffect(() => {
    if (vaultError) {
      toast({
        title: "Transaction Failed",
        description: vaultError.message || "Transaction failed. Please try again.",
        variant: "destructive",
      })
    }
  }, [vaultError, toast])

  const handleDeposit = async () => {
    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to deposit",
        variant: "destructive",
      })
      return
    }

    if (!depositCommitment || depositCommitment.trim() === "") {
      toast({
        title: "Commitment Required",
        description: "Please enter your commitment (generated from your Noir circuit)",
        variant: "destructive",
      })
      return
    }

    // Validate commitment format (should be 0x followed by 64 hex characters)
    if (!/^0x[a-fA-F0-9]{64}$/.test(depositCommitment.trim())) {
      toast({
        title: "Invalid Commitment Format",
        description: "Commitment must be a valid 0x-prefixed hex string (66 characters)",
        variant: "destructive",
      })
      return
    }

    const depositAmountNum = Number.parseFloat(FIXED_DEPOSIT_AMOUNT)
    if (!balance || depositAmountNum <= 0) {
      toast({
        title: "Insufficient Balance",
        description: `You need at least ${FIXED_DEPOSIT_AMOUNT} ${selectedToken.symbol} to deposit`,
        variant: "destructive",
      })
      return
    }

    const balanceNum = Number.parseFloat(formatUnits(balance, selectedToken.decimals))
    if (balanceNum < depositAmountNum) {
      toast({
        title: "Insufficient Balance",
        description: `You have ${formatted} ${selectedToken.symbol}, but need ${FIXED_DEPOSIT_AMOUNT} ${selectedToken.symbol}`,
        variant: "destructive",
      })
      return
    }

    try {
      const commitment = depositCommitment.trim()
      
      toast({
        title: "Deposit Pending",
        description: "Please confirm the transaction in your wallet...",
      })

      await vaultDeposit(selectedToken, FIXED_DEPOSIT_AMOUNT, commitment)
      
      // Save the commitment after successful deposit
      setDepositedCommitment(commitment)
      setDepositCommitment("") // Clear input for next deposit
    } catch (err: any) {
      toast({
        title: "Deposit Failed",
        description: err?.message || "Failed to deposit. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleWithdraw = async () => {
    if (!isConnected || !address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to withdraw",
        variant: "destructive",
      })
      return
    }

    if (!withdrawNote || withdrawNote.trim() === "") {
      toast({
        title: "Invalid Commitment Note",
        description: "Please enter your commitment note to withdraw",
        variant: "destructive",
      })
      return
    }

    // Validate commitment note format (should be 0x followed by 64 hex characters)
    if (!/^0x[a-fA-F0-9]{64}$/.test(withdrawNote.trim())) {
      toast({
        title: "Invalid Commitment Note Format",
        description: "Commitment note must be a valid 0x-prefixed hex string (66 characters)",
        variant: "destructive",
      })
      return
    }

    try {
      // TODO: Generate proof, merkleRoot, and nullifierHash from the commitment note
      // For now, this is a placeholder - you'll need to implement the proof generation
      // This typically requires:
      // 1. Finding the leaf index in the merkle tree
      // 2. Generating a zkSNARK proof
      // 3. Computing the nullifier hash
      
      toast({
        title: "Withdrawal Requires Proof",
        description: "Proof generation is required for withdrawal. This feature needs to be implemented with a proof generation service.",
        variant: "destructive",
      })
      
      // Placeholder - uncomment when proof generation is implemented
      // const proof = "0x..." // Generated proof
      // const merkleRoot = "0x..." // Current merkle root from vault
      // const nullifierHash = "0x..." // Computed nullifier hash
      // 
      // await vaultWithdraw(
      //   selectedToken,
      //   proof,
      //   merkleRoot,
      //   nullifierHash,
      //   address
      // )
      
      // toast({
      //   title: "Withdrawal Pending",
      //   description: "Please confirm the transaction in your wallet...",
      // })
    } catch (err: any) {
      toast({
        title: "Withdrawal Failed",
        description: err?.message || "Failed to withdraw. Please try again.",
        variant: "destructive",
      })
    }
  }

  const copyCommitmentNote = () => {
    if (depositedCommitment) {
      navigator.clipboard.writeText(depositedCommitment)
      setNoteCopied(true)
      toast({
        title: "Copied!",
        description: "Commitment note copied to clipboard. Keep it safe!",
      })
      setTimeout(() => setNoteCopied(false), 2000)
    }
  }

  return (
    <Card className="border-primary/20 bg-black/40 backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="border-b border-white/5 pb-6">
        <CardTitle className="flex items-center gap-2 text-xl text-white">
          <LockIcon className="size-5 text-primary" />
          Privacy-Preserving LP Vault
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-2">
          Deposit a fixed amount of tokens and receive a commitment note. Withdraw anonymously using your note.
          Supports multiple tokens for enhanced privacy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger value="deposit" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Deposit
            </TabsTrigger>
            <TabsTrigger
              value="withdraw"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="deposit-token" className="text-xs font-medium uppercase text-muted-foreground">
                Select Token
              </Label>
              <Select
                value={selectedToken.symbol}
                onValueChange={(value) => {
                  const token = STABLECOINS.find((t) => t.symbol === value)
                  if (token) {
                    setSelectedToken(token)
                    setDepositCommitment("") // Reset commitment input when token changes
                    setDepositedCommitment(null) // Reset deposited commitment when token changes
                  }
                }}
              >
                <SelectTrigger id="deposit-token">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STABLECOINS.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol} className="focus:bg-primary/10">
                      <span className="flex items-center gap-2">
                        <span>{token.icon}</span>
                        <span>{token.symbol}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deposit-commitment" className="text-xs font-medium uppercase text-muted-foreground">
                Commitment (from Noir circuit)
              </Label>
              <div className="relative">
                <input
                  id="deposit-commitment"
                  type={showNote ? "text" : "password"}
                  placeholder="0x..."
                  value={depositCommitment}
                  onChange={(e) => setDepositCommitment(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 pr-20 text-sm font-mono text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNote(!showNote)}
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showNote ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the commitment generated by your local Noir circuit
              </p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Fixed Deposit Amount:</span>
                <span className="font-mono font-bold text-primary text-lg">{FIXED_DEPOSIT_AMOUNT} {selectedToken.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your Balance:</span>
                <span className="font-mono text-white">
                  {isConnected ? (isLoading ? "Loading..." : `${formatted} ${selectedToken.symbol}`) : "Connect wallet"}
                </span>
              </div>
              {error && error.message === "Please switch to Base network" && switchToBase && (
                <Button
                  onClick={switchToBase}
                  className="w-full mt-2 bg-primary text-black hover:bg-primary/90"
                  size="sm"
                >
                  Switch to Base Network
                </Button>
              )}
            </div>

            {depositedCommitment ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium uppercase text-green-400">Your Commitment Note</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowNote(!showNote)}
                        className="h-7 text-xs text-green-400 hover:text-green-300"
                      >
                        {showNote ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copyCommitmentNote}
                        className="h-7 text-xs text-green-400 hover:text-green-300"
                      >
                        {noteCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                      </Button>
                    </div>
                  </div>
                  <div className="font-mono text-xs break-all text-green-300 bg-black/20 p-2 rounded border border-green-500/20">
                    {showNote ? depositedCommitment : "•".repeat(66)}
                  </div>
                  <p className="text-xs text-green-400/80 mt-2">
                    ⚠️ Save this note securely! You'll need it to withdraw your deposit anonymously.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setDepositedCommitment(null)
                    setDepositCommitment("")
                  }}
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10"
                >
                  Make Another Deposit
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleDeposit}
                disabled={!isConnected || isLoading || isVaultPending || !depositCommitment || (balance && Number.parseFloat(formatUnits(balance, selectedToken.decimals)) < Number.parseFloat(FIXED_DEPOSIT_AMOUNT))}
                className="h-12 w-full bg-primary text-lg font-semibold text-black hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                size="lg"
              >
                <LockIcon className="mr-2 size-5" />
                {isVaultPending ? "Processing..." : `Deposit ${FIXED_DEPOSIT_AMOUNT} ${selectedToken.symbol}`}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="withdraw-token" className="text-xs font-medium uppercase text-muted-foreground">
                Select Token
              </Label>
              <Select
                value={selectedToken.symbol}
                onValueChange={(value) => {
                  const token = STABLECOINS.find((t) => t.symbol === value)
                  if (token) setSelectedToken(token)
                }}
              >
                <SelectTrigger id="withdraw-token">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STABLECOINS.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol} className="focus:bg-primary/10">
                      <span className="flex items-center gap-2">
                        <span>{token.icon}</span>
                        <span>{token.symbol}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-note" className="text-xs font-medium uppercase text-muted-foreground">
                Commitment Note
              </Label>
              <div className="relative">
                <input
                  id="withdraw-note"
                  type={showNote ? "text" : "password"}
                  placeholder="0x..."
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 pr-20 text-sm font-mono text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNote(!showNote)}
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showNote ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the commitment note you received when depositing
              </p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Withdrawal Amount:</span>
                <span className="font-mono font-bold text-primary">{FIXED_DEPOSIT_AMOUNT} {selectedToken.symbol}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Privacy:</span>
                <span className="text-xs text-primary">Anonymous withdrawal</span>
              </div>
            </div>

            <Button
              onClick={handleWithdraw}
              disabled={!withdrawNote || withdrawNote.trim() === "" || isVaultPending}
              className="h-12 w-full border-primary/30 bg-transparent text-lg font-semibold text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              variant="outline"
              size="lg"
            >
              <UnlockIcon className="mr-2 size-5" />
              {isVaultPending ? "Processing..." : "Withdraw Anonymously"}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-3">
          <div className="rounded-lg border border-white/5 bg-white/5 p-4">
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <div className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                <LockIcon className="size-3" />
              </div>
              <div>
                <p className="font-semibold text-white">Privacy-Preserving Deposits</p>
                <p className="mt-1 leading-relaxed opacity-80">
                  Deposit a fixed amount and receive a commitment note. Your deposit is mixed with others, making it
                  impossible to link your deposit to your withdrawal. Similar to Tornado Cash, but with multi-token support.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <div className="mt-0.5 rounded-full bg-primary/20 p-1 text-primary">
                <UnlockIcon className="size-3" />
              </div>
              <div>
                <p className="font-semibold text-white">Anonymous Withdrawals</p>
                <p className="mt-1 leading-relaxed opacity-80">
                  Use your commitment note to withdraw to any address. The withdrawal cannot be traced back to your
                  original deposit, ensuring complete privacy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
