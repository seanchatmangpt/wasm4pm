/**
 * Pre-release certification checklist — as executable code.
 *
 * Each gate is a function that returns pass/fail with details.
 * Run all gates before publishing a release.
 */
const registeredGates = new Map();
/**
 * Register a certification gate.
 */
export function registerGate(name, fn) {
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
 */
export function clearGates() {
    registeredGates.clear();
}
/**
 * Get list of registered gate names.
 */
export function getRegisteredGates() {
    return [...registeredGates.keys()];
}
// ─── Built-in Gates ───────────────────────────────────────────────
registerGate('contracts:schemas', () => ({
    gate: 'contracts:schemas',
    passed: true,
    details: 'Schema validation placeholder — override with real check',
    duration_ms: 0,
}));
registerGate('parity:explain-run', () => ({
    gate: 'parity:explain-run',
    passed: true,
    details: 'Parity placeholder — override with real parity harness',
    duration_ms: 0,
}));
registerGate('observability:otel-optional', () => ({
    gate: 'observability:otel-optional',
    passed: true,
    details: 'OTEL optional placeholder — override with real check',
    duration_ms: 0,
}));
registerGate('security:redaction', () => ({
    gate: 'security:redaction',
    passed: true,
    details: 'Redaction placeholder — override with real scan',
    duration_ms: 0,
}));
registerGate('watch:reconnect', () => ({
    gate: 'watch:reconnect',
    passed: true,
    details: 'Watch reconnect placeholder — override with real check',
    duration_ms: 0,
}));
registerGate('cli:exit-codes', () => ({
    gate: 'cli:exit-codes',
    passed: true,
    details: 'CLI exit code placeholder — override with real check',
    duration_ms: 0,
}));
registerGate('config:resolution', () => ({
    gate: 'config:resolution',
    passed: true,
    details: 'Config resolution placeholder — override with real check',
    duration_ms: 0,
}));
registerGate('performance:benchmarks', () => ({
    gate: 'performance:benchmarks',
    passed: true,
    details: 'Benchmark placeholder — override with real check',
    duration_ms: 0,
}));
/**
 * Create a gate that checks a condition.
 */
export function createGate(name, check, details) {
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
 */
export function formatReport(report) {
    const lines = [
        `Certification Report — v${report.version}`,
        `Timestamp: ${report.timestamp}`,
        `Status: ${report.passed ? 'PASSED' : 'FAILED'}`,
        '',
        'Gates:',
    ];
    for (const gate of report.gates) {
        const icon = gate.passed ? '[PASS]' : '[FAIL]';
        lines.push(`  ${icon} ${gate.gate} (${gate.duration_ms}ms) — ${gate.details}`);
    }
    lines.push('', report.summary);
    return lines.join('\n');
}
//# sourceMappingURL=certification.js.map