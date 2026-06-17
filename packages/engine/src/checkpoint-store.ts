/**
 * checkpoint-store.ts
 * SQLite-backed persistent checkpoint storage
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Checkpoint } from './checkpointing.js';

export const CheckpointMetadataSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sequenceNumber: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  progress: z.number(),
  sizeBytes: z.number(),
});

export type CheckpointMetadata = z.infer<typeof CheckpointMetadataSchema>;

export const RunFilterSchema = z.object({
  runId: z.string().optional(),
  minSequence: z.number().optional(),
  maxSequence: z.number().optional(),
  beforeDate: z.date().optional(),
  afterDate: z.date().optional(),
});

export type RunFilter = z.infer<typeof RunFilterSchema>;

export interface ICheckpointStore {
  save(id: string, checkpoint: Checkpoint): Promise<void>;
  load(id: string): Promise<Checkpoint | null>;
  list(filter?: RunFilter): Promise<CheckpointMetadata[]>;
  delete(id: string): Promise<void>;
  deleteByRunId(runId: string): Promise<number>;
}

export class MemoryCheckpointStore implements ICheckpointStore {
  private store = new Map<string, Checkpoint>();

  async save(id: string, checkpoint: Checkpoint): Promise<void> {
    this.store.set(id, { ...checkpoint });
  }

  async load(id: string): Promise<Checkpoint | null> {
    return this.store.get(id) || null;
  }

  async list(filter?: RunFilter): Promise<CheckpointMetadata[]> {
    let checkpoints = Array.from(this.store.values());
    if (filter?.runId) {
      checkpoints = checkpoints.filter((cp) => cp.runId === filter.runId);
    }
    return checkpoints.map((cp) => ({
      id: cp.id,
      runId: cp.runId,
      sequenceNumber: cp.sequenceNumber,
      createdAt: cp.timestamp,
      updatedAt: cp.timestamp,
      progress: cp.progress,
      sizeBytes: JSON.stringify(cp).length,
    }));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async deleteByRunId(runId: string): Promise<number> {
    let deleted = 0;
    const entries = Array.from(this.store.entries());
    for (const [id, cp] of entries) {
      if (cp.runId === runId) {
        this.store.delete(id);
        deleted++;
      }
    }
    return deleted;
  }
}

export class FileCheckpointStore implements ICheckpointStore {
  private baseDir: string;

  constructor(baseDir = '.wasm4pm/checkpoints') {
    this.baseDir = baseDir;
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getCheckpointPath(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safe}.json`);
  }

  async save(id: string, checkpoint: Checkpoint): Promise<void> {
    this.ensureDir();
    const filePath = this.getCheckpointPath(id);
    const data = {
      id: checkpoint.id,
      runId: checkpoint.runId,
      timestamp: checkpoint.timestamp.toISOString(),
      sequenceNumber: checkpoint.sequenceNumber,
      state: checkpoint.state,
      progress: checkpoint.progress,
      metadata: checkpoint.metadata,
      savedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async load(id: string): Promise<Checkpoint | null> {
    const filePath = this.getCheckpointPath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          try {
            const parsed = JSON.parse(data);
            const checkpoint: Checkpoint = {
              id: parsed.id,
              runId: parsed.runId,
              timestamp: new Date(parsed.timestamp),
              sequenceNumber: parsed.sequenceNumber,
              state: parsed.state,
              progress: parsed.progress,
              metadata: parsed.metadata,
            };
            resolve(checkpoint);
          } catch (e) {
            reject(e);
          }
        }
      });
    });
  }

  async list(filter?: RunFilter): Promise<CheckpointMetadata[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(this.baseDir, (err, files) => {
        if (err) {
          reject(err);
          return;
        }

        const promises = files
          .filter((f) => f.endsWith('.json'))
          .map((f) => {
            const filePath = path.join(this.baseDir, f);
            return new Promise<CheckpointMetadata | null>((res) => {
              fs.readFile(filePath, 'utf-8', (readErr, data) => {
                if (readErr) {
                  res(null);
                } else {
                  try {
                    const parsed = JSON.parse(data);
                    const stat = fs.statSync(filePath);
                    const meta: CheckpointMetadata = {
                      id: parsed.id,
                      runId: parsed.runId,
                      sequenceNumber: parsed.sequenceNumber,
                      createdAt: new Date(parsed.timestamp),
                      updatedAt: new Date(parsed.savedAt || parsed.timestamp),
                      progress: parsed.progress,
                      sizeBytes: stat.size,
                    };
                    res(meta);
                  } catch {
                    res(null);
                  }
                }
              });
            });
          });

        Promise.all(promises)
          .then((results) => {
            let checkpoints = results.filter((m) => m !== null) as CheckpointMetadata[];
            if (filter?.runId) {
              checkpoints = checkpoints.filter((m) => m.runId === filter.runId);
            }
            resolve(checkpoints.sort((a, b) => a.sequenceNumber - b.sequenceNumber));
          })
          .catch(reject);
      });
    });
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getCheckpointPath(id);
    return new Promise((resolve, reject) => {
      fs.rm(filePath, { force: true }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteByRunId(runId: string): Promise<number> {
    const metadatas = await this.list({ runId });
    let deleted = 0;
    for (const meta of metadatas) {
      try {
        await this.delete(meta.id);
        deleted++;
      } catch {
        // Continue
      }
    }
    return deleted;
  }
}
