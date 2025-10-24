import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const RPC = process.env.RPC || "https://sepolia.base.org";
const CLIENT_PK = process.env.CLIENT_PK!;
const PAYEE_URL = process.env.PAYEE_URL || "http://localhost:3002";
const WALLET_ADDR = process.env.WALLET_ADDR!;
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
const PAYEE_ADDRESS = process.env.PAYEE_ADDRESS!;

if (!CLIENT_PK || CLIENT_PK.includes("your_") || !WALLET_ADDR || !PAYEE_ADDRESS || PAYEE_ADDRESS.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("");
  console.error("Please set the following in your .env file:");
  if (!CLIENT_PK || CLIENT_PK.includes("your_")) {
    console.error("  ❌ CLIENT_PK - Your client wallet private key");
  }
  if (!WALLET_ADDR) {
    console.error("  ❌ WALLET_ADDR - Deployed contract address");
    console.error("      Your deployed contract: 0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912");
  }
  if (!PAYEE_ADDRESS || PAYEE_ADDRESS.includes("your_")) {
    console.error("  ❌ PAYEE_ADDRESS - Payee wallet address (can be any address, e.g., SP address)");
  }
  console.error("");
  console.error("💡 Tips:");
  console.error("  1. Run 'npm run addresses' to see your addresses from private keys");
  console.error("  2. Copy .env.example to .env if you haven't");
  console.error("  3. Make sure to use actual private keys (without 0x prefix for PKs)");
  console.error("  4. PAYEE_ADDRESS should be a valid Ethereum address (with 0x prefix)");
  console.error("");
  process.exit(1);
}

// Provider and signer
const provider = new ethers.JsonRpcProvider(RPC);
const clientWallet = new ethers.Wallet(CLIENT_PK, provider);

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

// Generate random nonce
function generateNonce(): bigint {
  return BigInt("0x" + Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join(""));
}

// Generate reference hash
function generateRef(callId: string): string {
  return ethers.id(callId);
}

// Create and sign mandate
async function createMandate(
  payee: string,
  amountUSD: number,
  callId: string
): Promise<{ mandate: any; payerSig: string }> {
  // Convert USD to USDC (6 decimals)
  const amount = ethers.parseUnits(amountUSD.toString(), 6);

  // Create mandate
  const mandate = {
    owner: clientWallet.address,
    token: USDC_ADDRESS,
    payee,
    amount: amount.toString(),
    nonce: generateNonce().toString(),
    deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    ref: generateRef(callId),
  };

  // Sign with EIP-712
  const payerSig = await clientWallet.signTypedData(
    DOMAIN,
    MANDATE_TYPES,
    mandate
  );

  return { mandate, payerSig };
}

// Encode payment header
function encodePaymentHeader(mandate: any, payerSig: string): string {
  const payload = JSON.stringify({ mandate, payerSig });
  return Buffer.from(payload).toString("base64");
}

// Call payee API with payment
async function callPredictAPI(): Promise<void> {
  console.log("=== AEP2 Client Demo ===");
  console.log(`Client Address: ${clientWallet.address}`);
  console.log(`Payee Address: ${PAYEE_ADDRESS}`);
  console.log(`Wallet Contract: ${WALLET_ADDR}`);
  console.log("");

  try {
    // 1. Create mandate for 0.001 USD
    console.log("[1/3] Creating payment mandate...");
    const callId = `predict-${Date.now()}`;
    const { mandate, payerSig } = await createMandate(PAYEE_ADDRESS, 0.001, callId);

    console.log("Mandate created:");
    console.log(`  - Amount: 0.001 USDC`);
    console.log(`  - Nonce: ${mandate.nonce}`);
    console.log(`  - Deadline: ${new Date(mandate.deadline * 1000).toISOString()}`);
    console.log(`  - Ref: ${mandate.ref}`);
    console.log("");

    // 2. Encode payment header
    console.log("[2/3] Encoding payment header...");
    const paymentHeader = encodePaymentHeader(mandate, payerSig);
    console.log(`Payment header: ${paymentHeader.slice(0, 50)}...`);
    console.log("");

    // 3. Call API
    console.log("[3/3] Calling /predict API...");
    const response = await fetch(`${PAYEE_URL}/predict`, {
      method: "GET",
      headers: {
        "X-Payment-Mandate": paymentHeader,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      return;
    }

    const data: any = await response.json();

    console.log("=== Success ===");
    console.log(`ETH-USD Price: $${data.price}`);
    console.log(`Timestamp: ${new Date(data.timestamp * 1000).toISOString()}`);
    console.log("");
    console.log("Payment Status:", data.payment.status);
    console.log("SP Receipt:");
    console.log(`  - SP Address: ${data.payment.spReceipt.sp}`);
    console.log(`  - Mandate Digest: ${data.payment.spReceipt.mandateDigest}`);
    console.log(`  - Enqueue Deadline: ${new Date(data.payment.spReceipt.enqueueDeadline * 1000).toISOString()}`);
    console.log("");
    console.log("Settlement will be completed on-chain by SP within 3 hours.");
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

// Test without payment
async function testWithoutPayment(): Promise<void> {
  console.log("=== Testing without payment ===");
  try {
    const response = await fetch(`${PAYEE_URL}/predict`, {
      method: "GET",
    });

    const data: any = await response.json();
    console.log("Response:", data);
    console.log("");
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "no-payment") {
    await testWithoutPayment();
  } else {
    await callPredictAPI();
  }
}

main().catch(console.error);
