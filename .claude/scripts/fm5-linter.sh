#!/bin/bash
# FM-5 Linter: Detects self-referential test assertions (FM-5 violations)
# Self-referential assertions prove nothing — they always pass.
# This script finds common FM-5 patterns and fails the commit if found.

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

VIOLATIONS_FOUND=0
TEMP_FILE=$(mktemp)

# Patterns that indicate FM-5 violations (self-referential assertions)
# Pattern 1: expect(true).toBe(true) — pure tautology
# Pattern 2: expect(threw || true).toBe(true) — || true defeats hang detection
# Pattern 3: expect(condition || true).toBe(true) — always true
# Pattern 4: expect(result === null || typeof result === 'object').toBe(true) — weak OR
# Pattern 5: expect((json as X).field === 'success' || json !== null).toBe(true) — soft assertion

echo "🔍 FM-5 Linter: Scanning for self-referential test assertions..."
echo ""

# Get changed test files only
CHANGED_TEST_FILES=$(git diff --cached --name-only | grep -E "\.test\.ts$" || true)

if [ -z "$CHANGED_TEST_FILES" ]; then
  echo "   No test files changed."
  exit 0
fi

# Check each changed test file
while IFS= read -r file; do
  # Pattern 1: expect(true).toBe(true)
  if git show ":$file" 2>/dev/null | grep -n "expect(true)\.toBe(true)" > "$TEMP_FILE"; then
    while IFS= read -r line; do
      echo "$file:$line — expect(true).toBe(true) is a tautology (FM-5 violation)"
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    done < "$TEMP_FILE"
  fi

  # Pattern 2: expect(threw || true).toBe(true)
  if git show ":$file" 2>/dev/null | grep -n "expect(.* || true)\.toBe(true)" > "$TEMP_FILE"; then
    while IFS= read -r line; do
      echo "$file:$line — expect(... || true).toBe(true) defeats hang detection (FM-5 violation)"
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    done < "$TEMP_FILE"
  fi

  # Pattern 3: expect(result === null || typeof result === 'object').toBe(true)
  # This is weak — should verify actual state, not OR conditions
  if git show ":$file" 2>/dev/null | grep -n "expect(.*result === null.*typeof result.*).toBe(true)" > "$TEMP_FILE"; then
    while IFS= read -r line; do
      echo "$file:$line — weak OR condition: should assert actual object properties (FM-5 violation)"
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    done < "$TEMP_FILE"
  fi

  # Pattern 4: expect((json as X).field === 'success' || json !== null).toBe(true)
  # This is soft — should require specific status value
  if git show ":$file" 2>/dev/null | grep -n "expect(.*\.status === .* || json !== null)" > "$TEMP_FILE"; then
    while IFS= read -r line; do
      echo "$file:$line — soft assertion: should require specific status value (FM-5 violation)"
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    done < "$TEMP_FILE"
  fi

done <<< "$CHANGED_TEST_FILES"

rm -f "$TEMP_FILE"

if [ $VIOLATIONS_FOUND -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ FM-5 Violations found: $VIOLATIONS_FOUND${NC}"
  echo ""
  echo "FM-5 Rule: Self-referential assertions prove nothing."
  echo "Replace with real oracles:"
  echo "  • Rank-1 Mathematical: Bellman correctness, statistical properties"
  echo "  • Rank-2 Domain Contract: Design-decided invariants (health degradation → reward decrease)"
  echo "  • Rank-3 Metamorphic: Input perturbation → output relation"
  echo "  • Rank-4 Statistical: Convergence trends over N trials"
  echo ""
  echo "See: .claude/rules/chicago-tdd.md (Chicago TDD — Van der Aalst Constitution)"
  exit 1
else
  echo "   ✓ No FM-5 violations found"
  exit 0
fi
