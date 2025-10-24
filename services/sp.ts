import express from "express";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

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

// Settlement queue with persistence
interface QueueItem {
  mandate: any;
  payerSig: string;
  receipt: any;
  retries: number;
  status: "enqueued" | "settled" | "failed";
  enqueuedAt: number;
  settledAt?: number;
}

interface PersistentData {
  queue: QueueItem[];
  processedMandates: string[];
  mandateHistory: QueueItem[];
  settled: number;
}

const DATA_FILE = path.join(__dirname, "../.sp-data.json");

let settlementQueue: QueueItem[] = [];
let processedMandates = new Set<string>();
let mandateHistory: QueueItem[] = [];
let settledCount = 0;

// Load persistent data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data: PersistentData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      settlementQueue = data.queue || [];
      processedMandates = new Set(data.processedMandates || []);
      mandateHistory = data.mandateHistory || [];
      settledCount = data.settled || 0;
      console.log(`[PERSISTENCE] Loaded ${settlementQueue.length} queued, ${settledCount} settled mandates`);
    }
  } catch (error) {
    console.error("[PERSISTENCE ERROR] Failed to load data:", error);
  }
}

// Save persistent data
function saveData() {
  try {
    const data: PersistentData = {
      queue: settlementQueue,
      processedMandates: Array.from(processedMandates),
      mandateHistory,
      settled: settledCount,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[PERSISTENCE ERROR] Failed to save data:", error);
  }
}

// Load data on startup
loadData();

// Verify mandate signature
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
    console.error("Signature verification failed:", error);
    return false;
  }
}

// Calculate mandate digest
function getMandateDigest(mandate: any): string {
  return ethers.TypedDataEncoder.hash(DOMAIN, MANDATE_TYPES, mandate);
}

// Generate SP enqueue signature
async function generateEnqueueSignature(
  mandateDigest: string,
  enqueueDeadline: number
): Promise<string> {
  const message = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "uint256"],
    [mandateDigest, spWallet.address, enqueueDeadline]
  );
  return await spWallet.signMessage(ethers.getBytes(message));
}

// POST /enqueue endpoint
app.post("/enqueue", async (req, res) => {
  try {
    const { mandate, payerSig } = req.body;

    if (!mandate || !payerSig) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "mandate and payerSig are required",
      });
    }

    // 1. Verify signature
    if (!verifyMandateSignature(mandate, payerSig)) {
      return res.status(400).json({
        error: "INVALID_SIGNATURE",
        message: "Payer signature verification failed",
      });
    }

    // 2. Check deadline
    const now = Math.floor(Date.now() / 1000);
    if (mandate.deadline <= now) {
      return res.status(400).json({
        error: "MANDATE_EXPIRED",
        message: "Mandate deadline has passed",
      });
    }

    // 3. Check mandate digest uniqueness
    const mandateDigest = getMandateDigest(mandate);
    if (processedMandates.has(mandateDigest)) {
      return res.status(400).json({
        error: "DUPLICATE_MANDATE",
        message: "Mandate already processed",
      });
    }

    // 4. Check on-chain debitable balance
    const debitableBalance = await walletContract.debitableBalance(
      mandate.owner,
      mandate.token
    );

    // 5. Check withdraw locks
    const withdrawLock = await walletContract.withdrawLocks(
      mandate.owner,
      mandate.token
    );

    // Calculate available balance within settlement window (3 hours)
    const settlementWindow = 3 * 60 * 60; // 3 hours in seconds
    const availableInWindow =
      withdrawLock.unlockAt <= now + settlementWindow
        ? debitableBalance + withdrawLock.locked
        : debitableBalance;

    if (availableInWindow < mandate.amount) {
      return res.status(402).json({
        error: "INSUFFICIENT_BALANCE",
        message: "Insufficient debitable balance for settlement",
        available: availableInWindow.toString(),
        required: mandate.amount.toString(),
      });
    }

    // 6. Generate SP commitment signature
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

    // 7. Add to settlement queue
    const queueItem: QueueItem = {
      mandate,
      payerSig,
      receipt,
      retries: 0,
      status: "enqueued",
      enqueuedAt: now,
    };

    settlementQueue.push(queueItem);
    mandateHistory.push(queueItem);
    processedMandates.add(mandateDigest);

    saveData();

    console.log(
      `[ENQUEUE] Mandate ${mandateDigest.slice(0, 10)}... added to queue`
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
  res.json({
    status: "ok",
    sp: spWallet.address,
    wallet: WALLET_ADDR,
    queueLength: settlementQueue.length,
    settled: settledCount,
    history: mandateHistory.map((item) => ({
      mandateDigest: item.receipt.mandateDigest,
      owner: item.mandate.owner,
      payee: item.mandate.payee,
      amount: item.mandate.amount,
      status: item.status,
      enqueuedAt: item.enqueuedAt,
      settledAt: item.settledAt,
    })),
  });
});

