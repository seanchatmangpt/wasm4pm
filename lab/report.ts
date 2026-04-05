/**
 * lab/report.ts - Report generation and analysis utility
 *
 * Generates human-readable reports from validation results:
 * - Summary of validation status
 * - Regression detection output
 * - Performance comparisons
 * - Artifact metadata tracking
 */

import fs from "fs";
import path from "path";

/**
 * Load the most recent validation report
 */
function loadLatestReport(reportsDir: string = "reports"): any {
  if (!fs.existsSync(reportsDir)) {
    console.error(`Reports directory not found: ${reportsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(reportsDir);
  const jsonFiles = files
    .filter((f) => f.endsWith(".json") && f.startsWith("validity-"))
    .sort()
    .reverse();

  if (jsonFiles.length === 0) {
    console.error("No validation reports found");
    process.exit(1);
  }

  const latestFile = jsonFiles[0];
  const reportPath = path.join(reportsDir, latestFile);
  return {
    path: reportPath,
    data: JSON.parse(fs.readFileSync(reportPath, "utf-8")),
  };
}

/**
 * Format report for human-readable output
 */
function formatReport(report: any): void {
  const artifact = report.artifact;
  const summary = report.summary;
  const tests = report.tests || [];

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        Post-Publication Validation Report                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Artifact Section
  console.log("ARTIFACT");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Name:       ${artifact.name}`);
  console.log(`  Version:    ${artifact.version}`);
  console.log(`  Installed:  ${artifact.installedAt}`);
  console.log(`  Platform:   ${artifact.platform} (${artifact.arch})`);
  console.log(`  Node:       ${artifact.nodeVersion}`);
  console.log(`  Hash:       ${artifact.packageHash.substring(0, 16)}...`);
  console.log();

  // Summary Section
  console.log("SUMMARY");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Total Tests:  ${summary.total}`);
  console.log(`  Passed:       ${summary.passed} (${percentage(summary.passed, summary.total)}%)`);
  console.log(`  Failed:       ${summary.failed} (${percentage(summary.failed, summary.total)}%)`);
  console.log(`  Skipped:      ${summary.skipped} (${percentage(summary.skipped, summary.total)}%)`);
  console.log(`  Conformance:  ${report.conformance === "PASS" ? "✅ PASS" : "❌ FAIL"}`);
  console.log();

  // Test Results by Category
  console.log("RESULTS BY CATEGORY");
  console.log("─────────────────────────────────────────────────────────────");
  const categories = [...new Set(tests.map((t: any) => t.category))];

  for (const category of categories) {
    const categoryTests = tests.filter((t: any) => t.category === category);
    const categoryPassed = categoryTests.filter((t: any) => t.status === "PASS").length;
    const categoryFailed = categoryTests.filter((t: any) => t.status === "FAIL").length;

    const status = categoryFailed === 0 ? "✓" : "✗";
    console.log(`  ${status} ${category.padEnd(20)} ${categoryPassed}/${categoryTests.length}`);

    if (categoryFailed > 0) {
      categoryTests
        .filter((t: any) => t.status === "FAIL")
        .forEach((t: any) => {
          console.log(`      - ${t.name}: ${t.error || "Assertion failed"}`);
        });
    }
  }
  console.log();

  // Slowest Tests
  const slowest = tests
    .filter((t: any) => t.duration_ms !== undefined)
    .sort((a: any, b: any) => b.duration_ms - a.duration_ms)
    .slice(0, 5);

  if (slowest.length > 0) {
    console.log("SLOWEST TESTS");
    console.log("─────────────────────────────────────────────────────────────");
    slowest.forEach((t: any) => {
      console.log(`  ${t.name.padEnd(35)} ${t.duration_ms.toFixed(2)}ms`);
    });
    console.log();
  }

  // Timestamp
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Generated: ${summary.timestamp}`);
}

/**
 * Calculate percentage
 */
function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Compare two reports for regression
 */
function compareReports(current: any, previous: any): void {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        Regression Analysis Report                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  console.log("COMPARISON");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Current:  ${current.artifact.version} (${current.summary.timestamp})`);
  console.log(`  Previous: ${previous.artifact.version} (${previous.summary.timestamp})`);
  console.log();

  // Summary Changes
  console.log("CHANGES");
  console.log("─────────────────────────────────────────────────────────────");
  const passedDelta = current.summary.passed - previous.summary.passed;
  const failedDelta = current.summary.failed - previous.summary.failed;

  console.log(`  Passed:  ${current.summary.passed} (${passedDelta > 0 ? "+" : ""}${passedDelta})`);
  console.log(`  Failed:  ${current.summary.failed} (${failedDelta > 0 ? "+" : ""}${failedDelta})`);
  console.log();

  // Test Status Changes
  const changes = [];
  for (const currentTest of current.tests) {
    const previousTest = previous.tests.find((t: any) => t.name === currentTest.name);
    if (previousTest && previousTest.status !== currentTest.status) {
      changes.push({
        name: currentTest.name,
        from: previousTest.status,
        to: currentTest.status,
      });
    }
  }

  if (changes.length === 0) {
    console.log("  ✓ No test status changes detected");
  } else {
    console.log(`  ⚠ ${changes.length} test status changes:`);
    changes.forEach((c) => {
      console.log(`    - ${c.name}: ${c.from} → ${c.to}`);
    });
  }
  console.log();
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const shouldCompare = args.includes("--compare");

  const latest = loadLatestReport();
  console.log(`Loading: ${latest.path}`);
  console.log();

  formatReport(latest.data);

  if (shouldCompare) {
    console.log();
    console.log("═════════════════════════════════════════════════════════════");
    console.log();

    // Find previous report
    const reportsDir = "reports";
    const files = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith(".json") && f.startsWith("validity-"))
      .sort()
      .reverse();

    if (files.length < 2) {
      console.log("⚠ No previous report found for comparison");
    } else {
      const previousPath = path.join(reportsDir, files[1]);
      const previous = JSON.parse(fs.readFileSync(previousPath, "utf-8"));
      compareReports(latest.data, previous);
    }
  }
}

main();
