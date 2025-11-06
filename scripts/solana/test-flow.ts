import fetch from 'node-fetch';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import * as dotenv from 'dotenv';

dotenv.config();

const SP_URL = process.env.SP_URL || 'http://localhost:3001';
const PAYEE_URL = process.env.PAYEE_URL || 'http://localhost:3002';
const FAUCET_URL = process.env.FAUCET_URL || 'http://localhost:3003';

async function testHealthEndpoints() {
  console.log('=== Testing Health Endpoints ===\n');

  try {
    console.log('Testing SP health...');
    const spHealth = await fetch(`${SP_URL}/health`);
    const spData = await spHealth.json();
    console.log('✅ SP Status:', spData.status);
    console.log('   Address:', spData.sp);

    console.log('\nTesting Payee health...');
    const payeeHealth = await fetch(`${PAYEE_URL}/health`);
    const payeeData = await payeeHealth.json();
    console.log('✅ Payee Status:', payeeData.status);
    console.log('   Address:', payeeData.payee);

    console.log('\nTesting Faucet health...');
    const faucetHealth = await fetch(`${FAUCET_URL}/health`);
    const faucetData = await faucetHealth.json();
    console.log('✅ Faucet Status:', faucetData.status);
    console.log('   Address:', faucetData.faucet);

    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
}

async function test402Response() {
  console.log('\n=== Testing 402 Payment Required ===\n');

  try {
    console.log('Calling API without payment...');
    const response = await fetch(`${PAYEE_URL}/predict`);
    const data = await response.json();

    if (response.status === 402) {
      console.log('✅ Received 402 Payment Required');
      console.log('   Price:', data.price, data.currency);
      console.log('   Payee:', data.payee);
      console.log('   Token:', data.token);
      return true;
    } else {
      console.log('❌ Expected 402, got', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

async function testPaidFlow() {
  console.log('\n=== Testing Paid API Flow ===\n');

  try {
    // Load client keypair
    const clientPk = process.env.CLIENT_SOLANA_PK;
    if (!clientPk) {
      console.error('❌ CLIENT_SOLANA_PK not set');
      return false;
    }

    const clientKeypair = Keypair.fromSecretKey(bs58.decode(clientPk));
    console.log('Client Address:', clientKeypair.publicKey.toString());

    // Create mandate
    const payeeAddress = process.env.PAYEE_SOLANA_ADDRESS;
    const usdcMint = process.env.SOLANA_USDC_MINT;

    if (!payeeAddress || !usdcMint) {
      console.error('❌ Missing PAYEE_SOLANA_ADDRESS or SOLANA_USDC_MINT');
      return false;
    }

    const mandate = {
      payer: clientKeypair.publicKey.toString(),
      token: usdcMint,
      payee: payeeAddress,
      amount: (0.001 * 1_000_000).toString(),
      nonce: Math.floor(Math.random() * 1000000000).toString(),
      deadline: Math.floor(Date.now() / 1000) + 600,
      ref: `test-${Date.now()}`,
    };

    console.log('\nCreated mandate:');
    console.log('  Amount: 0.001 USDC');
    console.log('  Nonce:', mandate.nonce);

    // Sign mandate
    const mandateMessage = JSON.stringify(mandate);
    const messageBytes = new TextEncoder().encode(mandateMessage);
    const signature = nacl.sign.detached(messageBytes, clientKeypair.secretKey);
    const signatureBase58 = bs58.encode(signature);

    // Encode for HTTP header
    const payload = JSON.stringify({ mandate, payerSig: signatureBase58 });
    const base64 = Buffer.from(payload).toString('base64');

    console.log('\nCalling API with payment mandate...');

    // Call API
    const response = await fetch(`${PAYEE_URL}/predict`, {
      method: 'GET',
      headers: {
        'X-Payment-Mandate': base64,
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ API call successful!');
      console.log('   ETH-USD Price:', data.price);
      console.log('   Payment Status:', data.payment.status);
      console.log('   SP Receipt:', data.payment.spReceipt.sp.slice(0, 20) + '...');
      return true;
    } else {
      console.log('❌ API call failed');
      console.log('   Status:', response.status);
      console.log('   Error:', data.error);
      console.log('   Message:', data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   AEP2 Solana Integration Tests       ║');
  console.log('╚════════════════════════════════════════╝\n');

  const results: { name: string; passed: boolean }[] = [];

  // Test 1: Health checks
  const healthPassed = await testHealthEndpoints();
  results.push({ name: 'Health Checks', passed: healthPassed });

  if (!healthPassed) {
    console.log('\n❌ Services not running. Start with: npm run start:solana');
    process.exit(1);
  }

  // Test 2: 402 response
  const test402Passed = await test402Response();
  results.push({ name: '402 Payment Required', passed: test402Passed });

  // Test 3: Paid flow
  const paidFlowPassed = await testPaidFlow();
  results.push({ name: 'Paid API Flow', passed: paidFlowPassed });

  // Summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          Test Results                  ║');
  console.log('╚════════════════════════════════════════╝\n');

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log(`\n${allPassed ? '✅' : '❌'} ${results.filter((r) => r.passed).length}/${results.length} tests passed\n`);

  process.exit(allPassed ? 0 : 1);
}

runAllTests();

