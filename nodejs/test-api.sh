#!/bin/bash

# Test script for NFC API Server
# Make sure the server is running: node server.js

API_URL="http://localhost:3000"

echo "======================================"
echo "NFC API Server Test Script"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "${BLUE}[1] Testing Health Check...${NC}"
curl -s "$API_URL/health" | jq '.'
echo ""
echo ""

# Test 2: Write to NFC
echo -e "${BLUE}[2] Testing Write to NFC...${NC}"
echo "Please place your NFC card on the reader now..."
sleep 2

curl -X POST "$API_URL/nfc/write" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Tiến Dũng",
      "id": 12345,
      "email": "tien.dung@example.com",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "test": true
    }
  }' | jq '.'

echo ""
echo ""

# Wait before reading
echo -e "${BLUE}[3] Testing Read from NFC...${NC}"
echo "Remove and place the card again to read..."
read -p "Press Enter when ready..."

curl -X POST "$API_URL/nfc/read" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'

echo ""
echo ""

# Test 4: Format (commented out by default)
# echo -e "${BLUE}[4] Testing Format NFC...${NC}"
# echo "WARNING: This will erase all data on the card!"
# read -p "Press Enter to continue or Ctrl+C to cancel..."
#
# curl -X POST "$API_URL/nfc/format" \
#   -H "Content-Type: application/json" \
#   -d '{}' | jq '.'
#
# echo ""
# echo ""

echo -e "${GREEN}======================================"
echo "Tests completed!"
echo "======================================${NC}"
