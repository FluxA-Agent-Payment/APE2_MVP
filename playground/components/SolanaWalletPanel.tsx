"use client";

import { useState, useEffect } from "react";
import { Wallet, Download, LogOut, RefreshCw } from "lucide-react";
import { useSolanaWallet } from "./providers/SolanaWalletProvider";
import { 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  Transaction, 
  TransactionInstruction,
  SystemProgram 
} from "@solana/web3.js";
import { 
  getAssociatedTokenAddress, 
  getAccount, 
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

const USDC_MINT = process.env.NEXT_PUBLIC_SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Devnet USDC
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "AnZDD6eXMV3xfhLqXWi6DUp8ebJwYCYfce8sYawVgdan";
const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL || "http://localhost:3003";

// Deposit instruction discriminator from IDL
const DEPOSIT_DISCRIMINATOR = new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182]);

// Helper to encode u64 as little-endian bytes
function encodeU64(value: bigint): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, value, true); // true = little-endian
  return new Uint8Array(buffer);
}

// Helper to derive wallet state PDA
function getWalletStatePDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("wallet_state")],
    programId
  );
}

// Helper to derive user account PDA
function getUserAccountPDA(
  user: PublicKey,
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("user_account"), user.toBytes(), mint.toBytes()],
    programId
  );
}

