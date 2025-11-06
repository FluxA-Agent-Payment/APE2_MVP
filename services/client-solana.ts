import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import nacl from "tweetnacl";

dotenv.config();

// Configuration
const CLIENT_PK = process.env.CLIENT_SOLANA_PK!;
const PAYEE_URL = process.env.PAYEE_URL || "http://localhost:3002";
const PAYEE_ADDRESS = process.env.PAYEE_SOLANA_ADDRESS!;
const USDC_MINT = process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

if (!CLIENT_PK || CLIENT_PK.includes("your_")) {
  console.error("❌ Configuration Error!");
  console.error("Please set CLIENT_SOLANA_PK in your .env file");
  process.exit(1);
}

// Initialize client
const clientKeypair = Keypair.fromSecretKey(bs58.decode(CLIENT_PK));
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");

console.log("=== AEP2 Solana Client Demo ===");
console.log(`Client Address: ${clientKeypair.publicKey.toString()}`);
console.log(`Payee Address: ${PAYEE_ADDRESS}`);
console.log(`Network: Solana Devnet`);
console.log();

async function createAndSignMandate() {
  const mandate = {
    payer: clientKeypair.publicKey.toString(),
    token: USDC_MINT,
    payee: PAYEE_ADDRESS,
    amount: (0.001 * 1_000_000).toString(), // 0.001 USDC
    nonce: Math.floor(Math.random() * 1000000000).toString(),
    deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    ref: `api-call-${Date.now()}`,
  };

  console.log("[1/3] Creating payment mandate...");
  console.log("Mandate created:");
  console.log(`  - Amount: 0.001 USDC`);
  console.log(`  - Nonce: ${mandate.nonce}`);
  console.log(`  - Deadline: ${new Date(mandate.deadline * 1000).toISOString()}`);
  console.log(`  - Ref: ${mandate.ref}`);
  console.log();

  // Sign mandate
  const mandateMessage = JSON.stringify(mandate);
  const messageBytes = new TextEncoder().encode(mandateMessage);
  const signature = nacl.sign.detached(messageBytes, clientKeypair.secretKey);
  const signatureBase58 = bs58.encode(signature);

  return { mandate, payerSig: signatureBase58 };
}

async function callPaidAPI() {
  try {
    // Create and sign mandate
    const { mandate, payerSig } = await createAndSignMandate();

    // Encode for HTTP header
    console.log("[2/3] Encoding payment header...");
    const payload = JSON.stringify({ mandate, payerSig });
    const base64 = Buffer.from(payload).toString("base64");
    console.log(`Payment header: ${base64.slice(0, 50)}...`);
    console.log();

    // Call API
    console.log("[3/3] Calling /predict API...");
    const response = await fetch(`${PAYEE_URL}/predict`, {
      method: "GET",
      headers: {
        "X-Payment-Mandate": base64,
      },
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("=== Error ===");
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${data.error}`);
      console.error(`Message: ${data.message}`);
      return;
    }

    // Validate response structure
    if (!data.payment || !data.payment.spReceipt) {
      console.error("=== Error ===");
      console.error("Invalid response structure from payee");
      console.error("Response:", JSON.stringify(data, null, 2));
      return;
    }

    console.log("=== Success ===");
    console.log(`${data.symbol} Price: $${data.price}`);
    console.log(`Timestamp: ${new Date(data.timestamp * 1000).toISOString()}`);
    console.log();
    console.log(`Payment Status: ${data.payment.status}`);
    console.log("SP Receipt:");
    console.log(`  - SP Address: ${data.payment.spReceipt.sp}`);
    console.log(`  - Mandate Digest: ${data.payment.spReceipt.mandateDigest.slice(0, 20)}...`);
    console.log(`  - Enqueue Deadline: ${new Date(data.payment.spReceipt.enqueueDeadline * 1000).toISOString()}`);
    console.log(`  - SP Signature: ${data.payment.spReceipt.spEnqueueSig.slice(0, 20)}...`);
    console.log();
    console.log("Settlement will be completed on-chain by SP within 3 hours.");
  } catch (error: any) {
    console.error("=== Error ===");
    console.error(error.message);
  }
}

// Run demo
if (process.argv[2] === "no-payment") {
  console.log("Testing API without payment (should return 402)...");
  fetch(`${PAYEE_URL}/predict`)
    .then((res) => res.json())
    .then((data) => {
      console.log("=== 402 Response ===");
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(console.error);
} else {
  callPaidAPI();
}

