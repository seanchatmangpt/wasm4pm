/**
 * Algorithm determinism test harness.
 *
 * Verifies that an algorithm produces bit-exact identical output given:
 * - Same event log (binary identical)
 * - Same parameters
 * - Multiple runs (N >= 3, default 5)
 *
 * Rank-1 oracle (verification.md): Mathematical theorem that deterministic
 * algorithms must satisfy this contract. If violated, the algorithm uses:
 * - Non-deterministic data structures (HashMap iteration, thread_rng)
 * - Unseeded RNG (fastrand without seed)
 * - Floating-point accumulation (sensitive to evaluation order)
 *
 * Usage:
 *
 * ```typescript
 * import { checkAlgorithmDeterminism } from '@wasm4pm/testing';
 *
 * const result = await checkAlgorithmDeterminism(
 *   { algorithmName: 'dfg', parameters: { activity_key: 'concept:name' } },
 *   5, // iterations
 *   (log, params) => kernel.run('dfg', handle, params).then(r => r.output_hash),
 * );
 *
 * if (!result.passed) {
 *   console.error(result.details);
 * }
 * ```
 */

import { hashData } from '@wasm4pm/contracts';

export interface AlgorithmDeterminismTest {
  /** Display name of the algorithm (e.g., "dfg", "genetic_algorithm") */
  algorithmName: string;

  /** Algorithm parameters as key-value pairs */
  parameters: Record<string, unknown>;

  /** Binary or text representation of the test event log */
  eventLog: Uint8Array | string;

  /** Whether this algorithm is expected to be deterministic */
  expectedDeterministic?: boolean;
}

export interface DeterminismTestResult {
  /** True if all hashes match (assuming expectedDeterministic=true) */
  passed: boolean;

  /** Name of the algorithm tested */
  algorithmName: string;

  /** Number of iterations run */
  iterations: number;

  /** All output hashes from each run */
  hashes: string[];

  /** Set of unique hashes across all runs */
  uniqueHashes: Set<string>;

  /** List of violations (empty if passed=true) */
  violations: string[];

  /** Human-readable details */
  details: string;
}

/**
 * Run an algorithm N times and verify output hash stability.
 *
 * The `algorithmRunner` is responsible for:
 * 1. Executing the algorithm with given parameters on the test log
 * 2. Computing a BLAKE3 hash of the output (DFG, result object, etc.)
 * 3. Returning the hash as a hex string
 *
 * @param test Test specification (algorithm name, params, log)
 * @param iterations Number of runs (default 5, min 2)
 * @param algorithmRunner Async function that executes the algorithm and returns output hash
 * @returns Test result with pass/fail and detected violations
 *
 * @throws Error if iterations < 2
 *
 * @example
 * ```typescript
 * const result = await checkAlgorithmDeterminism(
 *   {
 *     algorithmName: 'dfg',
 *     parameters: { activity_key: 'concept:name' },
 *     eventLog: xesContent,
 *   },
 *   5,
 *   async (log, params) => {
 *     const result = await kernel.run('dfg', logHandle, params);
 *     return hashData(result);
 *   },
 * );
 *
 * expect(result.passed).toBe(true);
 * ```
 */
