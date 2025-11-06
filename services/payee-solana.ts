import express from "express";
import * as dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";

dotenv.config();

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Payment-Mandate");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Configuration
const SP_URL = process.env.SP_URL || "http://localhost:3001";
const PAYEE_PORT = process.env.PAYEE_PORT || 3002;
const PAYEE_ADDRESS = process.env.PAYEE_SOLANA_ADDRESS!;
const USDC_MINT = process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

if (!PAYEE_ADDRESS || PAYEE_ADDRESS.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("Please set PAYEE_SOLANA_ADDRESS in your .env file");
  process.exit(1);
}

// Validate Solana address
try {
  new PublicKey(PAYEE_ADDRESS);
} catch (error) {
  console.error("❌ Invalid PAYEE_SOLANA_ADDRESS");
  process.exit(1);
}

// Pricing
const API_PRICE = 0.001; // 0.001 USDC

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    payee: PAYEE_ADDRESS,
    network: "solana-devnet",
    spUrl: SP_URL,
  });
});

// Protected endpoint - ETH-USD price prediction
app.get("/predict", async (req, res) => {
  const mandateHeader = req.headers["x-payment-mandate"] as string;

  // Check if payment header exists
  if (!mandateHeader) {
    return res.status(402).json({
      error: "PAYMENT_REQUIRED",
      message: `Missing X-Payment-Mandate header. Price: ${API_PRICE} USDC required.`,
      price: API_PRICE,
      currency: "USDC",
      network: "solana-devnet",
      payee: PAYEE_ADDRESS,
      token: USDC_MINT,
    });
  }

  try {
    // Decode mandate
    const mandatePayload = JSON.parse(Buffer.from(mandateHeader, "base64").toString());
    const { mandate, payerSig } = mandatePayload;

    // Validate mandate fields
    if (!mandate || !payerSig) {
      return res.status(400).json({
        error: "INVALID_MANDATE",
        message: "Mandate and payerSig required",
      });
    }

    // Validate payee matches
    if (mandate.payee !== PAYEE_ADDRESS) {
      return res.status(400).json({
        error: "INVALID_PAYEE",
        message: "Mandate payee does not match service address",
      });
    }

    // Validate token
    if (mandate.token !== USDC_MINT) {
      return res.status(400).json({
        error: "INVALID_TOKEN",
        message: "Only USDC payments accepted",
      });
    }

    // Validate amount (in smallest units: 1 USDC = 1,000,000)
    const expectedAmount = Math.floor(API_PRICE * 1_000_000);
    if (parseInt(mandate.amount) < expectedAmount) {
      return res.status(402).json({
        error: "INSUFFICIENT_PAYMENT",
        message: `Insufficient payment. Required: ${API_PRICE} USDC`,
        required: expectedAmount,
        received: mandate.amount,
      });
    }

    // Forward to SP for validation and enqueue
    const spResponse = await fetch(`${SP_URL}/enqueue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mandate,
        payerSig,
      }),
    });

    const spData = await spResponse.json() as any;

    if (!spResponse.ok) {
      return res.status(spResponse.status).json({
        error: "SP_ERROR",
        message: spData.message || "Settlement Processor rejected payment",
        details: spData,
      });
    }

    // Validate SP response structure
    if (!spData.success || !spData.receipt) {
      return res.status(500).json({
        error: "INVALID_SP_RESPONSE",
        message: "Settlement Processor returned invalid response",
        details: spData,
      });
    }

    // Payment validated and enqueued - return data
    const mockPrice = (Math.random() * 1000 + 3000).toFixed(2);

    res.json({
      symbol: "ETH-USD",
      price: parseFloat(mockPrice),
      timestamp: Math.floor(Date.now() / 1000),
      payment: {
        status: "enqueued",
        spReceipt: spData.receipt,
      },
    });
  } catch (error: any) {
    console.error("[PREDICT ERROR]", error);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error.message,
    });
  }
});

// Start server
app.listen(PAYEE_PORT, () => {
  console.log("=== AEP2 Payee Service Started (Solana) ===");
  console.log(`Payee Address: ${PAYEE_ADDRESS}`);
  console.log(`Network: Solana Devnet`);
  console.log(`Token: USDC (${USDC_MINT})`);
  console.log(`API Price: ${API_PRICE} USDC`);
  console.log(`Port: ${PAYEE_PORT}`);
  console.log(`SP URL: ${SP_URL}`);
});

