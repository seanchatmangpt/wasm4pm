/**
 * Types and interfaces for the Process-Model Registry (Milestone M1).
 */

import { z } from 'zod';

export const ModelTypeSchema = z.enum(['PNML', 'POWL']);
export type ModelType = z.infer<typeof ModelTypeSchema>;

export const ProcessModelEnvelopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  model_type: ModelTypeSchema,
  payload: z.string(),
  metadata: z.record(z.string(), z.string()),
});

export type ProcessModelEnvelope = z.infer<typeof ProcessModelEnvelopeSchema>;

export const ComparisonOpSchema = z.enum(['Equals', 'NotEquals', 'Contains', 'GreaterThan', 'LessThan']);
export type ComparisonOp = z.infer<typeof ComparisonOpSchema>;

export const ConditionalGuardSchema = z.object({
  attribute_name: z.string(),
  operation: ComparisonOpSchema,
  threshold: z.string(),
});

export type ConditionalGuard = z.infer<typeof ConditionalGuardSchema>;

export const VariantKeySchema = z.object({
  attributes: z.record(z.string(), z.string()),
});

export type VariantKey = z.infer<typeof VariantKeySchema>;

export const VariantRuleSchema = z.object({
  model_id: z.string(),
  guards: z.array(ConditionalGuardSchema),
  priority: z.number(),
});

export type VariantRule = z.infer<typeof VariantRuleSchema>;
