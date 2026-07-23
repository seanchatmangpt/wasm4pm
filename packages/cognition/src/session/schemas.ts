//! Strict Zod schemas for state-carrying cognition sessions.

import { z } from 'zod';

const TrackSpecSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    concepts: z.array(z.string().min(1)),
  })
  .strict();

const PatternSpecSchema = z
  .object({
    id: z.string().min(1),
    phrases: z.array(z.string().min(1)).min(1),
    proposition: z.string().min(1),
    track_weights: z.record(z.string(), z.number().min(-1).max(1)),
    concept: z.string().nullable().optional(),
  })
  .strict();

const SessionRuleSchema = z
  .object({
    id: z.string().min(1),
    premises: z.array(z.string().min(1)).min(1),
    track_id: z.string().min(1),
    certainty: z.number().min(0).max(1),
    concept: z.string().nullable().optional(),
  })
  .strict();

const PhaseSpecSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    requires_committed_track: z.boolean(),
    required_concepts: z.array(z.string()),
  })
  .strict();

const ThresholdSpecSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    margin: z.number().min(0).max(1),
    minimum_coverage: z.number().int().nonnegative(),
    confirmation_required: z.boolean(),
    maximum_contradiction: z.number().min(0).max(1),
  })
  .strict();

const SessionBoundsSchema = z
  .object({
    max_observations: z.number().int().positive(),
    max_evidence: z.number().int().positive(),
    max_observation_bytes: z.number().int().positive(),
    max_tracks: z.number().int().positive(),
    max_patterns: z.number().int().positive(),
    max_rules: z.number().int().positive(),
  })
  .strict();

export const DomainPackSchema = z
  .object({
    version: z.string().min(1),
    id: z.string().min(1),
    tracks: z.array(TrackSpecSchema).min(1),
    patterns: z.array(PatternSpecSchema),
    rules: z.array(SessionRuleSchema),
    phases: z.array(PhaseSpecSchema).min(1),
    aliases: z.record(z.string(), z.string()),
    thresholds: ThresholdSpecSchema,
    bounds: SessionBoundsSchema,
  })
  .strict();
export type DomainPack = z.infer<typeof DomainPackSchema>;

export const ObservationSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    text: z.string(),
    retract_evidence_ids: z.array(z.string()),
  })
  .strict();
export type Observation = z.infer<typeof ObservationSchema>;

export const ConfirmationSchema = z
  .object({
    track_id: z.string().min(1),
    accepted: z.boolean(),
  })
  .strict();
export type Confirmation = z.infer<typeof ConfirmationSchema>;

const EvidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    observation_id: z.string().min(1),
    pattern_id: z.string().min(1),
    proposition: z.string().min(1),
    track_weights: z.record(z.string(), z.number()),
    concept: z.string().nullable().optional(),
    polarity: z.enum(['positive', 'negative']),
    active: z.boolean(),
  })
  .strict();

export const TrackHypothesisSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    support: z.number().min(0).max(1),
    contradiction: z.number().min(0).max(1),
    score: z.number().min(0).max(1),
    eliminated: z.boolean(),
    evidence_ids: z.array(z.string()),
    fired_rules: z.array(z.string()),
  })
  .strict();
export type TrackHypothesis = z.infer<typeof TrackHypothesisSchema>;

export interface SessionState {
  schema_version: string;
  turn: number;
  domain_pack_hash: string;
  previous_state_hash?: string | null;
  observations: Observation[];
  evidence: Array<z.infer<typeof EvidenceRecordSchema>>;
  rejected_tracks: string[];
  hypotheses: TrackHypothesis[];
  committed_track?: string | null;
  phase: string;
  covered_concepts: string[];
  missing_concepts: string[];
  pending_confirmation?: string | null;
  state_hash: string;
}

export const SessionStateSchema: z.ZodType<SessionState> = z.lazy(() =>
  z
    .object({
      schema_version: z.string().min(1),
      turn: z.number().int().nonnegative(),
      domain_pack_hash: z.string().min(1),
      previous_state_hash: z.string().nullable().optional(),
      observations: z.array(ObservationSchema),
      evidence: z.array(EvidenceRecordSchema),
      rejected_tracks: z.array(z.string()),
      hypotheses: z.array(TrackHypothesisSchema),
      committed_track: z.string().nullable().optional(),
      phase: z.string().min(1),
      covered_concepts: z.array(z.string()),
      missing_concepts: z.array(z.string()),
      pending_confirmation: z.string().nullable().optional(),
      state_hash: z.string().min(1),
    })
    .strict(),
);

