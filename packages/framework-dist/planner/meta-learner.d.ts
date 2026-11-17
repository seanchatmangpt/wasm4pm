import type { MetaCase } from './receipt-reader.js';
export interface MetaRecommendation {
    algorithm: string;
    score: number;
    estimatedMs: number;
    corpusMs: number;
    explanation: string;
}
export declare function recommendAlgorithm(eventCount: number, cases: MetaCase[], n?: number): MetaRecommendation[];
//# sourceMappingURL=meta-learner.d.ts.map