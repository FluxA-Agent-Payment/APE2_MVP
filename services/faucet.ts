import express from "express";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

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
const PORT = process.env.FAUCET_PORT || 3003;
const FAUCET_PK = process.env.DEPLOYER_PK;
const RPC_URL = process.env.RPC || "https://sepolia.base.org";
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x81bb48C38d6127cEd513804Bfb4828622eb3D0d4";

// Amounts to send
const USDC_AMOUNT = "3"; // 3 USDC
const ETH_AMOUNT = "0.0001"; // 0.0001 ETH

// USDC ABI
const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

// Rate limiting: track last claim time per address
const lastClaimTime = new Map<string, number>();
const CLAIM_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const faucetWallet = new ethers.Wallet(FAUCET_PK!, provider);
const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, faucetWallet);

// POST /claim endpoint
app.post("/claim", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        error: "INVALID_ADDRESS",
        message: "Valid Ethereum address required",
      });
    }

    // Check rate limiting
    const normalizedAddress = address.toLowerCase();
    const lastClaim = lastClaimTime.get(normalizedAddress);
    const now = Date.now();

    if (lastClaim && now - lastClaim < CLAIM_COOLDOWN) {
      const remainingTime = Math.ceil((CLAIM_COOLDOWN - (now - lastClaim)) / 1000 / 60);
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: `Please wait ${remainingTime} minutes before claiming again`,
        remainingMinutes: remainingTime,
      });
    }

    console.log(`[FAUCET] Processing claim for ${address}`);

    // Check faucet balances
    const faucetEthBalance = await provider.getBalance(faucetWallet.address);
    const faucetUsdcBalance = await usdcContract.balanceOf(faucetWallet.address);

    const ethToSend = ethers.parseEther(ETH_AMOUNT);
    const usdcToSend = ethers.parseUnits(USDC_AMOUNT, 6);

    if (faucetEthBalance < ethToSend) {
      return res.status(503).json({
        error: "INSUFFICIENT_ETH",
        message: "Faucet has insufficient ETH balance",
      });
    }

    if (faucetUsdcBalance < usdcToSend) {
      return res.status(503).json({
        error: "INSUFFICIENT_USDC",
        message: "Faucet has insufficient USDC balance",
      });
    }

    // Send ETH
    console.log(`[FAUCET] Sending ${ETH_AMOUNT} ETH to ${address}...`);
    const ethTx = await faucetWallet.sendTransaction({
      to: address,
      value: ethToSend,
    });
    await ethTx.wait();
    console.log(`[FAUCET] ETH sent: ${ethTx.hash}`);

    // Send USDC
    console.log(`[FAUCET] Sending ${USDC_AMOUNT} USDC to ${address}...`);
    const usdcTx = await usdcContract.transfer(address, usdcToSend);
    await usdcTx.wait();
    console.log(`[FAUCET] USDC sent: ${usdcTx.hash}`);

    // Update rate limiting
    lastClaimTime.set(normalizedAddress, now);

    res.json({
      success: true,
      transactions: {
        eth: {
          hash: ethTx.hash,
          amount: ETH_AMOUNT,
        },
        usdc: {
          hash: usdcTx.hash,
          amount: USDC_AMOUNT,
        },
      },
    });
  } catch (error: any) {
    console.error("[FAUCET ERROR]", error);
    res.status(500).json({
      error: "CLAIM_FAILED",
      message: error.message || "Failed to process claim",
    });
  }
});

// Health check
app.get("/health", async (req, res) => {
  try {
    const faucetEthBalance = await provider.getBalance(faucetWallet.address);
    const faucetUsdcBalance = await usdcContract.balanceOf(faucetWallet.address);

    res.json({
      status: "ok",
      faucetAddress: faucetWallet.address,
      balances: {
        eth: ethers.formatEther(faucetEthBalance),
        usdc: ethers.formatUnits(faucetUsdcBalance, 6),
      },
      claimAmounts: {
        eth: ETH_AMOUNT,
        usdc: USDC_AMOUNT,
      },
      cooldown: `${CLAIM_COOLDOWN / 1000 / 60} minutes`,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log("=== AEP2 Faucet Service Started ===");
  console.log(`Faucet Address: ${faucetWallet.address}`);
  console.log(`ETH per claim: ${ETH_AMOUNT}`);
  console.log(`USDC per claim: ${USDC_AMOUNT}`);
  console.log(`Cooldown: ${CLAIM_COOLDOWN / 1000 / 60} minutes`);
  console.log(`Listening on port ${PORT}`);
});
