This repo is a minimal viable product implementation of the Agent Embedded Payment protocol for AI-native payment solutions.

## Overview

AEP2 is an embedded payment protocol designed for agent commerce. It enables AI agents to embed one-time payment mandates within x402, A2A or MCP calls — enabling instant payee verification and deferred settlement after execution.

![img](https://github.com/FluxA-Agent-Payment/APE2_MVP/blob/main/img/aep2.png)

AEP2 provides "embedded one-time payment authorization (mandate)" capability for AI agents. When an agent makes an API call, it includes a mandate + signature in the request header. The Settlement Processor (SP) verifies and commits to settling on-chain within a settlement window, while the Debit Wallet protects this window with a delayed withdrawal model.

Learn more: [fluxapay.xyz/protocol](https://www.fluxapay.xyz/protocol)

## Architecture

### Components

1. **Smart Contract (AEP2DebitWallet)**: Manages user funds, delayed withdrawals, and one-time payment settlement
2. **Settlement Processor (SP)**: Validates mandates, provides settlement commitments, and processes on-chain settlements
3. **Payee Service**: Demo merchant service that requires payment via AEP2 protocol
4. **Client**: Example implementation for creating mandates and calling paid APIs

### Flow

```
Client -> (X-Payment-Mandate header) -> Payee
Payee -> (POST /enqueue) -> SP
SP -> (validates & returns receipt) -> Payee
Payee -> (returns data + receipt) -> Client
SP (worker) -> (settle on-chain) -> AEP2DebitWallet
```

## Prerequisites

- Node.js >= 18
- Base Sepolia testnet access
- Test ETH for gas (from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
- Test USDC (Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Deployment
DEPLOYER_PK=your_deployer_private_key
RPC=https://sepolia.base.org

# Settlement Processor (SP)
SP_PK=your_sp_private_key
WALLET_ADDR=deployed_wallet_contract_address
SP_PORT=3001

# Payee Service
SP_URL=http://localhost:3001
PAYEE_PORT=3002
PAYEE_ADDRESS=your_payee_address

# Client
CLIENT_PK=your_client_private_key
PAYEE_URL=http://localhost:3002
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

## Deployment

### 1. Deploy Contract

```bash
npm run compile
npm run deploy
```

Save the deployed contract address to `WALLET_ADDR` in `.env`.

### 2. Authorize SP

Use Hardhat console or script to call `setSP(spAddress, true)`:

```bash
npx hardhat console --network baseSepolia
```

```javascript
const wallet = await ethers.getContractAt("AEP2DebitWallet", "WALLET_ADDR");
await wallet.setSP("SP_ADDRESS", true);
```

### 3. Deposit USDC

Client needs to deposit USDC into the wallet:

```javascript
// In Hardhat console or script
const usdc = await ethers.getContractAt("IERC20", "USDC_ADDRESS");
const wallet = await ethers.getContractAt("AEP2DebitWallet", "WALLET_ADDR");

// Approve
await usdc.approve("WALLET_ADDR", ethers.parseUnits("10", 6)); // 10 USDC

// Deposit
await wallet.deposit("USDC_ADDRESS", ethers.parseUnits("10", 6));
```

## Running

### Start Settlement Processor

```bash
npm run sp
```

### Start Payee Service

In another terminal:

```bash
npm run payee
```

### Run Client Demo

In another terminal:

```bash
npm run client
```

To test without payment (should return 402):

```bash
npm run client no-payment
```

## Testing the Flow

### 1. Without Payment

```bash
curl http://localhost:3002/predict
```

Expected response (HTTP 402):
```json
{
  "error": "PAYMENT_REQUIRED",
  "message": "Missing X-Payment-Mandate header. Price: 0.001 USD required.",
  "price": 0.001,
  "currency": "USD",
  "payee": "0x..."
}
```

### 2. With Payment

The client automatically creates a mandate, signs it, and includes it in the request header:

```bash
npm run client
```

Expected output:
```
=== AEP2 Client Demo ===
Client Address: 0x...
Payee Address: 0x...
Wallet Contract: 0x...

[1/3] Creating payment mandate...
Mandate created:
  - Amount: 0.001 USDC
  - Nonce: ...
  - Deadline: ...
  - Ref: ...

[2/3] Encoding payment header...
Payment header: ...

[3/3] Calling /predict API...
=== Success ===
ETH-USD Price: $4005.32
Timestamp: ...

Payment Status: enqueued
SP Receipt:
  - SP Address: 0x...
  - Mandate Digest: 0x...
  - Enqueue Deadline: ...

Settlement will be completed on-chain by SP within 3 hours.
```

### 3. Check Settlement

SP worker processes settlements asynchronously. Check SP logs for settlement transactions.

## API Documentation

### Payee Service

#### GET /predict

Returns mock ETH-USD price (requires payment).

**Headers:**
- `X-Payment-Mandate`: Base64-encoded JSON of `{mandate, payerSig}`

**Response (Success):**
```json
{
  "symbol": "ETH-USD",
  "price": 4005.32,
  "timestamp": 1234567890,
  "payment": {
    "status": "enqueued",
    "spReceipt": {
      "sp": "0x...",
      "mandateDigest": "0x...",
      "enqueueDeadline": 1234567890,
      "spEnqueueSig": "0x..."
    }
  }
}
```

#### GET /health

Health check endpoint.

### Settlement Processor

#### POST /enqueue

Validates mandate and commits to settlement.

**Body:**
```json
{
  "mandate": {
    "owner": "0x...",
    "token": "0x...",
    "payee": "0x...",
    "amount": "1000",
    "nonce": "123456",
    "deadline": 1234567890,
    "ref": "0x..."
  },
  "payerSig": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "receipt": {
    "sp": "0x...",
    "mandateDigest": "0x...",
    "enqueueDeadline": 1234567890,
    "spEnqueueSig": "0x..."
  }
}
```

#### GET /health

Health check endpoint.

## Smart Contract

### AEP2DebitWallet

#### Key Functions

- `deposit(address token, uint256 amount)`: Deposit ERC20 tokens
- `requestWithdraw(address token, uint256 amount)`: Request withdrawal (enters 3-hour lock)
- `executeWithdraw(address token, address to)`: Execute withdrawal after delay
- `settle(Mandate m, bytes payerSig)`: Settle payment via signed mandate (SP only)
- `debitableBalance(address owner, address token)`: Get available balance for settlement
- `setSP(address who, bool enabled)`: Authorize/revoke SP (owner only)

#### Events

- `Deposited(address user, address token, uint256 amount)`
- `WithdrawalRequested(address user, address token, uint256 amount, uint64 unlockAt)`
- `WithdrawalExecuted(address user, address token, address to, uint256 amount)`
- `Settled(address owner, address token, address payee, uint256 amount, uint256 nonce, bytes32 ref)`
- `SPSet(address sp, bool enabled)`
- `OwnerSet(address newOwner)`

## Security Considerations

This is a PoC/MVP implementation. DO NOT DEPLOY ON PRODUCTION.
