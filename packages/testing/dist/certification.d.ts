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
}
export interface CertificationReport {
    timestamp: string;
    version: string;
    gates: GateResult[];
    passed: boolean;
    summary: string;
}
export type GateFunction = () => Promise<GateResult> | GateResult;
/**
 * Register a certification gate.
 */
export declare function registerGate(name: string, fn: GateFunction): void;
/**
 * Run all registered certification gates.
 */
export declare function runCertification(version: string): Promise<CertificationReport>;
/**
 * Clear all registered gates (for testing the certification system itself).
 */
export declare function clearGates(): void;
/**
 * Get list of registered gate names.
 */
export declare function getRegisteredGates(): string[];
/**
 * Create a gate that checks a condition.
 */
export declare function createGate(name: string, check: () => Promise<boolean> | boolean, details?: string): void;
/**
 * Print certification report to console.
 */
export declare function formatReport(report: CertificationReport): string;
//# sourceMappingURL=certification.d.ts.map