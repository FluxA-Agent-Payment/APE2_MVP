import express from "express";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN, web3 } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";

dotenv.config();

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Configuration
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SP_PK = process.env.SP_SOLANA_PK!;
const PROGRAM_ID = process.env.PROGRAM_ID || "AEP2WaaaBBBCCCDDDEEEFFFGGGHHHIIIJJJKKKLLL";
const PORT = process.env.SP_PORT || 3001;

if (!SP_PK || SP_PK.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("Please set SP_SOLANA_PK in your .env file");
  process.exit(1);
}

// Solana connection and wallet
const connection = new Connection(RPC, "confirmed");
const spKeypair = Keypair.fromSecretKey(bs58.decode(SP_PK));
const wallet = new Wallet(spKeypair);

console.log(`SP Solana Address: ${spKeypair.publicKey.toString()}`);

// Initialize SQLite database
const HOME_DIR = os.homedir();
const SP_DATA_DIR = path.join(HOME_DIR, ".sp_data_solana");
const DB_FILE = path.join(SP_DATA_DIR, ".sp-solana-data.db");

if (!fs.existsSync(SP_DATA_DIR)) {
  fs.mkdirSync(SP_DATA_DIR, { recursive: true, mode: 0o755 });
  console.log(`[INIT] Created data directory: ${SP_DATA_DIR}`);
}

const db = new Database(DB_FILE);
console.log(`[INIT] Database location: ${DB_FILE}`);

if (fs.existsSync(DB_FILE)) {
  fs.chmodSync(DB_FILE, 0o644);
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS mandates (
    mandate_digest TEXT PRIMARY KEY,
    payer TEXT NOT NULL,
    token TEXT NOT NULL,
    payee TEXT NOT NULL,
    amount TEXT NOT NULL,
    nonce TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    ref TEXT NOT NULL,
    payer_sig TEXT NOT NULL,
    sp_enqueue_sig TEXT NOT NULL,
    enqueue_deadline INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('enqueued', 'settled', 'failed')),
    enqueued_at INTEGER NOT NULL,
    settled_at INTEGER,
    tx_hash TEXT,
    retries INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_status ON mandates(status);
  CREATE INDEX IF NOT EXISTS idx_enqueued_at ON mandates(enqueued_at DESC);

  CREATE TABLE IF NOT EXISTS wallet_balances (
    payer TEXT NOT NULL,
    token TEXT NOT NULL,
    balance TEXT NOT NULL DEFAULT '0',
    locked TEXT NOT NULL DEFAULT '0',
    unlock_at INTEGER NOT NULL DEFAULT 0,
    last_synced INTEGER NOT NULL,
    PRIMARY KEY (payer, token)
  );

  CREATE INDEX IF NOT EXISTS idx_last_synced ON wallet_balances(last_synced);

  CREATE TABLE IF NOT EXISTS used_nonces (
    payer TEXT NOT NULL,
    token TEXT NOT NULL,
    nonce TEXT NOT NULL,
    used_at INTEGER NOT NULL,
    PRIMARY KEY (payer, token, nonce)
  );

  CREATE INDEX IF NOT EXISTS idx_payer_token ON used_nonces(payer, token);
`);

// Prepared statements
const insertMandate = db.prepare(`
  INSERT INTO mandates (
    mandate_digest, payer, token, payee, amount, nonce, deadline, ref,
    payer_sig, sp_enqueue_sig, enqueue_deadline, status, enqueued_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateMandateSettled = db.prepare(`
  UPDATE mandates SET status = 'settled', settled_at = ?, tx_hash = ? WHERE mandate_digest = ?
`);

const updateMandateFailed = db.prepare(`
  UPDATE mandates SET status = 'failed' WHERE mandate_digest = ?
`);

const updateMandateRetries = db.prepare(`
  UPDATE mandates SET retries = retries + 1 WHERE mandate_digest = ?
`);

const getQueuedMandates = db.prepare(`
  SELECT * FROM mandates WHERE status = 'enqueued' ORDER BY enqueued_at ASC
`);

const getMandateByDigest = db.prepare(`
  SELECT * FROM mandates WHERE mandate_digest = ?
`);

const getAllMandates = db.prepare(`
  SELECT
    mandate_digest as mandateDigest,
    payer,
    payee,
    amount,
    status,
    enqueued_at as enqueuedAt,
    settled_at as settledAt,
    tx_hash as txHash
  FROM mandates ORDER BY enqueued_at DESC LIMIT 10
`);

const getStats = db.prepare(`
  SELECT
    COUNT(CASE WHEN status = 'enqueued' THEN 1 END) as queued,
    COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
  FROM mandates
`);

const getWalletBalance = db.prepare(`
  SELECT * FROM wallet_balances WHERE payer = ? AND token = ?
`);

const upsertWalletBalance = db.prepare(`
  INSERT INTO wallet_balances (payer, token, balance, locked, unlock_at, last_synced)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(payer, token) DO UPDATE SET
    balance = excluded.balance,
    locked = excluded.locked,
    unlock_at = excluded.unlock_at,
    last_synced = excluded.last_synced
`);

const updateWalletBalanceAfterSettle = db.prepare(`
  UPDATE wallet_balances
  SET balance = (CAST(balance AS INTEGER) - CAST(? AS INTEGER)),
      last_synced = ?
  WHERE payer = ? AND token = ?
`);

const isNonceUsed = db.prepare(`
  SELECT 1 FROM used_nonces WHERE payer = ? AND token = ? AND nonce = ?
`);

const markNonceUsed = db.prepare(`
  INSERT OR IGNORE INTO used_nonces (payer, token, nonce, used_at)
  VALUES (?, ?, ?, ?)
`);

// Verify Solana signature
function verifySignature(message: string, signature: string, publicKey: string): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = new PublicKey(publicKey).toBytes();

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error("[SIG VERIFY ERROR]", error);
    return false;
  }
}

