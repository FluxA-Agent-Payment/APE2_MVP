#!/bin/bash

# AEP2 Solana Services Shutdown Script

echo "╔════════════════════════════════════════╗"
echo "║  Stopping AEP2 Solana Services         ║"
echo "╚════════════════════════════════════════╝"
echo ""

echo "Stopping services..."

# Stop services
pkill -f "ts-node services/sp-solana.ts" && echo "  ✅ Stopped Settlement Processor" || echo "  ℹ️  SP not running"
pkill -f "ts-node services/payee-solana.ts" && echo "  ✅ Stopped Payee Service" || echo "  ℹ️  Payee not running"
pkill -f "ts-node services/faucet-solana.ts" && echo "  ✅ Stopped Faucet Service" || echo "  ℹ️  Faucet not running"

echo ""
echo "✅ All services stopped"
echo ""

