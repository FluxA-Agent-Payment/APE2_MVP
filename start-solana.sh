#!/bin/bash

# AEP2 Solana Services Startup Script

set -e

# Ensure correct Node.js version
if [ -f .nvmrc ] && command -v nvm &> /dev/null; then
    echo "📦 Switching to Node.js $(cat .nvmrc)..."
    source ~/.nvm/nvm.sh
    nvm use
    echo ""
fi

echo "╔════════════════════════════════════════╗"
echo "║  Starting AEP2 Solana Services         ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file. See SOLANA_SETUP.md for details."
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$PROGRAM_ID" ]; then
    echo "❌ PROGRAM_ID not set in .env"
    exit 1
fi

if [ -z "$SP_SOLANA_PK" ]; then
    echo "❌ SP_SOLANA_PK not set in .env"
    exit 1
fi

echo "Configuration:"
echo "  Program ID: $PROGRAM_ID"
echo "  Network: ${SOLANA_NETWORK:-devnet}"
echo ""

# Kill existing processes if any
echo "Checking for existing processes..."
pkill -f "ts-node services/sp-solana.ts" || true
pkill -f "ts-node services/payee-solana.ts" || true
pkill -f "ts-node services/faucet-solana.ts" || true
sleep 2

# Create logs directory
mkdir -p logs/solana

# Start Settlement Processor
echo "[1/4] Starting Settlement Processor (SP)..."
nohup npx ts-node services/sp-solana.ts > logs/solana/sp.log 2>&1 &
SP_PID=$!
echo "  PID: $SP_PID"
sleep 2

# Check if SP started
if ! kill -0 $SP_PID 2>/dev/null; then
    echo "❌ SP failed to start. Check logs/solana/sp.log"
    exit 1
fi

# Start Payee Service
echo "[2/4] Starting Payee Service..."
nohup npx ts-node services/payee-solana.ts > logs/solana/payee.log 2>&1 &
PAYEE_PID=$!
echo "  PID: $PAYEE_PID"
sleep 2

# Check if Payee started
if ! kill -0 $PAYEE_PID 2>/dev/null; then
    echo "❌ Payee failed to start. Check logs/solana/payee.log"
    kill $SP_PID || true
    exit 1
fi

# Start Faucet Service
echo "[3/4] Starting Faucet Service..."
nohup npx ts-node services/faucet-solana.ts > logs/solana/faucet.log 2>&1 &
FAUCET_PID=$!
echo "  PID: $FAUCET_PID"
sleep 2

# Check if Faucet started
if ! kill -0 $FAUCET_PID 2>/dev/null; then
    echo "❌ Faucet failed to start. Check logs/solana/faucet.log"
    kill $SP_PID $PAYEE_PID || true
    exit 1
fi

# Start Frontend (optional, commented out by default)
# echo "[4/4] Starting Frontend..."
# cd playground
# nohup npm run dev > ../logs/solana/frontend.log 2>&1 &
# FRONTEND_PID=$!
# cd ..
# echo "  PID: $FRONTEND_PID"

echo ""
echo "✅ All services started successfully!"
echo ""
echo "Services:"
echo "  Settlement Processor: http://localhost:3001"
echo "  Payee Service:        http://localhost:3002"
echo "  Faucet:               http://localhost:3003"
echo "  Frontend:             http://localhost:3000/solana"
echo ""
echo "Logs:"
echo "  SP:     logs/solana/sp.log"
echo "  Payee:  logs/solana/payee.log"
echo "  Faucet: logs/solana/faucet.log"
echo ""
echo "To stop services, run: ./stop-solana.sh"
echo ""
echo "To start frontend separately:"
echo "  cd playground && npm run dev"
echo ""

