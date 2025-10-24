import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Setup script to authorize SP and deposit initial funds
 */
async function main() {
  const walletAddress = process.env.WALLET_ADDR;
  const spAddress = process.env.SP_ADDRESS;
  const usdcAddress = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  if (!walletAddress) {
    console.error("Error: WALLET_ADDR must be set in .env");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Setup with account:", deployer.address);

  const wallet = await ethers.getContractAt("AEP2DebitWallet", walletAddress);

  // 1. Authorize SP if provided
  if (spAddress) {
    console.log("\n[1/2] Authorizing SP...");
    const isSPAuthorized = await wallet.sp(spAddress);

    if (isSPAuthorized) {
      console.log(`SP ${spAddress} is already authorized`);
    } else {
      const tx = await wallet.setSP(spAddress, true);
      await tx.wait();
      console.log(`SP ${spAddress} authorized successfully`);
    }
  } else {
    console.log("\n[1/2] Skipping SP authorization (SP_ADDRESS not set)");
  }

  // 2. Check and deposit USDC if needed
  console.log("\n[2/2] Checking USDC balance...");
  const balance = await wallet.balances(deployer.address, usdcAddress);
  console.log(`Current wallet balance: ${ethers.formatUnits(balance, 6)} USDC`);

  const debitableBalance = await wallet.debitableBalance(deployer.address, usdcAddress);
  console.log(`Debitable balance: ${ethers.formatUnits(debitableBalance, 6)} USDC`);

  console.log("\n=== Setup Complete ===");
  console.log("Contract:", walletAddress);
  console.log("Owner:", deployer.address);
  if (spAddress) {
    console.log("SP:", spAddress);
  }
  console.log("\nTo deposit USDC:");
  console.log("1. Get USDC from faucet or swap");
  console.log("2. Approve: usdc.approve(WALLET_ADDR, amount)");
  console.log("3. Deposit: wallet.deposit(USDC_ADDRESS, amount)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
