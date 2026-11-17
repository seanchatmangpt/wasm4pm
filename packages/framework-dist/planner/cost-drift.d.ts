export interface CostDriftSignal {
    algorithm: string;
    sampleCount: number;
    predictedMeanMs: number;
    actualMeanMs: number;
    ewmaRatio: number;
    trend: 'stable' | 'degrading' | 'improving';
    isAlert: boolean;
}
export declare function checkCostModelDrift(receiptsDir: string, algorithm: string, alpha?: number, driftThreshold?: number): CostDriftSignal | undefined;
//# sourceMappingURL=cost-drift.d.ts.map