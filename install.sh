#!/bin/bash

echo "========================================"
echo "  AniStash Play - Installation Script"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[1/3] Installing server dependencies..."
echo ""
cd site/server
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install server dependencies"
    cd ../..
    exit 1
fi
cd ../..

echo ""
echo "[2/3] Installing client dependencies..."
echo ""
cd site/client
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install client dependencies"
    cd ../..
    exit 1
fi

echo ""
echo "[3/3] Building client..."
echo ""
npm run build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build client"
    cd ../..
    exit 1
fi
cd ../..

echo ""
echo "========================================"
echo "  Installation Successful!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Edit config.json to set your anime library path"
echo "  2. Run './run.sh' to start the server"
echo "  3. Open http://localhost:4321 in your browser"
echo ""
echo "Starting server now..."
sleep 2
./run.sh
