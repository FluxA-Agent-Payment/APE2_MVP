#!/bin/bash

# AEP2 MVP - Stop All Services

echo "=== Stopping AEP2 Services ==="

if [ -f .pids ]; then
    PIDS=$(cat .pids)
    echo "Stopping PIDs: $PIDS"
    kill $PIDS 2>/dev/null
    rm .pids
    echo "Services stopped"
else
    echo "No .pids file found. Services may not be running."
    echo "Try manually with: pkill -f 'ts-node services'"
fi
