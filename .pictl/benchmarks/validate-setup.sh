#!/bin/bash
# Validate benchmark regression detection setup
# Checks that all components are properly configured

set +e  # Don't exit on errors; we'll summarize them

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"
CHECKS_PASSED=0
CHECKS_FAILED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Benchmark Regression Detection — Setup Validation ===${NC}\n"

# Helper functions
check_file() {
  local file="$1"
  local desc="$2"
  if [ -f "$file" ]; then
    echo -e "${GREEN}✅${NC} $desc"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC} $desc — NOT FOUND: $file"
    ((CHECKS_FAILED++))
  fi
}

check_dir() {
  local dir="$1"
  local desc="$2"
  if [ -d "$dir" ]; then
    echo -e "${GREEN}✅${NC} $desc"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC} $desc — NOT FOUND: $dir"
    ((CHECKS_FAILED++))
  fi
}

check_executable() {
  local file="$1"
  local desc="$2"
  if [ -x "$file" ]; then
    echo -e "${GREEN}✅${NC} $desc (executable)"
    ((CHECKS_PASSED++))
  elif [ -f "$file" ]; then
    echo -e "${YELLOW}⚠️${NC}  $desc (exists but not executable)"
    ((CHECKS_FAILED++))
  else
    echo -e "${RED}❌${NC} $desc — NOT FOUND"
    ((CHECKS_FAILED++))
  fi
}

check_json_valid() {
  local file="$1"
  local desc="$2"
  if [ -f "$file" ]; then
    if jq empty "$file" 2>/dev/null; then
      echo -e "${GREEN}✅${NC} $desc (valid JSON)"
      ((CHECKS_PASSED++))
    else
      echo -e "${RED}❌${NC} $desc — INVALID JSON"
      ((CHECKS_FAILED++))
    fi
  else
    echo -e "${RED}❌${NC} $desc — FILE NOT FOUND: $file"
    ((CHECKS_FAILED++))
  fi
}

check_git_workflow() {
  local workflow="$1"
  local desc="$2"
  if [ -f "$workflow" ]; then
    if grep -q -E "(bench|regression|benchmark|Regression)" "$workflow"; then
      echo -e "${GREEN}✅${NC} $desc (contains benchmark checks)"
      ((CHECKS_PASSED++))
    else
      echo -e "${RED}❌${NC} $desc (file exists but benchmark checks missing)"
      ((CHECKS_FAILED++))
    fi
  else
    echo -e "${RED}❌${NC} $desc — NOT FOUND"
    ((CHECKS_FAILED++))
  fi
}

# 1. Check directory structure
echo -e "${BLUE}1. Directory Structure${NC}"
check_dir "$SCRIPT_DIR" "Benchmarks directory (.pictl/benchmarks)"
check_dir "$SCRIPT_DIR/baselines" "Baselines directory (.pictl/benchmarks/baselines)"
echo ""

# 2. Check shell scripts
echo -e "${BLUE}2. Shell Scripts${NC}"
check_executable "$SCRIPT_DIR/update-baseline.sh" "update-baseline.sh"
check_executable "$SCRIPT_DIR/detect-regression.sh" "detect-regression.sh"
echo ""

# 3. Check Python scripts
echo -e "${BLUE}3. Python Scripts${NC}"
check_executable "$SCRIPT_DIR/plot-trends.py" "plot-trends.py"
# Verify Python syntax
if python3 -m py_compile "$SCRIPT_DIR/plot-trends.py" 2>/dev/null; then
  echo -e "${GREEN}✅${NC} plot-trends.py (valid Python syntax)"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} plot-trends.py (syntax error)"
  ((CHECKS_FAILED++))
fi
echo ""

# 4. Check documentation files
echo -e "${BLUE}4. Documentation${NC}"
check_file "$SCRIPT_DIR/README.md" "README.md"
check_file "$SCRIPT_DIR/SETUP.md" "SETUP.md"
check_file "$SCRIPT_DIR/regression-report.md" "regression-report.md (template)"
echo ""

