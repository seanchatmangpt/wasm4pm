import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Diagnosis } from '../types.js';
import { planRepairs } from '../repair-broker.js';
import { executeRepairPlan, verifyRepairReceiptChain } from '../repair-execution.js';

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-brce-'));
  roots.push(root);
  return root;
}

function warning(name: string): Diagnosis {
  return { name, severity: 'WARNING', message: 'repair required', observation: 'EXECUTED' };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('hardened doctor repair execution', () => {
  it('chains subject, authority, plan, pending receipts, outcomes, and consequence', () => {
    const root = workspace();
    const report = executeRepairPlan(planRepairs([warning('Results directory')]), {
      workspaceRoot: root,
      authorized: true,
      runId: 'chained-repair',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(report.standing).toBe('ALIVE');
    expect(report.receipt_chain.valid).toBe(true);
    expect(report.receipt_chain.admission_receipt).toBeTruthy();
    expect(report.receipt_chain.consequence_receipt).toBeTruthy();
    expect(fs.existsSync(path.join(root, '.wasm4pm', 'results'))).toBe(true);

    const replay = verifyRepairReceiptChain({
      workspaceRoot: root,
      admissionReceipt: report.receipt_chain.admission_receipt!,
      consequenceReceipt: report.receipt_chain.consequence_receipt!,
      expectedReport: report,
    });
    expect(replay).toMatchObject({ valid: true, issues: [] });
  });

  it('detects tampering in a broker outcome receipt', () => {
    const root = workspace();
    const report = executeRepairPlan(planRepairs([warning('Results directory')]), {
      workspaceRoot: root,
      authorized: true,
      runId: 'tamper-repair',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });
    const outcomePath = path.join(root, report.outcomes[0]!.outcome_receipt!);
    fs.appendFileSync(outcomePath, '\nTAMPERED\n');

    const replay = verifyRepairReceiptChain({
      workspaceRoot: root,
      admissionReceipt: report.receipt_chain.admission_receipt!,
      consequenceReceipt: report.receipt_chain.consequence_receipt!,
      expectedReport: report,
    });
    expect(replay.valid).toBe(false);
    expect(replay.issues).toContain('OUTCOME_RECEIPT_HASH_MISMATCH:ensure-results-directory');
  });

  it('refuses actuation when the pre-actuation chain receipt cannot be written', () => {
    const root = workspace();
    fs.mkdirSync(path.join(root, '.wasm4pm', 'receipts'), { recursive: true });
    fs.writeFileSync(path.join(root, '.wasm4pm', 'receipts', 'doctor-repair'), 'blocked');

    const report = executeRepairPlan(planRepairs([warning('Results directory')]), {
      workspaceRoot: root,
      authorized: true,
      runId: 'blocked-admission',
    });

    expect(report.standing).toBe('BLOCKED');
    expect(report.receipt_chain.valid).toBe(false);
    expect(report.receipt_chain.issues[0]).toMatch(/PRE_ACTUATION_CHAIN_RECEIPT_BLOCKED/);
    expect(fs.existsSync(path.join(root, '.wasm4pm', 'results'))).toBe(false);
  });
});
