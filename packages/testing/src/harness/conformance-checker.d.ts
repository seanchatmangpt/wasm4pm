/**
 * Agent 3: Conformance Checker
 *
 * Validates observed behavior against the discovered model.
 * Traces through OCEL log using the discovered DFG, flags deviations.
 */
import type { OcelEventLog } from './ocel-harvester';
export interface ConformanceViolation {
    traceId: string;
    eventIndex: number;
    activity: string;
    expectedActivities: string[];
    severity: 'low' | 'medium' | 'high';
    description: string;
}
export interface ConformanceResult {
    conformant: boolean;
    fitness: number;
    precision: number;
    violations: ConformanceViolation[];
    totalEvents: number;
    conformingEvents: number;
    violatingEvents: number;
    pathsDivergent: number;
}
export interface DiscoveredModel {
    activities: Set<string>;
    directlyFollows: Map<string, Set<string>>;
    startActivities: Set<string>;
    endActivities: Set<string>;
}
export declare class ConformanceChecker {
    /**
     * Discover a simple DFG-based model from the log
     */
    private discoverModel;
    /**
     * Check conformance of each trace against the discovered model
     */
    checkConformance(ocel: OcelEventLog, model?: DiscoveredModel): Promise<ConformanceResult>;
}
//# sourceMappingURL=conformance-checker.d.ts.map