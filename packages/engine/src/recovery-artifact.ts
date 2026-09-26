/**
 * Provider-neutral, content-addressed crash recovery artifact.
 *
 * The existing checkpoint store answers "what checkpoint can I load?".
 * This module answers the stronger question needed by ALOOP/provider-extinction:
 * "did a fresh provider/job consume the exact same admitted recovery state?".
 *
 * Provider/run/locator observations are intentionally excluded from identity.
 * Authority is always none; this artifact can justify recovery selection but
 * can never authorize an external consequence.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Checkpoint } from './checkpointing.js';

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const RecoveryTransportSchema = z.object({
  provider: z.string().min(1),
  providerRunId: z.string().min(1),
  locator: z.string().min(1).optional(),
}).strict();

export type RecoveryTransport = z.infer<typeof RecoveryTransportSchema>;

export const RecoveryArtifactSchema = z.object({
  schema: z.literal('wasm4pm.recovery-artifact/1'),
  subjectDigest: DigestSchema,
  checkpointDigest: DigestSchema,
  producerDigest: DigestSchema,
  sequenceNumber: z.number().int().nonnegative(),
  engineState: z.string().min(1),
  progress: z.number().finite(),
  authority: z.literal('none'),
  identityDigest: DigestSchema,
  transport: RecoveryTransportSchema.optional(),
}).strict();

export type RecoveryArtifact = z.infer<typeof RecoveryArtifactSchema>;

export const RecoveryFailureInjectionSchema = z.object({
  schema: z.literal('wasm4pm.recovery-failure/1'),
  injectionId: z.string().min(1),
  kind: z.enum(['CRASH', 'LEASE_LOSS', 'PROVIDER_EXTINCTION']),
  failedProvider: z.string().min(1),
  failedProviderRunId: z.string().min(1),
  seed: z.number().int().nonnegative(),
  injectionDigest: DigestSchema,
}).strict();

export type RecoveryFailureInjection = z.infer<typeof RecoveryFailureInjectionSchema>;

export interface RecoveryAdmission {
  admitted: boolean;
  reasons: string[];
  identityDigest: string;
  authority: 'none';
}

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
    .join(',') + '}';
}

function digest(value: Json): string {
  return 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
}

/**
 * Semantic checkpoint identity. It intentionally excludes checkpoint id,
 * wall-clock timestamp, arbitrary metadata, filesystem path and provider.
 */
export function checkpointSemanticDigest(checkpoint: Checkpoint): string {
  return digest({
    runId: checkpoint.runId,
    sequenceNumber: checkpoint.sequenceNumber,
    state: checkpoint.state,
    progress: checkpoint.progress,
  });
}

function identityBasis(
  artifact: Omit<RecoveryArtifact, 'identityDigest' | 'transport'>
): Json {
  return {
    schema: artifact.schema,
    subjectDigest: artifact.subjectDigest,
    checkpointDigest: artifact.checkpointDigest,
    producerDigest: artifact.producerDigest,
    sequenceNumber: artifact.sequenceNumber,
    engineState: artifact.engineState,
    progress: artifact.progress,
    authority: artifact.authority,
  };
}

export function buildRecoveryArtifact(
  checkpoint: Checkpoint,
  input: {
    subjectDigest: string;
    producerDigest: string;
    transport?: RecoveryTransport;
  }
): RecoveryArtifact {
  DigestSchema.parse(input.subjectDigest);
  DigestSchema.parse(input.producerDigest);
  const base = {
    schema: 'wasm4pm.recovery-artifact/1' as const,
    subjectDigest: input.subjectDigest,
    checkpointDigest: checkpointSemanticDigest(checkpoint),
    producerDigest: input.producerDigest,
    sequenceNumber: checkpoint.sequenceNumber,
    engineState: checkpoint.state,
    progress: checkpoint.progress,
    authority: 'none' as const,
  };
  return RecoveryArtifactSchema.parse({
    ...base,
    identityDigest: digest(identityBasis(base)),
    ...(input.transport ? { transport: RecoveryTransportSchema.parse(input.transport) } : {}),
  });
}

