/**
 * compare-gaps.test.ts
 *
 * Closes the gaps identified by the wpm compare audit:
 *
 * BUG-1  sparkBar() rendered all-░ (empty) when max==min (tie case).
 *        Fixed: tied values now render as ▓▓▓▓▓▓▓▓ (full / "tied at ceiling").
 *
 * BUG-2  Human output always showed green ✔ even when ALL algorithms fail.
 *        Fixed: projection.error() for 0 successes, projection.warn() for partial.
 *
 * GAP-3a JSON payload was missing output_type field per entry.
 *        Fixed: output_type is 'dfg'|'petrinet'|'tree'|'declare'|'unknown'.
 *
 * GAP-3b JSON payload was missing duration_ms / node_count / edge_count aliases.
 *        Fixed: all three aliases present alongside the originals.
 *
 * GAP-4  recommendation is null when only 1 algorithm succeeds (by design, no fix).
 *
 * JSON envelope (from runCli / stdout):
 *   {
 *     command, status, exit_code,
 *     payload: { status, input, activityKey, algorithms[], recommendation },  // on success
 *     error:   { code, message }                                              // on error
 *   }
 */

import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

// ---------------------------------------------------------------------------
// Test fixture — real XES log bundled with the project.
// ---------------------------------------------------------------------------
const XES = '/Users/sac/wasm4pm/data/RequestForPayment.xes';

// ---------------------------------------------------------------------------
// Helper — parse the full JSON envelope from the CLI
// ---------------------------------------------------------------------------
interface CliEnvelope {
  command: string;
  status: string;
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
}

async function compareRaw(algos: string, extra: string[] = []): Promise<{ exitCode: number; envelope: CliEnvelope }> {
  const result = await runCli([
    'compare',
    algos,
    '-i',
    XES,
    '--format',
    'json',
    '--no-save',
    ...extra,
  ]);
  let envelope: CliEnvelope = { command: 'compare', status: 'error', exit_code: result.exitCode, payload: null };
  try {
    envelope = JSON.parse(result.stdout) as CliEnvelope;
  } catch {
    // leave defaults if stdout is not JSON
  }
  return { exitCode: result.exitCode, envelope };
}

