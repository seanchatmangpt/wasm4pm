/**
 * Audit Store — Immutable audit trail for autonomous agent corrections
 *
 * Stores all agent corrections with BLAKE3-referenced snapshots
 * for rollback support. Uses JSON file storage for portability.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { z } from 'zod';
import type { AuditEntry, CorrectionType } from './types.js';
import { CorrectionTypeSchema, SeveritySchema } from './types.js';

/** Query filter for audit entries */
export const AuditQuerySchema = z.object({
  /** Filter by agent name */
  agent: z.string().optional(),
  /** Filter by correction type */
  correction_type: CorrectionTypeSchema.optional(),
  /** Filter by severity */
  severity: SeveritySchema.optional(),
  /** Filter by success/failure */
  success: z.boolean().optional(),
  /** Maximum number of entries to return */
  limit: z.number().optional(),
  /** Start timestamp (ISO string) */
  since: z.string().optional(),
  /** End timestamp (ISO string) */
  until: z.string().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

/** Audit summary statistics */
export const AuditSummarySchema = z.object({
  /** Total entries */
  total_entries: z.number(),
  /** Entries by agent */
  by_agent: z.record(z.string(), z.number()),
  /** Entries by correction type */
  by_correction_type: z.record(CorrectionTypeSchema, z.number()),
  /** Success rate */
  success_rate: z.number(),
  /** Critical corrections */
  critical_count: z.number(),
  /** Most recent timestamp */
  last_activity: z.string().nullable(),
});
export type AuditSummary = z.infer<typeof AuditSummarySchema>;

/**
 * Audit Store — persistent storage for agent correction audit trail
 */
export class AuditStore {
  private storePath: string;
  private entries: AuditEntry[] = [];
  private dirty: boolean = false;

  constructor(storePath?: string) {
    this.storePath = storePath || join(process.cwd(), '.wasm4pm', 'agents', 'audit.jsonl');
    this._load();
  }

  /** Load audit entries from disk */
  private _load(): void {
    if (!existsSync(this.storePath)) {
      this.entries = [];
      return;
    }

    try {
      const raw = readFileSync(this.storePath, 'utf-8');
      const lines = raw.split('\n').filter((line) => line.trim());
      this.entries = lines.map((line) => JSON.parse(line));
    } catch {
      this.entries = [];
    }
  }

  /** Save audit entries to disk */
  save(): void {
    if (!this.dirty) return;

    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = this.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    writeFileSync(this.storePath, content, 'utf-8');
    this.dirty = false;
  }

  /** Log a new audit entry */
  log(entry: AuditEntry): void {
    this.entries.push(entry);
    this.dirty = true;
  }

  /** Query audit entries with filters */
  query(filter: AuditQuery = {}): AuditEntry[] {
    let results = [...this.entries];

    if (filter.agent) {
      results = results.filter((e) => e.agent_name === filter.agent);
    }

    if (filter.correction_type) {
      results = results.filter((e) => e.correction_type === filter.correction_type);
    }

    if (filter.severity) {
      results = results.filter((e) => e.violation.severity === filter.severity);
    }

    if (filter.success !== undefined) {
      results = results.filter((e) => e.correction_success === filter.success);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      results = results.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (filter.until) {
      const untilTime = new Date(filter.until).getTime();
      results = results.filter((e) => new Date(e.timestamp).getTime() <= untilTime);
    }

    if (filter.limit && filter.limit > 0) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /** Get the last N entries */
  getLast(n: number = 10): AuditEntry[] {
    return this.entries.slice(-n);
  }

  /** Get the last entry for a specific agent */
  getLastForAgent(agentName: string): AuditEntry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].agent_name === agentName) {
        return this.entries[i];
      }
    }
    return null;
  }

  /** Get entries for a specific artifact */
  getForArtifact(artifactId: string): AuditEntry[] {
    return this.entries.filter((e) => e.artifact_id === artifactId);
  }

  /** Get summary statistics */
  getSummary(): AuditSummary {
    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let successCount = 0;
    let criticalCount = 0;

    for (const entry of this.entries) {
      // By agent
      byAgent[entry.agent_name] = (byAgent[entry.agent_name] || 0) + 1;

      // By correction type
      byType[entry.correction_type] = (byType[entry.correction_type] || 0) + 1;

      // Success/failure
      if (entry.correction_success) {
        successCount++;
      }

      // Critical severity
      if (entry.violation.severity === 'critical') {
        criticalCount++;
      }
    }

    return {
      total_entries: this.entries.length,
      by_agent: byAgent,
      by_correction_type: byType as Record<CorrectionType, number>,
      success_rate: this.entries.length > 0 ? successCount / this.entries.length : 0,
      critical_count: criticalCount,
      last_activity:
        this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
    };
  }

  /** Get total entry count */
  get count(): number {
    return this.entries.length;
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries = [];
    this.dirty = true;
    this.save();
  }

  /** Get the store path */
  get path(): string {
    return this.storePath;
  }
}
