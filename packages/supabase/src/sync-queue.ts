import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// SyncQueueItem
// ---------------------------------------------------------------------------

export const SyncQueueItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['command_receipt', 'truex_envelope']),
  payload: z.record(z.string(), z.unknown()),
  enqueued_at: z.string(),
  attempts: z.number(),
});

export type SyncQueueItem = z.infer<typeof SyncQueueItemSchema>;

// ---------------------------------------------------------------------------
// SyncQueueFile
// ---------------------------------------------------------------------------

export const SyncQueueFileSchema = z.object({
  pending: z.array(SyncQueueItemSchema),
});

export type SyncQueueFile = z.infer<typeof SyncQueueFileSchema>;

const DEFAULT_QUEUE_PATH = '.wasm4pm/sync-queue.json';

export class SyncQueue {
  private filepath: string;

  constructor(filepath: string = DEFAULT_QUEUE_PATH) {
    this.filepath = path.resolve(filepath);
  }

  private readFile(): SyncQueueFile {
    if (!fs.existsSync(this.filepath)) {
      return { pending: [] };
    }
    const raw = fs.readFileSync(this.filepath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupt queue file — treat as empty rather than crashing the enqueue
      // path. The bad file will be overwritten on the next write.
      return { pending: [] };
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as SyncQueueFile).pending)) {
      return { pending: [] };
    }
    return parsed as SyncQueueFile;
  }

  private writeFile(data: SyncQueueFile): void {
    const dir = path.dirname(this.filepath);
    // Use recursive:true unconditionally — avoids the TOCTOU race between
    // existsSync and mkdirSync when two processes both enqueue simultaneously.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filepath, JSON.stringify(data, null, 2));
  }

  enqueue(item: Omit<SyncQueueItem, 'enqueued_at' | 'attempts'>): void {
    const data = this.readFile();
    data.pending.push({
      ...item,
      enqueued_at: new Date().toISOString(),
      attempts: 0,
    });
    this.writeFile(data);
  }

  peek(): SyncQueueItem[] {
    return this.readFile().pending;
  }

  /** Remove items whose ids are listed. */
  ack(ids: string[]): void {
    const data = this.readFile();
    const idSet = new Set(ids);
    data.pending = data.pending.filter((item) => !idSet.has(item.id));
    this.writeFile(data);
  }

  /** Increment attempt counter for failed flush. */
  markAttempt(id: string): void {
    const data = this.readFile();
    const item = data.pending.find((p) => p.id === id);
    if (item) {
      item.attempts += 1;
    }
    this.writeFile(data);
  }

  flushPending(): SyncQueueItem[] {
    return this.peek();
  }
}

export function getDefaultSyncQueuePath(): string {
  return DEFAULT_QUEUE_PATH;
}
