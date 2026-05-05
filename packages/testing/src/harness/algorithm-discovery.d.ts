/**
 * Agent 2: Algorithm Discovery
 *
 * Runs all 15 process discovery algorithms on same event log.
 * Ranks by fitness, precision, simplicity, generalization (van der Aalst metrics).
 */
import type { OcelEventLog } from './ocel-harvester';
export interface AlgorithmResult {
  name: string;
  fitness: number;
  precision: number;
  simplicity: number;
  generalization: number;
  executionTimeMs: number;
  edgeCount: number;
  transitionCount: number;
}
export interface DiscoveryResults {
  algorithms: AlgorithmResult[];
  fastest: AlgorithmResult | null;
  highestQuality: AlgorithmResult | null;
}
export declare class AlgorithmDiscovery {
  discoverWithAllAlgorithms(ocel: OcelEventLog): Promise<DiscoveryResults>;
}
//# sourceMappingURL=algorithm-discovery.d.ts.map
