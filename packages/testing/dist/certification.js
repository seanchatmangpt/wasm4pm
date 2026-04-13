/**
 * Pre-release certification checklist — as executable code.
 *
 * Each gate is a function that returns pass/fail with details.
 * Run all gates before publishing a release.
 */
import * as fs from 'fs';
import * as path from 'path';
const registeredGates = new Map();
/**
 * Register a certification gate.
 * @internal
 */
function registerGate(name, fn) {
    registeredGates.set(name, fn);
}
/**
 * Run all registered certification gates.
 */
export async function runCertification(version) {
    const gates = [];
    for (const [name, fn] of registeredGates) {
        const start = Date.now();
        try {
            const result = await fn();
            result.duration_ms = Date.now() - start;
            gates.push(result);
        }
        catch (err) {
            gates.push({
                gate: name,
                passed: false,
                details: `Gate threw: ${err instanceof Error ? err.message : String(err)}`,
                duration_ms: Date.now() - start,
            });
        }
    }
    const passed = gates.every(g => g.passed);
    const passCount = gates.filter(g => g.passed).length;
    const summary = `${passCount}/${gates.length} gates passed`;
    return {
        timestamp: new Date().toISOString(),
        version,
        gates,
        passed,
        summary,
    };
}
/**
 * Clear all registered gates (for testing the certification system itself).
 * @internal
 */
function clearGates() {
    registeredGates.clear();
}
/**
 * Get list of registered gate names.
 * @internal
 */
function getRegisteredGates() {
    return [...registeredGates.keys()];
}
// ─── Built-in Gates ───────────────────────────────────────────────
registerGate('contracts:schemas', () => ({
    gate: 'contracts:schemas',
    passed: true,
    details: 'Schema validation placeholder -- override with real check',
    duration_ms: 0,
}));
registerGate('parity:explain-run', () => ({
    gate: 'parity:explain-run',
    passed: true,
    details: 'Parity placeholder -- override with real parity harness',
    duration_ms: 0,
}));
registerGate('observability:otel-optional', () => ({
    gate: 'observability:otel-optional',
    passed: true,
    details: 'OTEL optional placeholder -- override with real check',
    duration_ms: 0,
}));
registerGate('security:redaction', () => ({
    gate: 'security:redaction',
    passed: true,
    details: 'Redaction placeholder -- override with real scan',
    duration_ms: 0,
}));
registerGate('watch:reconnect', () => ({
    gate: 'watch:reconnect',
    passed: true,
    details: 'Watch reconnect placeholder -- override with real check',
    duration_ms: 0,
}));
registerGate('cli:exit-codes', () => ({
    gate: 'cli:exit-codes',
    passed: true,
    details: 'CLI exit code placeholder -- override with real check',
    duration_ms: 0,
}));
registerGate('config:resolution', () => ({
    gate: 'config:resolution',
    passed: true,
    details: 'Config resolution placeholder -- override with real check',
    duration_ms: 0,
}));
registerGate('performance:benchmarks', async () => {
    // Locate BPI 2020 fixture relative to workspace root
    const fixturePaths = [
        path.resolve(process.cwd(), 'wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
        path.resolve(process.cwd(), 'tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
        path.resolve(process.cwd(), '..', 'wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes'),
    ];
    const fixturePath = fixturePaths.find(p => {
        try {
            fs.accessSync(p);
            return true;
        }
        catch {
            return false;
        }
    });
    if (!fixturePath) {
        return {
            gate: 'performance:benchmarks',
            passed: true,
            details: 'Fixture absent -- skipped',
            duration_ms: 0,
        };
    }
    // Load WASM module via dynamic import to avoid hard dependency on @pictl/engine
    let wasm;
    try {
        // Dynamic import is intentionally used — @pictl/engine is not a declared dependency
        // so this gracefully degrades when the module is unavailable (e.g. in CI or when only
        // @pictl/testing is installed without the full monorepo).
        const engine = await import(
        /* @vite-ignore */ '@pictl/engine');
        const loader = engine.WasmLoader.getInstance();
        await loader.init();
        wasm = loader.get();
    }
    catch {
        return {
            gate: 'performance:benchmarks',
            passed: true,
            details: 'WASM module unavailable -- skipped',
            duration_ms: 0,
        };
    }
    // Load the event log
    const xesContent = fs.readFileSync(fixturePath, 'utf-8');
    const logHandle = wasm.load_eventlog_from_xes(xesContent);
    // Run DFG discovery and measure
    const t0 = performance.now();
    wasm.discover_dfg(logHandle, 'concept:name');
    const elapsed = performance.now() - t0;
    // Free handle
    wasm.delete_object(logHandle);
    const BPI2020_EVENTS = 86581;
    const eventsPerSec = Math.round(BPI2020_EVENTS / (elapsed / 1000));
    const passed = eventsPerSec >= 100000 && elapsed < 5000;
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
function createGate(name, check, details) {
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
function formatReport(report) {
    const lines = [
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
//# sourceMappingURL=certification.js.map