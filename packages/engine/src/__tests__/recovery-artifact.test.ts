import { describe, expect, test } from 'vitest';
import type { Checkpoint } from '../checkpointing.js';
import {
  admitRecoveryArtifact,
  buildRecoveryArtifact,
  buildRecoveryFailureInjection,
  checkpointSemanticDigest,
  qualifyProviderRecovery,
} from '../recovery-artifact.js';

const subject = 'sha256:' + 'a'.repeat(64);
const producer = 'sha256:' + 'b'.repeat(64);

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'cp-run-1-7',
    runId: 'semantic-run-1',
    timestamp: new Date('2026-09-25T20:00:00.000Z'),
    sequenceNumber: 7,
    state: 'ready',
    progress: 0.75,
    metadata: { workstationPath: '/tmp/provider-a/checkpoint.json' },
    ...overrides,
  };
}

describe('content-addressed recovery artifact', () => {
  test('identity excludes provider, provider run, locator, checkpoint id, timestamp and metadata', () => {
    const firstCheckpoint = checkpoint();
    const sameSemanticCheckpoint = checkpoint({
      id: 'cp-fresh-job-99',
      timestamp: new Date('2026-09-25T22:00:00.000Z'),
      metadata: { workstationPath: 'C:/fresh/provider-b/cp.json', arbitrary: true },
    });

    expect(checkpointSemanticDigest(firstCheckpoint))
      .toBe(checkpointSemanticDigest(sameSemanticCheckpoint));

    const before = buildRecoveryArtifact(firstCheckpoint, {
      subjectDigest: subject,
      producerDigest: producer,
      transport: {
        provider: 'wasm-worker-a',
        providerRunId: 'provider-run-a',
        locator: '/tmp/provider-a/checkpoint.json',
      },
    });
    const after = buildRecoveryArtifact(sameSemanticCheckpoint, {
      subjectDigest: subject,
      producerDigest: producer,
      transport: {
        provider: 'wasm-worker-b',
        providerRunId: 'provider-run-b',
        locator: 'C:/fresh/provider-b/checkpoint.json',
      },
    });

    expect(after.identityDigest).toBe(before.identityDigest);
    expect(after.checkpointDigest).toBe(before.checkpointDigest);
  });

  test('exact subject and semantic checkpoint are independently admitted', () => {
    const cp = checkpoint();
    const artifact = buildRecoveryArtifact(cp, {
      subjectDigest: subject,
      producerDigest: producer,
    });
    expect(admitRecoveryArtifact(artifact, cp, subject)).toEqual({
      admitted: true,
      reasons: [],
      identityDigest: artifact.identityDigest,
      authority: 'none',
    });

    const wrongSubject = admitRecoveryArtifact(
      artifact,
      cp,
      'sha256:' + 'c'.repeat(64),
    );
    expect(wrongSubject.admitted).toBe(false);
    expect(wrongSubject.reasons).toContain('RECOVERY_SUBJECT_MISMATCH');

    const drifted = admitRecoveryArtifact(
      artifact,
      checkpoint({ progress: 0.9 }),
      subject,
    );
    expect(drifted.admitted).toBe(false);
    expect(drifted.reasons).toContain('RECOVERY_CHECKPOINT_MISMATCH');
  });

  test('provider extinction qualifies only when semantic identity survives a fresh provider run', () => {
    const cp = checkpoint();
    const before = buildRecoveryArtifact(cp, {
      subjectDigest: subject,
      producerDigest: producer,
      transport: {
        provider: 'provider-a',
        providerRunId: 'run-a',
        locator: '/work/a/cp',
      },
    });
    const after = buildRecoveryArtifact(cp, {
      subjectDigest: subject,
      producerDigest: producer,
      transport: {
        provider: 'provider-b',
        providerRunId: 'run-b',
        locator: '/work/b/cp',
      },
    });
    const failure = buildRecoveryFailureInjection({
      injectionId: 'fi:extinction:26925',
      kind: 'PROVIDER_EXTINCTION',
      failedProvider: 'provider-a',
      failedProviderRunId: 'run-a',
      seed: 26925,
    });

    expect(qualifyProviderRecovery(before, after, failure)).toEqual({
      admitted: true,
      reasons: [],
      identityDigest: before.identityDigest,
      authority: 'none',
    });
  });

  test('same provider or semantic mutation is a typed counterexample', () => {
    const cp = checkpoint();
    const before = buildRecoveryArtifact(cp, {
      subjectDigest: subject,
      producerDigest: producer,
      transport: { provider: 'provider-a', providerRunId: 'run-a' },
    });
    const after = buildRecoveryArtifact(checkpoint({ progress: 0.9 }), {
      subjectDigest: subject,
      producerDigest: producer,
      transport: { provider: 'provider-a', providerRunId: 'run-a' },
    });
    const failure = buildRecoveryFailureInjection({
      injectionId: 'fi:crash:26925',
      kind: 'CRASH',
      failedProvider: 'provider-a',
      failedProviderRunId: 'run-a',
      seed: 1,
    });

    const result = qualifyProviderRecovery(before, after, failure);
    expect(result.admitted).toBe(false);
    expect(result.reasons).toContain('PROVIDER_NOT_REPLACED');
    expect(result.reasons).toContain('PROVIDER_RUN_NOT_REPLACED');
    expect(result.reasons).toContain('RECOVERY_SEMANTIC_IDENTITY_DRIFT');
  });

  test('tampered identity digest fails closed', () => {
    const cp = checkpoint();
    const artifact = buildRecoveryArtifact(cp, {
      subjectDigest: subject,
      producerDigest: producer,
    });
    const result = admitRecoveryArtifact(
      { ...artifact, identityDigest: 'sha256:' + 'f'.repeat(64) },
      cp,
      subject,
    );
    expect(result.admitted).toBe(false);
    expect(result.reasons).toContain('RECOVERY_IDENTITY_DIGEST_MISMATCH');
  });
});
