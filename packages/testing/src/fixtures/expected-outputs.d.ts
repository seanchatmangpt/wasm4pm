/**
 * Expected outputs for parity and determinism testing.
 */
export interface ExpectedReceipt {
    status: 'success' | 'partial' | 'failed';
    hasRunId: boolean;
    hasConfigHash: boolean;
    hasInputHash: boolean;
    hasPlanHash: boolean;
    hasDuration: boolean;
}
export interface ExpectedExplainOutput {
    containsSteps: boolean;
    containsAlgorithm: boolean;
    containsProfile: boolean;
    containsSource: boolean;
    stepCount: number;
}
/** Expected receipt shape for a successful run */
export declare const SUCCESS_RECEIPT: ExpectedReceipt;
/** Expected receipt shape for a partial failure */
export declare const PARTIAL_RECEIPT: ExpectedReceipt;
/** Expected receipt shape for a failed run */
export declare const FAILED_RECEIPT: ExpectedReceipt;
/** Validate a receipt object matches expected shape */
export declare function validateReceiptShape(receipt: Record<string, unknown>, expected: ExpectedReceipt): string[];
/** Validate explain output contains expected structure */
export declare function validateExplainOutput(output: string, expected: ExpectedExplainOutput): string[];
//# sourceMappingURL=expected-outputs.d.ts.map