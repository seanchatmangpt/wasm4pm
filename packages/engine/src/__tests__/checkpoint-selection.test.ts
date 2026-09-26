import { describe, expect, test } from 'vitest';
import {
  CheckpointSequenceConflictError,
  MemoryCheckpointStore,
  filterAndOrderCheckpointMetadata,
  selectLatestCheckpointMetadata,
  type CheckpointMetadata,
} from '../checkpoint-store.js';
import type { Checkpoint } from '../checkpointing.js';

function metadata(id: string, sequenceNumber: number, createdAt: string): CheckpointMetadata {
  const at = new Date(createdAt);
  return {
    id,
    runId: 'run-1',
    sequenceNumber,
    createdAt: at,
    updatedAt: at,
    progress: sequenceNumber / 10,
    sizeBytes: 100,
  };
}

function checkpoint(id: string, sequenceNumber: number): Checkpoint {
  return {
    id,
    runId: 'run-1',
    timestamp: new Date(`2026-09-25T20:00:0${sequenceNumber}.000Z`),
    sequenceNumber,
    state: 'ready',
    progress: sequenceNumber / 10,
  };
}

describe('checkpoint recovery selection', () => {
  test('selection is semantic-sequence ordered rather than store iteration ordered', async () => {
    const store = new MemoryCheckpointStore();
    await store.save('cp-3', checkpoint('cp-3', 3));
    await store.save('cp-1', checkpoint('cp-1', 1));
    await store.save('cp-2', checkpoint('cp-2', 2));

    const listed = await store.list({ runId: 'run-1' });
    expect(listed.map((item) => item.sequenceNumber)).toEqual([1, 2, 3]);
    expect(selectLatestCheckpointMetadata(listed)?.id).toBe('cp-3');
  });

  test('the complete RunFilter contract is applied by the shared selector', () => {
    const entries = [
      metadata('cp-1', 1, '2026-09-25T20:00:01.000Z'),
      metadata('cp-2', 2, '2026-09-25T20:00:02.000Z'),
      metadata('cp-3', 3, '2026-09-25T20:00:03.000Z'),
    ];
    const filtered = filterAndOrderCheckpointMetadata(entries, {
      runId: 'run-1',
      minSequence: 2,
      maxSequence: 3,
      afterDate: new Date('2026-09-25T20:00:01.500Z'),
      beforeDate: new Date('2026-09-25T20:00:03.500Z'),
    });
    expect(filtered.map((item) => item.id)).toEqual(['cp-2', 'cp-3']);
  });

  test('duplicate highest sequence is refused rather than broken by path or timestamp', () => {
    const entries = [
      metadata('provider-a/path/cp', 7, '2026-09-25T20:00:00.000Z'),
      metadata('provider-b/path/cp', 7, '2026-09-25T22:00:00.000Z'),
    ];
    expect(() => selectLatestCheckpointMetadata(entries))
      .toThrow(CheckpointSequenceConflictError);
    expect(() => selectLatestCheckpointMetadata(entries))
      .toThrow(/CHECKPOINT_SEQUENCE_CONFLICT/);
  });
});
