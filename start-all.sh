#!/bin/bash

# AEP2 MVP - Start All Services
# This script starts SP and Payee services in the background

echo "=== Starting AEP2 Services ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Start SP
echo "[1/2] Starting Settlement Processor..."
npm run sp > logs/sp.log 2>&1 &
SP_PID=$!
echo "SP started (PID: $SP_PID)"
sleep 2

# Start Payee
echo "[2/2] Starting Payee Service..."
npm run payee > logs/payee.log 2>&1 &
PAYEE_PID=$!
echo "Payee started (PID: $PAYEE_PID)"
sleep 2

echo ""
echo "=== Services Started ==="
echo "SP:    http://localhost:3001 (PID: $SP_PID)"
echo "Payee: http://localhost:3002 (PID: $PAYEE_PID)"
echo ""
echo "Logs:"
echo "  SP:    tail -f logs/sp.log"
echo "  Payee: tail -f logs/payee.log"
echo ""
echo "To stop services:"
echo "  kill $SP_PID $PAYEE_PID"
echo ""
echo "Save PIDs to file for easy cleanup:"
echo "$SP_PID $PAYEE_PID" > .pids
echo "PIDs saved to .pids"
