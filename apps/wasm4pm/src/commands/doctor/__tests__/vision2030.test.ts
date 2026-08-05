import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '../types.js';
import {
  evaluateVision2030,
  verifyVision2030Report,
  type CapabilityDefinition,
  type Vision2030Subject,
} from '../vision2030.js';

const pass = (name: string): (() => Promise<Diagnosis>) => async () => ({
  name,
  severity: 'INFO',
  observation: 'EXECUTED',
  message: 'observed execution passed',
});

const skip = (name: string): (() => Promise<Diagnosis>) => async () => ({
  name,
  severity: 'INFO',
  message: 'Skipped — boundary unavailable',
});

const fail = (name: string): (() => Promise<Diagnosis>) => async () => ({
  name,
  severity: 'STOP_THE_LINE',
  observation: 'EXECUTED',
  message: 'boundary failed',
});

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

const admittedSubject: Vision2030Subject = {
  repository: 'seanchatmangpt/wasm4pm',
  git_commit: 'a'.repeat(40),
  package_version: '26.7.23',
  node_version: 'v22.16.0',
  platform: 'linux',
  arch: 'x64',
  admitted: true,
};

describe('Vision 2030 capability audit', () => {
  it('enforces evidence ceilings instead of crowning a declared route', async () => {
    const definitions: CapabilityDefinition[] = [
      {
        id: 'route',
        label: 'Route',
        description: 'Declared route',
        checks: [pass('route check')],
        ceiling: 'PARTIAL_ALIVE',
      },
    ];

    const report = await evaluateVision2030(definitions, hash, { subject: admittedSubject });
    expect(report.capabilities[0]?.standing).toBe('PARTIAL_ALIVE');
    expect(report.overall_standing).toBe('PARTIAL_ALIVE');
  });

  it('classifies executed environment failures as BUILD_BROKEN', async () => {
    const report = await evaluateVision2030(
      [
        {
          id: 'environment',
          label: 'Environment',
          description: 'Runtime substrate',
          checks: [fail('wasm build')],
          failureStanding: 'BUILD_BROKEN',
        },
      ],
      hash,
      { subject: admittedSubject }
    );

    expect(report.overall_standing).toBe('BUILD_BROKEN');
    expect(report.summary.build_broken).toBe(1);
  });

  it('preserves explicit unsupported boundaries', async () => {
    const report = await evaluateVision2030(
      [
        {
          id: 'future-runtime',
          label: 'Future runtime',
          description: 'Not wired yet',
          checks: [],
          unsupportedReason: 'No executable route exists.',
        },
      ],
      hash,
      { subject: admittedSubject }
    );

    expect(report.overall_standing).toBe('UNSUPPORTED');
    expect(report.capabilities[0]?.limitation).toBe('No executable route exists.');
  });

  it('refuses unknown filters rather than silently auditing another subject', async () => {
    await expect(
      evaluateVision2030(
        [{ id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] }],
        hash,
        { only: ['missing'], subject: admittedSubject }
      )
    ).rejects.toMatchObject({
      code: 'UNKNOWN_CAPABILITY_REFUSED',
    });
  });

  it('refuses duplicate capability identities', async () => {
    await expect(
      evaluateVision2030(
        [
          { id: 'duplicate', label: 'One', description: 'One', checks: [pass('one')] },
          { id: 'duplicate', label: 'Two', description: 'Two', checks: [pass('two')] },
        ],
        hash,
        { subject: admittedSubject }
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_CAPABILITY_ID_REFUSED' });
  });

  it('never treats a legacy skipped INFO diagnosis as an observed pass', async () => {
    const report = await evaluateVision2030(
      [{ id: 'skipped', label: 'Skipped', description: 'Unavailable', checks: [skip('skip')] }],
      hash,
      { subject: admittedSubject }
    );

    expect(report.scope_standing).toBe('UNKNOWN');
    expect(report.overall_standing).toBe('UNKNOWN');
    expect(report.capabilities[0]?.counts.not_observed).toBe(1);
  });

  it('bounds mixed observed and unobserved evidence to PARTIAL_ALIVE', async () => {
    const report = await evaluateVision2030(
      [
        {
          id: 'mixed',
          label: 'Mixed',
          description: 'Mixed evidence',
          checks: [pass('executed'), skip('skipped')],
        },
      ],
      hash,
      { subject: admittedSubject }
    );

    expect(report.capabilities[0]?.standing).toBe('PARTIAL_ALIVE');
  });

  it('cannot crown a filtered subset as global ALIVE', async () => {
    const definitions: CapabilityDefinition[] = [
      { id: 'one', label: 'One', description: 'One', checks: [pass('one')] },
      { id: 'two', label: 'Two', description: 'Two', checks: [pass('two')] },
    ];
    const report = await evaluateVision2030(definitions, hash, {
      only: ['one'],
      subject: admittedSubject,
    });

    expect(report.scope).toMatchObject({ mode: 'FILTERED', complete: false });
    expect(report.scope_standing).toBe('ALIVE');
    expect(report.overall_standing).toBe('PARTIAL_ALIVE');
  });

  it('cannot crown execution without exact admitted subject identity', async () => {
    const report = await evaluateVision2030(
      [{ id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] }],
      hash
    );

    expect(report.scope_standing).toBe('ALIVE');
    expect(report.subject.admitted).toBe(false);
    expect(report.overall_standing).toBe('PARTIAL_ALIVE');
  });

  it('binds evidence to subject, scope, catalog, diagnoses, and not wall-clock time', async () => {
    const definitions: CapabilityDefinition[] = [
      { id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] },
    ];
    const first = await evaluateVision2030(definitions, hash, {
      now: () => new Date('2030-01-01T00:00:00.000Z'),
      subject: admittedSubject,
    });
    const second = await evaluateVision2030(definitions, hash, {
      now: () => new Date('2031-01-01T00:00:00.000Z'),
      subject: admittedSubject,
    });

    expect(first.generated_at).not.toBe(second.generated_at);
    expect(first.evidence_hash).toBe(second.evidence_hash);
    expect(verifyVision2030Report(first, hash)).toMatchObject({ valid: true, issues: [] });
  });

  it('refuses tampered diagnosis evidence on replay', async () => {
    const report = await evaluateVision2030(
      [{ id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] }],
      hash,
      { subject: admittedSubject }
    );
    const tampered = structuredClone(report);
    (tampered.capabilities[0]!.diagnoses[0] as { message: string }).message = 'forged pass';

    const verification = verifyVision2030Report(tampered, hash);
    expect(verification.valid).toBe(false);
    expect(verification.issues).toContain('DIAGNOSIS_EVIDENCE_MISMATCH:known:0');
    expect(verification.issues).toContain('EVIDENCE_HASH_MISMATCH');
  });
});
