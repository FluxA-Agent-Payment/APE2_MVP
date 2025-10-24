import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Helper script to derive addresses from private keys
 */
async function main() {
  console.log("=== Deriving Addresses from Private Keys ===\n");

  const keys = [
    { name: "Deployer", envVar: "DEPLOYER_PK" },
    { name: "SP (Settlement Processor)", envVar: "SP_PK" },
    { name: "Client", envVar: "CLIENT_PK" },
  ];

  for (const key of keys) {
    const pk = process.env[key.envVar];
    if (pk) {
      try {
        const wallet = new ethers.Wallet(pk);
        console.log(`${key.name}:`);
        console.log(`  Address: ${wallet.address}`);
        console.log(`  Env Var: ${key.envVar}`);
        console.log();
      } catch (error) {
        console.log(`${key.name}: Invalid private key`);
        console.log();
      }
    } else {
      console.log(`${key.name}: Not set in .env`);
      console.log();
    }
  }

  console.log("=== Contract Addresses ===\n");

  if (process.env.WALLET_ADDR) {
    console.log(`Wallet Contract: ${process.env.WALLET_ADDR}`);
  } else {
    console.log("Wallet Contract: Not set (run npm run deploy first)");
  }

  if (process.env.PAYEE_ADDRESS) {
    console.log(`Payee Address: ${process.env.PAYEE_ADDRESS}`);
  } else {
    console.log("Payee Address: Not set (can be any address, e.g., SP address)");
  }

  console.log();
  console.log("=== Configuration Template ===\n");
  console.log("Add these to your .env file:\n");

  if (process.env.SP_PK) {
    const spWallet = new ethers.Wallet(process.env.SP_PK);
    console.log(`SP_ADDRESS=${spWallet.address}`);
  }

  if (process.env.WALLET_ADDR) {
    console.log(`WALLET_ADDR=${process.env.WALLET_ADDR}`);
  }

  if (process.env.SP_PK && !process.env.PAYEE_ADDRESS) {
    const spWallet = new ethers.Wallet(process.env.SP_PK);
    console.log(`PAYEE_ADDRESS=${spWallet.address}  # or any address you want`);
  }

  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
