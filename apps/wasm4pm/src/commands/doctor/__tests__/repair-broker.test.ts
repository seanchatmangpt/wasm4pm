import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Diagnosis } from '../types.js';
import {
  executeRepairPlan,
  planRepairs,
  RepairBrokerError,
  validateRepairRegistry,
} from '../repair-broker.js';

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-doctor-'));
  roots.push(root);
  return root;
}

function warning(name: string): Diagnosis {
  return { name, severity: 'WARNING', message: 'repair required' };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('doctor repair broker', () => {
  it('admits only structured non-shell repair actions', () => {
    expect(validateRepairRegistry()).toEqual([]);
  });

  it('refuses unknown repair identities', () => {
    expect(() => planRepairs([warning('Results directory')], ['run-anything'])).toThrowError(
      RepairBrokerError
    );
    try {
      planRepairs([warning('Results directory')], ['run-anything']);
    } catch (error) {
      expect(error).toMatchObject({ code: 'UNKNOWN_REPAIR_INTENT_REFUSED' });
    }
  });

  it('does not actuate without explicit authority', () => {
    const root = workspace();
    const plan = planRepairs([warning('Results directory')]);
    const report = executeRepairPlan(plan, {
      workspaceRoot: root,
      authorized: false,
      runId: 'authority-refusal',
    });

    expect(report.standing).toBe('REFUSED');
    expect(fs.existsSync(path.join(root, '.wasm4pm'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.wasm4pm', 'results'))).toBe(false);
  });

  it('does not crown a non-empty dry-run as ALIVE', () => {
    const root = workspace();
    const plan = planRepairs([warning('Results directory')]);
    const report = executeRepairPlan(plan, {
      workspaceRoot: root,
      authorized: true,
      dryRun: true,
      runId: 'dry-run',
    });

    expect(report.standing).toBe('PARTIAL_ALIVE');
    expect(fs.existsSync(path.join(root, '.wasm4pm'))).toBe(false);
  });

  it('persists the pending receipt before an admitted filesystem repair', () => {
    const root = workspace();
    const plan = planRepairs([warning('Results directory')]);
    const report = executeRepairPlan(plan, {
      workspaceRoot: root,
      authorized: true,
      runId: 'receipt-before-do',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(report.standing).toBe('ALIVE');
    expect(fs.existsSync(path.join(root, '.wasm4pm', 'results'))).toBe(true);
    const outcome = report.outcomes[0];
    expect(outcome?.status).toBe('ALIVE');
    expect(outcome?.pending_receipt).toBeTruthy();
    expect(outcome?.outcome_receipt).toBeTruthy();
    expect(fs.existsSync(path.join(root, outcome!.pending_receipt!))).toBe(true);
    expect(fs.existsSync(path.join(root, outcome!.outcome_receipt!))).toBe(true);

    const pending = JSON.parse(
      fs.readFileSync(path.join(root, outcome!.pending_receipt!), 'utf8')
    ) as { receipt_kind: string; status: string };
    expect(pending).toMatchObject({ receipt_kind: 'pending', status: 'PENDING' });
  });

  it('preserves an existing configuration instead of overwriting it', () => {
    const root = workspace();
    const config = path.join(root, 'wasm4pm.toml');
    fs.writeFileSync(config, '[custom]\nvalue = true\n');
    const plan = planRepairs([warning('Config file')]);
    const report = executeRepairPlan(plan, {
      workspaceRoot: root,
      authorized: true,
      runId: 'preserve-config',
    });

    expect(report.outcomes[0]).toMatchObject({ status: 'ALIVE', changed: false });
    expect(fs.readFileSync(config, 'utf8')).toBe('[custom]\nvalue = true\n');
  });
});
