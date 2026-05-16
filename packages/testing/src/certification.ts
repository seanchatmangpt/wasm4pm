/**
 * Pre-release certification checklist — as executable code.
 *
 * Each gate is a function that returns pass/fail with details.
 * Run all gates before publishing a release.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GateResult {
  gate: string;
  passed: boolean;
  details: string;
  duration_ms: number;
  timing?: {
    median_ms: number;
    p95_ms: number;
    peak_memory_mb?: number;
  };
}

export interface CertificationReport {
  timestamp: string;
  version: string;
  gates: GateResult[];
  passed: boolean;
  summary: string;
  evidence?: {
    corpus_hash: string;
    generator_seed?: number;
    feature_flags: string[];
    wasm_build_profile: string;
    run_environment: {
      node_version: string;
      platform: string;
      arch: string;
    };
  };
}

export type GateFunction = () => Promise<GateResult> | GateResult;

const registeredGates: Map<string, GateFunction> = new Map();

/**
 * Register a certification gate.
 * @internal
 */
export function registerGate(name: string, fn: GateFunction): void {
  registeredGates.set(name, fn);
}

/**
 * Run all registered certification gates.
 *
 * The returned report always includes an `evidence` envelope so a practitioner
 * can reproduce any certification run exactly: same version, same node version,
 * same platform, same feature flags, same wasm profile.
 */
export async function runCertification(
  version: string,
  options?: { fast?: boolean; wasmBuildProfile?: string; featureFlags?: string[] }
): Promise<CertificationReport> {
  const gates: GateResult[] = [];

  for (const [name, fn] of registeredGates) {
    if (options?.fast && name === 'performance:benchmarks') {
      gates.push({
        gate: name,
        passed: true,
        details: 'Skipped (--fast mode)',
        duration_ms: 0,
      });
      continue;
    }

    const start = Date.now();
    try {
      const result = await fn();
      result.duration_ms = Date.now() - start;
      gates.push(result);
    } catch (err) {
      gates.push({
        gate: name,
        passed: false,
        details: `Gate threw: ${err instanceof Error ? err.message : String(err)}`,
        duration_ms: Date.now() - start,
      });
    }
  }

  const passed = gates.every((g) => g.passed);
  const passCount = gates.filter((g) => g.passed).length;
  const summary = `${passCount}/${gates.length} gates passed`;

  // Compute a stable corpus hash from the gate names so a later run can
  // detect if the gate set has changed (gate added/removed = different corpus).
  const gateNames = [...registeredGates.keys()].sort();
  const corpusHash = gateNames
    .join('|')
    .split('')
    .reduce((acc, c) => (Math.imul(31, acc) + c.charCodeAt(0)) | 0, 0)
    .toString(16)
    .padStart(8, '0');

  return {
    timestamp: new Date().toISOString(),
    version,
    gates,
    passed,
    summary,
    evidence: {
      corpus_hash: corpusHash,
      feature_flags: options?.featureFlags ?? [],
      wasm_build_profile: options?.wasmBuildProfile ?? 'browser',
      run_environment: {
        node_version: typeof process !== 'undefined' ? process.version : 'unknown',
        platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        arch: typeof process !== 'undefined' ? process.arch : 'unknown',
      },
    },
  };
}

/**
 * Clear all registered gates (for testing the certification system itself).
 * @internal
 */
export function clearGates(): void {
  registeredGates.clear();
}

/**
 * Get list of registered gate names.
 * @internal
 */
export function getRegisteredGates(): string[] {
  return [...registeredGates.keys()];
}

// ─── Built-in Gates ───────────────────────────────────────────────

