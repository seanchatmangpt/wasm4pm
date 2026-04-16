/**
 * Audit Store — Immutable audit trail for autonomous agent corrections
 *
 * Stores all agent corrections with BLAKE3-referenced snapshots
 * for rollback support. Uses JSON file storage for portability.
 */
import type { AuditEntry, CorrectionType, Severity } from './types.js';
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
export declare class AuditStore {
    private storePath;
    private entries;
    private dirty;
    constructor(storePath?: string);
    /** Load audit entries from disk */
    private _load;
    /** Save audit entries to disk */
    save(): void;
    /** Log a new audit entry */
    log(entry: AuditEntry): void;
    /** Query audit entries with filters */
    query(filter?: AuditQuery): AuditEntry[];
    /** Get the last N entries */
    getLast(n?: number): AuditEntry[];
    /** Get the last entry for a specific agent */
    getLastForAgent(agentName: string): AuditEntry | null;
    /** Get entries for a specific artifact */
    getForArtifact(artifactId: string): AuditEntry[];
    /** Get summary statistics */
    getSummary(): AuditSummary;
    /** Get total entry count */
    get count(): number;
    /** Clear all entries (for testing) */
    clear(): void;
    /** Get the store path */
    get path(): string;
}
//# sourceMappingURL=audit.d.ts.map