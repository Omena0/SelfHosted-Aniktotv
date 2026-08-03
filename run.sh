#!/bin/bash

echo "========================================"
echo "  AniStash Play - Starting Server"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    exit 1
fi

# Check if server files exist
if [ ! -f "site/server/index.js" ]; then
    echo "[ERROR] Server files not found!"
    echo "Please run ./install.sh first"
    echo ""
    exit 1
fi

# Check if client is built
if [ ! -d "site/client/dist" ]; then
    echo "[WARNING] Client not built yet. Building now..."
    cd site/client
    npm run build
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to build client"
        cd ../..
        exit 1
    fi
    cd ../..
fi

# Start the server
echo "🚀 Starting AniStash Play server..."
echo ""
node site/server/index.js
