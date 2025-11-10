import express from "express";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

dotenv.config();

const app = express();

// CORS middleware - allow all origins for development
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
const RPC = process.env.RPC || "https://sepolia.base.org";
const SP_PK = process.env.SP_PK!;
const WALLET_ADDR = process.env.WALLET_ADDR!;
const PORT = process.env.SP_PORT || 3001;

if (!SP_PK || SP_PK.includes("your_") || !WALLET_ADDR || WALLET_ADDR.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("");
  console.error("Please set the following in your .env file:");
  if (!SP_PK || SP_PK.includes("your_")) {
    console.error("  ❌ SP_PK - Settlement Processor private key");
  }
  if (!WALLET_ADDR || WALLET_ADDR.includes("your_")) {
    console.error("  ❌ WALLET_ADDR - Deployed contract address (from npm run deploy)");
  }
  console.error("");
  console.error("💡 Your deployed contract: 0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912");
  console.error("   Add this to .env: WALLET_ADDR=0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912");
  console.error("");
  process.exit(1);
}

// Provider and signer
const provider = new ethers.JsonRpcProvider(RPC);
const spWallet = new ethers.Wallet(SP_PK, provider);

// Contract ABI
const WALLET_ABI = [
  "function debitableBalance(address,address) view returns (uint256)",
  "function withdrawLocks(address,address) view returns (uint256 locked, uint64 unlockAt)",
  "function domainSeparator() view returns (bytes32)",
  "function settle((address,address,address,uint256,uint256,uint256,bytes32),bytes) external",
];

const walletContract = new ethers.Contract(WALLET_ADDR, WALLET_ABI, spWallet);

// EIP-712 Domain
const DOMAIN = {
  name: "AEP2DebitWallet",
  version: "1",
  chainId: 84532, // Base Sepolia
  verifyingContract: WALLET_ADDR,
};

// EIP-712 Types
const MANDATE_TYPES = {
  Mandate: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "ref", type: "bytes32" },
  ],
};

// Initialize SQLite database in home directory
const HOME_DIR = os.homedir();
const SP_DATA_DIR = path.join(HOME_DIR, ".sp_data");
const DB_FILE = path.join(SP_DATA_DIR, ".sp-data.db");

// Create .sp_data directory if it doesn't exist
if (!fs.existsSync(SP_DATA_DIR)) {
  fs.mkdirSync(SP_DATA_DIR, { recursive: true, mode: 0o755 });
  console.log(`[INIT] Created data directory: ${SP_DATA_DIR}`);
}

// Ensure directory is writable
try {
  fs.accessSync(SP_DATA_DIR, fs.constants.W_OK);
} catch (error) {
  console.error(`[ERROR] Directory ${SP_DATA_DIR} is not writable`);
  console.error(`[ERROR] Please run: chmod 755 ${SP_DATA_DIR}`);
  process.exit(1);
}

const db = new Database(DB_FILE);
console.log(`[INIT] Database location: ${DB_FILE}`);

// Ensure database file has correct permissions
if (fs.existsSync(DB_FILE)) {
  fs.chmodSync(DB_FILE, 0o644);
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS mandates (
    mandate_digest TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
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

  -- Offchain wallet balance state
  CREATE TABLE IF NOT EXISTS wallet_balances (
    owner TEXT NOT NULL,
    token TEXT NOT NULL,
    balance TEXT NOT NULL DEFAULT '0',
    locked TEXT NOT NULL DEFAULT '0',
    unlock_at INTEGER NOT NULL DEFAULT 0,
    last_synced INTEGER NOT NULL,
    PRIMARY KEY (owner, token)
  );

  CREATE INDEX IF NOT EXISTS idx_last_synced ON wallet_balances(last_synced);

  -- Offchain nonce tracking
  CREATE TABLE IF NOT EXISTS used_nonces (
    owner TEXT NOT NULL,
    token TEXT NOT NULL,
    nonce TEXT NOT NULL,
    used_at INTEGER NOT NULL,
    PRIMARY KEY (owner, token, nonce)
  );

  CREATE INDEX IF NOT EXISTS idx_owner_token ON used_nonces(owner, token);
`);

// Add tx_hash column if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE mandates ADD COLUMN tx_hash TEXT`);
  console.log("[MIGRATION] Added tx_hash column to mandates table");
} catch (error: any) {
  // Column already exists, ignore error
  if (!error.message.includes("duplicate column name")) {
    console.error("[MIGRATION ERROR]", error);
  }
}