# 5. Check JSON files
echo -e "${BLUE}5. Configuration Files${NC}"
check_json_valid "$SCRIPT_DIR/trends.json" "trends.json (schema)"
check_json_valid "$SCRIPT_DIR/baselines/SAMPLE_BASELINE.json" "SAMPLE_BASELINE.json"
echo ""

# 6. Check GitHub Actions workflow
echo -e "${BLUE}6. GitHub Actions Workflow${NC}"
check_git_workflow "$REPO_ROOT/.github/workflows/bench-regression.yml" "bench-regression.yml"
echo ""

# 7. Check Makefile integration
echo -e "${BLUE}7. Makefile Integration${NC}"
if grep -q "bench-regression" "$REPO_ROOT/Makefile"; then
  echo -e "${GREEN}✅${NC} Makefile contains bench-regression target"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} Makefile missing bench-regression target"
  ((CHECKS_FAILED++))
fi

if grep -q "bench-baseline-update" "$REPO_ROOT/Makefile"; then
  echo -e "${GREEN}✅${NC} Makefile contains bench-baseline-update target"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} Makefile missing bench-baseline-update target"
  ((CHECKS_FAILED++))
fi

if grep -q "bench-trends" "$REPO_ROOT/Makefile"; then
  echo -e "${GREEN}✅${NC} Makefile contains bench-trends target"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} Makefile missing bench-trends target"
  ((CHECKS_FAILED++))
fi
echo ""

# 8. Check external tools
echo -e "${BLUE}8. External Tools${NC}"
if command -v jq &> /dev/null; then
  echo -e "${GREEN}✅${NC} jq (JSON processor) available"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠️${NC}  jq not found (optional, for report parsing)"
fi

if command -v python3 &> /dev/null; then
  echo -e "${GREEN}✅${NC} python3 available"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} python3 not found (required)"
  ((CHECKS_FAILED++))
fi

if command -v git &> /dev/null; then
  echo -e "${GREEN}✅${NC} git available"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} git not found (required)"
  ((CHECKS_FAILED++))
fi

if command -v cargo &> /dev/null; then
  echo -e "${GREEN}✅${NC} cargo available"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠️${NC}  cargo not found (required for benchmarks)"
fi
echo ""

# 9. Test scripts (dry-run)
echo -e "${BLUE}9. Script Dry-Run Tests${NC}"

# Test update-baseline.sh --help or syntax check
if bash -n "$SCRIPT_DIR/update-baseline.sh" 2>/dev/null; then
  echo -e "${GREEN}✅${NC} update-baseline.sh (syntax valid)"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} update-baseline.sh (syntax error)"
  ((CHECKS_FAILED++))
fi

# Test detect-regression.sh syntax
if bash -n "$SCRIPT_DIR/detect-regression.sh" 2>/dev/null; then
  echo -e "${GREEN}✅${NC} detect-regression.sh (syntax valid)"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} detect-regression.sh (syntax error)"
  ((CHECKS_FAILED++))
fi

# Test plot-trends.py --help
if python3 "$SCRIPT_DIR/plot-trends.py" --help > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC} plot-trends.py --help works"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}❌${NC} plot-trends.py --help failed"
  ((CHECKS_FAILED++))
fi
echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
TOTAL=$((CHECKS_PASSED + CHECKS_FAILED))
PASS_PCT=$((CHECKS_PASSED * 100 / TOTAL))

echo "Checks passed: $CHECKS_PASSED / $TOTAL ($PASS_PCT%)"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Setup is complete.${NC}"
  echo ""
  echo "Next steps:"
  echo "1. On main branch: make bench && bash .pictl/benchmarks/update-baseline.sh"
  echo "2. Commit: git add .pictl/benchmarks/baselines/ && git commit -m 'chore: establish baselines'"
  echo "3. On PR: make bench-regression"
  exit 0
else
  echo -e "${RED}❌ $CHECKS_FAILED check(s) failed. See details above.${NC}"
  echo ""
  echo "To fix:"
  echo "1. chmod +x .pictl/benchmarks/*.sh .pictl/benchmarks/*.py"
  echo "2. Verify all required files exist"
  echo "3. Run: make help | grep bench"
  exit 1
fi
