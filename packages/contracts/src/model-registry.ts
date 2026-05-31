/**
 * Types and interfaces for the Process-Model Registry (Milestone M1).
 */

export type ModelType = 'PNML' | 'POWL';

export interface ProcessModelEnvelope {
  id: string;
  name: string;
  version: string;
  model_type: ModelType;
  payload: string;
  metadata: Record<string, string>;
}

export type ComparisonOp = 'Equals' | 'NotEquals' | 'Contains' | 'GreaterThan' | 'LessThan';

export interface ConditionalGuard {
  attribute_name: string;
  operation: ComparisonOp;
  threshold: string;
}

export interface VariantKey {
  attributes: Record<string, string>;
}

export interface VariantRule {
  model_id: string;
  guards: ConditionalGuard[];
  priority: number;
}
