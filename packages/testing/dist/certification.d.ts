/**
 * Pre-release certification checklist — as executable code.
 *
 * Each gate is a function that returns pass/fail with details.
 * Run all gates before publishing a release.
 */
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
/**
 * Register a certification gate.
 * @internal
 */
export declare function registerGate(name: string, fn: GateFunction): void;
/**
 * Run all registered certification gates.
 */
export declare function runCertification(version: string, options?: {
    fast?: boolean;
}): Promise<CertificationReport>;
/**
 * Clear all registered gates (for testing the certification system itself).
 * @internal
 */
export declare function clearGates(): void;
/**
 * Get list of registered gate names.
 * @internal
 */
export declare function getRegisteredGates(): string[];
/**
 * Create a gate that checks a condition.
 * @internal
 */
export declare function createGate(name: string, check: () => Promise<boolean> | boolean, details?: string): void;
/**
 * Print certification report to console.
 * @internal
 */
export declare function formatReport(report: CertificationReport): string;
//# sourceMappingURL=certification.d.ts.map