/**
 * Pre-release certification checklist — as executable code.
 *
 * Each gate is a function that returns pass/fail with details.
 * Run all gates before publishing a release.
 */
interface GateResult {
    gate: string;
    passed: boolean;
    details: string;
    duration_ms: number;
}
interface CertificationReport {
    timestamp: string;
    version: string;
    gates: GateResult[];
    passed: boolean;
    summary: string;
}
/**
 * Run all registered certification gates.
 */
export declare function runCertification(version: string): Promise<CertificationReport>;
export {};
//# sourceMappingURL=certification.d.ts.map