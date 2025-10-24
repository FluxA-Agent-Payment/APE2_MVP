import express from "express";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const SP_URL = process.env.SP_URL || "http://localhost:3001";
const PORT = process.env.PAYEE_PORT || 3002;
const PAYEE_ADDRESS = process.env.PAYEE_ADDRESS || "0x0000000000000000000000000000000000000000";

const PRICE_USD = 0.001; // Price in USD for /predict endpoint

// Helper to parse X-Payment-Mandate header
function parsePaymentHeader(header: string | undefined): any {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    console.error("Failed to parse payment header:", error);
    return null;
  }
}

// Helper to call SP enqueue
async function enqueueWithSP(mandate: any, payerSig: string): Promise<any> {
  const response = await fetch(`${SP_URL}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mandate, payerSig }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: any = {
      status: response.status,
    };
    if (data && typeof data === 'object') {
      Object.assign(error, data);
    }
    throw error;
  }

  return data;
}

// GET /predict endpoint
app.get("/predict", async (req, res) => {
  try {
    // Check for payment header
    const paymentHeader = req.headers["x-payment-mandate"] as string | undefined;

    if (!paymentHeader) {
      return res.status(402).json({
        error: "PAYMENT_REQUIRED",
        message: `Missing X-Payment-Mandate header. Price: ${PRICE_USD} USD required.`,
        price: PRICE_USD,
        currency: "USD",
        payee: PAYEE_ADDRESS,
      });
    }

    // Parse payment mandate
    const payment = parsePaymentHeader(paymentHeader);
    if (!payment || !payment.mandate || !payment.payerSig) {
      return res.status(400).json({
        error: "INVALID_PAYMENT",
        message: "Invalid payment header format",
      });
    }

    const { mandate, payerSig } = payment;

    // Verify mandate payee matches this service
    if (mandate.payee.toLowerCase() !== PAYEE_ADDRESS.toLowerCase()) {
      return res.status(400).json({
        error: "INVALID_PAYEE",
        message: "Mandate payee does not match this service",
        expected: PAYEE_ADDRESS,
        received: mandate.payee,
      });
    }

    // Forward to SP for enqueue
    let spResult;
    try {
      spResult = await enqueueWithSP(mandate, payerSig);
    } catch (error: any) {
      console.error("[SP ERROR]", error);
      return res.status(error.status || 500).json({
        error: error.error || "SP_ERROR",
        message: error.message || "Settlement processor error",
        details: error,
      });
    }

    // Generate mock ETH-USD price
    const basePrice = 4000;
    const variance = Math.random() * 40 - 20; // ±20
    const price = Math.round((basePrice + variance) * 100) / 100;

    console.log(
      `[PREDICT] Served price ${price} to ${mandate.owner.slice(0, 10)}... with mandate ${spResult.receipt.mandateDigest.slice(0, 10)}...`
    );

    // Return price with SP receipt
    res.json({
      symbol: "ETH-USD",
      price,
      timestamp: Math.floor(Date.now() / 1000),
      payment: {
        status: "enqueued",
        spReceipt: spResult.receipt,
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

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    payee: PAYEE_ADDRESS,
    price: PRICE_USD,
    sp: SP_URL,
  });
});

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Demo Payee Started ===");
  console.log(`Payee Address: ${PAYEE_ADDRESS}`);
  console.log(`Price: ${PRICE_USD} USD per request`);
  console.log(`Listening on port ${PORT}`);
  console.log(`SP URL: ${SP_URL}`);
});
