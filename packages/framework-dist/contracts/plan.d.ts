/**
 * Plan Schema - DAG representation for execution plans
 * Schema version 1.0
 *
 * A Plan is a directed acyclic graph (DAG) where nodes are processing
 * steps (source, algorithm, sink) and edges define data flow.
 * Deterministic serialization ensures identical plans produce identical hashes.
 */
import { z } from 'zod';
/**
 * Node types in the execution DAG
 */
export type PlanNodeKind = 'source' | 'algorithm' | 'sink';
export declare const PlanNodeKindSchema: z.ZodEnum<["source", "algorithm", "sink"]>;
/**
 * A single node in the execution plan DAG
 */
export declare const PlanNodeSchema: z.ZodObject<{
    /** Unique node identifier within this plan */
    id: z.ZodString;
    /** Node type */
    kind: z.ZodEnum<["source", "algorithm", "sink"]>;
    /** Human-readable label */
    label: z.ZodString;
    /** Configuration specific to this node */
    config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    /** Semantic version of the node's implementation */
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    version: string;
    id: string;
    kind: "algorithm" | "source" | "sink";
    label: string;
    config: Record<string, unknown>;
}, {
    version: string;
    id: string;
    kind: "algorithm" | "source" | "sink";
    label: string;
    config: Record<string, unknown>;
}>;
export type PlanNode = z.infer<typeof PlanNodeSchema>;
/**
 * A directed edge in the execution plan DAG
 */
export declare const PlanEdgeSchema: z.ZodObject<{
    /** Source node ID */
    from: z.ZodString;
    /** Target node ID */
    to: z.ZodString;
    /** Optional label describing the data flowing on this edge */
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    label?: string | undefined;
}, {
    from: string;
    to: string;
    label?: string | undefined;
}>;
export type PlanEdge = z.infer<typeof PlanEdgeSchema>;
/**
 * Execution plan — a DAG of processing steps
 */
export declare const PlanSchema: z.ZodObject<{
    /** Schema version for forward compatibility */
    schema_version: z.ZodLiteral<"1.0">;
    /** Unique plan identifier */
    plan_id: z.ZodString;
    /** ISO 8601 timestamp of plan creation */
    created_at: z.ZodString;
    /** Nodes in the DAG, sorted by id for determinism */
    nodes: z.ZodArray<z.ZodObject<{
        /** Unique node identifier within this plan */
        id: z.ZodString;
        /** Node type */
        kind: z.ZodEnum<["source", "algorithm", "sink"]>;
        /** Human-readable label */
        label: z.ZodString;
        /** Configuration specific to this node */
        config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        /** Semantic version of the node's implementation */
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: string;
        id: string;
        kind: "algorithm" | "source" | "sink";
        label: string;
        config: Record<string, unknown>;
    }, {
        version: string;
        id: string;
        kind: "algorithm" | "source" | "sink";
        label: string;
        config: Record<string, unknown>;
    }>, "many">;
    /** Edges in the DAG, sorted by (from, to) for determinism */
    edges: z.ZodArray<z.ZodObject<{
        /** Source node ID */
        from: z.ZodString;
        /** Target node ID */
        to: z.ZodString;
        /** Optional label describing the data flowing on this edge */
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        label?: string | undefined;
    }, {
        from: string;
        to: string;
        label?: string | undefined;
    }>, "many">;
    /** Plan metadata */
    metadata: z.ZodObject<{
        /** Name of the planner that generated this plan */
        planner: z.ZodString;
        /** Planner version */
        planner_version: z.ZodString;
        /** Estimated execution time in ms (if available) */
        estimated_duration_ms: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        planner: string;
        planner_version: string;
        estimated_duration_ms?: number | undefined;
    }, {
        planner: string;
        planner_version: string;
        estimated_duration_ms?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: "1.0";
    nodes: {
        version: string;
        id: string;
        kind: "algorithm" | "source" | "sink";
        label: string;
        config: Record<string, unknown>;
    }[];
    edges: {
        from: string;
        to: string;
        label?: string | undefined;
    }[];
    metadata: {
        planner: string;
        planner_version: string;
        estimated_duration_ms?: number | undefined;
    };
    plan_id: string;
    created_at: string;
}, {
    schema_version: "1.0";
    nodes: {
        version: string;
        id: string;
        kind: "algorithm" | "source" | "sink";
        label: string;
        config: Record<string, unknown>;
    }[];
    edges: {
        from: string;
        to: string;
        label?: string | undefined;
    }[];
    metadata: {
        planner: string;
        planner_version: string;
        estimated_duration_ms?: number | undefined;
    };
    plan_id: string;
    created_at: string;
}>;
export type Plan = z.infer<typeof PlanSchema>;
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