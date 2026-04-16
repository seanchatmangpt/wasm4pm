/**
 * Plan Schema - DAG representation for execution plans
 * Schema version 1.0
 *
 * A Plan is a directed acyclic graph (DAG) where nodes are processing
 * steps (source, algorithm, sink) and edges define data flow.
 * Deterministic serialization ensures identical plans produce identical hashes.
 */
/**
 * Node types in the execution DAG
 */
export type PlanNodeKind = 'source' | 'algorithm' | 'sink';
/**
 * A single node in the execution plan DAG
 */
export interface PlanNode {
    /** Unique node identifier within this plan */
    id: string;
    /** Node type */
    kind: PlanNodeKind;
    /** Human-readable label */
    label: string;
    /** Configuration specific to this node */
    config: Record<string, unknown>;
    /** Semantic version of the node's implementation */
    version: string;
}
/**
 * A directed edge in the execution plan DAG
 */
export interface PlanEdge {
    /** Source node ID */
    from: string;
    /** Target node ID */
    to: string;
    /** Optional label describing the data flowing on this edge */
    label?: string;
}
/**
 * Execution plan — a DAG of processing steps
 */
export interface Plan {
    /** Schema version for forward compatibility */
    schema_version: '1.0';
    /** Unique plan identifier */
    plan_id: string;
    /** ISO 8601 timestamp of plan creation */
    created_at: string;
    /** Nodes in the DAG, sorted by id for determinism */
    nodes: PlanNode[];
    /** Edges in the DAG, sorted by (from, to) for determinism */
    edges: PlanEdge[];
    /** Plan metadata */
    metadata: {
        /** Name of the planner that generated this plan */
        planner: string;
        /** Planner version */
        planner_version: string;
        /** Estimated execution time in ms (if available) */
        estimated_duration_ms?: number;
    };
}
/**
 * Sort nodes by id for deterministic serialization
 */
export declare function sortNodes(nodes: PlanNode[]): PlanNode[];
/**
 * Sort edges by (from, to) for deterministic serialization
 */
export declare function sortEdges(edges: PlanEdge[]): PlanEdge[];
/**
 * Normalize a plan for deterministic hashing:
 * sorts nodes by id, edges by (from, to), and config keys recursively
 */
export declare function normalizePlan(plan: Plan): Plan;
/**
 * Validate that a plan forms a valid DAG (no cycles, all edge refs valid)
 */
export declare function validatePlanDAG(plan: Plan): string[];
/**
 * Type guard for Plan objects
 */
export declare function isPlan(value: unknown): value is Plan;
/**
 * JSON Schema for Plan (for external validation)
 */
export declare const PLAN_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://wasm4pm.dev/schemas/plan/1.0";
    readonly title: "Plan";
    readonly description: "Execution plan DAG";
    readonly type: "object";
    readonly required: readonly ["schema_version", "plan_id", "created_at", "nodes", "edges", "metadata"];
    readonly properties: {
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.0";
        };
        readonly plan_id: {
            readonly type: "string";
        };
        readonly created_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly nodes: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["id", "kind", "label", "config", "version"];
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly kind: {
                        readonly type: "string";
                        readonly enum: readonly ["source", "algorithm", "sink"];
                    };
                    readonly label: {
                        readonly type: "string";
                    };
                    readonly config: {
                        readonly type: "object";
                    };
                    readonly version: {
                        readonly type: "string";
                    };
                };
                readonly additionalProperties: false;
            };
        };
        readonly edges: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["from", "to"];
                readonly properties: {
                    readonly from: {
                        readonly type: "string";
                    };
                    readonly to: {
                        readonly type: "string";
                    };
                    readonly label: {
                        readonly type: "string";
                    };
                };
                readonly additionalProperties: false;
            };
        };
        readonly metadata: {
            readonly type: "object";
            readonly required: readonly ["planner", "planner_version"];
            readonly properties: {
                readonly planner: {
                    readonly type: "string";
                };
                readonly planner_version: {
                    readonly type: "string";
                };
                readonly estimated_duration_ms: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
            };
            readonly additionalProperties: false;
        };
    };
    readonly additionalProperties: false;
};
//# sourceMappingURL=plan.d.ts.map