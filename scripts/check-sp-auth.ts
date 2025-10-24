import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const WALLET_ADDR = process.env.WALLET_ADDR!;
  const SP_ADDRESS = process.env.SP_ADDRESS!;

  console.log("\n=== Checking SP Authorization ===");
  console.log(`Contract: ${WALLET_ADDR}`);
  console.log(`SP Address: ${SP_ADDRESS}`);

  const wallet = await ethers.getContractAt("AEP2DebitWallet", WALLET_ADDR);

  // Check if SP is authorized
  const isAuthorized = await wallet.sp(SP_ADDRESS);
  console.log(`\nIs SP Authorized: ${isAuthorized}`);

  if (!isAuthorized) {
    console.log("\n⚠️  SP is NOT authorized!");
    console.log("Run: npm run setup");
  } else {
    console.log("\n✅ SP is authorized");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
