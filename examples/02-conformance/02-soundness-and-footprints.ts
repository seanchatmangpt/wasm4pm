/**
 * Example — WF-net Soundness and Footprint Analysis
 *
 * Demonstrates: `check_wf_net_soundness()`, `discover_footprints()`
 * Docs reference: WASM_API.md § Conformance — WF-net Soundness;  WASM_API.md § Footprint Analysis
 *
 * WF-net soundness checks three classical properties (van der Aalst, Definition 3.5):
 *   1. Option to complete — the final marking is reachable from every reachable marking
 *   2. No dead transitions — every transition can fire in some reachable marking (weak liveness)
 *   3. Bounded — no place exceeds 100 tokens at bounded-depth 50
 *
 * Footprint analysis produces an Alpha-style behavioral relation matrix over activities:
 *   - Causal     (i→j): i directly precedes j but j never precedes i
 *   - CausalInv  (j→i): inverse
 *   - Parallel   (i↔j): both i→j and j→i appear in the log
 *   - NeverFollows: no direct succession in either direction
 *
 * The example fails if either API is absent or returns a structurally invalid result,
 * making it a regression witness for both capabilities.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

interface SoundnessReport {
  is_sound: boolean;
  is_sound_and_safe: boolean;
  is_safe: boolean;
  option_to_complete: boolean;
  no_dead_transitions: boolean;
  reason?: string;
}

type FootprintRelation = 'Causal' | 'CausalInv' | 'Parallel' | 'NeverFollows';

interface FootprintMatrix {
  activities: string[];
  matrix: FootprintRelation[][];
}

async function main(): Promise<void> {
  logger.header('🔬', 'WF-net Soundness + Footprint Analysis', 'Structural correctness and behavioral relations');

  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  // ── Step 1: Load event log ───────────────────────────────────────────────────
  logger.step(1, 4, 'Loading event log');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load event log');
  logger.success(`Log loaded. Handle: ${logHandle.slice(0, 8)}...`);

  // ── Step 2: Discover Petri net (Alpha++) to get a WF-net handle ─────────────
  logger.step(2, 4, 'Discovering Petri net via Alpha++');
  const pnResult = await kernel.run('alpha_plus_plus', logHandle, { activityKey: 'concept:name' });
  assert.ok(pnResult.handle, 'Alpha++ discovery returned no handle');
  logger.success(`Petri net discovered. Handle: ${pnResult.handle.slice(0, 8)}...`);

  // ── Step 3: Check WF-net soundness ──────────────────────────────────────────
  logger.step(3, 4, 'Checking WF-net soundness (check_wf_net_soundness)');
  const soundnessRaw = (core as any).check_wf_net_soundness(pnResult.handle);
  const soundness: SoundnessReport = JSON.parse(
    typeof soundnessRaw === 'string' ? soundnessRaw : JSON.stringify(soundnessRaw)
  );

  // Structural contract: all three properties must be present in the result
  assert.ok(typeof soundness.is_sound === 'boolean', 'Soundness result missing is_sound field');
  assert.ok(typeof soundness.option_to_complete === 'boolean', 'Soundness result missing option_to_complete');
  assert.ok(typeof soundness.no_dead_transitions === 'boolean', 'Soundness result missing no_dead_transitions');

  logger.data('Soundness report', {
    is_sound: soundness.is_sound,
    is_safe: soundness.is_safe,
    option_to_complete: soundness.option_to_complete,
    no_dead_transitions: soundness.no_dead_transitions,
    reason: soundness.reason,
  });

  // The capability is exercised: we got a real report. Sound or not is an
  // empirical property of the mined net — we assert structure, not outcome.
  logger.success(`WF-net soundness checked. Result: ${soundness.is_sound ? 'SOUND ✅' : 'UNSOUND ⚠️'}`);
  if (!soundness.is_sound && soundness.reason) {
    logger.warn(`Soundness violation: ${soundness.reason}`);
  }

  // ── Step 4: Discover footprint matrix ────────────────────────────────────────
  logger.step(4, 4, 'Discovering footprint matrix (discover_footprints)');
  const footprintRaw = (core as any).discover_footprints(logHandle, 'concept:name');
  const footprint: FootprintMatrix = JSON.parse(
    typeof footprintRaw === 'string' ? footprintRaw : JSON.stringify(footprintRaw)
  );

  // Structural contract: activities list + square matrix
  assert.ok(Array.isArray(footprint.activities), 'Footprint result missing activities array');
  assert.ok(Array.isArray(footprint.matrix), 'Footprint result missing matrix');
  assert.strictEqual(
    footprint.matrix.length,
    footprint.activities.length,
    'Footprint matrix dimensions must match activity count'
  );
  for (const row of footprint.matrix) {
    assert.strictEqual(row.length, footprint.activities.length, 'Footprint matrix is not square');
    for (const rel of row) {
      assert.ok(
        ['Causal', 'CausalInv', 'Parallel', 'NeverFollows'].includes(rel),
        `Unexpected footprint relation: ${rel}`
      );
    }
  }

  // Report the causal pairs — the load-bearing content of footprint analysis
  const causalPairs: string[] = [];
  for (let i = 0; i < footprint.activities.length; i++) {
    for (let j = 0; j < footprint.activities.length; j++) {
      if (footprint.matrix[i][j] === 'Causal') {
        causalPairs.push(`${footprint.activities[i]} → ${footprint.activities[j]}`);
      }
    }
  }

  logger.success(`Footprint matrix: ${footprint.activities.length} activities, ${causalPairs.length} causal pairs`);
  for (const pair of causalPairs.slice(0, 8)) {
    logger.info(`  Causal: ${pair}`);
  }
  if (causalPairs.length > 8) {
    logger.info(`  ... and ${causalPairs.length - 8} more`);
  }

  // The contract: at least one Causal relation must exist in any non-trivial event log
  assert.ok(causalPairs.length > 0, 'Footprint matrix has no Causal relations — log may be empty or trivial');

  logger.info('✅ WF-net soundness and footprint analysis witness complete.');
}

main().catch(err => {
  console.error('Soundness/footprints example failed:', err);
  process.exit(1);
});
