import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Helper script to deposit USDC into the wallet
 */
async function main() {
  const walletAddress = process.env.WALLET_ADDR;
  const usdcAddress = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const amount = process.env.DEPOSIT_AMOUNT || "1"; // Default 1 USDC

  if (!walletAddress) {
    console.error("Error: WALLET_ADDR must be set in .env");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Depositing from account:", signer.address);

  const usdc = await ethers.getContractAt(
    ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
    usdcAddress
  );
  const wallet = await ethers.getContractAt("AEP2DebitWallet", walletAddress);

  const depositAmount = ethers.parseUnits(amount, 6);

  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(signer.address);
  console.log(`USDC balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

  if (usdcBalance < depositAmount) {
    console.error(`Insufficient USDC balance. Required: ${amount} USDC`);
    process.exit(1);
  }

  // Approve
  console.log(`\nApproving ${amount} USDC...`);
  const approveTx = await usdc.approve(walletAddress, depositAmount);
  await approveTx.wait();
  console.log("Approved");

  // Deposit
  console.log(`\nDepositing ${amount} USDC...`);
  const depositTx = await wallet.deposit(usdcAddress, depositAmount);
  await depositTx.wait();
  console.log("Deposited successfully");

  // Check new balance
  const newBalance = await wallet.balances(signer.address, usdcAddress);
  console.log(`\nNew wallet balance: ${ethers.formatUnits(newBalance, 6)} USDC`);

  const debitableBalance = await wallet.debitableBalance(signer.address, usdcAddress);
  console.log(`Debitable balance: ${ethers.formatUnits(debitableBalance, 6)} USDC`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
