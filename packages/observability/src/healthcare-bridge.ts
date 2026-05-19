/**
 * Healthcare bridge: emit compliance span events for LIVE-15 and LIVE-16.
 *
 * LIVE-15: Healthcare privacy compliance — patient data with consent present.
 *   Required attributes: mcpp.healthcare.patient_data, mcpp.consent_present
 *
 * LIVE-16: MedWatch temporal filing compliance gate.
 *   Required attributes: fda.medwatch.filing, mcpp.healthcare.awareness_timestamp
 */

import type { SpineTraceRecord } from './spine-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-15: Healthcare privacy compliance
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthcarePrivacyRecord {
  patientDataPresent: boolean;
  consentPresent: boolean;
  runId: string;
  spanName?: string; // defaults to 'healthcare.privacy.check'
  tsNs?: number;
}

export function emitHealthcarePrivacyCheck(rec: HealthcarePrivacyRecord): SpineTraceRecord {
  return {
    name: rec.spanName ?? 'healthcare.privacy.check',
    kind: 'event',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'mcpp.healthcare.patient_data': rec.patientDataPresent,
      'mcpp.consent_present': rec.consentPresent,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-16: MedWatch filing compliance
// ─────────────────────────────────────────────────────────────────────────────

export interface MedWatchFilingRecord {
  filingId: string;
  awarenessTimestamp: string; // ISO-8601
  runId: string;
  tsNs?: number;
}

export function emitMedWatchFiling(rec: MedWatchFilingRecord): SpineTraceRecord {
  return {
    name: 'medwatch.filing',
    kind: 'event',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'fda.medwatch.filing': rec.filingId,
      'mcpp.healthcare.awareness_timestamp': rec.awarenessTimestamp,
    },
  };
}
