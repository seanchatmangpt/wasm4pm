/**
 * Tests for healthcare-bridge.ts
 *
 * Verifies LIVE-15 and LIVE-16 span emission:
 *   LIVE-15: emitHealthcarePrivacyCheck — mcpp.healthcare.patient_data + mcpp.consent_present
 *   LIVE-16: emitMedWatchFiling        — fda.medwatch.filing + mcpp.healthcare.awareness_timestamp
 */

import { describe, it, expect } from 'vitest';
import {
  emitHealthcarePrivacyCheck,
  emitMedWatchFiling,
} from '../healthcare-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-15: emitHealthcarePrivacyCheck
// ─────────────────────────────────────────────────────────────────────────────

describe('emitHealthcarePrivacyCheck', () => {
  it('default span name is healthcare.privacy.check', () => {
    const record = emitHealthcarePrivacyCheck({
      patientDataPresent: true,
      consentPresent: true,
      runId: 'run-live15-001',
    });
    expect(record.name).toBe('healthcare.privacy.check');
  });

  it('carries mcpp.healthcare.patient_data and mcpp.consent_present', () => {
    const record = emitHealthcarePrivacyCheck({
      patientDataPresent: true,
      consentPresent: false,
      runId: 'run-live15-002',
    });
    expect(record.fields['mcpp.healthcare.patient_data']).toBe(true);
    expect(record.fields['mcpp.consent_present']).toBe(false);
  });

  it('custom spanName overrides default', () => {
    const record = emitHealthcarePrivacyCheck({
      patientDataPresent: false,
      consentPresent: true,
      runId: 'run-live15-003',
      spanName: 'custom.privacy.audit',
    });
    expect(record.name).toBe('custom.privacy.audit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-16: emitMedWatchFiling
// ─────────────────────────────────────────────────────────────────────────────

describe('emitMedWatchFiling', () => {
  it('span name is medwatch.filing', () => {
    const record = emitMedWatchFiling({
      filingId: 'MWF-2026-001',
      awarenessTimestamp: '2026-05-17T00:00:00Z',
      runId: 'run-live16-001',
    });
    expect(record.name).toBe('medwatch.filing');
  });

  it('carries fda.medwatch.filing and mcpp.healthcare.awareness_timestamp', () => {
    const record = emitMedWatchFiling({
      filingId: 'MWF-2026-002',
      awarenessTimestamp: '2026-05-17T12:34:56Z',
      runId: 'run-live16-002',
    });
    expect(record.fields['fda.medwatch.filing']).toBe('MWF-2026-002');
    expect(record.fields['mcpp.healthcare.awareness_timestamp']).toBe('2026-05-17T12:34:56Z');
  });

  it('preserves ISO timestamp string exactly', () => {
    const iso = '2026-01-15T08:30:00.000Z';
    const record = emitMedWatchFiling({
      filingId: 'MWF-2026-003',
      awarenessTimestamp: iso,
      runId: 'run-live16-003',
    });
    expect(record.fields['mcpp.healthcare.awareness_timestamp']).toBe(iso);
  });
});