export async function checkAlgorithmDeterminism(
  test: AlgorithmDeterminismTest,
  iterations: number = 5,
  algorithmRunner: (log: Uint8Array | string, params: Record<string, unknown>) => Promise<string>,
): Promise<DeterminismTestResult> {
  if (iterations < 2) {
    throw new Error('iterations must be >= 2');
  }

  const hashes: string[] = [];
  const violations: string[] = [];

  // Run the algorithm N times
  for (let i = 0; i < iterations; i++) {
    try {
      const hash = await algorithmRunner(test.eventLog, test.parameters);
      hashes.push(hash);
    } catch (err) {
      violations.push(`Run ${i + 1} failed: ${err}`);
      hashes.push('ERROR');
    }
  }

  // Analyze results
  const uniqueHashes = new Set(hashes.filter((h) => h !== 'ERROR'));
  const hasErrors = hashes.includes('ERROR');
  const expectedDeterministic = test.expectedDeterministic !== false;
  const passed = !hasErrors && uniqueHashes.size === 1 && expectedDeterministic;

  // Populate violations
  if (hasErrors) {
    violations.push(`Algorithm execution failed in ${hashes.filter((h) => h === 'ERROR').length} run(s)`);
  }

  if (!passed && expectedDeterministic && !hasErrors) {
    violations.push(
      `Expected deterministic output but got ${uniqueHashes.size} unique hashes across ${iterations} runs`,
    );
    violations.push(`Algorithm: ${test.algorithmName}`);
    violations.push(`Parameters: ${JSON.stringify(test.parameters)}`);
    violations.push(`Hashes:\n${hashes.map((h, i) => `  Run ${i + 1}: ${h.slice(0, 12)}...`).join('\n')}`);
    violations.push(
      `\nRoot cause candidates:\n` +
        `  1. HashMap iteration (non-deterministic ordering)\n` +
        `  2. Unseeded RNG (fastrand without seed control)\n` +
        `  3. Floating-point accumulation (order-dependent)\n` +
        `  4. Thread-local random state\n` +
        `  5. Wall-clock time dependency`,
    );
    violations.push(
      `\nFix: Run algorithm with same parameters twice; output must match exactly.` +
        ` If different, instrument code to detect which field varies.`,
    );
  }

  // Build details string
  let details: string;
  if (passed) {
    details =
      `✅ Determinism verified: ${iterations} identical hashes\n` +
      `  Algorithm: ${test.algorithmName}\n` +
      `  Hash: ${hashes[0]?.slice(0, 12)}...\n` +
      `  Stable output confirmed — meets Rank-1 oracle requirement (verification.md)`;
  } else if (hasErrors) {
    details =
      `❌ Algorithm execution failed\n` +
      `  Algorithm: ${test.algorithmName}\n` +
      `  Violations:\n${violations.map((v) => `    - ${v}`).join('\n')}`;
  } else {
    details =
      `❌ Non-deterministic output detected\n` +
      `  Algorithm: ${test.algorithmName}\n` +
      `  Unique hashes: ${uniqueHashes.size} from ${iterations} runs\n` +
      `  Violations:\n${violations.map((v) => `    - ${v}`).join('\n')}`;
  }

  return {
    passed,
    algorithmName: test.algorithmName,
    iterations,
    hashes,
    uniqueHashes,
    violations,
    details,
  };
}

/**
 * Batch test multiple algorithms for determinism.
 *
 * Runs all tests concurrently and collects results.
 *
 * @param tests Array of test specifications
 * @param iterations Number of runs per algorithm (default 5)
 * @param algorithmRunner Function to execute any algorithm (takes algo name as first param)
 * @returns Array of test results, one per test
 *
 * @example
 * ```typescript
 * const tests: AlgorithmDeterminismTest[] = [
 *   { algorithmName: 'dfg', parameters: {...}, eventLog: log },
 *   { algorithmName: 'genetic_algorithm', parameters: {...}, eventLog: log },
 * ];
 *
 * const results = await checkAlgorithmBatchDeterminism(
 *   tests,
 *   5,
 *   async (algo, log, params) => {
 *     const result = await kernel.run(algo, handle, params);
 *     return blake3(JSON.stringify(result)).toString();
 *   },
 * );
 *
 * const failures = results.filter(r => !r.passed);
 * if (failures.length > 0) {
 *   console.error(`${failures.length}/${results.length} algorithms non-deterministic`);
 *   for (const f of failures) console.error(f.details);
 * }
 * ```
 */
export async function checkAlgorithmBatchDeterminism(
  tests: AlgorithmDeterminismTest[],
  iterations: number = 5,
  algorithmRunner: (
    algo: string,
    log: Uint8Array | string,
    params: Record<string, unknown>,
  ) => Promise<string>,
): Promise<DeterminismTestResult[]> {
  return Promise.all(
    tests.map((test) =>
      checkAlgorithmDeterminism(test, iterations, (log, params) =>
        algorithmRunner(test.algorithmName, log, params),
      ),
    ),
  );
}

/**
 * Summary report for batch determinism test results.
 *
 * @param results Array of test results from checkAlgorithmBatchDeterminism()
 * @returns Markdown-formatted summary report
 *
 * @example
 * ```typescript
 * const results = await checkAlgorithmBatchDeterminism(...);
 * const report = summarizeDeterminismResults(results);
 * console.log(report);
 * ```
 */
export function summarizeDeterminismResults(results: DeterminismTestResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const table = results
    .map(
      (r) =>
        `| ${r.algorithmName.padEnd(20)} | ${r.passed ? '✅ PASS' : '❌ FAIL'} | ${r.uniqueHashes.size} | ${r.iterations} |`,
    )
    .join('\n');

  return (
    `# Algorithm Determinism Summary\n\n` +
    `**Results:** ${passed}/${results.length} passed\n\n` +
    `| Algorithm | Status | Unique Hashes | Iterations |\n` +
    `|-----------|--------|---------------|------------|\n` +
    table +
    `\n\n` +
    (failed === 0
      ? `✅ All algorithms are deterministic.\n\n` +
        `Rank-1 oracle satisfied: identical input → identical output (BLAKE3 hash verified).`
      : `❌ ${failed} algorithm(s) non-deterministic:\n\n` +
        results
          .filter((r) => !r.passed)
          .map((r) => `### ${r.algorithmName}\n\n\`\`\`\n${r.details}\n\`\`\``)
          .join('\n\n'))
  );
}
