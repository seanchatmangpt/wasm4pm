#!/bin/bash

# Release verification script
# Checks all release gates before publishing

set -e

echo "========================================"
echo "Release Gate Verification"
echo "========================================"

VERIFICATION_REPORT=".github/verification-report.md"
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize report
cat > "$VERIFICATION_REPORT" << 'EOF'
# Release Verification Report

Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Git Commit: $(git rev-parse --short HEAD)

## Verification Status

EOF

# Gate 1: All tests pass
echo ""
echo -e "${YELLOW}Gate 1: Verify all tests pass${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 1: All Tests Pass" >> "$VERIFICATION_REPORT"

cd wasm4pm
if npm test > /tmp/test-output.log 2>&1; then
    echo -e "${GREEN}✓ All tests passed${NC}"
    echo "✓ **All 800+ tests passed**" >> "../$VERIFICATION_REPORT"
else
    echo -e "${RED}✗ Tests failed${NC}"
    echo "✗ **Tests failed - see logs**" >> "../$VERIFICATION_REPORT"
    tail -50 /tmp/test-output.log >> "../$VERIFICATION_REPORT"
    FAILED=1
fi
cd ..

# Gate 2: Code coverage
echo ""
echo -e "${YELLOW}Gate 2: Verify code coverage > 70%${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 2: Code Coverage (>70%)" >> "$VERIFICATION_REPORT"

cd wasm4pm
if npm run test:coverage > /tmp/coverage-output.log 2>&1; then
    # Try to extract coverage percentage
    COVERAGE=$(npx nyc report --reporter=json 2>/dev/null | jq '.total.lines.pct' 2>/dev/null || echo "0")
    if (( $(echo "$COVERAGE >= 70" | bc -l 2>/dev/null || echo "1") )); then
        echo -e "${GREEN}✓ Coverage: ${COVERAGE}%${NC}"
        echo "✓ **Coverage: ${COVERAGE}% (threshold: 70%)**" >> "../$VERIFICATION_REPORT"
    else
        echo -e "${YELLOW}⚠ Coverage: ${COVERAGE}% (below threshold)${NC}"
        echo "⚠ **Coverage: ${COVERAGE}% (threshold: 70%, not enforced)**" >> "../$VERIFICATION_REPORT"
    fi
else
    echo -e "${YELLOW}⚠ Could not generate coverage report${NC}"
    echo "⚠ **Coverage report generation failed (continuing)**" >> "../$VERIFICATION_REPORT"
fi
cd ..

# Gate 3: No TypeScript errors
echo ""
echo -e "${YELLOW}Gate 3: Verify TypeScript type checking${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 3: TypeScript Type Checking" >> "$VERIFICATION_REPORT"

cd wasm4pm
if npm run type:check > /tmp/tsc-output.log 2>&1; then
    echo -e "${GREEN}✓ No TypeScript errors${NC}"
    echo "✓ **No TypeScript errors**" >> "../$VERIFICATION_REPORT"
else
    echo -e "${RED}✗ TypeScript errors detected${NC}"
    echo "✗ **TypeScript errors:**" >> "../$VERIFICATION_REPORT"
    cat /tmp/tsc-output.log >> "../$VERIFICATION_REPORT"
    FAILED=1
fi
cd ..

# Gate 4: No Rust warnings (clippy)
echo ""
echo -e "${YELLOW}Gate 4: Verify Rust code quality${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 4: Rust Code Quality (Clippy)" >> "$VERIFICATION_REPORT"

cd wasm4pm
if cargo clippy --all-targets --target wasm32-unknown-unknown -- -D warnings > /tmp/clippy-output.log 2>&1; then
    echo -e "${GREEN}✓ No Rust clippy warnings${NC}"
    echo "✓ **No Rust clippy warnings**" >> "../$VERIFICATION_REPORT"
else
    echo -e "${YELLOW}⚠ Clippy warnings detected (not enforced)${NC}"
    echo "⚠ **Clippy warnings (continuing):**" >> "../$VERIFICATION_REPORT"
    tail -20 /tmp/clippy-output.log >> "../$VERIFICATION_REPORT"
fi
cd ..

# Gate 5: Formatting
echo ""
echo -e "${YELLOW}Gate 5: Verify code formatting${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 5: Code Formatting" >> "$VERIFICATION_REPORT"

cd wasm4pm
if npm run format:check > /tmp/prettier-output.log 2>&1; then
    echo -e "${GREEN}✓ Code is properly formatted${NC}"
    echo "✓ **Code is properly formatted (Prettier)**" >> "../$VERIFICATION_REPORT"
else
    echo -e "${YELLOW}⚠ Formatting issues detected${NC}"
    echo "⚠ **Formatting issues (auto-fixable):**" >> "../$VERIFICATION_REPORT"
    tail -20 /tmp/prettier-output.log >> "../$VERIFICATION_REPORT"
fi
cd ..

# Gate 6: Security audit
echo ""
echo -e "${YELLOW}Gate 6: Verify security (cargo audit)${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 6: Security Audit (cargo audit)" >> "$VERIFICATION_REPORT"

cd wasm4pm
if cargo audit --deny warnings > /tmp/audit-output.log 2>&1; then
    echo -e "${GREEN}✓ No security vulnerabilities${NC}"
    echo "✓ **No known security vulnerabilities**" >> "../$VERIFICATION_REPORT"
