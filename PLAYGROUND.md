# 🎮 AEP2 Playground

Interactive web interface for testing and visualizing the Agent Embedded Payment Protocol v2.

## Overview

The Playground provides a visual, interactive way to test the entire AEP2 payment flow in your browser. It features a three-column layout that lets you:

1. **Sign payment mandates** with your wallet
2. **Test API calls** with signed mandates
3. **Monitor settlement** in real-time

## Quick Start

```bash
# One command to start everything!
./start-playground.sh
```

Then open **http://localhost:3000** in your browser.

## Features

### Left Panel: Wallet 💰
- **Connect Wallet**: MetaMask integration
- **View Balances**: USDC and Debit Wallet balances
- **Claim USDC**: Get test tokens from faucet
- **Deposit**: Transfer USDC to Debit Wallet
- **Sign Mandate**: Create and sign payment authorizations
- **Copy Mandate**: JSON and Base64 formats with one-click copy

### Middle Panel: Payee API 🔌
- **API Tester**: Like Postman, but for AEP2
- **Custom Headers**: Add X-Payment-Mandate header
- **Live Requests**: Test GET /predict endpoint
- **Response Viewer**: See ETH-USD prices and payment receipts
- **Error Handling**: Clear error messages

### Right Panel: SP Monitor 📊
- **Real-time Status**: See SP connection status
- **Queue Monitor**: Track pending settlements
- **Settlement History**: View all processed mandates
- **Transaction Links**: Direct links to BaseScan
- **Live Updates**: Auto-refresh every 3 seconds

## Screenshots

### Full Interface
```
┌──────────────┬──────────────┬──────────────┐
│   Wallet     │   Payee API  │  SP Monitor  │
│              │              │              │
│ [Connect]    │ Headers:     │ Status: ✅   │
│              │ X-Payment-   │              │
│ Balance:     │ Mandate:     │ Queue: 0     │
│ 10.0 USDC    │ [paste here] │              │
│              │              │ Settled: 5   │
│ [Claim]      │ [Send Req]   │              │
│ [Deposit]    │              │ History:     │
│              │ Response:    │ ✅ 0x123...  │
│ Sign Mandate │ Price: $4000 │ ⏳ 0x456...  │
│ Payee: 0x... │              │              │
│ Amount: 0.001│              │              │
│ [Sign]       │              │              │
│              │              │              │
│ JSON: {...}  │              │              │
│ Base64: ...  │              │              │
│ [Copy]       │              │              │
└──────────────┴──────────────┴──────────────┘
```

## Usage Flow

### Complete Payment Flow

1. **Setup** (one-time)
   ```bash
   # Make sure services are running
   npm run sp      # Terminal 1
   npm run payee   # Terminal 2
   # Or use: ./start-playground.sh
   ```

2. **Connect Wallet**
   - Click "Connect Wallet" in left panel
   - Approve MetaMask connection
   - Switch to Base Sepolia if needed

3. **Get Test USDC**
   - Click "Claim Free USDC" button
   - Or visit https://faucet.circle.com/
   - Wait for transaction confirmation

4. **Deposit to Debit Wallet**
   - Click "Deposit to Debit Wallet"
   - Approve USDC spending (if first time)
   - Confirm deposit transaction
   - See balance update

5. **Create Payment Mandate**
   - Enter payee address (pre-filled)
   - Set amount (e.g., 0.001 USDC)
   - Optional: Add reference ID
   - Click "Sign Mandate"
   - See signed mandate appear below

6. **Copy Mandate**
   - Review JSON format
   - Click "Copy Base64" button
   - Base64 mandate copied to clipboard

7. **Test API Call**
   - Switch to middle panel
   - Paste mandate into X-Payment-Mandate field
   - Click "Send Request"
   - See ETH-USD price response

8. **Monitor Settlement**
   - Watch right panel
   - See mandate appear as "enqueued"
   - Status changes to "processing"
   - Finally shows "settled" with tx link
   - Click tx link to view on BaseScan

## Architecture

```
┌─────────────┐
│   Browser   │
│  (Next.js)  │
└──────┬──────┘
       │
       ├──────> MetaMask (Sign Mandates)
       │
       ├──────> Payee Service :3002
       │              │
       │              └──────> SP Service :3001
       │                           │
       └───────────────────────────┼──────> Base Sepolia
                                   │        (Smart Contract)
                                   │
                                   └──────> Settlement
```

## Configuration

Environment variables (`.env.local`):

```env
# Network
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org

# Contracts
NEXT_PUBLIC_WALLET_ADDR=0xfCB13CEc6ABc2C86a160CcFB75D8a57303222C3E
NEXT_PUBLIC_USDC_ADDR=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Services
NEXT_PUBLIC_SP_URL=http://localhost:3001
NEXT_PUBLIC_PAYEE_URL=http://localhost:3002
```

## Troubleshooting

### "Wallet Won't Connect"
- ✅ Install MetaMask extension
- ✅ Switch to Base Sepolia network
- ✅ Refresh page and try again

### "API Request Fails"
- ✅ Check SP and Payee services are running
- ✅ Look for CORS errors in console
- ✅ Verify service URLs in .env.local

### "Mandate Signing Fails"
- ✅ Ensure wallet is connected
- ✅ Check you're on Base Sepolia
- ✅ Verify contract address matches

### "Settlement Stuck"
- ✅ Check SP service logs
- ✅ Ensure SP is authorized on contract
- ✅ Verify SP has ETH for gas fees

### "SP Shows Disconnected"
- ✅ Start SP service: `npm run sp`
- ✅ Check SP is on port 3001
- ✅ Look for errors in SP logs

## Development

```bash
# Install dependencies
cd playground
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS
- **Web3**: Ethers.js v6
- **Icons**: Lucide React
- **Network**: Base Sepolia Testnet

## File Structure

```
playground/
├── app/
│   ├── api/              # API routes for proxying
│   ├── page.tsx          # Main playground page
│   └── layout.tsx        # Root layout
├── components/
│   ├── WalletPanel.tsx   # Left: Wallet & Mandate signing
│   ├── PayeePanel.tsx    # Middle: API testing
│   └── SPPanel.tsx       # Right: SP monitoring
└── .env.local            # Environment config
```

## Benefits

### For Developers
- **Visual Debugging**: See the entire payment flow
- **Quick Testing**: No need for command-line tools
- **Real-time Feedback**: Instant response visibility
- **Error Diagnosis**: Clear error messages

### For Demos
- **Professional**: Polished UI for presentations
- **Interactive**: Let people try it themselves
- **Educational**: Shows all components working together
- **Impressive**: Real blockchain transactions

## Next Steps

- [ ] Add Coinbase Embedded Wallet support
- [ ] Implement claim USDC functionality
- [ ] Add deposit transaction handling
- [ ] Show transaction confirmations
- [ ] Add more detailed error messages
- [ ] Implement mandate history
- [ ] Add balance auto-refresh
- [ ] Show gas estimates

## License

MIT

---

**Ready to test?**

```bash
./start-playground.sh
```

Then visit **http://localhost:3000** 🚀
