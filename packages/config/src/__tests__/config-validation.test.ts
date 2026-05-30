/**
 * Config validation tests — improved Zod error messages and helpful feedback.
 *
 * Verifies:
 * 1. Invalid algorithm name produces a helpful error message listing valid options
 * 2. Invalid profile produces list of valid options
 * 3. Invalid output format produces a clear message
 * 4. Negative/zero timeout produces a clear message
 * 5. Config with all valid fields resolves without error
 */
import { describe, it, expect } from 'vitest';
import { validate } from '../schema.js';
import { resolveConfig } from '../resolver.js';

const minimalBase = {
  version: '26.4.5',
  source: { kind: 'file' as const },
};

// ---------------------------------------------------------------------------
// Algorithm name validation
// ---------------------------------------------------------------------------
describe('algorithm.name validation messages', () => {
  it('produces helpful error with algorithm count when name is unknown', () => {
    expect(() =>
      validate({ ...minimalBase, algorithm: { name: 'made_up_algorithm' } })
    ).toThrow(/algorithm\.name.*registered algorithms.*got "made_up_algorithm"/i);
  });

  it('mentions how to list valid algorithms', () => {
    let message = '';
    try {
      validate({ ...minimalBase, algorithm: { name: 'fake_algo' } });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/wpm doctor|38|registered/i);
  });

  it('accepts all known algorithm IDs without error', async () => {
    // Sample a few well-known algorithms
    const knownAlgos = ['dfg', 'alpha_plus_plus', 'heuristic_miner', 'ilp', 'genetic_algorithm'];
    for (const name of knownAlgos) {
      expect(() =>
        validate({ ...minimalBase, algorithm: { name } })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// execution.profile validation messages
// ---------------------------------------------------------------------------
describe('execution.profile validation messages', () => {
  it('produces error listing all valid profiles when profile is invalid', () => {
    expect(() =>
      validate({ ...minimalBase, execution: { profile: 'hyperfast' as 'fast' } })
    ).toThrow(/execution\.profile.*fast.*balanced.*quality.*stream/i);
  });

  it('includes the invalid value in the message', () => {
    let message = '';
    try {
      validate({ ...minimalBase, execution: { profile: 'turbo' as 'fast' } });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/turbo/);
  });

  it('accepts all valid profiles', () => {
    const profiles = ['fast', 'balanced', 'quality', 'stream'] as const;
    for (const profile of profiles) {
      expect(() =>
        validate({ ...minimalBase, execution: { profile } })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// output.format validation messages
// ---------------------------------------------------------------------------
describe('output.format validation messages', () => {
  it('produces error listing human|json when format is invalid', () => {
    expect(() =>
      validate({ ...minimalBase, output: { format: 'xml' as 'json', destination: 'stdout', pretty: false, colorize: false } })
    ).toThrow(/output\.format.*human.*json.*got "xml"/i);
  });

  it('accepts human and json without error', () => {
    for (const format of ['human', 'json'] as const) {
      expect(() =>
        validate({ ...minimalBase, output: { format, destination: 'stdout', pretty: false, colorize: false } })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// execution.timeout validation messages
// ---------------------------------------------------------------------------
describe('execution.timeout validation messages', () => {
  it('produces helpful message when timeout is negative', () => {
    expect(() =>
      validate({ ...minimalBase, execution: { timeout: -5 } })
    ).toThrow(/execution\.timeout.*positive number/i);
  });

  it('produces helpful message when timeout is zero', () => {
    expect(() =>
      validate({ ...minimalBase, execution: { timeout: 0 } })
    ).toThrow(/execution\.timeout.*positive number/i);
  });

  it('accepts a positive timeout without error', () => {
    expect(() =>
      validate({ ...minimalBase, execution: { timeout: 30000 } })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// observability.logLevel validation messages
// ---------------------------------------------------------------------------
describe('observability.logLevel validation messages', () => {
  it('produces error listing valid log levels when level is invalid', () => {
    expect(() =>
      validate({
        ...minimalBase,
        observability: { logLevel: 'verbose' as 'debug' },
      })
    ).toThrow(/observability\.logLevel.*debug.*info.*warn.*error/i);
  });

  it('includes the invalid value in the message', () => {
    let message = '';
    try {
      validate({ ...minimalBase, observability: { logLevel: 'noisy' as 'debug' } });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/noisy/);
  });
});

// ---------------------------------------------------------------------------
// source.kind validation messages
// ---------------------------------------------------------------------------
describe('source.kind validation messages', () => {
  it('produces error listing file|stream|http when kind is invalid', () => {
    expect(() =>
      validate({ ...minimalBase, source: { kind: 'ftp' as 'file' } })
    ).toThrow(/source\.kind.*file.*stream.*http/i);
  });
});

// ---------------------------------------------------------------------------
// Full valid config resolves without error
// ---------------------------------------------------------------------------
describe('valid full config', () => {
  it('resolves without error when all fields are valid', async () => {
    const config = await resolveConfig({
      env: {
        WASM4PM_ALGORITHM: 'dfg',
        WASM4PM_PROFILE: 'balanced',
        WASM4PM_OUTPUT_FORMAT: 'human',
        WASM4PM_LOG_LEVEL: 'info',
      } as NodeJS.ProcessEnv,
      configSearchPaths: [],
    });
    expect(config.algorithm.name).toBe('dfg');
    expect(config.execution.profile).toBe('balanced');
    expect(config.output.format).toBe('human');
    expect(config.observability.logLevel).toBe('info');
  });

  it('resolves with quality profile and ilp algorithm', async () => {
    const config = await resolveConfig({
      env: {
        WASM4PM_ALGORITHM: 'ilp',
        WASM4PM_PROFILE: 'quality',
      } as NodeJS.ProcessEnv,
      configSearchPaths: [],
    });
    expect(config.algorithm.name).toBe('ilp');
    expect(config.execution.profile).toBe('quality');
  });

  it('provenance tracks env vars as env source', async () => {
    const config = await resolveConfig({
      env: {
        WASM4PM_ALGORITHM: 'heuristic_miner',
        WASM4PM_PROFILE: 'fast',
      } as NodeJS.ProcessEnv,
      configSearchPaths: [],
    });
    expect(config.metadata.provenance['algorithm.name']?.source).toBe('env');
    expect(config.metadata.provenance['execution.profile']?.source).toBe('env');
  });
});
