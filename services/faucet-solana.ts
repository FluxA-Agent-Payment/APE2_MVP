import express from "express";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

// In-memory rate limiting (replace with Redis or DB for production)
const lastClaims = new Map<string, number>();

dotenv.config();

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Configuration
const PORT = process.env.FAUCET_PORT || 3003;
const FAUCET_PK = process.env.FAUCET_SOLANA_PK!;
const USDC_MINT = process.env.SOLANA_USDC_MINT!;
const RATE_LIMIT_MINUTES = 60; // 1 hour between claims

if (!FAUCET_PK || FAUCET_PK.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("Please set FAUCET_SOLANA_PK in your .env file");
  process.exit(1);
}

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const faucetKeypair = Keypair.fromSecretKey(bs58.decode(FAUCET_PK));

console.log(`Faucet Address: ${faucetKeypair.publicKey.toString()}`);

// Simple rate limiting functions
function getLastClaim(address: string): number | null {
  return lastClaims.get(address) || null;
}

function setLastClaim(address: string, timestamp: number): void {
  lastClaims.set(address, timestamp);
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    faucet: faucetKeypair.publicKey.toString(),
    network: "solana-devnet",
    usdcMint: USDC_MINT,
  });
});

// Claim endpoint
app.post("/claim", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Address required",
      });
    }

    // Validate address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(address);
    } catch (error) {
      return res.status(400).json({
        error: "INVALID_ADDRESS",
        message: "Invalid Solana address",
      });
    }

    // Check rate limit
    const now = Math.floor(Date.now() / 1000);
    const lastClaimTime = getLastClaim(address);

    if (lastClaimTime) {
      const timeSince = now - lastClaimTime;
      const remainingSeconds = RATE_LIMIT_MINUTES * 60 - timeSince;

      if (remainingSeconds > 0) {
        return res.status(429).json({
          error: "RATE_LIMITED",
          message: `Please wait before claiming again`,
          remainingMinutes: Math.ceil(remainingSeconds / 60),
        });
      }
    }

    console.log(`[CLAIM] Processing claim for ${address.slice(0, 10)}...`);

    // Send SOL (0.1 SOL for gas)
    const solTransfer = SystemProgram.transfer({
      fromPubkey: faucetKeypair.publicKey,
      toPubkey: recipientPubkey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    });

    const solTx = new Transaction().add(solTransfer);
    solTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    solTx.feePayer = faucetKeypair.publicKey;
    solTx.sign(faucetKeypair);

    const solSignature = await connection.sendRawTransaction(solTx.serialize());
    await connection.confirmTransaction(solSignature, "confirmed");

    console.log(`[CLAIM] SOL sent: ${solSignature}`);

    // Send USDC (3 USDC)
    const usdcMint = new PublicKey(USDC_MINT);
    const faucetTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      faucetKeypair,
      usdcMint,
      faucetKeypair.publicKey
    );

    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      faucetKeypair,
      usdcMint,
      recipientPubkey
    );

    const usdcSignature = await mintTo(
      connection,
      faucetKeypair,
      usdcMint,
      recipientTokenAccount.address,
      faucetKeypair,
      3 * 1_000_000 // 3 USDC
    );

    console.log(`[CLAIM] USDC sent: ${usdcSignature}`);

    // Update rate limit
    setLastClaim(address, now);

    res.json({
      success: true,
      transactions: {
        sol: {
          signature: solSignature,
          amount: "0.1 SOL",
        },
        usdc: {
          signature: usdcSignature,
          amount: "3 USDC",
        },
      },
    });
  } catch (error: any) {
    console.error("[CLAIM ERROR]", error);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Solana Faucet Started ===");
  console.log(`Faucet Address: ${faucetKeypair.publicKey.toString()}`);
  console.log(`USDC Mint: ${USDC_MINT}`);
  console.log(`Port: ${PORT}`);
  console.log(`Rate Limit: ${RATE_LIMIT_MINUTES} minutes between claims`);
});

