/**
 * Tests for atomvm-bridge.ts — LIVE-07 partial coverage.
 *
 * Verifies that emitAtomVmDetect and emitAtomVmSupportedSkip produce
 * SpineTraceRecords with the correct span names and required LIVE-07
 * attributes: mcpp.atomvm.state and mcpp.atomvm.evidence_ref.
 */

import { describe, it, expect } from 'vitest';
import { emitAtomVmDetect, emitAtomVmSupportedSkip, AtomVmRecord } from '../atomvm-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture
// ─────────────────────────────────────────────────────────────────────────────

const BASE_REC: AtomVmRecord = {
  state: 'detected',
  evidenceRef: 'probe://atomvm/capability-manifest/v1',
  runId: 'test-run-atomvm-001',
};

// ─────────────────────────────────────────────────────────────────────────────
// emitAtomVmDetect
// ─────────────────────────────────────────────────────────────────────────────

describe('emitAtomVmDetect', () => {
  it('span name is atomvm.detect', () => {
    const record = emitAtomVmDetect(BASE_REC);
    expect(record.name).toBe('atomvm.detect');
  });

  it('carries both required LIVE-07 attributes', () => {
    const record = emitAtomVmDetect(BASE_REC);
    expect(record.fields['mcpp.atomvm.state']).toBe('detected');
    expect(record.fields['mcpp.atomvm.evidence_ref']).toBe('probe://atomvm/capability-manifest/v1');
  });

  it('works with state detected and not_supported', () => {
    const detectedRecord = emitAtomVmDetect({ ...BASE_REC, state: 'detected' });
    expect(detectedRecord.fields['mcpp.atomvm.state']).toBe('detected');

    const notSupportedRecord = emitAtomVmDetect({ ...BASE_REC, state: 'not_supported' });
    expect(notSupportedRecord.fields['mcpp.atomvm.state']).toBe('not_supported');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitAtomVmSupportedSkip
// ─────────────────────────────────────────────────────────────────────────────

describe('emitAtomVmSupportedSkip', () => {
  it('span name is atomvm.supported_skip', () => {
    const record = emitAtomVmSupportedSkip({ ...BASE_REC, state: 'skipped' });
    expect(record.name).toBe('atomvm.supported_skip');
  });

  it('carries both required LIVE-07 attributes', () => {
    const record = emitAtomVmSupportedSkip({ ...BASE_REC, state: 'skipped' });
    expect(record.fields['mcpp.atomvm.state']).toBe('skipped');
    expect(record.fields['mcpp.atomvm.evidence_ref']).toBe('probe://atomvm/capability-manifest/v1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tsNs override
// ─────────────────────────────────────────────────────────────────────────────

describe('tsNs override', () => {
  it('both emitters use tsNs override when provided', () => {
    const fixedNs = Number(1_700_000_000n * 1_000_000_000n);

    const detectRecord = emitAtomVmDetect({ ...BASE_REC, tsNs: fixedNs });
    expect(detectRecord.ts_ns).toBe(fixedNs);

    const skipRecord = emitAtomVmSupportedSkip({ ...BASE_REC, state: 'skipped', tsNs: fixedNs });
    expect(skipRecord.ts_ns).toBe(fixedNs);
  });
});