// Settlement worker
async function settlementWorker() {
  if (settlementQueue.length === 0) return;

  const item = settlementQueue[0];
  const { mandate, payerSig } = item;

  try {
    console.log(
      `[WORKER] Processing settlement for ${item.receipt.mandateDigest.slice(0, 10)}...`
    );

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
    const tx = await walletContract.settle(mandateTuple, payerSig, {
      gasLimit: 300000,
    });

    console.log(`[WORKER] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();

    // Check if transaction was successful
    if (receipt.status === 0) {
      throw new Error("Transaction reverted");
    }

    console.log(
      `[WORKER] Settlement successful for ${item.receipt.mandateDigest.slice(0, 10)}...`
    );

    // Update item status
    item.status = "settled";
    item.settledAt = Math.floor(Date.now() / 1000);

    // Update history
    const historyItem = mandateHistory.find(
      (h) => h.receipt.mandateDigest === item.receipt.mandateDigest
    );
    if (historyItem) {
      historyItem.status = "settled";
      historyItem.settledAt = item.settledAt;
    }

    settledCount++;

    // Remove from queue
    settlementQueue.shift();

    saveData();
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error("[WORKER ERROR]", errorMsg);

    // Check if transaction execution reverted
    if (errorMsg.includes("transaction execution reverted") || errorMsg.includes("Transaction reverted")) {
      console.log(
        `[WORKER] Transaction reverted for ${item.receipt.mandateDigest.slice(0, 10)}..., removing from queue`
      );

      // Update history status
      item.status = "failed";
      const historyItem = mandateHistory.find(
        (h) => h.receipt.mandateDigest === item.receipt.mandateDigest
      );
      if (historyItem) {
        historyItem.status = "failed";
      }

      settlementQueue.shift();
      saveData();
      return;
    }

    // Check if transaction already known (already submitted/mined)
    if (errorMsg.includes("already known") || errorMsg.includes("nonce too low") || errorMsg.includes("could not coalesce error")) {
      console.log(
        `[WORKER] Transaction already submitted for ${item.receipt.mandateDigest.slice(0, 10)}..., removing from queue`
      );
      settlementQueue.shift();
      saveData();
      return;
    }

    // Check if nonce already used (settlement already completed)
    if (errorMsg.includes("Nonce already used") || errorMsg.includes("already used")) {
      console.log(
        `[WORKER] Settlement already completed for ${item.receipt.mandateDigest.slice(0, 10)}..., removing from queue`
      );
      settlementQueue.shift();
      saveData();
      return;
    }

    // Simple retry logic (PoC)
    item.retries++;
    if (item.retries >= 3) {
      console.error(
        `[WORKER] Max retries reached for ${item.receipt.mandateDigest.slice(0, 10)}..., removing from queue`
      );

      // Update history status
      item.status = "failed";
      const historyItem = mandateHistory.find(
        (h) => h.receipt.mandateDigest === item.receipt.mandateDigest
      );
      if (historyItem) {
        historyItem.status = "failed";
      }

      settlementQueue.shift();
      saveData();
    } else {
      console.log(
        `[WORKER] Retry ${item.retries}/3 for ${item.receipt.mandateDigest.slice(0, 10)}...`
      );
    }
  }
}

// Start worker interval
setInterval(settlementWorker, 1500);

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Settlement Processor Started ===");
  console.log(`SP Address: ${spWallet.address}`);
  console.log(`Wallet Contract: ${WALLET_ADDR}`);
  console.log(`Listening on port ${PORT}`);
  console.log(`RPC: ${RPC}`);
});
