/**
 * Tests for three config validation gaps closed in feat/iter16:
 *
 * Gap 1 — Source/sink kind vs URL/path cross-field requirements:
 *   source.kind='http' without url, sink.kind='http' without url,
 *   sink.kind='file' without path all silently passed through to WASM
 *   which then crashed at runtime with a cryptic error. The fix adds
 *   .superRefine() checks that surface the problem at config resolution time.
 *
 * Gap 2 — swarm.algorithm_ids used z.string().min(1) instead of
 *   algorithmIdSchema, allowing arbitrary strings (e.g. 'nonexistent_algo')
 *   to pass validation and reach the kernel, which panics on unknown IDs.
 *
 * Gap 3 — prediction.enabled=true with tasks=[] silently produced zero
 *   prediction work. The fix rejects this at validation time with a
 *   message naming all six valid tasks.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../schema.js';

const minimal = { version: '26.4.5', source: { kind: 'file' as const } };

// =============================================================================
// Gap 1 — source/sink kind-vs-url/path cross-field enforcement
// =============================================================================

describe('Gap 1: source/sink kind vs url/path cross-field requirements', () => {
  // --- source ---

  it('rejects source.kind="http" when url is absent', () => {
    expect(() => validate({ ...minimal, source: { kind: 'http' } })).toThrow(
      /source\.url is required when source\.kind is "http"/
    );
  });

  it('accepts source.kind="http" when a valid url is provided', () => {
    expect(() =>
      validate({ ...minimal, source: { kind: 'http', url: 'https://example.com:8080/events.xes' } })
    ).not.toThrow();
  });

  it('rejects source.kind="file" when url is present (url not applicable for file)', () => {
    expect(() =>
      validate({ ...minimal, source: { kind: 'file', url: 'http://example.com' } })
    ).toThrow(/source\.url is not applicable when source\.kind is "file"/);
  });

  it('accepts source.kind="file" with only path (url absent)', () => {
    expect(() =>
      validate({ ...minimal, source: { kind: 'file', path: './events.xes' } })
    ).not.toThrow();
  });

  it('accepts source.kind="stream" with no path or url', () => {
    // Stream reads from stdin; neither path nor url is required.
    expect(() => validate({ ...minimal, source: { kind: 'stream' } })).not.toThrow();
  });

  // --- sink ---

  it('rejects sink.kind="http" when url is absent', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http' } })
    ).toThrow(/sink\.url is required when sink\.kind is "http"/);
  });

  it('accepts sink.kind="http" when a valid url is provided', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://example.com:9200/results' } })
    ).not.toThrow();
  });

  it('rejects sink.kind="file" when path is absent', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'file' } })
    ).toThrow(/sink\.path is required when sink\.kind is "file"/);
  });

  it('accepts sink.kind="file" when path is provided', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'file', path: './output.pnml' } })
    ).not.toThrow();
  });

  it('accepts sink.kind="stdout" with no path or url', () => {
    expect(() => validate({ ...minimal, sink: { kind: 'stdout' } })).not.toThrow();
  });

  it('rejects sink.kind="stdout" when path is present (path not applicable for stdout)', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'stdout', path: '/tmp/output' } })
    ).toThrow(/sink\.path is not applicable when sink\.kind is "stdout"/);
  });

  it('error message for source http without url names the exact field path', () => {
    let msg = '';
    try {
      validate({ ...minimal, source: { kind: 'http' } });
    } catch (e) {
      msg = (e as Error).message;
    }
    // Must surface [source.url] in the error path so the user knows exactly what to fix.
    expect(msg).toMatch(/\[source\.url\]/);
    expect(msg).toMatch(/source\.url is required/);
  });

  it('error message for sink file without path names the exact field path', () => {
    let msg = '';
    try {
      validate({ ...minimal, sink: { kind: 'file' } });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/\[sink\.path\]/);
    expect(msg).toMatch(/sink\.path is required/);
  });
});

// =============================================================================
// Gap 2 — swarm.algorithm_ids rejects unregistered algorithm IDs
// =============================================================================

describe('Gap 2: swarm.algorithm_ids validates against registered algorithm IDs', () => {
  it('rejects swarm.algorithm_ids containing an unregistered algorithm', () => {
    expect(() =>
      validate({ ...minimal, swarm: { algorithm_ids: ['nonexistent_algo'] } })
    ).toThrow(/algorithm\.name.*registered algorithms|Invalid enum value/i);
  });

  it('rejects swarm.algorithm_ids with a mix of valid and invalid IDs', () => {
    expect(() =>
      validate({ ...minimal, swarm: { algorithm_ids: ['dfg', 'not_real'] } })
    ).toThrow(/algorithm\.name.*registered algorithms|Invalid enum value/i);
  });

  it('accepts swarm.algorithm_ids with valid registered IDs', () => {
    expect(() =>
      validate({ ...minimal, swarm: { algorithm_ids: ['dfg', 'heuristic_miner', 'ilp'] } })
    ).not.toThrow();
  });

  it('accepts swarm default (single "dfg" entry)', () => {
    expect(() => validate({ ...minimal, swarm: {} })).not.toThrow();
    const cfg = validate({ ...minimal, swarm: {} });
    expect(cfg.swarm?.algorithm_ids).toEqual(['dfg']);
  });

  it('rejects swarm.algorithm_ids with an empty string element', () => {
    // algorithmIdSchema is an enum — empty string is not a valid enum value
    expect(() =>
      validate({ ...minimal, swarm: { algorithm_ids: [''] } })
    ).toThrow();
  });
});

// =============================================================================
// Gap 3 — prediction.enabled=true with tasks=[] is an error, not a no-op
// =============================================================================

describe('Gap 3: prediction.enabled=true requires at least one task', () => {
  it('rejects prediction.enabled=true with no tasks specified', () => {
    expect(() =>
      validate({ ...minimal, prediction: { enabled: true, tasks: [] } })
    ).toThrow(/prediction\.tasks must not be empty when prediction\.enabled is true/);
  });

  it('error message names all six valid prediction tasks', () => {
    let msg = '';
    try {
      validate({ ...minimal, prediction: { enabled: true, tasks: [] } });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/next_activity/);
    expect(msg).toMatch(/remaining_time/);
    expect(msg).toMatch(/outcome/);
    expect(msg).toMatch(/drift/);
    expect(msg).toMatch(/features/);
    expect(msg).toMatch(/resource/);
  });

  it('accepts prediction.enabled=true with one valid task', () => {
    expect(() =>
      validate({ ...minimal, prediction: { enabled: true, tasks: ['next_activity'] } })
    ).not.toThrow();
  });

  it('accepts prediction.enabled=true with all six tasks', () => {
    expect(() =>
      validate({
        ...minimal,
        prediction: {
          enabled: true,
          tasks: ['next_activity', 'remaining_time', 'outcome', 'drift', 'features', 'resource'],
        },
      })
    ).not.toThrow();
  });

  it('accepts prediction.enabled=false with empty tasks (disabled prediction needs no tasks)', () => {
    expect(() =>
      validate({ ...minimal, prediction: { enabled: false, tasks: [] } })
    ).not.toThrow();
  });

  it('accepts prediction section absent entirely', () => {
    // prediction is optional in the root schema
    const cfg = validate({ ...minimal });
    expect(cfg.prediction).toBeUndefined();
  });

  it('error path is [prediction.tasks] for the enabled+empty-tasks case', () => {
    let msg = '';
    try {
      validate({ ...minimal, prediction: { enabled: true, tasks: [] } });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/\[prediction\.tasks\]/);
  });
});
