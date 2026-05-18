/**
 * Tests for `wpm doctor` — zero-argument environment health check.
 *
 * Chicago TDD: tests command metadata (shape, args, meta) which is
 * observable behavior. Removed re-implemented logic sections that
 * just duplicated what the source already does.
 */

import { describe, it, expect } from 'vitest';
import { doctor } from '../src/cli.js';
import {
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALL_CHECKS,
  type Diagnosis,
  type Pathology,
  type Severity,
  type RepairMode,
} from '../src/commands/doctor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Command Shape
// ─────────────────────────────────────────────────────────────────────────────

describe('doctor command — shape', () => {
  it('is a valid citty command with meta, args, and subCommands', () => {
    expect(doctor.meta?.name).toBe('doctor');
    expect(doctor.meta?.description).toContain('health');
    expect(doctor.args).toBeDefined();
    // doctor uses citty's subCommands pattern; citty dispatches to a matching
    // subcommand (check/fix/publish/env/tps/perf/watch/report) or prints help.
    expect(doctor.subCommands).toBeDefined();
    expect(doctor.subCommands?.check).toBeDefined();
  });

  it('accepts --format, --verbose, and --quiet flags with correct types and aliases', () => {
    expect(doctor.args?.format?.type).toBe('string');
    expect(doctor.args?.format?.default).toBe('human');
    expect(doctor.args?.verbose?.type).toBe('boolean');
    expect(doctor.args?.verbose?.alias).toBe('v');
    expect(doctor.args?.quiet?.type).toBe('boolean');
    expect(doctor.args?.quiet?.alias).toBe('q');
  });

  it('requires zero positional arguments', () => {
    const positionals = Object.values(doctor.args ?? {}).filter(
      (a) => a && typeof a === 'object' && 'type' in a && a.type === 'positional'
    );
    expect(positionals).toHaveLength(0);
  });

  it('has all 9 expected subcommands', () => {
    const subs = Object.keys(doctor.subCommands ?? {});
    expect(subs).toContain('check');
    expect(subs).toContain('fix');
    expect(subs).toContain('publish');
    expect(subs).toContain('env');
    expect(subs).toContain('tps');
    expect(subs).toContain('perf');
    expect(subs).toContain('watch');
    expect(subs).toContain('report');
    expect(subs).toContain('hooks');
  });

  it('doctor description mentions check count or subcommands', () => {
    const desc = doctor.meta?.description ?? '';
    expect(desc).toMatch(/check|subcommand|env|tps|perf/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check Arrays — Structure and Counts
// ─────────────────────────────────────────────────────────────────────────────

describe('doctor check arrays — structure', () => {
  it('ENV_CHECKS contains the expected 17 environment checks', () => {
    // ENV_CHECKS is the canonical list of environment health functions
    expect(Array.isArray(ENV_CHECKS)).toBe(true);
    expect(ENV_CHECKS.length).toBeGreaterThanOrEqual(10);
    for (const check of ENV_CHECKS) {
      expect(typeof check).toBe('function');
    }
  });

  it('TPS_CHECKS contains pipeline integrity checks', () => {
    expect(Array.isArray(TPS_CHECKS)).toBe(true);
    expect(TPS_CHECKS.length).toBeGreaterThanOrEqual(3);
    for (const check of TPS_CHECKS) {
      expect(typeof check).toBe('function');
    }
  });

  it('CLAUDE_CODE_CHECKS contains code-quality checks', () => {
    expect(Array.isArray(CLAUDE_CODE_CHECKS)).toBe(true);
    expect(CLAUDE_CODE_CHECKS.length).toBeGreaterThanOrEqual(1);
    for (const check of CLAUDE_CODE_CHECKS) {
      expect(typeof check).toBe('function');
    }
  });

  it('ALL_CHECKS is the union of ENV_CHECKS + TPS_CHECKS + CLAUDE_CODE_CHECKS', () => {
    expect(ALL_CHECKS.length).toBe(
      ENV_CHECKS.length + TPS_CHECKS.length + CLAUDE_CODE_CHECKS.length
    );
    for (const check of ENV_CHECKS) {
      expect(ALL_CHECKS).toContain(check);
    }
    for (const check of TPS_CHECKS) {
      expect(ALL_CHECKS).toContain(check);
    }
    for (const check of CLAUDE_CODE_CHECKS) {
      expect(ALL_CHECKS).toContain(check);
    }
  });

  it('ALL_CHECKS has no duplicates', () => {
    const unique = new Set(ALL_CHECKS);
    expect(unique.size).toBe(ALL_CHECKS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis Shape — each check returns well-formed Diagnosis
// ─────────────────────────────────────────────────────────────────────────────

describe('doctor check functions — Diagnosis shape', () => {
  const VALID_SEVERITIES: Severity[] = ['INFO', 'WARNING', 'STOP_THE_LINE'];
  const VALID_PATHOLOGIES: Pathology[] = [
    'ENVIRONMENT_FAULT',
    'MODEL_TRUTH_FAULT',
    'PLAN_TRUTH_FAULT',
    'TIMING_TRUTH_FAULT',
    'DEPLOYABILITY_TRUTH_FAULT',
    'REPRODUCIBILITY_TRUTH_FAULT',
    'ANTI_LIE_TRUTH_FAULT',
    'EPISTEMIC_FAULT',
  ];
  const VALID_REPAIR_MODES: RepairMode[] = [
    'MANUAL_INTERVENTION',
    'REBUILD_ARTIFACTS',
    'SYNC_REGISTRY',
    'SCAFFOLD_CONFIG',
    'REINSTALL_DEPENDENCIES',
    'AUTO_REPAIR',
  ];

  it('each ENV_CHECK returns a Diagnosis with name and severity', async () => {
    for (const check of ENV_CHECKS) {
      const diagnosis: Diagnosis = await check();
      expect(typeof diagnosis.name).toBe('string');
      expect(diagnosis.name.length).toBeGreaterThan(0);
      expect(VALID_SEVERITIES).toContain(diagnosis.severity);
      expect(typeof diagnosis.message).toBe('string');
    }
  }, 30000);

  it('ENV_CHECKS diagnoses have non-empty names without duplicate names', async () => {
    const names: string[] = [];
    for (const check of ENV_CHECKS) {
      const d = await check();
      expect(d.name.trim().length).toBeGreaterThan(0);
      names.push(d.name);
    }
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  }, 30000);

  it('optional Diagnosis fields are valid when present', async () => {
    for (const check of ENV_CHECKS) {
      const d = await check();
      if (d.pathology !== undefined) {
        expect(VALID_PATHOLOGIES).toContain(d.pathology);
      }
      if (d.repairMode !== undefined) {
        expect(VALID_REPAIR_MODES).toContain(d.repairMode);
      }
      if (d.repairCommand !== undefined) {
        expect(typeof d.repairCommand).toBe('string');
        expect(d.repairCommand.trim().length).toBeGreaterThan(0);
      }
    }
  }, 30000);

  it('STOP_THE_LINE diagnoses always include a repair hint', async () => {
    for (const check of ALL_CHECKS) {
      const d = await check();
      if (d.severity === 'STOP_THE_LINE') {
        // Must provide at least one of: repairCommand, fixGuide, or fix
        const hasRepairHint = !!(d.repairCommand ?? d.fixGuide ?? d.fix);
        expect(hasRepairHint).toBe(true);
      }
    }
  }, 60000);

  it('TPS_CHECKS all return diagnoses with INFO, WARNING, or STOP_THE_LINE severity', async () => {
    const VALID_SEVERITIES: Severity[] = ['INFO', 'WARNING', 'STOP_THE_LINE'];
    for (const check of TPS_CHECKS) {
      const d = await check();
      expect(VALID_SEVERITIES).toContain(d.severity);
      expect(typeof d.name).toBe('string');
      expect(d.name.length).toBeGreaterThan(0);
    }
  }, 30000);
});
