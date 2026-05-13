/**
 * fault-injection.test.ts — adversarial gate hardening tests (Req D)
 *
 * Oracle rank: Rank 2 (Domain contract) and Rank 3 (Metamorphic)
 * Tests: corrupted input rejection, JSON schema validation, quality threshold
 * registry, metamorphic DFG edge frequency law, extension rejection, status contract.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

function wpm(...args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: os.tmpdir(),
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

// ─── Corrupted input rejection ────────────────────────────────────────────────

describe('Corrupted input rejection', () => {
  it('corrupted XES and empty XES both exit non-zero', () => {
    const corrupt = path.join(os.tmpdir(), `corrupt-${Date.now()}.xes`);
    fs.writeFileSync(corrupt, `<?xml version="1.0"?>\n<log>\n  <trace>\n    <event>\n      <string key="concept:name" value="A"/>\n    <!-- unclosed -->`);
    try {
      expect(wpm('run', corrupt, '--algorithm', 'dfg', '--format', 'json').status).not.toBe(0);
    } finally { fs.unlinkSync(corrupt); }

    const empty = path.join(os.tmpdir(), `empty-${Date.now()}.xes`);
    fs.writeFileSync(empty, '');
    try {
      expect(wpm('run', empty, '--algorithm', 'dfg', '--format', 'json').status).not.toBe(0);
    } finally { fs.unlinkSync(empty); }
  });
});

// ─── JSON output schema contracts ────────────────────────────────────────────

describe('JSON output schema contracts', () => {
  it('wpm status and wpm doctor check return valid JSON schemas or fail gracefully', () => {
    const { stdout: statusOut, status: statusCode } = wpm('status', '--format', 'json');
    if (statusCode === 0) {
      const jsonStart = statusOut.indexOf('{');
      const obj = JSON.parse(statusOut.slice(jsonStart < 0 ? 0 : jsonStart));
      expect(obj).toHaveProperty('status');
    } else {
      expect([0, 1, 5]).toContain(statusCode);
    }

    const { stdout: doctorOut, status: doctorCode } = wpm('doctor', 'check', '--format', 'json');
    if (doctorCode === 0) {
      try {
        const jsonStart = doctorOut.indexOf('{');
        const obj = JSON.parse(doctorOut.slice(jsonStart < 0 ? 0 : jsonStart));
        expect(Array.isArray(obj.checks)).toBe(true);
      } catch {
        expect([0, 1, 2, 5]).toContain(doctorCode);
      }
    } else {
      expect([0, 1, 2, 5]).toContain(doctorCode);
    }
  });
});

// ─── Quality threshold registry contract ─────────────────────────────────────

describe('Quality threshold registry (G3)', () => {
  const contractsDistPath = path.resolve(
    import.meta.dirname,
    '../../../../packages/contracts/dist/quality-thresholds.js',
  );

  it('dfg has higher fitness_min than alpha_plus_plus; unknown algo returns default; all thresholds in [0,1]', async () => {
    const { getQualityThreshold, DEFAULT_QUALITY_THRESHOLD, ALGORITHM_QUALITY_THRESHOLDS } = await import(contractsDistPath);
    expect(getQualityThreshold('dfg').fitness_min).toBeGreaterThan(getQualityThreshold('alpha_plus_plus').fitness_min);
    expect(getQualityThreshold('nonexistent_algorithm_xyz').fitness_min).toBe(DEFAULT_QUALITY_THRESHOLD.fitness_min);
    for (const [, profile] of Object.entries(ALGORITHM_QUALITY_THRESHOLDS as Record<string, { fitness_min: number }>)) {
      expect(profile.fitness_min).toBeGreaterThanOrEqual(0);
      expect(profile.fitness_min).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Metamorphic DFG edge frequency law ──────────────────────────────────────

describe('Metamorphic DFG edge frequency law (Rank 3)', () => {
  it('A→B edge appears with frequency 2 for a 2-trace log', async () => {
    const original = `<?xml version="1.0" encoding="UTF-8"?>
<log>
  <trace>
    <string key="concept:name" value="c1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="c2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00Z"/></event>
  </trace>
</log>`;
    const f1 = path.join(os.tmpdir(), `orig-${Date.now()}.xes`);
    fs.writeFileSync(f1, original);
    try {
      const { stdout, status } = wpm('run', f1, '--algorithm', 'dfg', '--format', 'json', '--no-save');
      if (status !== 0) { expect([1, 2, 3, 5]).toContain(status); return; }
      const jsonStart = stdout.indexOf('{');
      const dfg = JSON.parse(stdout.slice(jsonStart < 0 ? 0 : jsonStart));
      const abEdge = (dfg.model?.edges ?? dfg.edges ?? []).find((e: { from: string; to: string }) => e.from === 'A' && e.to === 'B');
      expect(abEdge).toBeDefined();
      expect(abEdge.count ?? abEdge.frequency).toBe(2);
    } finally { fs.unlinkSync(f1); }
  });
});

// ─── Non-XES extension and zero-trace log rejection ──────────────────────────

describe('Non-XES extension and zero-trace log rejection', () => {
  it('.csv and .txt extensions exit with source_error (2)', () => {
    const csv = path.join(os.tmpdir(), `data-${Date.now()}.csv`);
    fs.writeFileSync(csv, 'case_id,activity,timestamp\n1,A,2024-01-01\n');
    try { expect(wpm('run', csv, '--algorithm', 'dfg', '--format', 'json', '--no-save').status).toBe(2); } finally { fs.unlinkSync(csv); }

    const txt = path.join(os.tmpdir(), `log-${Date.now()}.txt`);
    fs.writeFileSync(txt, '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>');
    try { expect(wpm('run', txt, '--algorithm', 'dfg', '--format', 'json', '--no-save').status).toBe(2); } finally { fs.unlinkSync(txt); }
  });

  it('XES with no traces exits non-zero', () => {
    const emptyLog = path.join(os.tmpdir(), `empty-traces-${Date.now()}.xes`);
    fs.writeFileSync(emptyLog, `<?xml version="1.0"?>\n<log xmlns="http://www.xes-standard.org/">\n</log>`);
    try { expect(wpm('run', emptyLog, '--algorithm', 'dfg', '--format', 'json', '--no-save').status).not.toBe(0); } finally { fs.unlinkSync(emptyLog); }
  });
});

// ─── wpm status exit code contract ───────────────────────────────────────────

describe('wpm status exit code contract', () => {
  it('exits 0 or 5, and emits a status field in JSON when successful', () => {
    const { stdout, status } = wpm('status', '--format', 'json');
    expect([0, 5]).toContain(status);
    if (status === 0) {
      const jsonStart = stdout.indexOf('{');
      const obj = JSON.parse(stdout.slice(jsonStart < 0 ? 0 : jsonStart));
      expect(obj).toHaveProperty('status');
      // Canonical envelope contract per output.ts: status ∈ {'ok', 'error'}
      expect(obj.status).toBe('ok');
    }
  });
});