// Generate mandate digest
function getMandateDigest(mandate: any): string {
  const message = JSON.stringify({
    payer: mandate.payer,
    token: mandate.token,
    payee: mandate.payee,
    amount: mandate.amount,
    nonce: mandate.nonce,
    deadline: mandate.deadline,
    ref: mandate.ref,
  });
  return bs58.encode(Buffer.from(message));
}

// Generate SP enqueue signature
function generateEnqueueSignature(mandateDigest: string, enqueueDeadline: number): string {
  const message = `${mandateDigest}:${enqueueDeadline}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, spKeypair.secretKey);
  return bs58.encode(signature);
}

// Helper to derive user account PDA
function getUserAccountPDA(payer: PublicKey, token: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), payer.toBuffer(), token.toBuffer()],
    programId
  );
  return pda;
}

// Sync wallet balance from chain
async function syncWalletBalance(payer: string, token: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Query program for user balance
    const payerPubkey = new PublicKey(payer);
    const tokenPubkey = new PublicKey(token);
    const programId = new PublicKey(PROGRAM_ID);
    
    const userAccountPDA = getUserAccountPDA(payerPubkey, tokenPubkey, programId);
    const accountInfo = await connection.getAccountInfo(userAccountPDA);

    let balance = 0n;
    let locked = 0n;
    let unlockAt = 0;

    if (accountInfo && accountInfo.data) {
      // Parse UserAccount structure:
      // - Discriminator: 8 bytes
      // - balance: u64 (8 bytes) at offset 8
      // - withdraw_lock.locked: u64 (8 bytes) at offset 16
      // - withdraw_lock.unlock_at: i64 (8 bytes) at offset 24
      balance = accountInfo.data.readBigUInt64LE(8);
      locked = accountInfo.data.readBigUInt64LE(16);
      unlockAt = Number(accountInfo.data.readBigInt64LE(24));
    }

    upsertWalletBalance.run(
      payer, 
      token, 
      balance.toString(), 
      locked.toString(), 
      unlockAt, 
      now
    );

    console.log(`[SYNC] Balance synced for ${payer.slice(0, 10)}...: ${balance} (locked: ${locked})`);
  } catch (error) {
    console.error(`[SYNC ERROR] Failed to sync balance for ${payer}:`, error);
  }
}

// Check sufficient balance
function checkSufficientBalance(payer: string, token: string, amount: string): boolean {
  const walletBalance = getWalletBalance.get(payer, token) as any;

  if (!walletBalance) {
    console.warn(`[BALANCE CHECK] No balance record found for ${payer.slice(0, 10)}...`);
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const settlementWindow = 3 * 60 * 60;

  const balance = BigInt(walletBalance.balance);
  const locked = BigInt(walletBalance.locked);
  const unlockAt = Number(walletBalance.unlock_at);

  const availableInWindow = unlockAt <= now + settlementWindow ? balance + locked : balance;
  const required = BigInt(amount);

  if (availableInWindow < required) {
    console.warn(
      `[BALANCE CHECK] Insufficient balance: ${payer.slice(0, 10)}... has ${availableInWindow}, needs ${required}`
    );
    return false;
  }

  console.log(`[BALANCE CHECK] Sufficient balance: ${payer.slice(0, 10)}... has ${availableInWindow}, needs ${required}`);
  return true;
}

// POST /enqueue endpoint
app.post("/enqueue", async (req, res) => {
  const startTime = Date.now();

  try {
    const { mandate, payerSig } = req.body;

    if (!mandate || !payerSig) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Mandate and payerSig required",
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // Check deadline
    if (mandate.deadline < now) {
      return res.status(400).json({
        error: "EXPIRED_MANDATE",
        message: "Mandate has expired",
      });
    }

    // Verify signature
    const mandateMessage = JSON.stringify(mandate);
    if (!verifySignature(mandateMessage, payerSig, mandate.payer)) {
      return res.status(400).json({
        error: "INVALID_SIGNATURE",
        message: "Payer signature verification failed",
      });
    }

    // Check mandate digest uniqueness
    const mandateDigest = getMandateDigest(mandate);
    const existing = getMandateByDigest.get(mandateDigest);
    if (existing) {
      return res.status(400).json({
        error: "DUPLICATE_MANDATE",
        message: "Mandate already processed",
      });
    }

    // Check nonce
    const nonceUsed = isNonceUsed.get(mandate.payer, mandate.token, mandate.nonce.toString());
    if (nonceUsed) {
      return res.status(400).json({
        error: "NONCE_USED",
        message: "Nonce already used",
      });
    }

    // Sync and check balance
    await syncWalletBalance(mandate.payer, mandate.token);
    
    if (!checkSufficientBalance(mandate.payer, mandate.token, mandate.amount.toString())) {
      return res.status(402).json({
        error: "INSUFFICIENT_BALANCE",
        message: "Insufficient debitable balance for settlement",
      });
    }

    // Generate SP commitment signature
    const settlementWindow = 3 * 60 * 60;
    const enqueueDeadline = now + settlementWindow;
    const spEnqueueSig = generateEnqueueSignature(mandateDigest, enqueueDeadline);

    const receipt = {
      sp: spKeypair.publicKey.toString(),
      mandateDigest,
      enqueueDeadline,
      spEnqueueSig,
    };

    // Insert into database
    const transaction = db.transaction(() => {
      insertMandate.run(
        mandateDigest,
        mandate.payer,
        mandate.token,
        mandate.payee,
        mandate.amount.toString(),
        mandate.nonce.toString(),
        mandate.deadline,
        mandate.ref,
        payerSig,
        spEnqueueSig,
        enqueueDeadline,
        "enqueued",
        now
      );

      markNonceUsed.run(mandate.payer, mandate.token, mandate.nonce.toString(), now);
    });

    transaction();

    const duration = Date.now() - startTime;
    console.log(`[ENQUEUE] Mandate ${mandateDigest.slice(0, 10)}... added to queue (${duration}ms)`);

    res.json({
      success: true,
      receipt,
    });
  } catch (error: any) {
    console.error("[ENQUEUE ERROR]", error);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  const stats = getStats.get() as any;
  const history = getAllMandates.all();

  res.json({
    status: "ok",
    sp: spKeypair.publicKey.toString(),
    programId: PROGRAM_ID,
    network: "solana-devnet",
    queueLength: stats.queued || 0,
    settled: stats.settled || 0,
    failed: stats.failed || 0,
    history,
  });
});

// Settlement instruction discriminator from IDL
const SETTLE_DISCRIMINATOR = Buffer.from([175, 42, 185, 87, 144, 131, 102, 212]);

// Helper to create settle instruction
function createSettleInstruction(
  spKeypair: Keypair,
  payer: PublicKey,
  payee: PublicKey,
  mint: PublicKey,
  amount: bigint,
  nonce: bigint,
  deadline: bigint,
  reference: Buffer,
  programId: PublicKey
): web3.TransactionInstruction {
  // Get PDAs
  const [spAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sp_account"), spKeypair.publicKey.toBuffer()],
    programId
  );
  
  const [payerAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), payer.toBuffer(), mint.toBuffer()],
    programId
  );
  
  const [walletStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("wallet_state")],
    programId
  );

  // Get token accounts (both must be associated token accounts)
  const payeeTokenAccount = getAssociatedTokenAddressSync(mint, payee);
  const walletTokenAccount = getAssociatedTokenAddressSync(mint, walletStatePDA, true);

  // Encode instruction data
  const dataLayout = Buffer.alloc(8 + 8 + 8 + 8 + 32);
  SETTLE_DISCRIMINATOR.copy(dataLayout, 0);
  dataLayout.writeBigUInt64LE(amount, 8);
  dataLayout.writeBigUInt64LE(nonce, 16);
  dataLayout.writeBigInt64LE(deadline, 24);
  reference.copy(dataLayout, 32);

  const keys = [
    { pubkey: spAccountPDA, isSigner: false, isWritable: false },
    { pubkey: spKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: false, isWritable: false },
    { pubkey: payerAccountPDA, isSigner: false, isWritable: true },
    { pubkey: payee, isSigner: false, isWritable: false },
    { pubkey: payeeTokenAccount, isSigner: false, isWritable: true },
    { pubkey: walletTokenAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: walletStatePDA, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new web3.TransactionInstruction({
    keys,
    programId,
    data: dataLayout,
  });
}

// Settlement worker
async function settlementWorker() {
  const queuedMandates = getQueuedMandates.all() as any[];

  if (queuedMandates.length === 0) return;

  const item = queuedMandates[0];

  // Double-check status before processing (defensive check)
  const currentItem = getMandateByDigest.get(item.mandate_digest) as any;
  if (!currentItem || currentItem.status !== 'enqueued') {
    console.log(`[WORKER] Mandate ${item.mandate_digest.slice(0, 10)}... is no longer enqueued, skipping`);
    return;
  }

  try {
    console.log(`[WORKER] Processing settlement for ${item.mandate_digest.slice(0, 10)}...`);

    const programId = new PublicKey(PROGRAM_ID);
    const payer = new PublicKey(item.payer);
    const payee = new PublicKey(item.payee);
    const mint = new PublicKey(item.token);
    
    // Convert reference to 32-byte array
    const referenceBuffer = Buffer.alloc(32);
    Buffer.from(item.ref).copy(referenceBuffer);

    // Get payee token account
    const payeeTokenAccount = getAssociatedTokenAddressSync(mint, payee);

    // Create and send transaction
    const transaction = new Transaction();

    // Check if payee token account exists, if not create it
    try {
      await getAccount(connection, payeeTokenAccount);
      console.log(`[WORKER] Payee token account already exists`);
    } catch (error) {
      console.log(`[WORKER] Creating payee token account...`);
      // Create the associated token account for the payee
      const createATAIx = createAssociatedTokenAccountInstruction(
        spKeypair.publicKey, // payer
        payeeTokenAccount, // account to create
        payee, // owner
        mint, // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      transaction.add(createATAIx);
    }

    // Create settle instruction
    const settleIx = createSettleInstruction(
      spKeypair,
      payer,
      payee,
      mint,
      BigInt(item.amount),
      BigInt(item.nonce),
      BigInt(item.deadline),
      referenceBuffer,
      programId
    );

    transaction.add(settleIx);
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = spKeypair.publicKey;
    transaction.sign(spKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Update status immediately after sending (optimistic update)
    // This prevents the worker from picking up the same mandate again
    const now = Math.floor(Date.now() / 1000);
    updateMandateSettled.run(now, signature, item.mandate_digest);
    
    console.log(`[WORKER] Settlement transaction sent for ${item.mandate_digest.slice(0, 10)}... Tx: ${signature}`);
    
    // Wait for confirmation (but status is already updated)
    try {
      await connection.confirmTransaction(signature, "confirmed");
      console.log(`[WORKER] Settlement confirmed for ${item.mandate_digest.slice(0, 10)}... Tx: ${signature}`);
    } catch (confirmError) {
      // If confirmation fails, we still mark it as settled since the transaction was sent
      // The transaction might still succeed even if confirmation times out
      console.warn(`[WORKER] Confirmation timeout for ${item.mandate_digest.slice(0, 10)}... but transaction was sent: ${signature}`);
    }
  } catch (error: any) {
    console.error("[WORKER ERROR]", error);
    updateMandateRetries.run(item.mandate_digest);

    const updatedItem = getMandateByDigest.get(item.mandate_digest) as any;
    if (updatedItem.retries >= 3) {
      console.error(`[WORKER] Max retries reached for ${item.mandate_digest.slice(0, 10)}...`);
      updateMandateFailed.run(item.mandate_digest);
    }
  }
}

// Start worker interval
setInterval(settlementWorker, 1500);

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Settlement Processor Started (Solana) ===");
  console.log(`SP Address: ${spKeypair.publicKey.toString()}`);
  console.log(`Program ID: ${PROGRAM_ID}`);
  console.log(`Database: ${DB_FILE}`);
  console.log(`Port: ${PORT}`);

  const stats = getStats.get() as any;
  console.log(`Loaded: ${stats.queued} queued, ${stats.settled} settled, ${stats.failed} failed`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nClosing database...");
  db.close();
  process.exit(0);
});

