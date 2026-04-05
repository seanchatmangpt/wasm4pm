/**
 * lab/harness.ts - Post-Publication Conformance Validation Harness
 *
 * This harness coordinates validation of the published wasm4pm artifact.
 * It installs the package from npm, tracks artifact metadata, and runs
 * conformance tests that validate claims against observable behavior.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import crypto from "crypto";

/**
 * Artifact metadata captured at installation time
 */
export interface ArtifactMetadata {
  name: string;
  version: string;
  npmUrl: string;
  installPath: string;
  installedAt: string;
  packageHash: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

/**
 * Result of a single conformance test
 */
export interface ConformanceTestResult {
  name: string;
  category: string;
  claim: string;
  status: "PASS" | "FAIL" | "SKIP";
  duration_ms: number;
  timestamp: string;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Complete validity report combining artifact metadata and test results
 */
export interface ValidityReport {
  artifact: ArtifactMetadata;
  tests: ConformanceTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timestamp: string;
  };
  conformance: "PASS" | "FAIL";
}

/**
 * Conformance test definition
 */
export interface ConformanceTest {
  name: string;
  category: string;
  claim: string;
  timeout?: number;
  observable: () => Promise<any>;
  assert: (result: any) => { passed: boolean; details?: Record<string, any> };
}

/**
 * Lab validation harness
 */
export class LabRunner {
  private installDir: string;
  private artifact: ArtifactMetadata | null = null;
  private results: ConformanceTestResult[] = [];
  private version: string;
  private verbose: boolean;

  constructor(options: { version?: string; installDir?: string; verbose?: boolean } = {}) {
    this.version = options.version || "latest";
    this.installDir = options.installDir || path.join(__dirname, ".wasm4pm-test");
    this.verbose = options.verbose || false;
  }

  /**
   * Install the published artifact from npm
   */
  async installArtifact(): Promise<void> {
    this.log("Installing wasm4pm from npm...");

    // Create installation directory
    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }

    try {
      // Install from npm with exact version
      const npmCmd = `npm install --save-exact wasm4pm@${this.version}`;
      this.log(`Executing: ${npmCmd}`);
      execSync(npmCmd, {
        cwd: this.installDir,
        stdio: this.verbose ? "inherit" : "pipe",
      });

      // Capture artifact metadata
      this.artifact = await this.captureMetadata();
      this.log(`✓ Artifact installed: ${this.artifact.version}`);
    } catch (error) {
      throw new Error(`Failed to install wasm4pm from npm: ${error}`);
    }
  }

