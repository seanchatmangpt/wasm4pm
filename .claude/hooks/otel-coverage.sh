#!/bin/bash

##############################################################################
# Pre-commit hook: OTEL Span Coverage Enforcement
#
# Blocks commits when NEW public functions are added without OTEL spans.
# Allows commits if modified public functions keep existing spans.
#
# Exit codes:
#   0 = all new public functions have spans
#   1 = new public functions found without spans (COMMIT BLOCKED)
#   2 = scanning error
##############################################################################

set -eu

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
TEMP_DIR="/tmp/pictl_otel_check_$$"
mkdir -p "$TEMP_DIR"

trap "rm -rf $TEMP_DIR" EXIT

# Get list of changed TypeScript files in packages/*/src
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=A | grep -E "packages/.*/src/.*\.ts$" || true)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Create scanning script
cat > "$TEMP_DIR/check_new_functions.js" << 'CHECK_EOF'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const changedFiles = process.argv.slice(2);
const violations = [];

changedFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;

  const content = fs.readFileSync(fullPath, 'utf-8');
  const exports = [];

  // Extract all public functions
  const funcPattern = /export\s+(async\s+)?function\s+(\w+)/gm;
  const constPattern = /export\s+const\s+(\w+)\s*[=:]/gm;

  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    exports.push({ name: match[2], type: 'function' });
  }

  while ((match = constPattern.exec(content)) !== null) {
    exports.push({ name: match[1], type: 'const' });
  }

  // Check if any export lacks Instrumentation call
  exports.forEach(exp => {
    const escapedName = exp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const funcPattern = new RegExp(
      `export\\s+(?:async\\s+)?(?:const\\s+)?${escapedName}\\s*[=:(]`
    );

    const match = funcPattern.exec(content);
    if (match) {
      const startIdx = match.index;
      const funcBody = content.substring(startIdx);
      const endIdx = funcBody.indexOf('\nexport');
      const body = endIdx === -1 ? funcBody : funcBody.substring(0, endIdx);

      const hasInstrumentation = /Instrumentation\.(create|emit|record)/.test(body);
      if (!hasInstrumentation) {
        violations.push({
          file,
          function: exp.name,
          line: content.substring(0, startIdx).split('\n').length,
        });
      }
    }
  });
});

if (violations.length > 0) {
  console.error('\n❌ OTEL SPAN COVERAGE VIOLATION\n');
  console.error('New public functions must have Instrumentation calls.\n');
  violations.forEach(v => {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    → export function ${v.function}() { ... }\n`);
  });
  console.error('Fix by adding Instrumentation.create*() call at function start.\n');
  process.exit(1);
} else {
  console.log('✅ OTEL coverage check passed');
  process.exit(0);
}
CHECK_EOF

# Run check
cd "$PROJECT_ROOT"
if ! node "$TEMP_DIR/check_new_functions.js" $CHANGED_FILES; then
  echo ""
  echo "Commit BLOCKED: Add OTEL spans to new public functions."
  echo "See packages/observability/src/instrumentation.ts for API."
  exit 1
fi

exit 0
