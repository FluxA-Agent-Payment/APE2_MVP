import { ethers } from "hardhat";

async function main() {
  console.log("Deploying AEP2DebitWallet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy AEP2DebitWallet
  const AEP2DebitWallet = await ethers.getContractFactory("AEP2DebitWallet");
  const wallet = await AEP2DebitWallet.deploy();

  console.log("Waiting for deployment confirmation...");
  const deploymentReceipt = await wallet.deploymentTransaction()?.wait(2); // Wait for 2 confirmations

  const walletAddress = await wallet.getAddress();
  console.log("AEP2DebitWallet deployed to:", walletAddress);
  console.log("Transaction hash:", deploymentReceipt?.hash);

  // Wait a bit for contract to be fully available
  console.log("Waiting for contract to be ready...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get domain separator
  try {
    const domainSeparator = await wallet.domainSeparator();
    console.log("Domain Separator:", domainSeparator);
  } catch (error) {
    console.log("Note: Could not fetch domain separator immediately (this is normal)");
    console.log("You can fetch it later using the contract address");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", walletAddress);
  console.log("Owner:", deployer.address);
  console.log("Withdraw Delay:", "3 hours");
  console.log("\nNext steps:");
  console.log("1. Set WALLET_ADDR in .env file");
  console.log("2. Call setSP() to authorize Settlement Processor");
  console.log("3. Deposit USDC for testing");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
