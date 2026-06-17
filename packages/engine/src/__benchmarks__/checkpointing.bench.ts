/**
 * checkpointing.bench.ts
 *
 * Benchmarks for CheckpointManager (in-memory) and MemoryCheckpointStore
 * (async Map-backed). Long-running engine jobs checkpoint frequently —
 * save/load latency directly affects throughput.
 */

import { bench, describe } from 'vitest';
import { CheckpointManager } from '../checkpointing.js';
import { MemoryCheckpointStore } from '../checkpoint-store.js';

const RUNNING = 'running' as const;

// Pre-built fixtures (populated at module load — not inside bench callbacks)
function buildManager(n: number): CheckpointManager {
  const mgr = new CheckpointManager('bench-run');
  for (let i = 0; i < n; i++) {
    mgr.create(RUNNING, i / n);
  }
  return mgr;
}

async function buildStore(n: number): Promise<MemoryCheckpointStore> {
  const store = new MemoryCheckpointStore();
  const base = new CheckpointManager('bench-run');
  for (let i = 0; i < n; i++) {
    const cp = base.create(RUNNING, i / n, { index: i });
    await store.save(cp.id, cp);
  }
  return store;
}

const STORE_10 = await buildStore(10);
const STORE_100 = await buildStore(100);
const STORE_1000 = await buildStore(1000);

// Multi-run store: 1000 checkpoints spread across 100 runs (10 per run).
// Demonstrates O(k) filtered list() via secondary index vs O(n) without it.
async function buildMultiRunStore(runs: number, perRun: number): Promise<MemoryCheckpointStore> {
  const store = new MemoryCheckpointStore();
  for (let r = 0; r < runs; r++) {
    const mgr = new CheckpointManager(`run_${r}`);
    for (let i = 0; i < perRun; i++) {
      const cp = mgr.create(RUNNING, i / perRun, { run: r, index: i });
      await store.save(cp.id, cp);
    }
  }
  return store;
}

// 1000 entries across 100 runs — 10 checkpoints per run
const MULTI_RUN_STORE = await buildMultiRunStore(100, 10);

const MGR_100 = buildManager(100);
const LATEST_ID = MGR_100.getLatest()!.id;

// ── CheckpointManager (synchronous, in-memory) ────────────────────────────────

describe('CheckpointManager (sync, in-memory)', () => {
  bench('create() — no metadata', () => {
    const mgr = new CheckpointManager('bench');
    mgr.create(RUNNING, 0.5);
  });

  bench('create() — small metadata (3 keys)', () => {
    const mgr = new CheckpointManager('bench');
    mgr.create(RUNNING, 0.5, { step: 1, algo: 'dfg', events: 500 });
  });

  bench('create() — large metadata (20 keys)', () => {
    const mgr = new CheckpointManager('bench');
    mgr.create(RUNNING, 0.5, Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`key_${i}`, `value_${i}`])
    ));
  });

  bench('create() × 10 sequential', () => {
    const mgr = new CheckpointManager('bench');
    for (let i = 0; i < 10; i++) mgr.create(RUNNING, i / 10);
  });

  bench('getLatest() from 100-checkpoint manager', () => {
    MGR_100.getLatest();
  });

  bench('getById() from 100-checkpoint manager', () => {
    MGR_100.getById(LATEST_ID);
  });

  bench('list() from 100-checkpoint manager', () => {
    MGR_100.list();
  });

  bench('count() from 100-checkpoint manager', () => {
    MGR_100.count();
  });
});

// ── MemoryCheckpointStore (async, Map-backed) ─────────────────────────────────

describe('MemoryCheckpointStore — save', () => {
  bench('save() single checkpoint', async () => {
    const store = new MemoryCheckpointStore();
    const mgr = new CheckpointManager('bench');
    const cp = mgr.create(RUNNING, 0.5);
    await store.save(cp.id, cp);
  });
});

describe('MemoryCheckpointStore — load', () => {
  bench('load() — hit, 10-entry store', async () => {
    const entries = await STORE_10.list();
    await STORE_10.load(entries[0].id);
  });

  bench('load() — hit, 100-entry store', async () => {
    const entries = await STORE_100.list();
    await STORE_100.load(entries[0].id);
  });

  bench('load() — hit, 1000-entry store', async () => {
    const entries = await STORE_1000.list();
    await STORE_1000.load(entries[0].id);
  });

  bench('load() — miss (key not present)', async () => {
    await STORE_10.load('nonexistent_id_xyz');
  });
});

describe('MemoryCheckpointStore — list', () => {
  bench('list() — 10 entries', async () => {
    await STORE_10.list();
  });

  bench('list() — 100 entries', async () => {
    await STORE_100.list();
  });

  bench('list() — 1000 entries (all same run)', async () => {
    await STORE_1000.list();
  });

  // Secondary-index benefit: 1000 entries across 100 runs.
  // list({ runId }) uses the runIndex to return only the 10 entries for that run
  // without touching the other 990 — O(10) instead of O(1000).
  bench('list() unfiltered — 1000 entries across 100 runs', async () => {
    await MULTI_RUN_STORE.list();
  });

  bench('list() filtered by runId — 1000 entries across 100 runs (O(10) via index)', async () => {
    await MULTI_RUN_STORE.list({ runId: 'run_50' });
  });
});