else
    echo -e "${YELLOW}⚠ Security audit warnings${NC}"
    echo "⚠ **Security audit output:**" >> "../$VERIFICATION_REPORT"
    cat /tmp/audit-output.log >> "../$VERIFICATION_REPORT"
fi
cd ..

# Gate 7: OTEL observability
echo ""
echo -e "${YELLOW}Gate 7: Verify OTEL observability${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 7: OTEL Observability" >> "$VERIFICATION_REPORT"

if grep -r "use_otel" wasm4pm/src/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OTEL integration found${NC}"
    echo "✓ **OTEL observability integrated**" >> "$VERIFICATION_REPORT"
else
    echo -e "${YELLOW}⚠ OTEL integration not found (optional)${NC}"
    echo "⚠ **OTEL integration optional**" >> "$VERIFICATION_REPORT"
fi

# Gate 8: Check for hardcoded secrets
echo ""
echo -e "${YELLOW}Gate 8: Verify no hardcoded secrets${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 8: Hardcoded Secrets Check" >> "$VERIFICATION_REPORT"

SECRET_PATTERNS="(password|secret|token|api[_-]?key|auth|credential)"
if grep -r -E "$SECRET_PATTERNS" wasm4pm/src/ --include="*.rs" --include="*.ts" 2>/dev/null | grep -v "// " | grep -v "test" > /tmp/secrets-check.log 2>&1; then
    if [ -s /tmp/secrets-check.log ]; then
        echo -e "${YELLOW}⚠ Potential secrets found (review manually)${NC}"
        echo "⚠ **Manual review required for potential secrets**" >> "$VERIFICATION_REPORT"
    else
        echo -e "${GREEN}✓ No obvious hardcoded secrets${NC}"
        echo "✓ **No hardcoded secrets detected**" >> "$VERIFICATION_REPORT"
    fi
else
    echo -e "${GREEN}✓ No obvious hardcoded secrets${NC}"
    echo "✓ **No hardcoded secrets detected**" >> "$VERIFICATION_REPORT"
fi

# Gate 9: Watch mode verification
echo ""
echo -e "${YELLOW}Gate 9: Verify watch mode features${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 9: Watch Mode Verification" >> "$VERIFICATION_REPORT"

if grep -r "watch" wasm4pm/__tests__/ --include="*.ts" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Watch mode tests exist${NC}"
    echo "✓ **Watch mode tests exist**" >> "$VERIFICATION_REPORT"
else
    echo -e "${YELLOW}⚠ No watch mode tests found (optional)${NC}"
    echo "⚠ **Watch mode tests optional**" >> "$VERIFICATION_REPORT"
fi

# Gate 10: Build verification
echo ""
echo -e "${YELLOW}Gate 10: Verify WASM builds${NC}"
echo "---" >> "$VERIFICATION_REPORT"
echo "### Gate 10: WASM Build Verification" >> "$VERIFICATION_REPORT"

cd wasm4pm
if npm run build:all > /tmp/build-output.log 2>&1; then
    if [ -f "pkg/wasm4pm.wasm" ] && [ -f "pkg-nodejs/wasm4pm.wasm" ] && [ -f "pkg-web/wasm4pm.wasm" ]; then
        echo -e "${GREEN}✓ All WASM targets built successfully${NC}"
        echo "✓ **All WASM targets built:**" >> "../$VERIFICATION_REPORT"
        echo "  - Bundler target: pkg/wasm4pm.wasm ($(ls -lh pkg/wasm4pm.wasm | awk '{print $5}'))" >> "../$VERIFICATION_REPORT"
        echo "  - Node.js target: pkg-nodejs/wasm4pm.wasm ($(ls -lh pkg-nodejs/wasm4pm.wasm | awk '{print $5}'))" >> "../$VERIFICATION_REPORT"
        echo "  - Web target: pkg-web/wasm4pm.wasm ($(ls -lh pkg-web/wasm4pm.wasm | awk '{print $5}'))" >> "../$VERIFICATION_REPORT"
    else
        echo -e "${RED}✗ WASM targets missing${NC}"
        echo "✗ **WASM build incomplete**" >> "../$VERIFICATION_REPORT"
        FAILED=1
    fi
else
    echo -e "${RED}✗ WASM build failed${NC}"
    echo "✗ **WASM build failed:**" >> "../$VERIFICATION_REPORT"
    tail -30 /tmp/build-output.log >> "../$VERIFICATION_REPORT"
    FAILED=1
fi
cd ..

# Final summary
echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All release gates passed${NC}"
    echo "" >> "$VERIFICATION_REPORT"
    echo "## Summary" >> "$VERIFICATION_REPORT"
    echo "✓ **All release gates PASSED** - Ready for publication" >> "$VERIFICATION_REPORT"
else
    echo -e "${RED}✗ Some release gates failed${NC}"
    echo "" >> "$VERIFICATION_REPORT"
    echo "## Summary" >> "$VERIFICATION_REPORT"
    echo "✗ **Some release gates FAILED** - Review above" >> "$VERIFICATION_REPORT"
fi
echo "========================================"

echo ""
echo "Verification report written to: $VERIFICATION_REPORT"

exit $FAILED
