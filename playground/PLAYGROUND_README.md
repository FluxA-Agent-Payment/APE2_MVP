# AEP2 Playground

Interactive visualization and testing environment for Agent Embedded Payment Protocol v2.

## Features

### 🎮 Three-Column Layout

1. **Left Panel - Wallet**
   - Connect MetaMask wallet
   - View USDC and Debit Wallet balances
   - Claim free test USDC
   - Deposit to Debit Wallet
   - Sign payment mandates
   - View and copy signed mandates (JSON & Base64)

2. **Middle Panel - Payee API**
   - API testing interface (like Postman)
   - Test GET /predict endpoint
   - Add custom headers
   - Paste Base64 mandates
   - View real-time responses
   - See ETH-USD prices

3. **Right Panel - SP Monitor**
   - Real-time SP status
   - Queue length monitoring
   - Mandate settlement tracking
   - Transaction history
   - Live status updates

## Quick Start

### Prerequisites

Make sure these services are running:
```bash
# Terminal 1 - Settlement Processor
cd ..
npm run sp

# Terminal 2 - Payee Service
npm run payee
```

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How to Use

### 1. Connect Wallet
- Click "Connect Wallet" in the left panel
- Approve MetaMask connection
- Switch to Base Sepolia network if needed

### 2. Get Test USDC
- Click "Claim Free USDC" to get test tokens
- Or manually get from: https://faucet.circle.com/

### 3. Deposit to Debit Wallet
- Click "Deposit to Debit Wallet"
- Approve USDC spending
- Confirm deposit transaction

### 4. Sign a Mandate
- Enter payee address (default provided)
- Set amount (e.g., 0.001 USDC)
- Optional: Add reference ID
- Click "Sign Mandate"
- View signed mandate in JSON and Base64 formats

### 5. Test Payment Flow
- Copy the Base64 mandate
- Switch to middle panel
- Paste into "X-Payment-Mandate" header
- Click "Send Request"
- See ETH-USD price returned

### 6. Monitor Settlement
- Watch right panel for mandate status
- See "enqueued" → "processing" → "settled"
- View transaction hash
- Check on BaseScan

## Environment Variables

`.env.local` is already configured with:

```env
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_WALLET_ADDR=0xfCB13CEc6ABc2C86a160CcFB75D8a57303222C3E
NEXT_PUBLIC_USDC_ADDR=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_SP_URL=http://localhost:3001
NEXT_PUBLIC_PAYEE_URL=http://localhost:3002
```

## Network Configuration

### Base Sepolia Testnet

Add to MetaMask:
- **Network Name**: Base Sepolia
- **RPC URL**: https://sepolia.base.org
- **Chain ID**: 84532
- **Currency**: ETH
- **Explorer**: https://sepolia.basescan.org

## Troubleshooting

### Wallet Won't Connect
- Make sure MetaMask is installed
- Switch to Base Sepolia network
- Refresh page and try again

### API Requests Fail
- Ensure SP and Payee services are running
- Check console for CORS errors
- Verify service URLs in .env.local

### Mandate Signing Fails
- Check wallet is connected
- Ensure you're on Base Sepolia
- Verify contract address is correct

### Settlement Not Processing
- Check SP service logs
- Ensure SP is authorized on contract
- Verify SP has ETH for gas

## Tech Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Ethers.js v6** - Ethereum interactions
- **Lucide React** - Icons

## License

MIT
