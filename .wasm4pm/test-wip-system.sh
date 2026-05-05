#!/bin/bash

# Test WIP System — Verify all components installed correctly

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
echo "Testing WIP system in: $REPO_ROOT"
echo ""

PASS=0
FAIL=0

# Test 1: WIP config exists and is valid JSON
echo "Test 1: WIP config file..."
if [ -f "$REPO_ROOT/.pictl/wip-config.json" ]; then
  if jq . "$REPO_ROOT/.pictl/wip-config.json" > /dev/null 2>&1; then
    echo "  ✅ PASS: .pictl/wip-config.json is valid JSON"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL: .pictl/wip-config.json is invalid JSON"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ❌ FAIL: .pictl/wip-config.json not found"
  FAIL=$((FAIL + 1))
fi

# Test 2: WIP check script exists and is executable
echo "Test 2: WIP check script..."
if [ -x "$REPO_ROOT/.claude/hooks/wip-check.sh" ]; then
  echo "  ✅ PASS: .claude/hooks/wip-check.sh is executable"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .claude/hooks/wip-check.sh not found or not executable"
  FAIL=$((FAIL + 1))
fi

# Test 3: Setup hooks script exists
echo "Test 3: Setup hooks script..."
if [ -f "$REPO_ROOT/.claude/scripts/setup-hooks.sh" ]; then
  echo "  ✅ PASS: .claude/scripts/setup-hooks.sh exists (will be made executable on first run)"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .claude/scripts/setup-hooks.sh not found"
  FAIL=$((FAIL + 1))
fi

# Test 4: GitHub Actions wip-check workflow exists
echo "Test 4: GitHub Actions WIP check workflow..."
if [ -f "$REPO_ROOT/.github/workflows/wip-check.yml" ]; then
  echo "  ✅ PASS: .github/workflows/wip-check.yml exists"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .github/workflows/wip-check.yml not found"
  FAIL=$((FAIL + 1))
fi

# Test 5: GitHub Actions staleness workflow exists
echo "Test 5: GitHub Actions staleness workflow..."
if [ -f "$REPO_ROOT/.github/workflows/pr-staleness.yml" ]; then
  echo "  ✅ PASS: .github/workflows/pr-staleness.yml exists"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .github/workflows/pr-staleness.yml not found"
  FAIL=$((FAIL + 1))
fi

# Test 6: WIP status dashboard exists
echo "Test 6: WIP status dashboard..."
if [ -f "$REPO_ROOT/.pictl/wip-status.md" ]; then
  echo "  ✅ PASS: .pictl/wip-status.md exists"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .pictl/wip-status.md not found"
  FAIL=$((FAIL + 1))
fi

# Test 7: WIP implementation documentation exists
echo "Test 7: WIP implementation documentation..."
if [ -f "$REPO_ROOT/.pictl/WIP-IMPLEMENTATION.md" ]; then
  echo "  ✅ PASS: .pictl/WIP-IMPLEMENTATION.md exists"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: .pictl/WIP-IMPLEMENTATION.md not found"
  FAIL=$((FAIL + 1))
fi

# Test 8: Config has required fields
echo "Test 8: Config has required fields..."
REQUIRED_FIELDS=("max_concurrent_prs" "max_review_hours" "escalation_hours" "merge_block_hours" "enabled")
MISSING_FIELDS=()

for field in "${REQUIRED_FIELDS[@]}"; do
  if ! jq -e ".$field" "$REPO_ROOT/.pictl/wip-config.json" > /dev/null 2>&1; then
    MISSING_FIELDS+=("$field")
  fi
done

if [ ${#MISSING_FIELDS[@]} -eq 0 ]; then
  echo "  ✅ PASS: All required config fields present"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: Missing config fields: ${MISSING_FIELDS[*]}"
  FAIL=$((FAIL + 1))
fi

# Test 9: Check gh CLI is available
echo "Test 9: GitHub CLI availability..."
if command -v gh &> /dev/null; then
  echo "  ✅ PASS: gh CLI is installed"
  PASS=$((PASS + 1))
else
  echo "  ⚠️  WARNING: gh CLI not found (required for hooks to work)"
  FAIL=$((FAIL + 1))
fi

# Test 10: Check gh CLI is authenticated
echo "Test 10: GitHub CLI authentication..."
if gh auth status > /dev/null 2>&1; then
  echo "  ✅ PASS: gh CLI is authenticated"
  PASS=$((PASS + 1))
else
  echo "  ⚠️  WARNING: gh CLI not authenticated (run 'gh auth login')"
  FAIL=$((FAIL + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ PASSED: $PASS"
echo "❌ FAILED: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ All tests passed! WIP system is ready."
  echo ""
  echo "Next steps:"
  echo "  1. Install hooks: bash .claude/scripts/setup-hooks.sh"
  echo "  2. Test locally: bash .claude/hooks/wip-check.sh"
  echo "  3. Verify in GitHub Actions: Push a new branch and check workflows"
  echo ""
  exit 0
else
  echo "❌ Some tests failed. Review output above."
  echo ""
  exit 1
fi
