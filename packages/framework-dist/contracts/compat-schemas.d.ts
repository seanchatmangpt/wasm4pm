import { z } from 'zod';
export declare const ArcSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    weight: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    weight?: number | undefined;
}, {
    from: string;
    to: string;
    weight?: number | undefined;
}>;
export type Arc = z.infer<typeof ArcSchema>;
export declare const BpmnEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    target: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    source: string;
    target: string;
}, {
    id: string;
    source: string;
    target: string;
}>;
export type BpmnEdge = z.infer<typeof BpmnEdgeSchema>;
export declare const BpmnLaneSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    nodes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    nodes: string[];
}, {
    id: string;
    name: string;
    nodes: string[];
}>;
export type BpmnLane = z.infer<typeof BpmnLaneSchema>;
export declare const BpmnNodeSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: string;
    name?: string | undefined;
}, {
    id: string;
    kind: string;
    name?: string | undefined;
}>;
export type BpmnNode = z.infer<typeof BpmnNodeSchema>;
export declare const BpmnProcessSchema: z.ZodObject<{
    edges: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        source: z.ZodString;
        target: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        source: string;
        target: string;
    }, {
        id: string;
        source: string;
        target: string;
    }>>, "many">;
    lanes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        nodes: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        nodes: string[];
    }, {
        id: string;
        name: string;
        nodes: string[];
    }>>, "many">;
    nodes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: string;
        name?: string | undefined;
    }, {
        id: string;
        kind: string;
        name?: string | undefined;
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: string;
        kind: string;
        name?: string | undefined;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
    }[];
    lanes: {
        id: string;
        name: string;
        nodes: string[];
    }[];
}, {
    nodes: {
        id: string;
        kind: string;
        name?: string | undefined;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
    }[];
    lanes: {
        id: string;
        name: string;
        nodes: string[];
    }[];
}>;
export type BpmnProcess = z.infer<typeof BpmnProcessSchema>;
export declare const CompatDiagnosticSchema: z.ZodObject<{
    message: z.ZodString;
    severity: z.ZodString;
    variant: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    severity: string;
    variant: string;
}, {
    message: string;
    severity: string;
    variant: string;
}>;
export type CompatDiagnostic = z.infer<typeof CompatDiagnosticSchema>;
export declare const ConformanceResultSchema: z.ZodObject<{
    deviating_traces: z.ZodNumber;
    fitness: z.ZodNumber;
    fitting_traces: z.ZodNumber;
    precision: z.ZodOptional<z.ZodNumber>;
    total_traces: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    fitness: number;
    deviating_traces: number;
    fitting_traces: number;
    total_traces: number;
    precision?: number | undefined;
}, {
    fitness: number;
    deviating_traces: number;
    fitting_traces: number;
    total_traces: number;
    precision?: number | undefined;
}>;
export type ConformanceResult = z.infer<typeof ConformanceResultSchema>;
export declare const ConformanceVerdictSchema: z.ZodObject<{
    is_perfect: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    is_perfect: boolean;
}, {
    is_perfect: boolean;
}>;
export type ConformanceVerdict = z.infer<typeof ConformanceVerdictSchema>;
export declare const DFGSchema: z.ZodObject<{
    edges: z.ZodArray<z.ZodLazy<z.ZodObject<{
        frequency: z.ZodNumber;
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        frequency: number;
    }, {
        from: string;
        to: string;
        frequency: number;
    }>>, "many">;
    nodes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        frequency: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        frequency: number;
        label?: string | undefined;
    }, {
        id: string;
        frequency: number;
        label?: string | undefined;
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: string;
        frequency: number;
        label?: string | undefined;
    }[];
    edges: {
        from: string;
        to: string;
        frequency: number;
    }[];
}, {
    nodes: {
        id: string;
        frequency: number;
        label?: string | undefined;
    }[];
    edges: {
        from: string;
        to: string;
        frequency: number;
    }[];
}>;
export type DFG = z.infer<typeof DFGSchema>;
export declare const DFGEdgeSchema: z.ZodObject<{
    frequency: z.ZodNumber;
    from: z.ZodString;
    to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    frequency: number;
}, {
    from: string;
    to: string;
    frequency: number;
}>;
export type DFGEdge = z.infer<typeof DFGEdgeSchema>;
export declare const DFGNodeSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    frequency: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    frequency: number;
    label?: string | undefined;
}, {
    id: string;
    frequency: number;
    label?: string | undefined;
}>;
export type DFGNode = z.infer<typeof DFGNodeSchema>;
export declare const DeclareConstraintSchema: z.ZodObject<{
    activities: z.ZodArray<z.ZodString, "many">;
    constraint_type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    activities: string[];
    constraint_type: string;
}, {
    activities: string[];
    constraint_type: string;
}>;
export type DeclareConstraint = z.infer<typeof DeclareConstraintSchema>;
export declare const DeclareModelSchema: z.ZodObject<{
    constraints: z.ZodArray<z.ZodLazy<z.ZodObject<{
        activities: z.ZodArray<z.ZodString, "many">;
        constraint_type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        activities: string[];
        constraint_type: string;
    }, {
        activities: string[];
        constraint_type: string;
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    constraints: {
        activities: string[];
        constraint_type: string;
    }[];
}, {
    constraints: {
        activities: string[];
        constraint_type: string;
    }[];
}>;
export type DeclareModel = z.infer<typeof DeclareModelSchema>;
export declare const DiagnosticSeveritySchema: z.ZodObject<{
    Error: z.ZodString;
    Info: z.ZodString;
    Warning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    Error: string;
    Info: string;
    Warning: string;
}, {
    Error: string;
    Info: string;
    Warning: string;
}>;
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;
export declare const WasmEventSchema: z.ZodObject<{
    activity: z.ZodString;
    lifecycle: z.ZodOptional<z.ZodString>;
    resource: z.ZodOptional<z.ZodString>;
    timestamp_ns: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    activity: string;
    lifecycle?: string | undefined;
    resource?: string | undefined;
    timestamp_ns?: number | undefined;
}, {
    activity: string;
    lifecycle?: string | undefined;
    resource?: string | undefined;
    timestamp_ns?: number | undefined;
}>;
export type WasmEvent = z.infer<typeof WasmEventSchema>;
export declare const WasmEventLogSchema: z.ZodObject<{
    attributes: z.ZodRecord<z.ZodString, z.ZodString>;
    traces: z.ZodArray<z.ZodLazy<z.ZodObject<{
        events: z.ZodArray<z.ZodLazy<z.ZodObject<{
            activity: z.ZodString;
            lifecycle: z.ZodOptional<z.ZodString>;
            resource: z.ZodOptional<z.ZodString>;
            timestamp_ns: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }, {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }>>, "many">;
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        events: {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }[];
    }, {
        id: string;
        events: {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }[];
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    traces: {
        id: string;
        events: {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }[];
    }[];
    attributes: Record<string, string>;
}, {
    traces: {
        id: string;
        events: {
            activity: string;
            lifecycle?: string | undefined;
            resource?: string | undefined;
            timestamp_ns?: number | undefined;
        }[];
    }[];
    attributes: Record<string, string>;
}>;
export type WasmEventLog = z.infer<typeof WasmEventLogSchema>;
export declare const EvidenceSchema: z.ZodObject<{
    inner: z.ZodAny;
    state: z.ZodLazy<z.ZodObject<{
        Admitted: z.ZodString;
        Exportable: z.ZodString;
        Projected: z.ZodString;
        Raw: z.ZodString;
        Receipted: z.ZodString;
        Refused: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        Admitted: string;
        Exportable: string;
        Projected: string;
        Raw: string;
        Receipted: string;
        Refused: string;
    }, {
        Admitted: string;
        Exportable: string;
        Projected: string;
        Raw: string;
        Receipted: string;
        Refused: string;
    }>>;
    witness: z.ZodString;
}, "strip", z.ZodTypeAny, {
    state: {
        Admitted: string;
        Exportable: string;
        Projected: string;
        Raw: string;
        Receipted: string;
        Refused: string;
    };
    witness: string;
    inner?: any;
}, {
    state: {
        Admitted: string;
        Exportable: string;
        Projected: string;
        Raw: string;
        Receipted: string;
        Refused: string;
    };
    witness: string;
    inner?: any;
}>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export declare const EvidenceStateSchema: z.ZodObject<{
    Admitted: z.ZodString;
    Exportable: z.ZodString;
    Projected: z.ZodString;
    Raw: z.ZodString;
    Receipted: z.ZodString;
    Refused: z.ZodString;
}, "strip", z.ZodTypeAny, {
    Admitted: string;
    Exportable: string;
    Projected: string;
    Raw: string;
    Receipted: string;
    Refused: string;
}, {
    Admitted: string;
    Exportable: string;
    Projected: string;
    Raw: string;
    Receipted: string;
    Refused: string;
}>;
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;
export declare const LossChainSchema: z.ZodObject<{
    steps: z.ZodArray<z.ZodLazy<z.ZodObject<{
        category: z.ZodString;
        projection: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        category: string;
        projection: string;
    }, {
        category: string;
        projection: string;
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    steps: {
        category: string;
        projection: string;
    }[];
}, {
    steps: {
        category: string;
        projection: string;
    }[];
}>;
export type LossChain = z.infer<typeof LossChainSchema>;
export declare const LossReportSchema: z.ZodObject<{
    lost: z.ZodAny;
    policy: z.ZodString;
    projection: z.ZodString;
}, "strip", z.ZodTypeAny, {
    projection: string;
    policy: string;
    lost?: any;
}, {
    projection: string;
    policy: string;
    lost?: any;
}>;
export type LossReport = z.infer<typeof LossReportSchema>;
export declare const NamedLossSchema: z.ZodObject<{
    category: z.ZodString;
    projection: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: string;
    projection: string;
}, {
    category: string;
    projection: string;
}>;
export type NamedLoss = z.infer<typeof NamedLossSchema>;
export declare const ObjectTypeCardinalitySchema: z.ZodObject<{
    max_occurrence: z.ZodOptional<z.ZodNumber>;
    min_occurrence: z.ZodNumber;
    object_type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    min_occurrence: number;
    object_type: string;
    max_occurrence?: number | undefined;
}, {
    min_occurrence: number;
    object_type: string;
    max_occurrence?: number | undefined;
}>;
export type ObjectTypeCardinality = z.infer<typeof ObjectTypeCardinalitySchema>;
export declare const OcelAttributeValueSchema: z.ZodObject<{
    Boolean: z.ZodOptional<z.ZodBoolean>;
    Float: z.ZodOptional<z.ZodNumber>;
    Integer: z.ZodOptional<z.ZodNumber>;
    String: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    Boolean?: boolean | undefined;
    Float?: number | undefined;
    Integer?: number | undefined;
    String?: string | undefined;
}, {
    Boolean?: boolean | undefined;
    Float?: number | undefined;
    Integer?: number | undefined;
    String?: string | undefined;
}>;
export type OcelAttributeValue = z.infer<typeof OcelAttributeValueSchema>;
export declare const WasmOcelEventSchema: z.ZodObject<{
    attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodLazy<z.ZodObject<{
            Boolean: z.ZodOptional<z.ZodBoolean>;
            Float: z.ZodOptional<z.ZodNumber>;
            Integer: z.ZodOptional<z.ZodNumber>;
            String: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        }, {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
    }, {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
    }>>, "many">;
    id: z.ZodString;
    relationships: z.ZodArray<z.ZodLazy<z.ZodObject<{
        objectId: z.ZodString;
        qualifier: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        objectId: string;
        qualifier: string;
    }, {
        objectId: string;
        qualifier: string;
    }>>, "many">;
    time: z.ZodNumber;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    time: number;
    attributes: {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
    }[];
    relationships: {
        objectId: string;
        qualifier: string;
    }[];
}, {
    type: string;
    id: string;
    time: number;
    attributes: {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
    }[];
    relationships: {
        objectId: string;
        qualifier: string;
    }[];
}>;
export type WasmOcelEvent = z.infer<typeof WasmOcelEventSchema>;
export declare const OcelEventAttributeSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodLazy<z.ZodObject<{
        Boolean: z.ZodOptional<z.ZodBoolean>;
        Float: z.ZodOptional<z.ZodNumber>;
        Integer: z.ZodOptional<z.ZodNumber>;
        String: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    }, {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    value: {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    };
    name: string;
}, {
    value: {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    };
    name: string;
}>;
export type OcelEventAttribute = z.infer<typeof OcelEventAttributeSchema>;
export declare const WasmOcelLogSchema: z.ZodObject<{
    eventTypes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            name: string;
        }, {
            type: string;
            name: string;
        }>>, "many">;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }, {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }>>, "many">;
    events: z.ZodArray<z.ZodLazy<z.ZodObject<{
        attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
            name: z.ZodString;
            value: z.ZodLazy<z.ZodObject<{
                Boolean: z.ZodOptional<z.ZodBoolean>;
                Float: z.ZodOptional<z.ZodNumber>;
                Integer: z.ZodOptional<z.ZodNumber>;
                String: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            }, {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }, {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }>>, "many">;
        id: z.ZodString;
        relationships: z.ZodArray<z.ZodLazy<z.ZodObject<{
            objectId: z.ZodString;
            qualifier: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            objectId: string;
            qualifier: string;
        }, {
            objectId: string;
            qualifier: string;
        }>>, "many">;
        time: z.ZodNumber;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        time: number;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }[];
        relationships: {
            objectId: string;
            qualifier: string;
        }[];
    }, {
        type: string;
        id: string;
        time: number;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }[];
        relationships: {
            objectId: string;
            qualifier: string;
        }[];
    }>>, "many">;
    objectTypes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            name: string;
        }, {
            type: string;
            name: string;
        }>>, "many">;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }, {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }>>, "many">;
    objects: z.ZodArray<z.ZodLazy<z.ZodObject<{
        attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
            name: z.ZodString;
            time: z.ZodNumber;
            value: z.ZodLazy<z.ZodObject<{
                Boolean: z.ZodOptional<z.ZodBoolean>;
                Float: z.ZodOptional<z.ZodNumber>;
                Integer: z.ZodOptional<z.ZodNumber>;
                String: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            }, {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }, {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }>>, "many">;
        id: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }[];
    }, {
        type: string;
        id: string;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }[];
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    events: {
        type: string;
        id: string;
        time: number;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }[];
        relationships: {
            objectId: string;
            qualifier: string;
        }[];
    }[];
    objects: {
        type: string;
        id: string;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }[];
    }[];
    eventTypes: {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }[];
    objectTypes: {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }[];
}, {
    events: {
        type: string;
        id: string;
        time: number;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
        }[];
        relationships: {
            objectId: string;
            qualifier: string;
        }[];
    }[];
    objects: {
        type: string;
        id: string;
        attributes: {
            value: {
                Boolean?: boolean | undefined;
                Float?: number | undefined;
                Integer?: number | undefined;
                String?: string | undefined;
            };
            name: string;
            time: number;
        }[];
    }[];
    eventTypes: {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }[];
    objectTypes: {
        name: string;
        attributes: {
            type: string;
            name: string;
        }[];
    }[];
}>;
export type WasmOcelLog = z.infer<typeof WasmOcelLogSchema>;
export declare const OcelObjectSchema: z.ZodObject<{
    attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        name: z.ZodString;
        time: z.ZodNumber;
        value: z.ZodLazy<z.ZodObject<{
            Boolean: z.ZodOptional<z.ZodBoolean>;
            Float: z.ZodOptional<z.ZodNumber>;
            Integer: z.ZodOptional<z.ZodNumber>;
            String: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        }, {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
        time: number;
    }, {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
        time: number;
    }>>, "many">;
    id: z.ZodString;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    attributes: {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
        time: number;
    }[];
}, {
    type: string;
    id: string;
    attributes: {
        value: {
            Boolean?: boolean | undefined;
            Float?: number | undefined;
            Integer?: number | undefined;
            String?: string | undefined;
        };
        name: string;
        time: number;
    }[];
}>;
export type OcelObject = z.infer<typeof OcelObjectSchema>;
export declare const OcelObjectAttributeSchema: z.ZodObject<{
    name: z.ZodString;
    time: z.ZodNumber;
    value: z.ZodLazy<z.ZodObject<{
        Boolean: z.ZodOptional<z.ZodBoolean>;
        Float: z.ZodOptional<z.ZodNumber>;
        Integer: z.ZodOptional<z.ZodNumber>;
        String: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    }, {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    value: {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    };
    name: string;
    time: number;
}, {
    value: {
        Boolean?: boolean | undefined;
        Float?: number | undefined;
        Integer?: number | undefined;
        String?: string | undefined;
    };
    name: string;
    time: number;
}>;
export type OcelObjectAttribute = z.infer<typeof OcelObjectAttributeSchema>;
export declare const OcelRelationshipSchema: z.ZodObject<{
    objectId: z.ZodString;
    qualifier: z.ZodString;
}, "strip", z.ZodTypeAny, {
    objectId: string;
    qualifier: string;
}, {
    objectId: string;
    qualifier: string;
}>;
export type OcelRelationship = z.infer<typeof OcelRelationshipSchema>;
export declare const OcelTypeSchema: z.ZodObject<{
    attributes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>>, "many">;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    attributes: {
        type: string;
        name: string;
    }[];
}, {
    name: string;
    attributes: {
        type: string;
        name: string;
    }[];
}>;
export type OcelType = z.infer<typeof OcelTypeSchema>;
export declare const OcelTypeAttributeSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
}, {
    type: string;
    name: string;
}>;
export type OcelTypeAttribute = z.infer<typeof OcelTypeAttributeSchema>;
export declare const OrderEdgeSchema: z.ZodObject<{
    from: z.ZodNumber;
    to: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    from: number;
    to: number;
}, {
    from: number;
    to: number;
}>;
export type OrderEdge = z.infer<typeof OrderEdgeSchema>;
export declare const PetriNetSchema: z.ZodObject<{
    arcs: z.ZodArray<z.ZodLazy<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        weight?: number | undefined;
    }, {
        from: string;
        to: string;
        weight?: number | undefined;
    }>>, "many">;
    places: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name?: string | undefined;
    }, {
        id: string;
        name?: string | undefined;
    }>>, "many">;
    transitions: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        label?: string | undefined;
    }, {
        id: string;
        label?: string | undefined;
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    transitions: {
        id: string;
        label?: string | undefined;
    }[];
    arcs: {
        from: string;
        to: string;
        weight?: number | undefined;
    }[];
    places: {
        id: string;
        name?: string | undefined;
    }[];
}, {
    transitions: {
        id: string;
        label?: string | undefined;
    }[];
    arcs: {
        from: string;
        to: string;
        weight?: number | undefined;
    }[];
    places: {
        id: string;
        name?: string | undefined;
    }[];
}>;
export type PetriNet = z.infer<typeof PetriNetSchema>;
export declare const PlaceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name?: string | undefined;
}, {
    id: string;
    name?: string | undefined;
}>;
export type Place = z.infer<typeof PlaceSchema>;
export declare const PowlSchema: z.ZodObject<{
    edges: z.ZodArray<z.ZodLazy<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        from: number;
        to: number;
    }, {
        from: number;
        to: number;
    }>>, "many">;
    nodes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        id: z.ZodNumber;
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: number;
        kind: string;
    }, {
        id: number;
        kind: string;
    }>>, "many">;
    root: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: number;
        kind: string;
    }[];
    edges: {
        from: number;
        to: number;
    }[];
    root?: number | undefined;
}, {
    nodes: {
        id: number;
        kind: string;
    }[];
    edges: {
        from: number;
        to: number;
    }[];
    root?: number | undefined;
}>;
export type Powl = z.infer<typeof PowlSchema>;
export declare const PowlNodeSchema: z.ZodObject<{
    id: z.ZodNumber;
    kind: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: number;
    kind: string;
}, {
    id: number;
    kind: string;
}>;
export type PowlNode = z.infer<typeof PowlNodeSchema>;
export declare const ProcessPerspectiveSchema: z.ZodObject<{
    "control-flow": z.ZodString;
    data: z.ZodString;
    resource: z.ZodString;
    time: z.ZodString;
}, "strip", z.ZodTypeAny, {
    time: string;
    resource: string;
    "control-flow": string;
    data: string;
}, {
    time: string;
    resource: string;
    "control-flow": string;
    data: string;
}>;
export type ProcessPerspective = z.infer<typeof ProcessPerspectiveSchema>;
export declare const ProcessTreeSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodLazy<z.ZodObject<{
        children: z.ZodArray<z.ZodNumber, "many">;
        kind: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        children: number[];
        label?: string | undefined;
    }, {
        kind: string;
        children: number[];
        label?: string | undefined;
    }>>, "many">;
    root: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    nodes: {
        kind: string;
        children: number[];
        label?: string | undefined;
    }[];
    root?: number | undefined;
}, {
    nodes: {
        kind: string;
        children: number[];
        label?: string | undefined;
    }[];
    root?: number | undefined;
}>;
export type ProcessTree = z.infer<typeof ProcessTreeSchema>;
export declare const ProcessTreeNodeSchema: z.ZodObject<{
    children: z.ZodArray<z.ZodNumber, "many">;
    kind: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    children: number[];
    label?: string | undefined;
}, {
    kind: string;
    children: number[];
    label?: string | undefined;
}>;
export type ProcessTreeNode = z.infer<typeof ProcessTreeNodeSchema>;
export declare const WasmReceiptSchema: z.ZodObject<{
    final_hash_chain: z.ZodString;
    model_id: z.ZodString;
    verdict: z.ZodLazy<z.ZodObject<{
        is_perfect: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        is_perfect: boolean;
    }, {
        is_perfect: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    final_hash_chain: string;
    model_id: string;
    verdict: {
        is_perfect: boolean;
    };
}, {
    final_hash_chain: string;
    model_id: string;
    verdict: {
        is_perfect: boolean;
    };
}>;
export type WasmReceipt = z.infer<typeof WasmReceiptSchema>;
export declare const TemporalOrderSchema: z.ZodObject<{
    after: z.ZodString;
    before: z.ZodString;
    concurrent: z.ZodString;
    unknown: z.ZodString;
}, "strip", z.ZodTypeAny, {
    unknown: string;
    after: string;
    before: string;
    concurrent: string;
}, {
    unknown: string;
    after: string;
    before: string;
    concurrent: string;
}>;
export type TemporalOrder = z.infer<typeof TemporalOrderSchema>;
export declare const TokenReplayResultSchema: z.ZodObject<{
    consumed_tokens: z.ZodNumber;
    fitness: z.ZodNumber;
    missing_tokens: z.ZodNumber;
    produced_tokens: z.ZodNumber;
    remaining_tokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    fitness: number;
    consumed_tokens: number;
    missing_tokens: number;
    produced_tokens: number;
    remaining_tokens: number;
}, {
    fitness: number;
    consumed_tokens: number;
    missing_tokens: number;
    produced_tokens: number;
    remaining_tokens: number;
}>;
export type TokenReplayResult = z.infer<typeof TokenReplayResultSchema>;
export declare const WasmTraceSchema: z.ZodObject<{
    events: z.ZodArray<z.ZodLazy<z.ZodObject<{
        activity: z.ZodString;
        lifecycle: z.ZodOptional<z.ZodString>;
        resource: z.ZodOptional<z.ZodString>;
        timestamp_ns: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        activity: string;
        lifecycle?: string | undefined;
        resource?: string | undefined;
        timestamp_ns?: number | undefined;
    }, {
        activity: string;
        lifecycle?: string | undefined;
        resource?: string | undefined;
        timestamp_ns?: number | undefined;
    }>>, "many">;
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    events: {
        activity: string;
        lifecycle?: string | undefined;
        resource?: string | undefined;
        timestamp_ns?: number | undefined;
    }[];
}, {
    id: string;
    events: {
        activity: string;
        lifecycle?: string | undefined;
        resource?: string | undefined;
        timestamp_ns?: number | undefined;
    }[];
}>;
export type WasmTrace = z.infer<typeof WasmTraceSchema>;
export declare const TransitionSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    label?: string | undefined;
}, {
    id: string;
    label?: string | undefined;
}>;
export type Transition = z.infer<typeof TransitionSchema>;
export declare const XesEventSchema: z.ZodObject<{
    attributes: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    attributes: Record<string, string>;
}, {
    attributes: Record<string, string>;
}>;
export type XesEvent = z.infer<typeof XesEventSchema>;
export declare const XesExtensionSchema: z.ZodObject<{
    name: z.ZodString;
    prefix: z.ZodString;
    uri: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    prefix: string;
    uri: string;
}, {
    name: string;
    prefix: string;
    uri: string;
}>;
export type XesExtension = z.infer<typeof XesExtensionSchema>;
export declare const XesLifecycleTransitionSchema: z.ZodObject<{
    abort: z.ZodString;
    assign: z.ZodString;
    autoskip: z.ZodString;
    complete: z.ZodString;
    inprogress: z.ZodString;
    manualskip: z.ZodString;
    plan: z.ZodString;
    reassign: z.ZodString;
    resume: z.ZodString;
    schedule: z.ZodString;
    start: z.ZodString;
    suspend: z.ZodString;
    unknown: z.ZodString;
    withdraw: z.ZodString;
}, "strip", z.ZodTypeAny, {
    unknown: string;
    abort: string;
    assign: string;
    autoskip: string;
    complete: string;
    inprogress: string;
    manualskip: string;
    plan: string;
    reassign: string;
    resume: string;
    schedule: string;
    start: string;
    suspend: string;
    withdraw: string;
}, {
    unknown: string;
    abort: string;
    assign: string;
    autoskip: string;
    complete: string;
    inprogress: string;
    manualskip: string;
    plan: string;
    reassign: string;
    resume: string;
    schedule: string;
    start: string;
    suspend: string;
    withdraw: string;
}>;
export type XesLifecycleTransition = z.infer<typeof XesLifecycleTransitionSchema>;
export declare const XesLogSchema: z.ZodObject<{
    extensions: z.ZodArray<z.ZodLazy<z.ZodObject<{
        name: z.ZodString;
        prefix: z.ZodString;
        uri: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        prefix: string;
        uri: string;
    }, {
        name: string;
        prefix: string;
        uri: string;
    }>>, "many">;
    name: z.ZodString;
    traces: z.ZodArray<z.ZodLazy<z.ZodObject<{
        events: z.ZodArray<z.ZodLazy<z.ZodObject<{
            attributes: z.ZodRecord<z.ZodString, z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            attributes: Record<string, string>;
        }, {
            attributes: Record<string, string>;
        }>>, "many">;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        events: {
            attributes: Record<string, string>;
        }[];
    }, {
        name: string;
        events: {
            attributes: Record<string, string>;
        }[];
    }>>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    traces: {
        name: string;
        events: {
            attributes: Record<string, string>;
        }[];
    }[];
    extensions: {
        name: string;
        prefix: string;
        uri: string;
    }[];
}, {
    name: string;
    traces: {
        name: string;
        events: {
            attributes: Record<string, string>;
        }[];
    }[];
    extensions: {
        name: string;
        prefix: string;
        uri: string;
    }[];
}>;
export type XesLog = z.infer<typeof XesLogSchema>;
export declare const XesTraceSchema: z.ZodObject<{
    events: z.ZodArray<z.ZodLazy<z.ZodObject<{
        attributes: z.ZodRecord<z.ZodString, z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        attributes: Record<string, string>;
    }, {
        attributes: Record<string, string>;
    }>>, "many">;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    events: {
        attributes: Record<string, string>;
    }[];
}, {
    name: string;
    events: {
        attributes: Record<string, string>;
    }[];
}>;
export type XesTrace = z.infer<typeof XesTraceSchema>;
//# sourceMappingURL=compat-schemas.d.ts.map