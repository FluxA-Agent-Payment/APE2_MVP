#!/bin/bash

# AEP2 Playground - Start All Services
# This script starts SP, Payee, and Playground frontend

echo "=== Starting AEP2 Playground ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found in parent directory"
    echo "Please configure .env file first"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Start SP
echo "[1/3] Starting Settlement Processor..."
npm run sp > logs/sp.log 2>&1 &
SP_PID=$!
echo "SP started (PID: $SP_PID)"
sleep 2

# Start Payee
echo "[2/3] Starting Payee Service..."
npm run payee > logs/payee.log 2>&1 &
PAYEE_PID=$!
echo "Payee started (PID: $PAYEE_PID)"
sleep 2

# Start Playground
echo "[3/3] Starting Playground Frontend..."
cd playground
npm run dev > ../logs/playground.log 2>&1 &
PLAYGROUND_PID=$!
cd ..
echo "Playground started (PID: $PLAYGROUND_PID)"
sleep 3

echo ""
echo "=== All Services Started ==="
echo "SP:         http://localhost:3001 (PID: $SP_PID)"
echo "Payee:      http://localhost:3002 (PID: $PAYEE_PID)"
echo "Playground: http://localhost:3000 (PID: $PLAYGROUND_PID)"
echo ""
echo "Logs:"
echo "  SP:         tail -f logs/sp.log"
echo "  Payee:      tail -f logs/payee.log"
echo "  Playground: tail -f logs/playground.log"
echo ""
echo "To stop all services:"
echo "  kill $SP_PID $PAYEE_PID $PLAYGROUND_PID"
echo ""

# Save PIDs
echo "$SP_PID $PAYEE_PID $PLAYGROUND_PID" > .playground-pids
echo "PIDs saved to .playground-pids"
echo ""
echo "🚀 Open http://localhost:3000 in your browser!"
