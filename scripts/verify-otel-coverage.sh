#!/bin/bash

##############################################################################
# OTEL Span Coverage Scanner
#
# Scans all public functions in packages/*/src and verifies they have
# corresponding Instrumentation.create* calls.
#
# Usage:
#   ./scripts/verify-otel-coverage.sh [--fix] [--threshold=80]
#
# Exit codes:
#   0 = coverage at or above threshold
#   1 = coverage below threshold
#   2 = scanning error
##############################################################################

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGES_DIR="$PROJECT_ROOT/packages"
COVERAGE_JSON="$PROJECT_ROOT/.pictl/otel-coverage.json"
COVERAGE_MD="$PROJECT_ROOT/.pictl/otel-coverage.md"

FIX_MODE=false
THRESHOLD=80
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --fix) FIX_MODE=true; shift ;;
    --threshold=*) THRESHOLD="${1#*=}"; shift ;;
    --verbose) VERBOSE=true; shift ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

# Create Node.js scanning script
cat > /tmp/scan_otel_coverage.js << 'SCANNER_EOF'
const fs = require('fs');
const path = require('path');

const fixMode = process.argv[2] === '--fix';
const verbose = process.argv[3] === '--verbose';

// Type definitions for clarity
/** @typedef {{ name: string, type: 'function'|'const'|'class'|'interface'|'type', line: number }} ExportInfo */
/** @typedef {{ file: string, function: string, line: number }} MissingSpan */

/**
 * Extract public exports from TypeScript file
 * @param {string} filePath
 * @returns {ExportInfo[]}
 */
function extractPublicExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exports = [];

  // Parse TypeScript exports
  const funcPattern = /export\s+(async\s+)?function\s+(\w+)/gm;
  const constPattern = /export\s+const\s+(\w+)\s*[=:]/gm;
  const classPattern = /export\s+(class|interface|type)\s+(\w+)/gm;

  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    exports.push({
      name: match[2],
      type: 'function',
      line: content.substring(0, match.index).split('\n').length,
    });
  }

  while ((match = constPattern.exec(content)) !== null) {
    exports.push({
      name: match[1],
      type: 'const',
      line: content.substring(0, match.index).split('\n').length,
    });
  }

  while ((match = classPattern.exec(content)) !== null) {
    exports.push({
      name: match[2],
      type: match[1].toLowerCase(),
      line: content.substring(0, match.index).split('\n').length,
    });
  }

  return exports;
}

/**
 * Check if file has Instrumentation calls for given function
 * @param {string} filePath
 * @param {string} functionName
 * @returns {boolean}
 */
function hasInstrumentationCall(filePath, functionName) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Find the function body
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const funcBodyPattern = new RegExp(
    `(?:export\\s+(?:async\\s+)?function\\s+${escapedName}\\s*\\([^)]*\\)|export\\s+const\\s+${escapedName}\\s*[=:])\\s*[{=][\\s\\S]*?(?=\\n(?:export|$))`,
    'm'
  );

  const funcMatch = funcBodyPattern.exec(content);
  if (!funcMatch) return false;

  const funcBody = funcMatch[0];
  return /Instrumentation\.(create|emit|record)/.test(funcBody);
}

/**
 * Walk directory and scan all TypeScript files
 */
