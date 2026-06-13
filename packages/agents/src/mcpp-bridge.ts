/**
 * mcpp-bridge.ts — Bridge from mcpp agent output format to AgentOrchestrator.
 *
 * Closes GAP-1 from the mcpp-agent-pipeline audit:
 *   mcpp emits OCEL events (via fromMcppNativeJsonl or directly) where
 *   activities starting with "agent." carry autonomous agent correction records.
 *   This module converts those OCEL events into AuditEntry objects that
 *   AgentOrchestrator's AuditStore can ingest.
 *
 * ## Integration path
 *
 * ```
 * mcpp NDJSON  ──fromMcppNativeJsonl()──▶  OcelEvent[]
 * OcelEvent[]  ──mcppEventToAuditEntry()──▶  AuditEntry | null
 * AuditEntry   ──ingestMcppJsonl()──▶  AgentOrchestrator.getAuditStore().log()
 * ```
 *
 * ## Event shape expected from mcpp
 *
 * mcpp native format (before OCEL adaptation):
 * ```json
 * {
 *   "id": "evt-001",
 *   "activity": "agent.diagnose",
 *   "time": "2026-05-18T10:00:00Z",
 *   "attrs": {
 *     "agent_name": "receipt-chain-attacker",
 *     "correction_type": "receipt_chain_repair",
 *     "artifact_id": "mcpp-run-001",
 *     "success": true
 *   }
 * }
 * ```
 *
 * After OCEL adaptation by fromMcppNativeJsonl():
 * ```json
 * {
 *   "ocel:eid":       "evt-001",
 *   "ocel:activity":  "agent.diagnose",
 *   "ocel:timestamp": "2026-05-18T10:00:00Z",
 *   "ocel:omap":      [],
 *   "ocel:vmap":      { "agent_name": "receipt-chain-attacker", "correction_type": "receipt_chain_repair", "artifact_id": "mcpp-run-001", "success": true }
 * }
 * ```
 *
 * ## AuditEntry mapping
 *
 * | AuditEntry field        | Source                                           |
 * |-------------------------|--------------------------------------------------|
 * | timestamp               | ocel:timestamp                                   |
 * | agent_name              | ocel:vmap.agent_name (string)                    |
 * | correction_type         | ocel:vmap.correction_type (CorrectionType)       |
 * | correction_success      | ocel:vmap.success (boolean)                      |
 * | artifact_id             | ocel:vmap.artifact_id (string) or ocel:omap[0]  |
 * | correction_action       | "${ocel:activity} via mcpp"                       |
 * | violation               | synthesised from vmap fields                     |
 * | correction_details      | remaining ocel:vmap fields                       |
 * | snapshot_data           | null                                             |
 *
 * Non-agent events (ocel:activity does not start with "agent.") produce null.
 */

import { fromMcppNativeJsonl } from '@wasm4pm/contracts/ocel-bridge';
import type { OcelEvent } from '@wasm4pm/contracts/ocel-bridge';
import { z } from 'zod';
import type { AgentOrchestrator } from './orchestration.js';
import type { AuditEntry, CorrectionType, Severity } from './types.js';

// ── CorrectionType allow-list ─────────────────────────────────────────────────

/**
 * The full set of valid CorrectionType values from types.ts.
 * Incoming strings are validated against this set; unknown strings fall back to
 * 'process_correction' to avoid a hard failure on forward-compatible extensions.
 */
const VALID_CORRECTION_TYPES: ReadonlySet<string> = new Set<CorrectionType>([
  'config_restoration',
  'evidence_repair',
  'code_refactoring',
  'process_correction',
  'authority_restoration',
  'stub_elimination',
  'receipt_chain_repair',
]);

/** Coerce an arbitrary string to a valid CorrectionType. */
function toValidCorrectionType(raw: unknown): CorrectionType {
  if (typeof raw === 'string' && VALID_CORRECTION_TYPES.has(raw)) {
    return raw as CorrectionType;
  }
  return 'process_correction';
}

// ── Severity coercion ─────────────────────────────────────────────────────────

function toValidSeverity(raw: unknown): Severity {
  if (raw === 'critical' || raw === 'warning') return raw;
  return 'warning';
}

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert a single OCEL event from mcpp into an AuditEntry for AgentOrchestrator.
 *
 * Returns null for events whose `ocel:activity` does not start with `"agent."` —
 * those are manufacturing stage events, not agent correction events.
 *
 * Also returns null when required fields (`agent_name`, `correction_type`) are
 * missing or empty from `ocel:vmap`.
 *
 * @param event - An OcelEvent produced by fromMcppNativeJsonl() or fromMcppJsonl()
 * @returns AuditEntry if this is a valid agent event; null otherwise
 */
