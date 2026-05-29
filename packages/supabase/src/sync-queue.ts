import * as fs from 'node:fs';
import * as path from 'node:path';
import { SupabaseIntegrationError } from './config.js';

export interface SyncQueueItem {
  id: string;
  kind: 'command_receipt' | 'truex_envelope';
  payload: Record<string, unknown>;
  enqueued_at: string;
  attempts: number;
}

export interface SyncQueueFile {
  pending: SyncQueueItem[];
}

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
    const parsed = JSON.parse(raw) as SyncQueueFile;
    if (!Array.isArray(parsed.pending)) {
      return { pending: [] };
    }
    return parsed;
  }

  private writeFile(data: SyncQueueFile): void {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
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
    const items = this.peek();
    if (items.length === 0) {
      throw new SupabaseIntegrationError('SYNC_QUEUE_EMPTY', 'Sync queue has no pending items');
    }
    return items;
  }
}

export function getDefaultSyncQueuePath(): string {
  return DEFAULT_QUEUE_PATH;
}
