# 🚀 AEP2 Solana - Quick Start Guide

Get AEP2 running on Solana in **15 minutes**!

## Prerequisites

- Node.js >= 18
- Rust and Cargo
- Anchor CLI >= 0.29.0
- Solana CLI >= 1.17
- Phantom wallet (for frontend)

> 💡 **Don't have these installed?** See the [Detailed README](SOLANA_README.md#prerequisites-installation) for installation instructions.

## Quick Start (15 minutes)

### 1. Install Dependencies

```bash
npm install
cd playground && npm install && cd ..
```

### 2. Install Solana CLI (if needed)

```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### 3. Configure Solana

```bash
solana config set --url devnet
solana airdrop 2  # Get test SOL
```

### 4. Build and Deploy Program

```bash
cd contracts/solana
anchor build
anchor deploy
cd ../..
```

**Save the deployed program ID** - you'll need it for `.env` files.

### 5. Generate Keys

```bash
# Generate SP, Payee, Client, and Faucet keys
solana-keygen new -o ~/.config/solana/sp-keypair.json
solana-keygen new -o ~/.config/solana/payee-keypair.json
solana-keygen new -o ~/.config/solana/client-keypair.json
solana-keygen new -o ~/.config/solana/faucet-keypair.json

# Fund them
solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/sp-keypair.json)
solana airdrop 1 $(solana-keygen pubkey ~/.config/solana/client-keypair.json)
solana airdrop 5 $(solana-keygen pubkey ~/.config/solana/faucet-keypair.json)

# Get Base58 private keys
node get-base58-key.js ~/.config/solana/sp-keypair.json
node get-base58-key.js ~/.config/solana/client-keypair.json
node get-base58-key.js ~/.config/solana/faucet-keypair.json
```

### 6. Configure Environment

Create `.env` in root:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=<your_deployed_program_id>
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

SP_SOLANA_PK=<sp_private_key_base58>
SP_PORT=3001

PAYEE_SOLANA_ADDRESS=$(solana-keygen pubkey ~/.config/solana/payee-keypair.json)
PAYEE_PORT=3002
SP_URL=http://localhost:3001

CLIENT_SOLANA_PK=<client_private_key_base58>
PAYEE_URL=http://localhost:3002

FAUCET_SOLANA_PK=<faucet_private_key_base58>
FAUCET_PORT=3003
```

Create `playground/.env.local`:

```env
NEXT_PUBLIC_PROGRAM_ID=<your_deployed_program_id>
NEXT_PUBLIC_SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_FAUCET_URL=http://localhost:3003
NEXT_PUBLIC_SP_URL=http://localhost:3001
NEXT_PUBLIC_PAYEE_URL=http://localhost:3002
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### 7. Initialize Program

```bash
npm run solana:init
npm run solana:authorize-sp
npm run solana:create-usdc
```

### 8. Start Services

```bash
npm run start:solana
```

This starts:
- Settlement Processor (port 3001)
- Payee Service (port 3002)
- Faucet Service (port 3003)
- Frontend Playground (port 3000)

### 9. Test the Flow

1. **Open** http://localhost:3000/solana
2. **Connect** Phantom wallet (switch to Devnet)
3. **Claim** test SOL & USDC
4. **Deposit** to debit wallet
5. **Sign** a payment mandate
6. **Call** the API with the mandate
7. **Watch** settlement in SP panel

## What's Next?

- 📖 Read the [Detailed README](SOLANA_README.md) for architecture, API docs, and advanced topics
- 🔧 Review the code in `contracts/solana/src/lib.rs` and `services/*-solana.ts`
- 🧪 Try different scenarios and test edge cases
- 🚀 Integrate AEP2 into your application

## Troubleshooting

### Services Won't Start
```bash
# Check ports
lsof -i :3000-3003

# Kill if needed
pkill -f "node"
```

### Program Not Deployed
```bash
solana program show <PROGRAM_ID>
# If fails, redeploy
cd contracts/solana && anchor deploy
```

### Phantom Wallet Issues
- Ensure Phantom is on **Devnet** (Settings → Change Network)
- Refresh page after connecting

### Need More Help?

See the [Detailed README](SOLANA_README.md#troubleshooting) for comprehensive troubleshooting.

---

**Happy Building!** 🚀