function scanPackages() {
  const results = {};
  const baselineDate = new Date().toISOString().split('T')[0];

  const packagesDir = process.argv[4];
  const packages = fs.readdirSync(packagesDir);

  packages.forEach(pkg => {
    const srcDir = path.join(packagesDir, pkg, 'src');
    if (!fs.existsSync(srcDir)) return;

    results[pkg] = {
      total: 0,
      instrumented: 0,
      missing: [],
      files: {},
    };

    const walkDir = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.startsWith('__tests__') || file.endsWith('.test.ts')) return;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          const relFile = path.relative(srcDir, filePath);
          results[pkg].files[relFile] = { total: 0, instrumented: 0 };

          const exports = extractPublicExports(filePath);
          exports.forEach(exp => {
            if (exp.type !== 'type') {
              results[pkg].total++;
              results[pkg].files[relFile].total++;

              const hasInstrumentation = hasInstrumentationCall(filePath, exp.name);
              if (hasInstrumentation) {
                results[pkg].instrumented++;
                results[pkg].files[relFile].instrumented++;
              } else {
                results[pkg].missing.push({
                  file: relFile,
                  function: exp.name,
                  line: exp.line,
                });
              }
            }
          });
        }
      });
    };

    walkDir(srcDir);
  });

  // Calculate coverage
  let globalTotal = 0,
    globalInstrumented = 0;
  Object.values(results).forEach(data => {
    globalTotal += data.total;
    globalInstrumented += data.instrumented;
  });

  const coverage = globalTotal === 0 ? 0 : Math.round((globalInstrumented / globalTotal) * 100);

  // Generate JSON output
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    coverage,
    total: globalTotal,
    instrumented: globalInstrumented,
    missing_count: globalTotal - globalInstrumented,
    by_package: results,
    threshold: parseInt(process.argv[5], 10),
    meets_threshold: coverage >= parseInt(process.argv[5], 10),
  };

  // Write JSON
  const coverageDir = path.dirname(process.argv[6]);
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }
  fs.writeFileSync(process.argv[6], JSON.stringify(jsonOutput, null, 2));

  // Generate Markdown dashboard
  const sortedPkgs = Object.entries(results)
    .filter(([_, data]) => data.total > 0)
    .sort((a, b) => {
      const coverageA = a[1].total === 0 ? 100 : Math.round((a[1].instrumented / a[1].total) * 100);
      const coverageB = b[1].total === 0 ? 100 : Math.round((b[1].instrumented / b[1].total) * 100);
      return coverageA - coverageB;
    });

  let mdContent = '# OTEL Span Coverage Dashboard\n\n';
  mdContent += `**Last Updated:** ${new Date().toISOString()}\n\n`;
  mdContent += `## Overall Coverage\n\n`;
  mdContent += `- **Total Functions:** ${globalTotal}\n`;
  mdContent += `- **Instrumented:** ${globalInstrumented}\n`;
  mdContent += `- **Coverage:** ${coverage}%\n`;
  mdContent += `- **Target:** ${parseInt(process.argv[5], 10)}%\n`;
  mdContent += `- **Status:** ${coverage >= parseInt(process.argv[5], 10) ? '✅ PASS' : '❌ FAIL'}\n\n`;

  mdContent += '## Coverage by Package\n\n';
  mdContent += '| Package | Coverage | Instrumented | Total | Missing |\n';
  mdContent += '|---------|----------|--------------|-------|----------|\n';

  sortedPkgs.forEach(([pkg, data]) => {
    if (data.total === 0) return;
    const pkgCoverage = Math.round((data.instrumented / data.total) * 100);
    const status = pkgCoverage >= 80 ? '✅' : pkgCoverage >= 50 ? '⚠️' : '❌';
    mdContent += `| ${status} ${pkg} | ${pkgCoverage}% | ${data.instrumented} | ${data.total} | ${data.missing.length} |\n`;
  });

  mdContent += '\n## Top Gaps\n\n';
  const topGaps = sortedPkgs
    .filter(([_, data]) => data.missing.length > 0)
    .slice(0, 5);

  topGaps.forEach(([pkg, data]) => {
    mdContent += `### ${pkg} (${data.missing.length} missing)\n\n`;
    data.missing.slice(0, 3).forEach(m => {
      mdContent += `- \`${m.function}\` (${m.file}:${m.line})\n`;
    });
    if (data.missing.length > 3) {
      mdContent += `- ... and ${data.missing.length - 3} more\n`;
    }
    mdContent += '\n';
  });

  mdContent += '## How to Fix\n\n';
  mdContent += 'For each missing function, add an Instrumentation call at the start:\n\n';
  mdContent += '```typescript\n';
  mdContent += 'export function myFunction(params) {\n';
  mdContent += '  const span = Instrumentation.createSpan("myFunction", requiredAttrs);\n';
  mdContent += '  try {\n';
  mdContent += '    // ... implementation\n';
  mdContent += '    return result;\n';
  mdContent += '  } finally {\n';
  mdContent += '    span.end();\n';
  mdContent += '  }\n';
  mdContent += '}\n';
  mdContent += '```\n';

  fs.writeFileSync(process.argv[7], mdContent);

  // Console output
  console.log('\n=== OTEL Span Coverage Report ===\n');
  sortedPkgs.forEach(([pkg, data]) => {
    const pkgCoverage = Math.round((data.instrumented / data.total) * 100);
    const status = pkgCoverage >= 80 ? '✅' : pkgCoverage >= 50 ? '⚠️' : '❌';
    console.log(`${status} ${pkg}: ${data.instrumented}/${data.total} (${pkgCoverage}%)`);

    if (data.missing.length > 0 && data.missing.length <= 3 && verbose) {
      data.missing.forEach(m => {
        console.log(`   Missing: ${m.function} (${m.file}:${m.line})`);
      });
    }
  });

  console.log(`\n📊 OVERALL: ${globalInstrumented}/${globalTotal} (${coverage}%)\n`);

  if (coverage >= parseInt(process.argv[5], 10)) {
    console.log(`✅ Coverage meets threshold of ${process.argv[5]}%\n`);
    process.exit(0);
  } else {
    console.log(
      `❌ Coverage ${coverage}% is below threshold of ${process.argv[5]}%\n`
    );
    console.log('Run with --verbose to see all missing spans.\n');
    process.exit(1);
  }
}

scanPackages();
SCANNER_EOF

# Run scanner
if ! node /tmp/scan_otel_coverage.js "$FIX_MODE" "$VERBOSE" "$PACKAGES_DIR" "$THRESHOLD" "$COVERAGE_JSON" "$COVERAGE_MD"; then
  exit 1
fi
