// Every algorithm receipt passes through the sync queue; benchmarking queue
// operations and schema validation to catch regressions in the hot path.

import { bench, describe, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  SyncQueueItemSchema,
  SyncQueueFileSchema,
  SyncQueue,
  type SyncQueueItem,
} from '../sync-queue.js';

const FAST = { time: 100, iterations: 50 };

const tmpDir = mkdtempSync(tmpdir() + '/bench-queue-');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_ITEM: SyncQueueItem = {
  id: 'bench-item-0001',
  kind: 'command_receipt',
  payload: {
    algorithm: 'alpha_miner',
    status: 'ok',
    fitness: 0.97,
    receipt_hash: 'blake3:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
  },
  enqueued_at: '2026-06-10T00:00:00.000Z',
  attempts: 0,
};

function makeItem(index: number): SyncQueueItem {
  return {
    id: `bench-item-${String(index).padStart(4, '0')}`,
    kind: index % 2 === 0 ? 'command_receipt' : 'truex_envelope',
    payload: {
      algorithm: 'heuristic_miner',
      status: 'ok',
      fitness: 0.9 + index * 0.001,
      receipt_hash: `blake3:${index.toString(16).padStart(64, '0')}`,
    },
    enqueued_at: new Date(1749513600000 + index * 1000).toISOString(),
    attempts: 0,
  };
}

const ITEMS_10 = Array.from({ length: 10 }, (_, i) => makeItem(i));
const ITEMS_50 = Array.from({ length: 50 }, (_, i) => makeItem(i));

// ---------------------------------------------------------------------------
// 1. SyncQueueItemSchema.parse() — valid item fast path
// ---------------------------------------------------------------------------

describe('SyncQueueItemSchema.parse()', () => {
  bench('parse valid item', () => {
    SyncQueueItemSchema.parse(VALID_ITEM);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 2. SyncQueueFileSchema.parse() — file with 1 / 10 / 50 items
// ---------------------------------------------------------------------------

describe('SyncQueueFileSchema.parse()', () => {
  bench('parse file with 1 item', () => {
    SyncQueueFileSchema.parse({ pending: [VALID_ITEM] });
  }, FAST);

  bench('parse file with 10 items', () => {
    SyncQueueFileSchema.parse({ pending: ITEMS_10 });
  }, FAST);

  bench('parse file with 50 items', () => {
    SyncQueueFileSchema.parse({ pending: ITEMS_50 });
  }, FAST);
});

// ---------------------------------------------------------------------------
// 3. JSON.stringify of a SyncQueueItem — baseline
// ---------------------------------------------------------------------------

describe('JSON.stringify SyncQueueItem baseline', () => {
  bench('JSON.stringify single item', () => {
    JSON.stringify(VALID_ITEM);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 4. SyncQueue.enqueue() — single item (writes to tmpDir)
// ---------------------------------------------------------------------------

describe('SyncQueue.enqueue()', () => {
  let queue: SyncQueue;

  beforeAll(() => {
    queue = new SyncQueue(path.join(tmpDir, 'enqueue-bench.json'));
  });

  bench('enqueue single item', () => {
    queue.enqueue({
      id: `bench-enq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'command_receipt',
      payload: {
        algorithm: 'alpha_miner',
        status: 'ok',
        receipt_hash: 'blake3:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      },
    });
  }, FAST);
});

// ---------------------------------------------------------------------------
// 5. SyncQueue.dequeue() (peek) — from pre-loaded queue with 1 / 10 / 50 items
// ---------------------------------------------------------------------------

describe('SyncQueue.peek() (dequeue read)', () => {
  let queue1: SyncQueue;
  let queue10: SyncQueue;
  let queue50: SyncQueue;

  beforeAll(() => {
    const write = (file: string, items: SyncQueueItem[]) => {
      writeFileSync(file, JSON.stringify({ pending: items }, null, 2));
    };

    const p1 = path.join(tmpDir, 'peek-1.json');
    const p10 = path.join(tmpDir, 'peek-10.json');
    const p50 = path.join(tmpDir, 'peek-50.json');

    write(p1, [VALID_ITEM]);
    write(p10, ITEMS_10);
    write(p50, ITEMS_50);

    queue1 = new SyncQueue(p1);
    queue10 = new SyncQueue(p10);
    queue50 = new SyncQueue(p50);
  });

  bench('peek queue with 1 item', () => {
    queue1.peek();
  }, FAST);

  bench('peek queue with 10 items', () => {
    queue10.peek();
  }, FAST);

  bench('peek queue with 50 items', () => {
    queue50.peek();
  }, FAST);
});