  /**
   * Capture artifact metadata (version, hash, platform, etc.)
   */
  private async captureMetadata(): Promise<ArtifactMetadata> {
    const packageJsonPath = path.join(this.installDir, "node_modules", "wasm4pm", "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`Package metadata not found at ${packageJsonPath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const version = packageJson.version;

    // Calculate package hash
    const pkgPath = path.join(this.installDir, "node_modules", "wasm4pm");
    const packageHash = this.calculateDirectoryHash(pkgPath);

    return {
      name: "wasm4pm",
      version,
      npmUrl: `https://registry.npmjs.org/wasm4pm/${version}`,
      installPath: pkgPath,
      installedAt: new Date().toISOString(),
      packageHash,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  /**
   * Calculate SHA256 hash of package directory
   */
  private calculateDirectoryHash(dirPath: string): string {
    const hash = crypto.createHash("sha256");
    const files = this.getAllFiles(dirPath).sort();

    for (const file of files) {
      if (path.basename(file) === ".DS_Store") continue;
      const content = fs.readFileSync(file);
      hash.update(content);
    }

    return hash.digest("hex");
  }

  /**
   * Recursively get all files in a directory
   */
  private getAllFiles(dirPath: string): string[] {
    let files: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          files = files.concat(this.getAllFiles(fullPath));
        }
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Run a single conformance test
   */
  async runTest(test: ConformanceTest): Promise<ConformanceTestResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    try {
      const timeout = test.timeout || 30000;
      const result = await this.withTimeout(test.observable(), timeout);
      const assertion = test.assert(result);

      const duration_ms = performance.now() - startTime;

      return {
        name: test.name,
        category: test.category,
        claim: test.claim,
        status: assertion.passed ? "PASS" : "FAIL",
        duration_ms,
        timestamp,
        details: assertion.details,
        error: assertion.passed ? undefined : "Assertion failed",
      };
    } catch (error) {
      const duration_ms = performance.now() - startTime;
      return {
        name: test.name,
        category: test.category,
        claim: test.claim,
        status: "FAIL",
        duration_ms,
        timestamp,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run a set of conformance tests
   */
  async runTests(tests: ConformanceTest[]): Promise<ConformanceTestResult[]> {
    this.log(`Running ${tests.length} conformance tests...`);
    this.results = [];

    for (const test of tests) {
      this.log(`  Testing: ${test.name}...`);
      const result = await this.runTest(test);
      this.results.push(result);

      const icon = result.status === "PASS" ? "✓" : "✗";
      this.log(`  ${icon} ${test.name} (${result.duration_ms.toFixed(2)}ms)`);
    }

    return this.results;
  }

  /**
   * Run tests with a timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Test timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Generate validity report
   */
  generateReport(): ValidityReport {
    if (!this.artifact) {
      throw new Error("No artifact installed. Call installArtifact() first.");
    }

    const passed = this.results.filter((r) => r.status === "PASS").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;
    const skipped = this.results.filter((r) => r.status === "SKIP").length;

    return {
      artifact: this.artifact,
      tests: this.results,
      summary: {
        total: this.results.length,
        passed,
        failed,
        skipped,
        timestamp: new Date().toISOString(),
      },
      conformance: failed === 0 ? "PASS" : "FAIL",
    };
  }

  /**
   * Save report to file
   */
  saveReport(report: ValidityReport, outputDir: string = "reports"): string {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `validity-${timestamp}.json`;
    const filePath = path.join(outputDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    this.log(`✓ Report saved to ${filePath}`);

    return filePath;
  }

  /**
   * Load expected results baseline
   */
  loadBaseline(fixturesDir: string = "fixtures"): any {
    const baselinePath = path.join(fixturesDir, "expected-results.json");

    if (!fs.existsSync(baselinePath)) {
      this.log(`⚠ No baseline found at ${baselinePath}`);
      return null;
    }

    return JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  }

  /**
   * Compare current results against baseline for regression detection
   */
  checkRegression(baseline: any): { hasRegression: boolean; diff: any[] } {
    if (!baseline) {
      return { hasRegression: false, diff: [] };
    }

    const diff: any[] = [];

    // Simple comparison: check if test results match baseline
    for (const test of this.results) {
      const baselineTest = baseline.tests?.find(
        (t: ConformanceTestResult) => t.name === test.name
      );

      if (!baselineTest) {
        diff.push({
          type: "NEW_TEST",
          test: test.name,
          message: "New test not in baseline",
        });
      } else if (baselineTest.status !== test.status) {
        diff.push({
          type: "STATUS_CHANGE",
          test: test.name,
          expected: baselineTest.status,
          actual: test.status,
          message: `Status changed from ${baselineTest.status} to ${test.status}`,
        });
      }
    }

    // Check for removed tests
    for (const baselineTest of baseline.tests || []) {
      if (!this.results.find((t) => t.name === baselineTest.name)) {
        diff.push({
          type: "REMOVED_TEST",
          test: baselineTest.name,
          message: "Test removed from current run",
        });
      }
    }

    return {
      hasRegression: diff.length > 0,
      diff,
    };
  }

  /**
   * Get install directory for loading artifacts
   */
  getInstallDir(): string {
    return this.installDir;
  }

  /**
   * Get artifact metadata (null if not installed)
   */
  getArtifact(): ArtifactMetadata | null {
    return this.artifact;
  }

  /**
   * Get test results
   */
  getResults(): ConformanceTestResult[] {
    return this.results;
  }

  /**
   * Log message (respects verbose flag)
   */
  private log(message: string): void {
    if (this.verbose || message.includes("✓") || message.includes("✗") || message.includes("✗")) {
      console.log(message);
    }
  }

  /**
   * Clean up installation directory
   */
  async cleanup(): Promise<void> {
    if (fs.existsSync(this.installDir)) {
      this.log(`Cleaning up ${this.installDir}...`);
      fs.rmSync(this.installDir, { recursive: true });
    }
  }
}

/**
 * Helper: Create a conformance test
 */
export function createTest(options: {
  name: string;
  category: string;
  claim: string;
  observable: () => Promise<any>;
  assert: (result: any) => { passed: boolean; details?: Record<string, any> };
  timeout?: number;
}): ConformanceTest {
  return {
    name: options.name,
    category: options.category,
    claim: options.claim,
    timeout: options.timeout,
    observable: options.observable,
    assert: options.assert,
  };
}