// Prepared statements for better performance
const insertMandate = db.prepare(`
  INSERT INTO mandates (
    mandate_digest, owner, token, payee, amount, nonce, deadline, ref,
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
    owner,
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

// Wallet balance statements
const getWalletBalance = db.prepare(`
  SELECT * FROM wallet_balances WHERE owner = ? AND token = ?
`);

const upsertWalletBalance = db.prepare(`
  INSERT INTO wallet_balances (owner, token, balance, locked, unlock_at, last_synced)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(owner, token) DO UPDATE SET
    balance = excluded.balance,
    locked = excluded.locked,
    unlock_at = excluded.unlock_at,
    last_synced = excluded.last_synced
`);

const updateWalletBalanceAfterSettle = db.prepare(`
  UPDATE wallet_balances
  SET balance = (CAST(balance AS INTEGER) - CAST(? AS INTEGER)),
      last_synced = ?
  WHERE owner = ? AND token = ?
`);

// Nonce statements
const isNonceUsed = db.prepare(`
  SELECT 1 FROM used_nonces WHERE owner = ? AND token = ? AND nonce = ?
`);

const markNonceUsed = db.prepare(`
  INSERT OR IGNORE INTO used_nonces (owner, token, nonce, used_at)
  VALUES (?, ?, ?, ?)
`);

// Verify mandate signature (optimized - no async needed)
function verifyMandateSignature(mandate: any, payerSig: string): boolean {
  try {
    const recoveredAddress = ethers.verifyTypedData(
      DOMAIN,
      MANDATE_TYPES,
      mandate,
      payerSig
    );
    return recoveredAddress.toLowerCase() === mandate.owner.toLowerCase();
  } catch (error) {
    return false;
  }
}

// Generate mandate digest
function getMandateDigest(mandate: any): string {
  const encodedMandate = ethers.TypedDataEncoder.encode(
    DOMAIN,
    MANDATE_TYPES,
    mandate
  );
  return ethers.keccak256(encodedMandate);
}

// Generate SP enqueue signature
async function generateEnqueueSignature(
  mandateDigest: string,
  enqueueDeadline: number
): Promise<string> {
  const message = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256"],
    [mandateDigest, enqueueDeadline]
  );
  return spWallet.signMessage(ethers.getBytes(message));
}

// Sync wallet balance from chain
async function syncWalletBalance(owner: string, token: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    const debitableBalance = await walletContract.debitableBalance(owner, token);
    const withdrawLock = await walletContract.withdrawLocks(owner, token);

    upsertWalletBalance.run(
      owner,
      token,
      debitableBalance.toString(),
      withdrawLock.locked.toString(),
      Number(withdrawLock.unlockAt),
      now
    );

    console.log(`[SYNC] Balance synced for ${owner.slice(0, 10)}... token ${token.slice(0, 10)}...`);
  } catch (error) {
    console.error(`[SYNC ERROR] Failed to sync balance for ${owner}:`, error);
  }
}

// Check if wallet has sufficient balance (offchain check)
function checkSufficientBalance(owner: string, token: string, amount: string): boolean {
  const walletBalance = getWalletBalance.get(owner, token) as any;

  if (!walletBalance) {
    // Balance not synced yet, trigger sync in background and optimistically allow
    setImmediate(() => syncWalletBalance(owner, token));
    return true; // Optimistic approval
  }

  const now = Math.floor(Date.now() / 1000);
  const settlementWindow = 3 * 60 * 60;

  const balance = BigInt(walletBalance.balance);
  const locked = BigInt(walletBalance.locked);
  const unlockAt = Number(walletBalance.unlock_at);

  // Calculate available balance within settlement window
  const availableInWindow =
    unlockAt <= now + settlementWindow ? balance + locked : balance;

  const required = BigInt(amount);

  if (availableInWindow < required) {
    console.warn(
      `[BALANCE CHECK] Insufficient balance: ${owner.slice(0, 10)}... has ${availableInWindow}, needs ${required}`
    );
    return false;
  }

  return true;
}

// POST /enqueue endpoint (optimized for speed)
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

    // 1. Quick validation: Check deadline (no async)
    if (mandate.deadline < now) {
      return res.status(400).json({
        error: "EXPIRED_MANDATE",
        message: "Mandate has expired",
      });
    }

    // 2. Verify signature (sync operation, ~1-2ms)
    if (!verifyMandateSignature(mandate, payerSig)) {
      return res.status(400).json({
        error: "INVALID_SIGNATURE",
        message: "Payer signature verification failed",
      });
    }

    // 3. Check mandate digest uniqueness (sync DB query, <1ms)
    const mandateDigest = getMandateDigest(mandate);
    const existing = getMandateByDigest.get(mandateDigest);
    if (existing) {
      return res.status(400).json({
        error: "DUPLICATE_MANDATE",
        message: "Mandate already processed",
      });
    }

    // 4. Check nonce (offchain, <1ms)
    const nonceUsed = isNonceUsed.get(mandate.owner, mandate.token, mandate.nonce.toString());
    if (nonceUsed) {
      return res.status(400).json({
        error: "NONCE_USED",
        message: "Nonce already used",
      });
    }

    // 5. Check balance (offchain, <1ms)
    if (!checkSufficientBalance(mandate.owner, mandate.token, mandate.amount.toString())) {
      return res.status(402).json({
        error: "INSUFFICIENT_BALANCE",
        message: "Insufficient debitable balance for settlement",
      });
    }

    // 6. Generate SP commitment signature
    const settlementWindow = 3 * 60 * 60; // 3 hours in seconds
    const enqueueDeadline = now + settlementWindow;
    const spEnqueueSig = await generateEnqueueSignature(
      mandateDigest,
      enqueueDeadline
    );

    const receipt = {
      sp: spWallet.address,
      mandateDigest,
      enqueueDeadline,
      spEnqueueSig,
    };

    // 7. Insert into database and mark nonce as used (atomic transaction)
    const transaction = db.transaction(() => {
      insertMandate.run(
        mandateDigest,
        mandate.owner,
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

      markNonceUsed.run(
        mandate.owner,
        mandate.token,
        mandate.nonce.toString(),
        now
      );
    });

    transaction();

    const duration = Date.now() - startTime;
    console.log(
      `[ENQUEUE] Mandate ${mandateDigest.slice(0, 10)}... added to queue (${duration}ms)`
    );

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
    sp: spWallet.address,
    wallet: WALLET_ADDR,
    queueLength: stats.queued || 0,
    settled: stats.settled || 0,
    failed: stats.failed || 0,
    history,
  });
});

// Settlement worker
async function settlementWorker() {
  const queuedMandates = getQueuedMandates.all() as any[];

  if (queuedMandates.length === 0) return;

  const item = queuedMandates.shift();
  if (!item) return;

  try {
    console.log(
      `[WORKER] Processing settlement for ${item.mandate_digest.slice(0, 10)}...`
    );

    // Reconstruct mandate
    const mandate = {
      owner: item.owner,
      token: item.token,
      payee: item.payee,
      amount: item.amount,
      nonce: item.nonce,
      deadline: item.deadline,
      ref: item.ref,
    };

    // Convert mandate object to tuple format for contract call
    const mandateTuple = [
      mandate.owner,
      mandate.token,
      mandate.payee,
      mandate.amount,
      mandate.nonce,
      mandate.deadline,
      mandate.ref,
    ];

    // Call contract settle function
    const tx = await walletContract.settle(mandateTuple, item.payer_sig, {
      gasLimit: 300000,
    });

    console.log(`[WORKER] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();

    // Check if transaction was successful
    if (receipt.status === 0) {
      throw new Error("Transaction reverted");
    }

    console.log(
      `[WORKER] Settlement successful for ${item.mandate_digest.slice(0, 10)}...`
    );

    // Update status and offchain balance (atomic transaction)
    const now = Math.floor(Date.now() / 1000);
    const updateTransaction = db.transaction(() => {
      updateMandateSettled.run(now, tx.hash, item.mandate_digest);

      // Update offchain balance
      updateWalletBalanceAfterSettle.run(
        item.amount,
        now,
        item.owner,
        item.token
      );
    });

    updateTransaction();
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error("[WORKER ERROR]", errorMsg);

    // Check if transaction execution reverted
    if (errorMsg.includes("transaction execution reverted") || errorMsg.includes("Transaction reverted")) {
      console.log(
        `[WORKER] Transaction reverted for ${item.mandate_digest.slice(0, 10)}..., marking as failed`
      );
      updateMandateFailed.run(item.mandate_digest);
      return;
    }

    // Check if transaction already known
    if (errorMsg.includes("already known") || errorMsg.includes("nonce too low") || errorMsg.includes("could not coalesce error")) {
      console.log(
        `[WORKER] Transaction already submitted for ${item.mandate_digest.slice(0, 10)}..., marking as settled`
      );
      const now = Math.floor(Date.now() / 1000);
      updateMandateSettled.run(now, null, item.mandate_digest);
      return;
    }

    // Check if nonce already used
    if (errorMsg.includes("Nonce already used") || errorMsg.includes("already used")) {
      console.log(
        `[WORKER] Settlement already completed for ${item.mandate_digest.slice(0, 10)}...`
      );
      const now = Math.floor(Date.now() / 1000);
      updateMandateSettled.run(now, null, item.mandate_digest);
      return;
    }

    // Simple retry logic
    updateMandateRetries.run(item.mandate_digest);
    const updatedItem = getMandateByDigest.get(item.mandate_digest) as any;

    if (updatedItem.retries >= 3) {
      console.error(
        `[WORKER] Max retries reached for ${item.mandate_digest.slice(0, 10)}..., marking as failed`
      );
      updateMandateFailed.run(item.mandate_digest);
    } else {
      console.log(
        `[WORKER] Retry ${updatedItem.retries}/3 for ${item.mandate_digest.slice(0, 10)}...`
      );
    }
  }
}

// Start worker interval
setInterval(settlementWorker, 1500);

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Settlement Processor Started (SQLite) ===");
  console.log(`SP Address: ${spWallet.address}`);
  console.log(`Wallet Contract: ${WALLET_ADDR}`);
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
