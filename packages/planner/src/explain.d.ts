/**
 * Execution plan explanation in human-readable markdown format
 *
 * Per PRD §11: explain() == run()
 * The explanation is generated from the same plan used for execution
 */
import type { Config } from './planner.js';
/**
 * Generates a human-readable markdown explanation of an execution plan
 *
 * The explanation includes:
 * - Plan metadata (ID, hash, profile)
 * - Configuration summary
 * - Execution steps in order
 * - Dependency graph visualization
 * - Resource estimates
 *
 * @param config - Configuration to explain
 * @returns Markdown string describing the plan
 */
export declare function explain(config: Config): string;
/**
 * Generates a summary explanation (shorter version)
 * Useful for logging or quick reference
 *
 * @param config - Configuration to summarize
 * @returns Short markdown summary
 */
export declare function explainBrief(config: Config): string;
/**
 * Export functions
 */
export default explain;
//# sourceMappingURL=explain.d.ts.map