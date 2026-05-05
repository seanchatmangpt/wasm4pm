/**
 * Audit Store — Immutable audit trail for autonomous agent corrections
 *
 * Stores all agent corrections with BLAKE3-referenced snapshots
 * for rollback support. Uses JSON file storage for portability.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { AuditEntry, CorrectionType, Severity, VanDerAalstAgentName } from './types.js';

/** Query filter for audit entries */
export interface AuditQuery {
  /** Filter by agent name */
  agent?: string;
  /** Filter by correction type */
  correction_type?: CorrectionType;
  /** Filter by severity */
  severity?: Severity;
  /** Filter by success/failure */
  success?: boolean;
  /** Maximum number of entries to return */
  limit?: number;
  /** Start timestamp (ISO string) */
  since?: string;
  /** End timestamp (ISO string) */
  until?: string;
}

/** Audit summary statistics */
export interface AuditSummary {
  /** Total entries */
  total_entries: number;
  /** Entries by agent */
  by_agent: Record<string, number>;
  /** Entries by correction type */
  by_correction_type: Record<CorrectionType, number>;
  /** Success rate */
  success_rate: number;
  /** Critical corrections */
  critical_count: number;
  /** Most recent timestamp */
  last_activity: string | null;
}

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
      last_activity: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
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
