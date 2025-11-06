import { Connection, Keypair } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config();

async function main() {
  console.log('=== Creating Test USDC Mint ===\n');

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  // Add local proxy 
  
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load faucet keypair (will be mint authority)
  let faucetKeypair: Keypair;
  if (process.env.FAUCET_SOLANA_PK) {
    faucetKeypair = Keypair.fromSecretKey(bs58.decode(process.env.FAUCET_SOLANA_PK));
  } else {
    console.error('❌ FAUCET_SOLANA_PK not set in .env');
    console.error('Please create a faucet keypair first');
    process.exit(1);
  }

  console.log(`Faucet/Mint Authority: ${faucetKeypair.publicKey.toString()}`);

  // Check balance
  const balance = await connection.getBalance(faucetKeypair.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL\n`);

  if (balance < 0.5e9) {
    console.error('❌ Insufficient balance. Need at least 0.5 SOL.');
    console.error('Run: solana airdrop 2 ' + faucetKeypair.publicKey.toString());
    process.exit(1);
  }

  console.log('📝 Creating test USDC mint...');
  console.log('Decimals: 6 (same as real USDC)\n');

  try {
    const mint = await createMint(
      connection,
      faucetKeypair,
      faucetKeypair.publicKey, // mint authority
      null, // freeze authority
      6 // decimals
    );

    console.log('✅ Test USDC Mint Created!');
    console.log(`\nMint Address: ${mint.toString()}\n`);
    console.log('Add this to your .env file:');
    console.log(`SOLANA_USDC_MINT=${mint.toString()}`);
    console.log('\nAlso add to playground/.env.local:');
    console.log(`NEXT_PUBLIC_SOLANA_USDC_MINT=${mint.toString()}`);
    console.log('\nThe faucet will use this mint to distribute test USDC.');
  } catch (error) {
    console.error('❌ Error creating mint:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

