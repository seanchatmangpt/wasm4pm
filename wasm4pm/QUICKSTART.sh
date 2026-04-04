#!/bin/bash

# Quick start script for process_mining_wasm development
# This script sets up and validates the development environment

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}process_mining_wasm Quick Start${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v rustc &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed${NC}"
    echo "Install from: https://rustup.rs/"
    exit 1
fi
echo -e "${GREEN}✓ Rust found: $(rustc --version)${NC}"

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Cargo is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Cargo found: $(cargo --version)${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"

echo ""
echo -e "${YELLOW}Setting up Rust WASM target...${NC}"
rustup target add wasm32-unknown-unknown
echo -e "${GREEN}✓ WASM target installed${NC}"

echo ""
echo -e "${YELLOW}Checking wasm-pack...${NC}"
if command -v wasm-pack &> /dev/null; then
    echo -e "${GREEN}✓ wasm-pack found: $(wasm-pack --version)${NC}"
else
    echo -e "${YELLOW}Installing wasm-pack...${NC}"
    curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf | sh
    echo -e "${GREEN}✓ wasm-pack installed${NC}"
fi

echo ""
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}Building WASM module...${NC}"
npm run build:all
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo -e "${YELLOW}Running tests...${NC}"
npm test
echo -e "${GREEN}✓ All tests passed${NC}"

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Read GETTING_STARTED.md for usage examples"
echo "  2. Check API.md for available functions"
echo "  3. Review ARCHITECTURE.md for design details"
echo "  4. Run './test.sh' to run tests anytime"
echo "  5. Run 'npm run format' to format code"
echo ""
echo "Common commands:"
echo "  npm run build          # Build bundler target"
echo "  npm run build:all      # Build all targets"
echo "  npm test               # Run all tests"
echo "  npm run lint           # Check code quality"
echo "  npm run format         # Auto-format code"
echo ""