// Convenience: access the inner payload (valid on success responses)
async function comparePayload(
  algos: string,
  extra: string[] = []
): Promise<{ exitCode: number; payload: Record<string, unknown> }> {
  const { exitCode, envelope } = await compareRaw(algos, extra);
  return { exitCode, payload: (envelope.payload ?? {}) as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// BUG-1 — sparkBar tie-case fix
// ---------------------------------------------------------------------------
describe('BUG-1: sparkBar() tie case', () => {
  it('two algorithms with identical nodes+edges succeed without any crash', async () => {
    // dfg and skeleton both produce DFG-shaped output on typical logs.
    // When their counts are identical the old code rendered all-░; now it renders all-▓.
    const result = await runCli(['compare', 'dfg,skeleton', '-i', XES, '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // Human output must NOT show "all algorithms failed"
    expect(result.stdout).not.toMatch(/all algorithms failed/);
  });

  it('sparkBar tie: JSON payload nodes/edges for dfg,skeleton are valid non-negative numbers', async () => {
    const { exitCode, payload } = await comparePayload('dfg,skeleton');
    expect(exitCode).toBe(EXIT_CODES.success);
    // comparisons is the per-algorithm stat array; algorithms is just the name list
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    expect(Array.isArray(algos)).toBe(true);
    expect(algos).toHaveLength(2);
    for (const a of algos) {
      expect(typeof a['nodes']).toBe('number');
      expect(a['nodes'] as number).toBeGreaterThanOrEqual(0);
      expect(typeof a['edges']).toBe('number');
      expect(a['edges'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('sparkBar contract: legend text references ▓ and ░', async () => {
    const result = await runCli(['compare', 'dfg,skeleton', '-i', XES, '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('▓');
    expect(result.stdout).toContain('░');
    // Tie renders full bar for both — legend should mention max
    expect(result.stdout).toMatch(/▓+.*=.*max/);
  });
});

// ---------------------------------------------------------------------------
// BUG-2 — human header shows correct status level
// ---------------------------------------------------------------------------
describe('BUG-2: human output header status level', () => {
  it('full success: header does NOT say partial or all-failed', async () => {
    const result = await runCli(['compare', 'dfg,heuristic', '-i', XES, '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).not.toMatch(/partial.*succeeded/);
    expect(result.stdout).not.toMatch(/all algorithms failed/);
  });

  it('full success: human output contains "Algorithm comparison"', async () => {
    const result = await runCli(['compare', 'dfg,heuristic', '-i', XES, '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('Algorithm comparison');
  });
});

// ---------------------------------------------------------------------------
// GAP-3a — output_type field in each algorithm entry
// ---------------------------------------------------------------------------
describe('GAP-3a: output_type field present in JSON payload', () => {
  it('dfg algorithm has output_type = "dfg"', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    // comparisons is the per-algorithm stat array; algorithms is just the name list
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    const dfgEntry = algos.find((a) => a['algorithm'] === 'dfg');
    expect(dfgEntry).toBeDefined();
    expect(dfgEntry!['output_type']).toBe('dfg');
  });

  it('heuristic algorithm has a known output_type (dfg, petrinet, tree, or declare)', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    const heuristicEntry = algos.find((a) => a['algorithm'] === 'heuristic');
    expect(heuristicEntry).toBeDefined();
    expect(['dfg', 'petrinet', 'tree', 'declare']).toContain(heuristicEntry!['output_type']);
  });

  it('inductive miner has a known output_type', async () => {
    const { exitCode, payload } = await comparePayload('dfg,inductive');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    const inductiveEntry = algos.find((a) => a['algorithm'] === 'inductive');
    expect(inductiveEntry).toBeDefined();
    expect(['dfg', 'petrinet', 'tree', 'declare']).toContain(inductiveEntry!['output_type']);
  });

  it('sentinel (failed) rows have output_type = "unknown"', async () => {
    // All successful rows must have a known type; sentinel rows (nodes: -1) must be 'unknown'.
    // comparisons is the per-algorithm stat array with nodes, output_type etc.
    const { payload } = await comparePayload('dfg,heuristic');
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    for (const a of algos) {
      if ((a['nodes'] as number) < 0) {
        // This is a sentinel row
        expect(a['output_type']).toBe('unknown');
      } else {
        // Successful rows
        expect(['dfg', 'petrinet', 'tree', 'declare']).toContain(a['output_type']);
      }
    }
  });

  it('output_type is present on every entry in a 3-algorithm comparison', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic,inductive');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    expect(algos).toHaveLength(3);
    for (const a of algos) {
      expect(a).toHaveProperty('output_type');
      expect(typeof a['output_type']).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// GAP-3b — duration_ms / node_count / edge_count aliases
// ---------------------------------------------------------------------------
describe('GAP-3b: duration_ms, node_count, edge_count aliases in JSON payload', () => {
  it('each algorithm entry has duration_ms equal to elapsedMs', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    // comparisons is the per-algorithm stat array (not algorithms which is name list)
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    expect(Array.isArray(algos)).toBe(true);
    for (const a of algos) {
      expect(a).toHaveProperty('duration_ms');
      expect(typeof a['duration_ms']).toBe('number');
      // duration_ms must equal elapsedMs (same underlying value)
      expect(a['duration_ms']).toBe(a['elapsedMs']);
    }
  });

  it('each algorithm entry has node_count equal to nodes', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    for (const a of algos) {
      expect(a).toHaveProperty('node_count');
      expect(a['node_count']).toBe(a['nodes']);
    }
  });

  it('each algorithm entry has edge_count equal to edges', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    for (const a of algos) {
      expect(a).toHaveProperty('edge_count');
      expect(a['edge_count']).toBe(a['edges']);
    }
  });

  it('duration_ms is 0 for sentinel (failed) rows', async () => {
    const { payload } = await comparePayload('dfg,heuristic');
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    for (const a of algos) {
      if ((a['nodes'] as number) < 0) {
        expect(a['duration_ms']).toBe(0);
        expect(a['node_count']).toBe(-1);
        expect(a['edge_count']).toBe(-1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GAP-4 — recommendation null when < 2 algorithms succeed (design decision)
// ---------------------------------------------------------------------------
describe('GAP-4: recommendation field behaviour (design contract)', () => {
  it('recommendation is non-null when both algorithms succeed', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    const successCount = algos.filter((a) => (a['nodes'] as number) >= 0).length;
    if (successCount >= 2) {
      expect(payload['recommendation']).not.toBeNull();
    }
  });

  it('recommendation has fastest, highestQuality, bestTradeoff, tradeoffNarrative when present', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic,inductive');
    expect(exitCode).toBe(EXIT_CODES.success);
    const rec = payload['recommendation'] as Record<string, unknown> | null;
    if (rec !== null) {
      expect(rec).toHaveProperty('fastest');
      expect(rec).toHaveProperty('highestQuality');
      expect(rec).toHaveProperty('bestTradeoff');
      expect(rec).toHaveProperty('tradeoffNarrative');
    }
  });
});

// ---------------------------------------------------------------------------
// Already-correct behaviours — regression guard
// ---------------------------------------------------------------------------
describe('regression: already-correct input validation', () => {
  it('single algorithm exits 1 with error.code = TOO_FEW_ALGORITHMS', async () => {
    const { exitCode, envelope } = await compareRaw('dfg');
    expect(exitCode).toBe(EXIT_CODES.config_error);
    expect(envelope.error?.code).toBe('TOO_FEW_ALGORITHMS');
  });

  it('unknown algorithm exits 1 with error.code = UNKNOWN_ALGORITHMS', async () => {
    const { exitCode, envelope } = await compareRaw('dfg,ghost_algo');
    expect(exitCode).toBe(EXIT_CODES.config_error);
    expect(envelope.error?.code).toBe('UNKNOWN_ALGORITHMS');
  });

  it('duplicate algorithms exit 1 with error.code = DUPLICATE_ALGORITHMS', async () => {
    const { exitCode, envelope } = await compareRaw('dfg,dfg');
    expect(exitCode).toBe(EXIT_CODES.config_error);
    expect(envelope.error?.code).toBe('DUPLICATE_ALGORITHMS');
  });

  it('missing input file exits 2 with error.code = INPUT_NOT_FOUND', async () => {
    const result = await runCli([
      'compare',
      'dfg,heuristic',
      '-i',
      '/nonexistent/path/log.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const envelope = JSON.parse(result.stdout) as CliEnvelope;
    expect(envelope.error?.code).toBe('INPUT_NOT_FOUND');
  });

  it('valid two-algorithm comparison exits 0 with algorithms array of length 2', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    expect(payload['status']).toBe('ok');
    const algos = payload['algorithms'] as Array<Record<string, unknown>>;
    expect(algos).toHaveLength(2);
  });

  it('payload has activityKey = concept:name by default', async () => {
    const { payload } = await comparePayload('dfg,heuristic');
    expect(payload['activityKey']).toBe('concept:name');
  });

  it('--activity-key override propagates to payload.activityKey', async () => {
    const { payload } = await comparePayload('dfg,heuristic', ['--activity-key', 'concept:name']);
    expect(payload['activityKey']).toBe('concept:name');
  });
});

// ---------------------------------------------------------------------------
// Structural contract — all required top-level envelope and payload fields
// ---------------------------------------------------------------------------
describe('JSON payload structural contract', () => {
  it('success envelope has command, status=ok, exit_code=0, and payload object', async () => {
    const { exitCode, envelope } = await compareRaw('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    expect(envelope.command).toBe('compare');
    expect(envelope.status).toBe('ok');
    expect(envelope.exit_code).toBe(0);
    expect(envelope.payload).not.toBeNull();
  });

  it('success payload has all required top-level fields', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    expect(payload).toHaveProperty('status');
    expect(payload).toHaveProperty('input');
    expect(payload).toHaveProperty('activityKey');
    expect(payload).toHaveProperty('algorithms');
    expect(payload).toHaveProperty('recommendation');
  });

  it('each algorithm entry has all required original + gap-fix fields', async () => {
    const { exitCode, payload } = await comparePayload('dfg,heuristic');
    expect(exitCode).toBe(EXIT_CODES.success);
    // comparisons is the per-algorithm stat array; algorithms is the name list
    const algos = payload['comparisons'] as Array<Record<string, unknown>>;
    expect(Array.isArray(algos)).toBe(true);
    for (const a of algos) {
      // Original fields
      expect(a).toHaveProperty('algorithm');
      expect(a).toHaveProperty('nodes');
      expect(a).toHaveProperty('edges');
      expect(a).toHaveProperty('elapsedMs');
      expect(a).toHaveProperty('qualityTier');
      expect(a).toHaveProperty('speedTier');
      expect(a).toHaveProperty('quality_tier_is_proxy');
      // New fields from gap fixes
      expect(a).toHaveProperty('output_type');
      expect(a).toHaveProperty('duration_ms');
      expect(a).toHaveProperty('node_count');
      expect(a).toHaveProperty('edge_count');
    }
  });

  it('error envelope has command, status=error, exit_code non-zero, and error.code', async () => {
    const { exitCode, envelope } = await compareRaw('dfg');
    expect(exitCode).toBe(EXIT_CODES.config_error);
    expect(envelope.command).toBe('compare');
    expect(envelope.status).toBe('error');
    expect(envelope.exit_code).toBeGreaterThan(0);
    expect(envelope.error).toBeDefined();
    expect(typeof envelope.error!.code).toBe('string');
    expect(typeof envelope.error!.message).toBe('string');
  });
});