// Helper to create deposit instruction
function createDepositInstruction(
  user: PublicKey,
  userAccount: PublicKey,
  userTokenAccount: PublicKey,
  walletTokenAccount: PublicKey,
  mint: PublicKey,
  walletState: PublicKey,
  amount: bigint,
  programId: PublicKey
): TransactionInstruction {
  // Encode amount as u64 (8 bytes, little endian)
  const amountBytes = encodeU64(amount);

  // Concatenate discriminator and amount
  const dataArray = new Uint8Array(DEPOSIT_DISCRIMINATOR.length + amountBytes.length);
  dataArray.set(DEPOSIT_DISCRIMINATOR, 0);
  dataArray.set(amountBytes, DEPOSIT_DISCRIMINATOR.length);
  
  // Convert to Buffer for TransactionInstruction
  const data = Buffer.from(dataArray);

  const keys = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: userAccount, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: walletTokenAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: walletState, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export function SolanaWalletPanel() {
  const { publicKey, connected, connect, disconnect, connection, signTransaction } = useSolanaWallet();

  const [solBalance, setSolBalance] = useState<string>("0");
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [debitBalance, setDebitBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Fetch balances
  const fetchBalances = async () => {
    if (!publicKey || !connected) return;

    try {
      setRefreshing(true);

      // SOL balance
      const solBal = await connection.getBalance(publicKey);
      setSolBalance((solBal / LAMPORTS_PER_SOL).toFixed(4));

      // USDC balance
      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const tokenAccount = await getAssociatedTokenAddress(usdcMint, publicKey);
        const accountInfo = await getAccount(connection, tokenAccount);
        setUsdcBalance((Number(accountInfo.amount) / 1_000_000).toFixed(4));
      } catch (error) {
        setUsdcBalance("0");
      }

      // Query program for debit balance
      try {
        const programId = new PublicKey(PROGRAM_ID);
        const usdcMint = new PublicKey(USDC_MINT);
        const [userAccountPDA] = getUserAccountPDA(publicKey, usdcMint, programId);
        
        const accountInfo = await connection.getAccountInfo(userAccountPDA);
        
        if (accountInfo) {
          // Parse UserAccount: balance (u64) at offset 8 (after discriminator)
          const balance = accountInfo.data.readBigUInt64LE(8);
          setDebitBalance((Number(balance) / 1_000_000).toFixed(4));
        } else {
          setDebitBalance("0");
        }
      } catch (error) {
        console.error("Error fetching debit balance:", error);
        setDebitBalance("0");
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (publicKey && connected) {
      fetchBalances();
    }
  }, [publicKey, connected]);

  // Listen for payment events to refresh balance
  useEffect(() => {
    const handlePaymentSuccess = () => {
      console.log("[WALLET] Payment detected, refreshing balance...");
      setTimeout(() => {
        fetchBalances();
      }, 2000); // Wait 2 seconds for settlement to process
    };

    window.addEventListener('payment-success', handlePaymentSuccess);
    return () => window.removeEventListener('payment-success', handlePaymentSuccess);
  }, [publicKey, connected]);

  const handleConnect = async () => {
    try {
      setLoading(true);
      await connect();
    } catch (error: any) {
      alert(error.message || "Failed to connect Phantom wallet");
    } finally {
      setLoading(false);
    }
  };

  const claimFromFaucet = async () => {
    if (!publicKey) {
      alert("Please connect wallet first");
      return;
    }

    try {
      setClaiming(true);

      const response = await fetch(`${FAUCET_URL}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: publicKey.toString() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "RATE_LIMITED") {
          alert(`Please wait ${data.remainingMinutes} minutes before claiming again`);
        } else {
          alert(`Claim failed: ${data.message}`);
        }
        return;
      }

      alert(
        `Success! You received:\n` +
        `• ${data.transactions.sol.amount}\n` +
        `• ${data.transactions.usdc.amount}\n\n` +
        `SOL Transaction: ${data.transactions.sol.signature}\n` +
        `USDC Transaction: ${data.transactions.usdc.signature}`
      );

      // Refresh balances after a short delay
      setTimeout(() => {
        fetchBalances();
      }, 2000);
    } catch (error: any) {
      console.error("Error claiming from faucet:", error);
      alert("Failed to claim from faucet. Please make sure the faucet service is running.");
    } finally {
      setClaiming(false);
    }
  };

  const depositToWallet = async () => {
    if (!publicKey || !connected) {
      alert("Please connect wallet first");
      return;
    }

    try {
      setLoading(true);
      
      const depositAmountStr = prompt("Enter amount to deposit (USDC):", "1");
      if (!depositAmountStr) return;

      const depositAmountNum = parseFloat(depositAmountStr);
      if (isNaN(depositAmountNum) || depositAmountNum <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      // Convert to smallest units (1 USDC = 1,000,000)
      const amount = BigInt(Math.floor(depositAmountNum * 1_000_000));

      const programId = new PublicKey(PROGRAM_ID);
      const usdcMint = new PublicKey(USDC_MINT);

      // Derive PDAs
      const [walletStatePDA] = getWalletStatePDA(programId);
      const [userAccountPDA] = getUserAccountPDA(publicKey, usdcMint, programId);

      // Get token accounts
      const userTokenAccount = await getAssociatedTokenAddress(usdcMint, publicKey);
      const walletTokenAccount = await getAssociatedTokenAddress(usdcMint, walletStatePDA, true);

      // Create transaction
      const transaction = new Transaction();

      // Check if wallet token account exists, if not create it
      try {
        await getAccount(connection, walletTokenAccount);
        console.log("Wallet token account already exists");
      } catch (error) {
        console.log("Creating wallet token account...");
        // Create the associated token account for the program's wallet
        const createATAIx = createAssociatedTokenAccountInstruction(
          publicKey, // payer
          walletTokenAccount, // account to create
          walletStatePDA, // owner (PDA)
          usdcMint, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        transaction.add(createATAIx);
      }

      // Create deposit instruction
      const depositIx = createDepositInstruction(
        publicKey,
        userAccountPDA,
        userTokenAccount,
        walletTokenAccount,
        usdcMint,
        walletStatePDA,
        amount,
        programId
      );

      transaction.add(depositIx);

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign and send transaction
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      console.log("Deposit transaction sent:", signature);

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      alert(`Successfully deposited ${depositAmountNum} USDC!\n\nTransaction: ${signature}`);

      // Refresh balances
      setTimeout(() => {
        fetchBalances();
      }, 1000);
    } catch (error: any) {
      console.error("Error depositing:", error);
      alert("Deposit failed: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Solana Debit Wallet</h2>
          </div>
          {connected && (
            <button
              onClick={disconnect}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">An ai wallet that allows your ai agent to spend your funds — assign a debit balance to your ai for autonomous payments.</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Devnet Warning Banner */}
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-400">
            ⚠️ <strong>Important:</strong> Make sure your Phantom wallet is set to <strong>Devnet</strong>. 
            Click the settings icon in Phantom → Change Network → Select "Devnet"
          </p>
        </div>

        {/* Connect Wallet */}
        {!connected ? (
          <div className="space-y-4">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect Phantom Wallet
                </>
              )}
            </button>
            
            <p className="text-xs text-gray-400 text-center">
              Please install Phantom wallet extension from <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">phantom.app</a>
            </p>
          </div>
        ) : (
          <>
            {/* Address & Balance */}
            <div className="space-y-3">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-400">
                    Solana Devnet Address
                  </div>
                  <button
                    onClick={fetchBalances}
                    disabled={refreshing}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-white font-mono text-sm text-ellipsis overflow-hidden">
                  {publicKey?.toString()}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">SOL Balance</div>
                  <div className="text-white font-semibold">{solBalance}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">USDC Balance</div>
                  <div className="text-white font-semibold">{usdcBalance}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Debit Balance</div>
                  <div className="text-white font-semibold">{debitBalance}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={claimFromFaucet}
                disabled={claiming}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Claim Test SOL & USDC
                  </>
                )}
              </button>

              <button
                onClick={depositToWallet}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Processing..." : "Deposit to Debit Balance"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

