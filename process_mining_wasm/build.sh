#!/bin/bash

# Build script for process_mining_wasm
# Builds WASM bindings for all targets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Building process_mining_wasm...${NC}"

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo -e "${RED}Error: wasm-pack is not installed${NC}"
    echo "Install it with: cargo install wasm-pack"
    exit 1
fi

# Check if Rust toolchain is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}Error: Rust toolchain is not installed${NC}"
    echo "Install it from: https://rustup.rs/"
    exit 1
fi

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf pkg/

# Build for bundler target (recommended for modern bundlers)
echo -e "${YELLOW}Building for bundler target...${NC}"
wasm-pack build --target bundler

# Build for nodejs target
echo -e "${YELLOW}Building for nodejs target...${NC}"
wasm-pack build --target nodejs --out-dir pkg-nodejs

# Build for web target
echo -e "${YELLOW}Building for web target...${NC}"
wasm-pack build --target web --out-dir pkg-web

echo -e "${GREEN}Build complete!${NC}"
echo ""
echo "Generated files:"
echo "  pkg/              - Bundler target (default)"
echo "  pkg-nodejs/       - Node.js target"
echo "  pkg-web/          - Web target (browser)"
echo ""
echo "Next steps:"
echo "  npm run test      - Run tests"
echo "  npm run lint      - Check code quality"
echo "  npm run docs      - Generate documentation"
