/**
 * lab/validate.ts - Main validation entry point
 *
 * This script orchestrates post-publication conformance validation:
 * 1. Installs published wasm4pm from npm
 * 2. Captures artifact metadata
 * 3. Runs conformance tests
 * 4. Compares against baselines
 * 5. Generates reports
 */

import { LabRunner } from "./harness";
import fs from "fs";
import path from "path";

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  version?: string;
  verbose: boolean;
  category?: string;
  report?: string;
} {
  const args = process.argv.slice(2);
  const options: any = { verbose: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--version" && args[i + 1]) {
      options.version = args[++i];
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--category" && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === "--report" && args[i + 1]) {
      options.report = args[++i];
    }
  }

  return options;
}

/**
 * Main validation entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  wasm4pm Post-Publication Conformance Validation");
  console.log("═══════════════════════════════════════════════════════");
  console.log();

  const runner = new LabRunner({
    version: options.version,
    verbose: options.verbose,
  });

  try {
    // Step 1: Install artifact
    console.log("Step 1: Installing published artifact from npm...");
    await runner.installArtifact();
    const artifact = runner.getArtifact();

    if (!artifact) {
      throw new Error("Failed to capture artifact metadata");
    }

    console.log(`  Package: ${artifact.name}`);
    console.log(`  Version: ${artifact.version}`);
    console.log(`  Platform: ${artifact.platform} (${artifact.arch})`);
    console.log(`  Node: ${artifact.nodeVersion}`);
    console.log(`  Hash: ${artifact.packageHash.substring(0, 12)}...`);
    console.log();

    // Step 2: Load baseline
    console.log("Step 2: Loading baseline expectations...");
    const baseline = runner.loadBaseline();
    if (baseline) {
      console.log(`  Baseline loaded (${baseline.tests?.length || 0} expected tests)`);
    } else {
      console.log("  ⚠ No baseline found - skipping regression detection");
    }
    console.log();

    // Step 3: Run tests (placeholder - tests defined by conformance test suite)
    console.log("Step 3: Running conformance tests...");
    console.log("  ⚠ Test execution framework not yet implemented");
    console.log("  (Ready for test definition)");
    console.log();

    // Step 4: Generate report
    console.log("Step 4: Generating report...");
    const report = runner.generateReport();
    const reportPath = runner.saveReport(report);

    console.log(`  Report saved: ${reportPath}`);
    console.log();

    // Step 5: Check regression (if baseline available)
    if (baseline) {
      console.log("Step 5: Checking for regressions...");
      const regression = runner.checkRegression(baseline);

      if (regression.hasRegression) {
        console.log(`  ⚠ Regression detected: ${regression.diff.length} differences`);
        regression.diff.forEach((d) => {
          console.log(`    - ${d.message}`);
        });
      } else {
        console.log("  ✓ No regressions detected");
      }
      console.log();
    }

    // Summary
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Validation Summary");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Total Tests: ${report.summary.total}`);
    console.log(`  Passed: ${report.summary.passed}`);
    console.log(`  Failed: ${report.summary.failed}`);
    console.log(`  Skipped: ${report.summary.skipped}`);
    console.log(`  Conformance: ${report.conformance}`);
    console.log();

    if (report.conformance === "FAIL") {
      console.error("❌ Validation FAILED");
      process.exit(1);
    } else {
      console.log("✅ Validation PASSED");
      process.exit(0);
    }
  } catch (error) {
    console.error("❌ Validation error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
