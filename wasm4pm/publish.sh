#!/bin/bash

# Publishing script for process_mining_wasm
# Handles version bumping, testing, building, and npm publishing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current version
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

echo -e "${BLUE}=== process_mining_wasm Publishing ===${NC}"
echo "Current version: $CURRENT_VERSION"
echo ""

# Parse arguments for version type
VERSION_TYPE="${1:-patch}"
case $VERSION_TYPE in
    major|minor|patch)
        ;;
    *)
        echo -e "${RED}Error: Invalid version type: $VERSION_TYPE${NC}"
        echo "Usage: ./publish.sh [major|minor|patch]"
        exit 1
        ;;
esac

echo -e "${YELLOW}Validating repository state...${NC}"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Working directory has uncommitted changes${NC}"
    echo "Please commit or stash your changes before publishing"
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo -e "${YELLOW}Warning: Not on main/master branch (on: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${YELLOW}Running tests...${NC}"
if ! npm test; then
    echo -e "${RED}Tests failed. Aborting publish.${NC}"
    exit 1
fi

echo -e "${YELLOW}Linting code...${NC}"
if ! npm run lint; then
    echo -e "${RED}Linting failed. Aborting publish.${NC}"
    exit 1
fi

echo -e "${YELLOW}Type checking...${NC}"
if ! npm run type:check; then
    echo -e "${RED}Type checking failed. Aborting publish.${NC}"
    exit 1
fi

echo -e "${YELLOW}Building WASM for all targets...${NC}"
if ! npm run build:all; then
    echo -e "${RED}Build failed. Aborting publish.${NC}"
    exit 1
fi

echo -e "${YELLOW}Updating version to $VERSION_TYPE...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
echo -e "${GREEN}Version bumped: $CURRENT_VERSION -> $NEW_VERSION${NC}"

echo -e "${YELLOW}Committing version change...${NC}"
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"

echo -e "${YELLOW}Creating git tag...${NC}"
git tag "v$NEW_VERSION"

echo -e "${YELLOW}Publishing to npm...${NC}"
npm publish

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully published v$NEW_VERSION to npm${NC}"
    echo ""
    echo "Next steps:"
    echo "  git push origin main --tags"
    echo "  Create GitHub release at: https://github.com/seanchatmangpt/wasm4pm/releases"
else
    echo -e "${RED}npm publish failed${NC}"
    echo "Rolling back git changes..."
    git reset --soft HEAD~1
    git tag -d "v$NEW_VERSION"
    git checkout package.json package-lock.json
    exit 1
fi

echo -e "${GREEN}=== Publishing complete! ===${NC}"
