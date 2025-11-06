import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config();

async function main() {
  console.log('=== Authorizing Settlement Processor ===\n');

  // Load configuration
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  // Get SP address
  let spPubkey: PublicKey;
  if (process.env.SP_SOLANA_PK) {
    const spKeypair = Keypair.fromSecretKey(bs58.decode(process.env.SP_SOLANA_PK));
    spPubkey = spKeypair.publicKey;
  } else {
    console.error('❌ SP_SOLANA_PK not set in .env');
    process.exit(1);
  }

  console.log(`Program ID: ${programId.toString()}`);
  console.log(`SP Address: ${spPubkey.toString()}\n`);

  // Create connection
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load authority keypair
  const keypairPath = process.env.HOME + '/.config/solana/id.json';
  if (!fs.existsSync(keypairPath)) {
    console.error(`❌ Keypair not found at ${keypairPath}`);
    process.exit(1);
  }

  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`Authority: ${authorityKeypair.publicKey.toString()}`);

  // Check authority balance
  const balance = await connection.getBalance(authorityKeypair.publicKey);
  console.log(`Authority Balance: ${balance / 1e9} SOL\n`);

  if (balance < 0.1e9) {
    console.error('❌ Insufficient balance. Need at least 0.1 SOL.');
    process.exit(1);
  }

  // Derive SP account PDA
  const [spAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('sp_account'), spPubkey.toBuffer()],
    programId
  );

  console.log(`SP Account PDA: ${spAccountPDA.toString()}\n`);

  // Derive wallet state PDA
  const [walletStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('wallet_state')],
    programId
  );

  console.log(`Wallet State PDA: ${walletStatePDA.toString()}\n`);

  // Load IDL
  const idlPath = path.join(__dirname, '../../contracts/solana/target/idl/aep2_debit_wallet.json');
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found at ${idlPath}`);
    console.error('Please build the program first: cd contracts/solana && anchor build');
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create provider and program
  const wallet = new Wallet(authorityKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program: any = new Program(idl as any, provider);

  console.log('📝 Authorizing SP...');

  try {
    // Call set_sp instruction to enable the SP
    const tx = await program.methods
      .setSp(true)
      .accounts({
        walletState: walletStatePDA,
        authority: authorityKeypair.publicKey,
        sp: spPubkey,
        spAccount: spAccountPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('✅ SP authorization complete!');
    console.log(`Transaction signature: ${tx}\n`);
    console.log('\nThe SP is now authorized to settle payments on-chain.');
  } catch (error: any) {
    console.error('❌ Failed to authorize SP:', error.message);
    if (error.logs) {
      console.error('\nProgram logs:');
      error.logs.forEach((log: string) => console.error(log));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

