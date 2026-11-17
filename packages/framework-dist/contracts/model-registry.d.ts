/**
 * Types and interfaces for the Process-Model Registry (Milestone M1).
 */
import { z } from 'zod';
export declare const ModelTypeSchema: z.ZodEnum<["PNML", "POWL"]>;
export type ModelType = z.infer<typeof ModelTypeSchema>;
export declare const ProcessModelEnvelopeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    version: z.ZodString;
    model_type: z.ZodEnum<["PNML", "POWL"]>;
    payload: z.ZodString;
    metadata: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    version: string;
    id: string;
    name: string;
    model_type: "PNML" | "POWL";
    payload: string;
    metadata: Record<string, string>;
}, {
    version: string;
    id: string;
    name: string;
    model_type: "PNML" | "POWL";
    payload: string;
    metadata: Record<string, string>;
}>;
export type ProcessModelEnvelope = z.infer<typeof ProcessModelEnvelopeSchema>;
export declare const ComparisonOpSchema: z.ZodEnum<["Equals", "NotEquals", "Contains", "GreaterThan", "LessThan"]>;
export type ComparisonOp = z.infer<typeof ComparisonOpSchema>;
export declare const ConditionalGuardSchema: z.ZodObject<{
    attribute_name: z.ZodString;
    operation: z.ZodEnum<["Equals", "NotEquals", "Contains", "GreaterThan", "LessThan"]>;
    threshold: z.ZodString;
}, "strip", z.ZodTypeAny, {
    threshold: string;
    attribute_name: string;
    operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
}, {
    threshold: string;
    attribute_name: string;
    operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
}>;
export type ConditionalGuard = z.infer<typeof ConditionalGuardSchema>;
export declare const VariantKeySchema: z.ZodObject<{
    attributes: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    attributes: Record<string, string>;
}, {
    attributes: Record<string, string>;
}>;
export type VariantKey = z.infer<typeof VariantKeySchema>;
export declare const VariantRuleSchema: z.ZodObject<{
    model_id: z.ZodString;
    guards: z.ZodArray<z.ZodObject<{
        attribute_name: z.ZodString;
        operation: z.ZodEnum<["Equals", "NotEquals", "Contains", "GreaterThan", "LessThan"]>;
        threshold: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        threshold: string;
        attribute_name: string;
        operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
    }, {
        threshold: string;
        attribute_name: string;
        operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
    }>, "many">;
    priority: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    model_id: string;
    guards: {
        threshold: string;
        attribute_name: string;
        operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
    }[];
    priority: number;
}, {
    model_id: string;
    guards: {
        threshold: string;
        attribute_name: string;
        operation: "Equals" | "NotEquals" | "Contains" | "GreaterThan" | "LessThan";
    }[];
    priority: number;
}>;
export type VariantRule = z.infer<typeof VariantRuleSchema>;
//# sourceMappingURL=model-registry.d.ts.map