export const SessionTurnInputSchema = z
  .object({
    domain_pack: DomainPackSchema,
    previous_state: SessionStateSchema.nullable().optional(),
    observation: ObservationSchema.nullable().optional(),
    confirmation: ConfirmationSchema.nullable().optional(),
  })
  .strict();
export type SessionTurnInput = z.infer<typeof SessionTurnInputSchema>;

const TraceStepSchema = z
  .object({
    step: z.number().int().nonnegative(),
    kind: z.string(),
    detail: z.string(),
    depth: z.number().int().nonnegative(),
    objects: z.array(z.tuple([z.string(), z.string()])),
  })
  .strict();

const SessionProjectionSchema = z
  .object({
    current_track: z.string().nullable().optional(),
    hypotheses: z.array(TrackHypothesisSchema),
    covered_concepts: z.array(z.string()),
    missing_concepts: z.array(z.string()),
    phase: z.string(),
    phase_label: z.string(),
    pending_confirmation: z.string().nullable().optional(),
    complete: z.boolean(),
  })
  .strict();

const SessionReceiptSchema = z
  .object({
    input_hash: z.string().min(1),
    previous_state_hash: z.string().min(1),
    domain_pack_hash: z.string().min(1),
    output_hash: z.string().min(1),
    combined_hash: z.string().min(1),
  })
  .strict();

export const SessionTurnOutputSchema = z
  .object({
    state: SessionStateSchema,
    projection: SessionProjectionSchema,
    inference_trace: z.array(TraceStepSchema).min(1),
    ocel_log: z.unknown(),
    receipt: SessionReceiptSchema,
  })
  .strict();
export type SessionTurnOutput = z.infer<typeof SessionTurnOutputSchema>;

export const SessionRefusalCodeSchema = z.enum([
  'MALFORMED_INPUT',
  'INPUT_TOO_LARGE',
  'EMPTY_TURN',
  'INVALID_DOMAIN',
  'STATE_HASH_MISMATCH',
  'DOMAIN_PACK_MISMATCH',
  'OBSERVATION_TOO_LARGE',
  'RESOURCE_CAP',
  'OBSERVATION_ID_CONFLICT',
  'UNKNOWN_EVIDENCE',
  'UNKNOWN_TRACK',
  'CONFIRMATION_NOT_ELIGIBLE',
  'SERIALIZATION',
]);
export type SessionRefusalCode = z.infer<typeof SessionRefusalCodeSchema>;

const SessionRefusalSchema = z
  .object({
    code: SessionRefusalCodeSchema,
  })
  .passthrough();

const SuccessBoundarySchema = z
  .object({
    status: z.literal('ok'),
    run_id: z.string().min(1),
    input_hash: z.string().min(1),
    output_hash: z.string().min(1),
    replay_pointer: z.string().min(1),
    output: SessionTurnOutputSchema,
    signature: z.string().min(1),
    public_key_id: z.string().min(1),
    signature_algorithm: z.literal('ed25519'),
  })
  .strict();

const RefusalBoundarySchema = z
  .object({
    status: z.literal('refused'),
    run_id: z.string().min(1),
    input_hash: z.string().min(1),
    refusal_hash: z.string().min(1),
    replay_pointer: z.string().min(1),
    refusal: SessionRefusalSchema,
    message: z.string().min(1),
    signature: z.string().min(1),
    public_key_id: z.string().min(1),
    signature_algorithm: z.literal('ed25519'),
  })
  .strict();

export const SessionBoundaryResultSchema = z.discriminatedUnion('status', [
  SuccessBoundarySchema,
  RefusalBoundarySchema,
]);
export type SessionBoundaryResult = z.infer<typeof SessionBoundaryResultSchema>;
export type SessionSuccessResult = z.infer<typeof SuccessBoundarySchema>;
