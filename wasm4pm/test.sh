#!/bin/bash

# Test runner script for process_mining_wasm
# Runs unit tests, integration tests, and optional browser tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
RUN_BROWSER=false
RUN_UNIT=true
RUN_INTEGRATION=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --browser)
            RUN_BROWSER=true
            shift
            ;;
        --unit-only)
            RUN_INTEGRATION=false
            RUN_BROWSER=false
            shift
            ;;
        --integration-only)
            RUN_UNIT=false
            RUN_BROWSER=false
            shift
            ;;
        --all)
            RUN_BROWSER=true
            shift
            ;;
        --watch)
            echo -e "${YELLOW}Running tests in watch mode...${NC}"
            npm run test:unit:watch
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./test.sh [--browser] [--unit-only] [--integration-only] [--all] [--watch]"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}=== process_mining_wasm Test Suite ===${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Build WASM if needed
if [ ! -d "pkg" ]; then
    echo -e "${YELLOW}Building WASM module...${NC}"
    npm run build
fi

# Run unit tests
if [ "$RUN_UNIT" = true ]; then
    echo -e "${YELLOW}Running unit tests...${NC}"
    npm run test:unit
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Unit tests passed${NC}"
    else
        echo -e "${RED}Unit tests failed${NC}"
        exit 1
    fi
    echo ""
fi

# Run integration tests
if [ "$RUN_INTEGRATION" = true ]; then
    echo -e "${YELLOW}Running integration tests...${NC}"
    if [ -f "__tests__/integration.test.js" ] || [ -f "__tests__/integration.test.ts" ]; then
        npm run test:integration
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Integration tests passed${NC}"
        else
            echo -e "${RED}Integration tests failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}No integration tests found, skipping...${NC}"
    fi
    echo ""
fi

# Run browser tests
if [ "$RUN_BROWSER" = true ]; then
    echo -e "${YELLOW}Running browser tests...${NC}"
    npm run test:browser
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Browser tests passed${NC}"
    else
        echo -e "${RED}Browser tests failed${NC}"
        exit 1
    fi
    echo ""
fi

echo -e "${GREEN}=== All tests passed! ===${NC}"