export function mcppEventToAuditEntry(event: OcelEvent): AuditEntry | null {
  const activity = event['ocel:activity'];

  // Only process agent-originated events
  if (!activity.startsWith('agent.')) {
    return null;
  }

  const vmap = event['ocel:vmap'];

  // agent_name is required
  const agentName = typeof vmap['agent_name'] === 'string' && vmap['agent_name'].length > 0
    ? vmap['agent_name']
    : null;
  if (agentName === null) {
    return null;
  }

  // correction_type is required (coerced to valid value)
  const correctionType = toValidCorrectionType(vmap['correction_type']);

  // success can be boolean or string "true"/"false"
  const rawSuccess = vmap['success'];
  const success: boolean =
    typeof rawSuccess === 'boolean'
      ? rawSuccess
      : rawSuccess === 'true';

  // artifact_id: prefer vmap field, fall back to first omap entry, then null
  const rawArtifactId = vmap['artifact_id'];
  const artifactId: string | null =
    typeof rawArtifactId === 'string' && rawArtifactId.length > 0
      ? rawArtifactId
      : event['ocel:omap'].length > 0
        ? event['ocel:omap'][0]
        : null;

  const timestamp = event['ocel:timestamp'];
  const severity = toValidSeverity(vmap['severity']);

  // violation_type: use vmap field if present, otherwise derive from activity suffix
  const violationType =
    typeof vmap['violation_type'] === 'string' && vmap['violation_type'].length > 0
      ? vmap['violation_type']
      : activity.replace(/^agent\./, '');

  // Remaining vmap fields become correction_details (excluding the fields we've consumed)
  const usedKeys = new Set(['agent_name', 'correction_type', 'success', 'artifact_id', 'severity', 'violation_type', 'outcome', 'session_id', 'part_name']);
  const correctionDetails: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vmap)) {
    if (!usedKeys.has(k)) {
      correctionDetails[k] = v;
    }
  }

  const entry: AuditEntry = {
    timestamp,
    agent_name: agentName,
    correction_type: correctionType,
    violation: {
      agent_name: agentName,
      violation_type: violationType,
      severity,
      evidence: correctionDetails,
      process_mining_proof: null,
      timestamp,
      blocked_manufacturing: severity === 'critical',
      target: artifactId ?? agentName,
    },
    correction_action: `${activity} via mcpp`,
    correction_success: success,
    correction_details: correctionDetails,
    artifact_id: artifactId,
    snapshot_data: null,
  };

  return entry;
}

// ── Batch ingestion ───────────────────────────────────────────────────────────

/**
 * Result of ingesting mcpp NDJSON into an AgentOrchestrator.
 */
export const IngestResultSchema = z.object({
  /** Number of agent events successfully converted and ingested */
  ingested: z.number(),
  /** Number of lines that were skipped (non-agent events, parse errors, missing fields) */
  skipped: z.number(),
});
export type IngestResult = z.infer<typeof IngestResultSchema>;

/**
 * Parse mcpp NDJSON output, convert agent events to AuditEntry objects, and
 * ingest them into the given AgentOrchestrator's AuditStore.
 *
 * Processing rules:
 * - Blank lines are silently skipped (counted as skipped)
 * - Lines with JSON parse errors are silently skipped (counted as skipped)
 * - Lines whose parsed event is not a valid mcpp native or OCEL event are skipped
 * - OCEL events whose `ocel:activity` does not start with `"agent."` are skipped
 * - OCEL events with missing required fields (agent_name) are skipped
 * - Valid agent events are ingested via `orchestrator.getAuditStore().log(entry)`
 *
 * The function calls `auditStore.save()` once at the end if any entries were ingested.
 *
 * @param orchestrator - The AgentOrchestrator whose AuditStore will receive entries
 * @param ndjson       - Newline-delimited JSON string from mcpp output
 * @returns Counts of ingested and skipped events
 */
export function ingestMcppJsonl(
  orchestrator: AgentOrchestrator,
  ndjson: string,
): IngestResult {
  const lines = ndjson.split('\n');
  let ingested = 0;
  let skipped = 0;

  const auditStore = orchestrator.getAuditStore();

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed.length === 0) {
      skipped++;
      continue;
    }

    // Adapt mcpp native or OCEL events to OcelEvent format
    let ocelEvents: OcelEvent[];
    try {
      ocelEvents = fromMcppNativeJsonl(trimmed);
    } catch {
      skipped++;
      continue;
    }

    if (ocelEvents.length === 0) {
      skipped++;
      continue;
    }

    // Process each adapted event (one line → one event via fromMcppNativeJsonl)
    for (const ocelEvent of ocelEvents) {
      const entry = mcppEventToAuditEntry(ocelEvent);
      if (entry === null) {
        skipped++;
      } else {
        auditStore.log(entry);
        ingested++;
      }
    }
  }

  // Persist ingested entries to disk (no-op if 0 entries)
  if (ingested > 0) {
    auditStore.save();
  }

  return { ingested, skipped };
}
