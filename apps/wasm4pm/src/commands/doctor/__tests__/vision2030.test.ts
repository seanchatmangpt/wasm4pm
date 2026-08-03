import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '../types.js';
import {
  evaluateVision2030,
  type CapabilityDefinition,
} from '../vision2030.js';

const pass = (name: string): (() => Promise<Diagnosis>) => async () => ({
  name,
  severity: 'INFO',
  message: 'observed execution passed',
});

const fail = (name: string): (() => Promise<Diagnosis>) => async () => ({
  name,
  severity: 'STOP_THE_LINE',
  message: 'boundary failed',
});

const hash = (value: string): string => value.length.toString(16).padStart(64, '0');

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

    const report = await evaluateVision2030(definitions, hash);
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
      hash
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
      hash
    );

    expect(report.overall_standing).toBe('UNSUPPORTED');
    expect(report.capabilities[0]?.limitation).toBe('No executable route exists.');
  });

  it('refuses unknown filters rather than silently auditing another subject', async () => {
    await expect(
      evaluateVision2030(
        [{ id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] }],
        hash,
        { only: ['missing'] }
      )
    ).rejects.toMatchObject({
      code: 'UNKNOWN_CAPABILITY_REFUSED',
    });
  });

  it('binds the evidence hash to content rather than wall-clock time', async () => {
    const definitions: CapabilityDefinition[] = [
      { id: 'known', label: 'Known', description: 'Known rail', checks: [pass('known')] },
    ];
    const first = await evaluateVision2030(definitions, hash, {
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });
    const second = await evaluateVision2030(definitions, hash, {
      now: () => new Date('2031-01-01T00:00:00.000Z'),
    });

    expect(first.generated_at).not.toBe(second.generated_at);
    expect(first.evidence_hash).toBe(second.evidence_hash);
  });
});
