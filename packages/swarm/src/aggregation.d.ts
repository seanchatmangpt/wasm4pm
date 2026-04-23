/**
 * aggregation.ts
 *
 * Merges algorithm results across workers.
 * Strategies: union, intersection, majority_vote, weighted_avg.
 */
import type { WorkerResult } from './types.js';
export type AggregationStrategy = 'union' | 'intersection' | 'majority_vote' | 'weighted_avg' | 'ml_ensemble';
export interface AggregateResult {
    algorithm: string;
    strategy: AggregationStrategy;
    workersIncluded: number;
    aggregate: unknown;
    aggregateHash: string;
    consensusRatio: number;
}
export declare function aggregate(results: WorkerResult[], algorithm: string, strategy?: AggregationStrategy, workerIds?: string[]): AggregateResult;
//# sourceMappingURL=aggregation.d.ts.map