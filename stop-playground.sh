#!/bin/bash

# AEP2 Playground - Stop All Services

echo "=== Stopping AEP2 Playground Services ==="

if [ -f .playground-pids ]; then
    PIDS=$(cat .playground-pids)
    echo "Stopping PIDs: $PIDS"
    kill $PIDS 2>/dev/null
    rm .playground-pids
    echo "All services stopped"
else
    echo "No .playground-pids file found."
    echo "Trying to find and stop processes..."
    pkill -f 'ts-node services/sp' && echo "Stopped SP"
    pkill -f 'ts-node services/payee' && echo "Stopped Payee"
    pkill -f 'next dev' && echo "Stopped Playground"
fi