export function admitRecoveryArtifact(
  value: unknown,
  checkpoint: Checkpoint,
  expectedSubjectDigest: string
): RecoveryAdmission {
  const parsed = RecoveryArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return {
      admitted: false,
      reasons: ['RECOVERY_ARTIFACT_SCHEMA_INVALID'],
      identityDigest: 'sha256:' + '0'.repeat(64),
      authority: 'none',
    };
  }
  const artifact = parsed.data;
  const reasons: string[] = [];
  if (artifact.subjectDigest !== expectedSubjectDigest) {
    reasons.push('RECOVERY_SUBJECT_MISMATCH');
  }
  const observedCheckpoint = checkpointSemanticDigest(checkpoint);
  if (artifact.checkpointDigest !== observedCheckpoint) {
    reasons.push('RECOVERY_CHECKPOINT_MISMATCH');
  }
  if (
    artifact.sequenceNumber !== checkpoint.sequenceNumber
    || artifact.engineState !== checkpoint.state
    || artifact.progress !== checkpoint.progress
  ) {
    reasons.push('RECOVERY_STATE_PROJECTION_MISMATCH');
  }
  const { identityDigest: _claimed, transport: _transport, ...base } = artifact;
  const recomputedIdentity = digest(identityBasis(base));
  if (artifact.identityDigest !== recomputedIdentity) {
    reasons.push('RECOVERY_IDENTITY_DIGEST_MISMATCH');
  }
  return {
    admitted: reasons.length === 0,
    reasons,
    identityDigest: recomputedIdentity,
    authority: 'none',
  };
}

export function buildRecoveryFailureInjection(input: {
  injectionId: string;
  kind: RecoveryFailureInjection['kind'];
  failedProvider: string;
  failedProviderRunId: string;
  seed: number;
}): RecoveryFailureInjection {
  const basis = {
    schema: 'wasm4pm.recovery-failure/1' as const,
    injectionId: input.injectionId,
    kind: input.kind,
    failedProvider: input.failedProvider,
    failedProviderRunId: input.failedProviderRunId,
    seed: input.seed,
  };
  return RecoveryFailureInjectionSchema.parse({
    ...basis,
    injectionDigest: digest(basis),
  });
}

export function qualifyProviderRecovery(
  beforeValue: unknown,
  afterValue: unknown,
  failureValue: unknown
): RecoveryAdmission {
  const beforeParsed = RecoveryArtifactSchema.safeParse(beforeValue);
  const afterParsed = RecoveryArtifactSchema.safeParse(afterValue);
  const failureParsed = RecoveryFailureInjectionSchema.safeParse(failureValue);
  if (!beforeParsed.success || !afterParsed.success || !failureParsed.success) {
    return {
      admitted: false,
      reasons: ['PROVIDER_RECOVERY_SCHEMA_INVALID'],
      identityDigest: 'sha256:' + '0'.repeat(64),
      authority: 'none',
    };
  }
  const before = beforeParsed.data;
  const after = afterParsed.data;
  const failure = failureParsed.data;
  const reasons: string[] = [];

  if (!before.transport || !after.transport) {
    reasons.push('PROVIDER_RECOVERY_TRANSPORT_EVIDENCE_MISSING');
  } else {
    if (failure.failedProvider !== before.transport.provider) {
      reasons.push('FAILURE_PROVIDER_MISMATCH');
    }
    if (failure.failedProviderRunId !== before.transport.providerRunId) {
      reasons.push('FAILURE_PROVIDER_RUN_MISMATCH');
    }
    if (before.transport.provider === after.transport.provider) {
      reasons.push('PROVIDER_NOT_REPLACED');
    }
    if (before.transport.providerRunId === after.transport.providerRunId) {
      reasons.push('PROVIDER_RUN_NOT_REPLACED');
    }
  }
  if (before.identityDigest !== after.identityDigest) {
    reasons.push('RECOVERY_SEMANTIC_IDENTITY_DRIFT');
  }

  const expectedFailureDigest = buildRecoveryFailureInjection({
    injectionId: failure.injectionId,
    kind: failure.kind,
    failedProvider: failure.failedProvider,
    failedProviderRunId: failure.failedProviderRunId,
    seed: failure.seed,
  }).injectionDigest;
  if (failure.injectionDigest !== expectedFailureDigest) {
    reasons.push('FAILURE_INJECTION_DIGEST_MISMATCH');
  }

  return {
    admitted: reasons.length === 0,
    reasons,
    identityDigest: after.identityDigest,
    authority: 'none',
  };
}
