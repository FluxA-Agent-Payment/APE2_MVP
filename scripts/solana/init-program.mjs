import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet, BN } = pkg;
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import BNLib from 'bn.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function main() {
  console.log('=== Initializing AEP2 Debit Wallet Program ===\n');

  // Load configuration
  const programId = new PublicKey(process.env.PROGRAM_ID);
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  console.log(`Program ID: ${programId.toString()}`);
  console.log(`RPC URL: ${rpcUrl}\n`);

  // Create connection
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load authority keypair
  const keypairPath = process.env.HOME + '/.config/solana/id.json';
  if (!fs.existsSync(keypairPath)) {
    console.error(`❌ Keypair not found at ${keypairPath}`);
    console.error('Please run: solana-keygen new');
    process.exit(1);
  }

  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`Authority: ${authorityKeypair.publicKey.toString()}`);

  // Check authority balance
  const balance = await connection.getBalance(authorityKeypair.publicKey);
  console.log(`Authority Balance: ${balance / 1e9} SOL\n`);

  if (balance < 1e9) {
    console.error('❌ Insufficient balance. Need at least 1 SOL.');
    console.error('Run: solana airdrop 2');
    process.exit(1);
  }

  // Derive wallet state PDA
  const [walletStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('wallet_state')],
    programId
  );

  console.log(`Wallet State PDA: ${walletStatePDA.toString()}\n`);

  // Check if already initialized
  const accountInfo = await connection.getAccountInfo(walletStatePDA);
  if (accountInfo) {
    console.log('⚠️  Program already initialized!');
    console.log('Skipping initialization...\n');
    return;
  }

  console.log('📝 Initializing program state...');
  const withdrawDelay = 10800; // 3 hours in seconds
  console.log(`Withdrawal delay: ${withdrawDelay} seconds (3 hours)\n`);

  // Load IDL
  const idlPath = join(__dirname, '../../contracts/solana/target/idl/aep2_debit_wallet.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create provider and program
  const wallet = new Wallet(authorityKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  try {
    // Call initialize instruction
    const tx = await program.methods
      .initialize(new BNLib(withdrawDelay))
      .accounts({
        walletState: walletStatePDA,
        authority: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('✅ Program initialized successfully!');
    console.log(`Transaction signature: ${tx}\n`);
  } catch (error) {
    if (error.message?.includes('already in use')) {
      console.log('⚠️  Program already initialized!\n');
    } else {
      throw error;
    }
  }

  console.log('✅ Initialization complete!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