registerGate('contracts:schemas', async () => {
  try {
    const kernel = (await import(/* @vite-ignore */ '@wasm4pm/kernel' as string)) as {
      getRegistry: () => { getAllAlgorithms: () => Record<string, any>[] };
    };
    const registry = kernel.getRegistry();
    const algos = registry.getAllAlgorithms();
    const missing = algos.filter((a) => !a.id || !a.name || a.speedScore === undefined || a.qualityScore === undefined);
    const passed = missing.length === 0;
    return {
      gate: 'contracts:schemas',
      passed,
      details: passed
        ? `All ${algos.length} algorithms have required metadata fields`
        : `${missing.length} algorithms missing metadata (id, name, speedScore, qualityScore)`,
      duration_ms: 0,
    };
  } catch (err) {
    return {
      gate: 'contracts:schemas',
      passed: false,
      details: `Failed to load @wasm4pm/kernel: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('parity:explain-run', async () => {
  try {
    const testing = (await import(/* @vite-ignore */ '@wasm4pm/testing' as string)) as {
      checkParityBatch: (algos: string[], seed?: number) => Promise<{ passed: boolean; failed: string[] }>;
    };
    const result = await testing.checkParityBatch(['dfg', 'heuristic_miner', 'genetic_algorithm'], 42);
    return {
      gate: 'parity:explain-run',
      passed: result.passed,
      details: result.passed
        ? 'explain() output matches plan() output for dfg, heuristic_miner, genetic_algorithm'
        : `Parity failures: ${result.failed.join(', ')}`,
      duration_ms: 0,
    };
  } catch (err) {
    return {
      gate: 'parity:explain-run',
      passed: false,
      details: `Failed to check parity: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('observability:otel-optional', async () => {
  try {
    const observability = (await import(/* @vite-ignore */ '@wasm4pm/observability' as string)) as {
      Instrumentation: {
        createAlgorithmStartedEvent?: (config: unknown) => unknown;
        createAlgorithmCompletedEvent?: (config: unknown) => unknown;
        createErrorEvent?: (code: unknown, message: unknown) => unknown;
      };
    };
    const instr = observability.Instrumentation;
    const hasFuncs =
      typeof instr.createAlgorithmStartedEvent === 'function' &&
      typeof instr.createAlgorithmCompletedEvent === 'function' &&
      typeof instr.createErrorEvent === 'function';
    return {
      gate: 'observability:otel-optional',
      passed: hasFuncs,
      details: hasFuncs ? 'OTEL instrumentation functions available' : 'Missing OTEL instrumentation functions',
      duration_ms: 0,
    };
  } catch (err) {
    return {
      gate: 'observability:otel-optional',
      passed: false,
      details: `Failed to load @wasm4pm/observability: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('security:redaction', async () => {
  try {
    const config = (await import(/* @vite-ignore */ '@wasm4pm/config' as string)) as {
      resolveConfig: (opts?: unknown) => Record<string, unknown>;
    };
    process.env.WASM4PM_API_KEY = 'secret-test-key-12345';
    const cfg = config.resolveConfig({ algorithm: 'dfg' });
    const cfgJson = JSON.stringify(cfg);
    const hasSecret = cfgJson.includes('secret-test-key-12345');
    delete process.env.WASM4PM_API_KEY;
    return {
      gate: 'security:redaction',
      passed: !hasSecret,
      details: hasSecret ? 'Secret found in config JSON (NOT redacted)' : 'Secrets properly redacted from output',
      duration_ms: 0,
    };
  } catch (err) {
    delete process.env.WASM4PM_API_KEY;
    return {
      gate: 'security:redaction',
      passed: false,
      details: `Failed to check redaction: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('watch:reconnect', async () => {
  try {
    const testing = (await import(/* @vite-ignore */ '@wasm4pm/testing/harness/cli' as string)) as {
      runCli: (args: string[], opts?: unknown) => Promise<{ exitCode: number; stderr: string }>;
    };
    const result = await testing.runCli(['watch', '--format', 'json'], { timeout: 500 });
    // wpm watch should keep running (timeout exit, not an immediate clean exit with 0).
    // A non-zero exit without an error message = timed out = started correctly.
    // exitCode 0 in under 500ms = exited immediately = not running = fail.
    const startedCleanly = result.exitCode !== 0 && !result.stderr.includes('Error');
    return {
      gate: 'watch:reconnect',
      passed: startedCleanly,
      details: startedCleanly
        ? 'watch command started successfully (timed out as expected, no errors)'
        : `watch command did not start correctly: exitCode=${result.exitCode} stderr=${result.stderr.slice(0, 100)}`,
      duration_ms: 0,
    };
  } catch (err) {
    return {
      gate: 'watch:reconnect',
      passed: false,
      details: `Failed to run watch command: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('cli:exit-codes', async () => {
  try {
    const testing = (await import(/* @vite-ignore */ '@wasm4pm/testing/harness/cli' as string)) as {
      runCli: (args: string[], opts?: unknown) => Promise<{ exitCode: number }>;
    };
    const result = await testing.runCli(['run', '/nonexistent/path.xes']);
    const isSourceError = result.exitCode === 2;
    return {
      gate: 'cli:exit-codes',
      passed: isSourceError,
      details: isSourceError
        ? 'Correct exit code (2) for SOURCE_ERROR on missing file'
        : `Wrong exit code: ${result.exitCode} (expected 2 for SOURCE_ERROR)`,
      duration_ms: 0,
    };
  } catch (err) {
    return {
      gate: 'cli:exit-codes',
      passed: false,
      details: `Failed to verify exit codes: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('config:resolution', async () => {
  try {
    const config = (await import(/* @vite-ignore */ '@wasm4pm/config' as string)) as {
      resolveConfig: (opts?: unknown) => { algorithm: { name: string }; metadata: { provenance: Record<string, unknown> } };
    };
    process.env.WASM4PM_ALGORITHM = 'heuristic_miner';
    const cfg = config.resolveConfig({ algorithm: 'dfg' });
    const algoProvenance = cfg.metadata.provenance['algorithm'] as Record<string, unknown> | undefined;
    const isCorrect = cfg.algorithm.name === 'dfg' && algoProvenance?.['source'] === 'CLI';
    delete process.env.WASM4PM_ALGORITHM;
    return {
      gate: 'config:resolution',
      passed: isCorrect,
      details: isCorrect
        ? 'CLI argument overrides ENV var; provenance correctly tracks source'
        : `Config precedence failed: algorithm=${cfg.algorithm.name}, provenance=${JSON.stringify(cfg.metadata.provenance)}`,
      duration_ms: 0,
    };
  } catch (err) {
    delete process.env.WASM4PM_ALGORITHM;
    return {
      gate: 'config:resolution',
      passed: false,
      details: `Failed to check config resolution: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }
});

registerGate('performance:benchmarks', async () => {
  // Locate BPI 2020 fixture relative to workspace root
  const fixturePaths = [
    path.resolve(process.cwd(), 'wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
    path.resolve(process.cwd(), 'tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
    path.resolve(process.cwd(), '..', 'wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
  ];

  const fixturePath = fixturePaths.find((p) => {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  });

  if (!fixturePath) {
    return {
      gate: 'performance:benchmarks',
      passed: false,
      details: 'BPI 2020 fixture not found — run from workspace root. Cannot verify performance thresholds.',
      duration_ms: 0,
    };
  }

  // Load WASM module via dynamic import to avoid hard dependency on @wasm4pm/engine
  let wasm: Record<string, any>;
  try {
    // Dynamic import is intentionally used — @wasm4pm/engine is not a declared dependency
    // so this gracefully degrades when the module is unavailable (e.g. in CI or when only
    // @wasm4pm/testing is installed without the full monorepo).
    const engine = (await import(/* @vite-ignore */ '@wasm4pm/engine' as string)) as {
      WasmLoader: {
        getInstance: () => { init: () => Promise<void>; get: () => Record<string, any> };
      };
    };
    const loader = engine.WasmLoader.getInstance();
    await loader.init();
    wasm = loader.get();
  } catch (err) {
    return {
      gate: 'performance:benchmarks',
      passed: false,
      details: `WASM module failed to load: ${err instanceof Error ? err.message : String(err)}. Cannot benchmark.`,
      duration_ms: 0,
    };
  }

  // Load the event log
  const xesContent = fs.readFileSync(fixturePath, 'utf-8');
  const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

  // Run DFG discovery and measure
  const t0 = performance.now();
  wasm.discover_dfg(logHandle, 'concept:name');
  const elapsed = performance.now() - t0;

  // Free handle
  wasm.delete_object(logHandle);

  const BPI2020_EVENTS = 86581;
  const eventsPerSec = Math.round(BPI2020_EVENTS / (elapsed / 1000));
  const passed = eventsPerSec >= 100_000 && elapsed < 5000;

  return {
    gate: 'performance:benchmarks',
    passed,
    details: `DFG on BPI 2020 (${BPI2020_EVENTS.toLocaleString()} events): ${elapsed.toFixed(1)}ms, ${eventsPerSec.toLocaleString()} events/sec`,
    duration_ms: Math.round(elapsed),
  };
});

/**
 * Create a gate that checks a condition.
 * @internal
 */
export function createGate(
  name: string,
  check: () => Promise<boolean> | boolean,
  details?: string
): void {
  registerGate(name, async () => {
    const passed = await check();
    return {
      gate: name,
      passed,
      details: passed ? (details ?? `${name} passed`) : `${name} failed`,
      duration_ms: 0,
    };
  });
}

/**
 * Print certification report to console.
 * @internal
 */
export function formatReport(report: CertificationReport): string {
  const lines: string[] = [
    `Certification Report -- v${report.version}`,
    `Timestamp: ${report.timestamp}`,
    `Status: ${report.passed ? 'PASSED' : 'FAILED'}`,
    '',
    'Gates:',
  ];

  for (const gate of report.gates) {
    const icon = gate.passed ? '[PASS]' : '[FAIL]';
    lines.push(`  ${icon} ${gate.gate} (${gate.duration_ms}ms) -- ${gate.details}`);
  }

  lines.push('', report.summary);
  return lines.join('\n');
}
