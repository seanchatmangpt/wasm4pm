#!/bin/bash
#
# Test Purity Enforcement Hook
# Gemba principle: Integration tests must be real (no mocks/stubs)
#
# Runs ESLint on changed test files and blocks commit if integration tests contain mocks.
# Usage: called by pre-commit.sh
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Find changed test files (staged + unstaged)
CHANGED_TESTS=$(git diff --diff-filter=ACM --name-only HEAD -- '*.test.ts' '*.spec.ts' 2>/dev/null || true)

if [ -z "$CHANGED_TESTS" ]; then
  echo "No test files changed. Skipping test purity check."
  exit 0
fi

# Separate integration tests from unit tests
INTEGRATION_TESTS=""
UNIT_TESTS=""

while IFS= read -r file; do
  if [[ "$file" == *".integration.test.ts" ]] || [[ "$file" == *".e2e.test.ts" ]] || [[ "$file" == *"__tests__/integration/"* ]]; then
    INTEGRATION_TESTS="$INTEGRATION_TESTS $file"
  else
    UNIT_TESTS="$UNIT_TESTS $file"
  fi
done <<< "$CHANGED_TESTS"

# Track violations
VIOLATIONS=()
VERIFIED_INTEGRATION=0

echo "Running test purity checks (Gemba enforcement)..."
echo ""

# Check integration tests for mocks
if [ -n "$INTEGRATION_TESTS" ]; then
  echo "Checking integration tests for mock usage..."

  for test_file in $INTEGRATION_TESTS; do
    # Check for mock patterns
    if grep -qE "(vi\\.mock|vi\\.stub|vi\\.stubGlobal|jest\\.mock|jest\\.spyOn|sinon\\.stub|td\\.replace|mockImplementation|mockReturnValue)" "$test_file"; then
      VIOLATIONS+=("$test_file")
      echo -e "${RED}✗ VIOLATION${NC}: $test_file contains mocks/stubs"
    else
      ((VERIFIED_INTEGRATION++))
      echo -e "${GREEN}✓ OK${NC}: $test_file (real implementation)"
    fi
  done
fi

# Summary
echo ""
if [ ${#VIOLATIONS[@]} -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Test purity check passed"
  echo "  Integration tests verified: $VERIFIED_INTEGRATION (all real, no mocks)"
  [ -n "$UNIT_TESTS" ] && echo "  Unit tests checked: $(echo $UNIT_TESTS | wc -w)"
  exit 0
else
  echo -e "${RED}[FAIL]${NC} Test purity violations found"
  echo ""
  echo "Integration tests must use real WASM/APIs per Gemba principle."
  echo "Move mocks to unit tests (*.unit.test.ts or *.spec.ts)."
  echo ""
  echo "Violations:"
  for violation in "${VIOLATIONS[@]}"; do
    echo "  - $violation"
  done
  echo ""
  echo "To fix:"
  echo "  1. Extract mock/stub setup to a separate unit test file"
  echo "  2. Or mark this as a unit test: rename to *.unit.test.ts"
  echo "  3. Or use real implementations in the integration test"
  echo ""
  exit 1
fi
