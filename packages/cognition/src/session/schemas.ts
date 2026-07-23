//! Strict Zod schemas for state-carrying cognition sessions.

import { z } from 'zod';

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ConceptSpecSchema = z
  .object({
    label: z.string().min(1),
    prompt: z.string().min(1),
  })
  .strict();
export type ConceptSpec = z.infer<typeof ConceptSpecSchema>;

const TrackSpecSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    concepts: z.array(z.string().min(1)).min(1),
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
    concept_coverage: z.number().min(0).max(1),
    confirmation_required: z.boolean(),
    maximum_contradiction: z.number().min(0).max(1),
  })
  .strict();

const SessionBoundsSchema = z
  .object({
    max_turns: z.number().int().positive(),
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
    version: z.literal('2'),
    id: z.string().min(1),
    concepts: z.record(z.string(), ConceptSpecSchema),
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

export const SessionTurnRecordSchema = z
  .object({
    observation: ObservationSchema.nullable().optional(),
    confirmation: ConfirmationSchema.nullable().optional(),
  })
  .strict()
  .refine((record) => record.observation != null || record.confirmation != null, {
    message: 'A turn record requires an observation or confirmation.',
  });
export type SessionTurnRecord = z.infer<typeof SessionTurnRecordSchema>;

export const EvidenceRecordSchema = z
  .object({
    id: HashSchema,
    observation_id: z.string().min(1),
    pattern_id: z.string().min(1),
    matched_phrase: z.string().min(1),
    proposition: z.string().min(1),
    track_weights: z.record(z.string(), z.number().min(-1).max(1)),
    concept: z.string().nullable().optional(),
    polarity: z.enum(['positive', 'negative']),
    active: z.boolean(),
  })
  .strict();
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const TrackHypothesisSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    support: z.number().min(0).max(1),
    contradiction: z.number().min(0).max(1),
    score: z.number().min(0).max(1),
    eliminated: z.boolean(),
    evidence_ids: z.array(HashSchema),
    fired_rules: z.array(z.string()),
  })
  .strict();
export type TrackHypothesis = z.infer<typeof TrackHypothesisSchema>;

export interface SessionState {
  schema_version: '2';
  turn: number;
  domain_pack_hash: string;
  previous_state_hash?: string | null;
  turns: SessionTurnRecord[];
  observations: Observation[];
  evidence: EvidenceRecord[];
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
      schema_version: z.literal('2'),
      turn: z.number().int().positive(),
      domain_pack_hash: HashSchema,
      previous_state_hash: HashSchema.nullable().optional(),
      turns: z.array(SessionTurnRecordSchema).min(1),
      observations: z.array(ObservationSchema),
      evidence: z.array(EvidenceRecordSchema),
      rejected_tracks: z.array(z.string()),
      hypotheses: z.array(TrackHypothesisSchema),
      committed_track: z.string().nullable().optional(),
      phase: z.string().min(1),
      covered_concepts: z.array(z.string()),
      missing_concepts: z.array(z.string()),
      pending_confirmation: z.string().nullable().optional(),
      state_hash: HashSchema,
    })
    .strict()
    .refine((session) => session.turn === session.turns.length, {
      message: 'turn must equal the canonical turn-ledger length',
      path: ['turn'],
    }),
);

export const SessionTurnInputSchema = z
  .object({
    domain_pack: DomainPackSchema,
    previous_state: SessionStateSchema.nullable().optional(),
    observation: ObservationSchema.nullable().optional(),
    confirmation: ConfirmationSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => input.observation != null || input.confirmation != null, {
    message: 'A session turn requires an observation or confirmation.',
  });
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
    input_hash: HashSchema,
    previous_state_hash: HashSchema,
    domain_pack_hash: HashSchema,
    output_hash: HashSchema,
    combined_hash: HashSchema,
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
  'EMPTY_OBSERVATION',
  'INVALID_DOMAIN',
  'STATE_HASH_MISMATCH',
  'INVALID_STATE',
  'DOMAIN_PACK_MISMATCH',
  'OBSERVATION_TOO_LARGE',
  'RESOURCE_CAP',
  'OBSERVATION_ID_CONFLICT',
  'UNKNOWN_EVIDENCE',
  'UNKNOWN_TRACK',
  'CONFIRMATION_NOT_PENDING',
  'CONFIRMATION_NOT_ELIGIBLE',
  'SERIALIZATION',
]);
export type SessionRefusalCode = z.infer<typeof SessionRefusalCodeSchema>;

const SessionRefusalSchema = z
  .object({
    code: SessionRefusalCodeSchema,
  })
  .passthrough();

const AttestationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ed25519-self-signed'),
      signature: z.string().regex(/^[0-9a-f]{128}$/),
      public_key: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('blake3-only'),
      signature: z.null(),
      public_key: z.null(),
    })
    .strict(),
]);

const SuccessBoundarySchema = z
  .object({
    status: z.literal('ok'),
    run_id: HashSchema,
    input_hash: HashSchema,
    output_hash: HashSchema,
    attested_hash: HashSchema,
    replay_pointer: z.string().regex(/^[0-9a-f]{16}$/),
    output: SessionTurnOutputSchema,
    attestation: AttestationSchema,
  })
  .strict();

const RefusalBoundarySchema = z
  .object({
    status: z.literal('refused'),
    run_id: HashSchema,
    input_hash: HashSchema,
    refusal_hash: HashSchema,
    attested_hash: HashSchema,
    replay_pointer: z.string().regex(/^[0-9a-f]{16}$/),
    refusal: SessionRefusalSchema,
    message: z.string().min(1),
    attestation: AttestationSchema,
  })
  .strict();

export const SessionBoundaryResultSchema = z.discriminatedUnion('status', [
  SuccessBoundarySchema,
  RefusalBoundarySchema,
]);
export type SessionBoundaryResult = z.infer<typeof SessionBoundaryResultSchema>;
export type SessionSuccessResult = z.infer<typeof SuccessBoundarySchema>;
