# AEP2 Quick Start Guide

Get the AEP2 MVP running in 5 minutes!

## Prerequisites

- Node.js 18+
- 3 Ethereum wallets (deployer, SP, client) with Base Sepolia ETH
- Base Sepolia USDC for testing

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
# Get these addresses from your wallets
DEPLOYER_PK=0x...
SP_PK=0x...
SP_ADDRESS=0x...  # Address of SP_PK wallet
CLIENT_PK=0x...
PAYEE_ADDRESS=0x...  # Can be same as SP or any address

# These will be filled after deployment
WALLET_ADDR=
```

## Step 3: Deploy Contract

```bash
npm run compile
npm run deploy
```

Copy the deployed contract address to `WALLET_ADDR` in `.env`.

## Step 4: Setup Contract

Authorize SP and check setup:

```bash
npm run setup
```

## Step 5: Get Test USDC

Get Base Sepolia USDC from:
- Bridge from Ethereum Sepolia
- Swap on Base Sepolia DEX
- Use faucet if available

Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Step 6: Deposit USDC

Deposit 1 USDC (or set DEPOSIT_AMOUNT in .env):

```bash
npm run deposit
```

## Step 7: Start Services

### Option A: Manual (Recommended for testing)

Terminal 1 - Start SP:
```bash
npm run sp
```

Terminal 2 - Start Payee:
```bash
npm run payee
```

### Option B: Automatic (Background)

```bash
./start-all.sh
```

View logs:
```bash
tail -f logs/sp.log
tail -f logs/payee.log
```

Stop services:
```bash
./stop-all.sh
```

## Step 8: Test the System

Terminal 3 - Run client:

```bash
# Test without payment (should fail with 402)
npm run client no-payment

# Test with payment (should succeed)
npm run client
```

## Expected Output

Successful payment flow:

```
=== AEP2 Client Demo ===
Client Address: 0x...
Payee Address: 0x...
Wallet Contract: 0x...

[1/3] Creating payment mandate...
Mandate created:
  - Amount: 0.001 USDC
  - Nonce: ...
  - Deadline: 2024-...
  - Ref: 0x...

[2/3] Encoding payment header...
Payment header: eyJtYW5kYXRlIjp7Im93b...

[3/3] Calling /predict API...
=== Success ===
ETH-USD Price: $4005.32
Timestamp: 2024-...

Payment Status: enqueued
SP Receipt:
  - SP Address: 0x...
  - Mandate Digest: 0x...
  - Enqueue Deadline: 2024-...

Settlement will be completed on-chain by SP within 3 hours.
```

## Verify Settlement

Check SP logs for settlement transaction:

```
[WORKER] Processing settlement for 0x1234567890...
[WORKER] Transaction sent: 0xabcdef...
[WORKER] Settlement successful for 0x1234567890...
```

Verify on Base Sepolia block explorer:
https://sepolia.basescan.org/tx/[transaction_hash]

## Troubleshooting

### "Insufficient balance" error

```bash
# Check balance
npx hardhat console --network baseSepolia
> const wallet = await ethers.getContractAt("AEP2DebitWallet", "YOUR_WALLET_ADDR")
> const balance = await wallet.balances("YOUR_CLIENT_ADDR", "USDC_ADDR")
> console.log(ethers.formatUnits(balance, 6))
```

If balance is 0, run `npm run deposit` again.

### "Not authorized SP" error

```bash
# Check SP authorization
npx hardhat console --network baseSepolia
> const wallet = await ethers.getContractAt("AEP2DebitWallet", "YOUR_WALLET_ADDR")
> const authorized = await wallet.sp("YOUR_SP_ADDRESS")
> console.log(authorized)
```

If false, run `npm run setup` or manually authorize:

```javascript
await wallet.setSP("YOUR_SP_ADDRESS", true)
```

### Services won't start

- Check if ports 3001 and 3002 are available
- Verify RPC URL is accessible
- Check all required env vars are set

### Settlement not processing

- Check SP logs for errors
- Verify SP has enough ETH for gas
- Ensure mandate hasn't expired
- Check SP is authorized on contract

## Next Steps

- Read [README.md](./README.md) for detailed documentation
- Check [prd.md](./prd.md) for protocol specification
- Explore contract events on block explorer
- Integrate AEP2 into your AI agent application

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review error messages carefully
- Verify all configuration values
- Test with small amounts first

Happy building with AEP2!
