import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteSync, blake3Hex } from '../../receipts/_shared.js';
import { canonicalJson } from './vision2030.js';
import {
  executeRepairPlan as executeLegacyRepairPlan,
  type PlannedRepair,
  type RepairExecutionReport,
  type RepairOutcome,
} from './repair-broker.js';

const CHAIN_SCHEMA = 'wasm4pm.doctor-repair-chain.v1' as const;

interface AdmissionReceiptPayload {
  readonly schema_version: typeof CHAIN_SCHEMA;
  readonly receipt_kind: 'admission';
  readonly run_id: string;
  readonly workspace_root_hash: string;
  readonly plan_hash: string;
  readonly authority_hash: string;
  readonly authorized: boolean;
  readonly dry_run: boolean;
  readonly previous_receipt_hash: null;
  readonly timestamp: string;
}

interface ConsequenceArtifact {
  readonly intent_id: string;
  readonly pending_receipt?: string;
  readonly pending_receipt_hash?: string;
  readonly outcome_receipt?: string;
  readonly outcome_receipt_hash?: string;
}

interface ConsequenceReceiptPayload {
  readonly schema_version: typeof CHAIN_SCHEMA;
  readonly receipt_kind: 'consequence';
  readonly run_id: string;
  readonly workspace_root_hash: string;
  readonly plan_hash: string;
  readonly report_hash: string;
  readonly standing: RepairExecutionReport['standing'];
  readonly artifacts: readonly ConsequenceArtifact[];
  readonly previous_receipt_hash: string;
  readonly timestamp: string;
}

type AdmissionReceipt = AdmissionReceiptPayload & { readonly receipt_hash: string };
type ConsequenceReceipt = ConsequenceReceiptPayload & { readonly receipt_hash: string };

export interface RepairReceiptChainVerification {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly admission_hash?: string;
  readonly consequence_hash?: string;
}

export interface RepairReceiptChain {
  readonly admission_receipt?: string;
  readonly admission_hash?: string;
  readonly consequence_receipt?: string;
  readonly consequence_hash?: string;
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export interface HardenedRepairExecutionReport extends RepairExecutionReport {
  readonly receipt_chain: RepairReceiptChain;
}

export interface RepairExecutionOptions {
  readonly workspaceRoot: string;
  readonly authorized: boolean;
  readonly dryRun?: boolean;
  readonly now?: () => Date;
  readonly runId?: string;
}

function receiptWithHash<T extends object>(payload: T): T & { readonly receipt_hash: string } {
  return Object.freeze({
    ...payload,
    receipt_hash: blake3Hex(canonicalJson(payload)),
  });
}

function safePath(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`REPAIR_RECEIPT_PATH_ESCAPE_REFUSED: ${relative}`);
  }
  return target;
}

function relativePath(root: string, absolute: string): string {
  return path.relative(path.resolve(root), absolute).split(path.sep).join('/');
}

function writeChainReceipt(root: string, filename: string, receipt: object): string {
  const directory = safePath(root, '.wasm4pm/receipts/doctor-repair');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, filename);
  atomicWriteSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return target;
}

function hashFile(root: string, relative?: string): string | undefined {
  if (!relative) return undefined;
  const target = safePath(root, relative);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return undefined;
  return blake3Hex(fs.readFileSync(target));
}

function coreReport(report: RepairExecutionReport): RepairExecutionReport {
  return {
    schema_version: report.schema_version,
    run_id: report.run_id,
    standing: report.standing,
    authorized: report.authorized,
    dry_run: report.dry_run,
    plan: report.plan,
    outcomes: report.outcomes,
  };
}

function planHash(plan: readonly PlannedRepair[]): string {
  return blake3Hex(
    canonicalJson(
      plan.map(({ intent, required_by }) => ({
        intent: {
          id: intent.id,
          title: intent.title,
          diagnoses: intent.diagnoses,
          action: intent.action,
          reversible: intent.reversible,
        },
        required_by,
      }))
    )
  );
}

function blockedReport(
  plan: readonly PlannedRepair[],
  options: RepairExecutionOptions,
  runId: string,
  issue: string
): HardenedRepairExecutionReport {
  const outcomes: RepairOutcome[] = plan.map(({ intent }) => ({
    intent_id: intent.id,
    status: 'BLOCKED',
    changed: false,
    message: issue,
  }));
  return {
    schema_version: 'wasm4pm.doctor-repair.v1',
    run_id: runId,
    standing: 'BLOCKED',
    authorized: options.authorized,
    dry_run: Boolean(options.dryRun),
    plan,
    outcomes,
    receipt_chain: { valid: false, issues: [issue] },
  };
}

function parseReceipt<T>(root: string, relative: string): T {
  const target = safePath(root, relative);
  return JSON.parse(fs.readFileSync(target, 'utf8')) as T;
}

function validateReceiptHash(receipt: AdmissionReceipt | ConsequenceReceipt): boolean {
  const { receipt_hash: receiptHash, ...payload } = receipt;
  return receiptHash === blake3Hex(canonicalJson(payload));
}

export function verifyRepairReceiptChain(options: {
  readonly workspaceRoot: string;
  readonly admissionReceipt: string;
  readonly consequenceReceipt: string;
  readonly expectedReport?: RepairExecutionReport;
}): RepairReceiptChainVerification {
  const issues: string[] = [];
  let admission: AdmissionReceipt | undefined;
  let consequence: ConsequenceReceipt | undefined;
  try {
    admission = parseReceipt<AdmissionReceipt>(options.workspaceRoot, options.admissionReceipt);
  } catch (error) {
    issues.push(`ADMISSION_RECEIPT_UNREADABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    consequence = parseReceipt<ConsequenceReceipt>(options.workspaceRoot, options.consequenceReceipt);
  } catch (error) {
    issues.push(`CONSEQUENCE_RECEIPT_UNREADABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!admission || !consequence) return { valid: false, issues };

  if (admission.schema_version !== CHAIN_SCHEMA || admission.receipt_kind !== 'admission') {
    issues.push('ADMISSION_RECEIPT_SCHEMA_MISMATCH');
  }
  if (consequence.schema_version !== CHAIN_SCHEMA || consequence.receipt_kind !== 'consequence') {
    issues.push('CONSEQUENCE_RECEIPT_SCHEMA_MISMATCH');
  }
  if (!validateReceiptHash(admission)) issues.push('ADMISSION_RECEIPT_HASH_MISMATCH');
  if (!validateReceiptHash(consequence)) issues.push('CONSEQUENCE_RECEIPT_HASH_MISMATCH');
  if (consequence.previous_receipt_hash !== admission.receipt_hash) {
    issues.push('RECEIPT_CHAIN_LINK_MISMATCH');
  }
  if (consequence.run_id !== admission.run_id) issues.push('RECEIPT_RUN_ID_MISMATCH');
  if (consequence.workspace_root_hash !== admission.workspace_root_hash) {
    issues.push('RECEIPT_SUBJECT_MISMATCH');
  }
  if (consequence.plan_hash !== admission.plan_hash) issues.push('RECEIPT_PLAN_HASH_MISMATCH');
  if (options.expectedReport) {
    const expectedHash = blake3Hex(canonicalJson(coreReport(options.expectedReport)));
    if (consequence.report_hash !== expectedHash) issues.push('REPAIR_REPORT_HASH_MISMATCH');
  }

  for (const artifact of consequence.artifacts) {
    if (artifact.pending_receipt) {
      const actual = hashFile(options.workspaceRoot, artifact.pending_receipt);
      if (!actual || actual !== artifact.pending_receipt_hash) {
        issues.push(`PENDING_RECEIPT_HASH_MISMATCH:${artifact.intent_id}`);
      }
    }
    if (artifact.outcome_receipt) {
      const actual = hashFile(options.workspaceRoot, artifact.outcome_receipt);
      if (!actual || actual !== artifact.outcome_receipt_hash) {
        issues.push(`OUTCOME_RECEIPT_HASH_MISMATCH:${artifact.intent_id}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    admission_hash: admission.receipt_hash,
    consequence_hash: consequence.receipt_hash,
  };
}

/**
 * Public BRCE executor. It writes an admission receipt before delegating to the
 * structured broker, then chains all broker receipts into a consequence receipt.
 * If admission cannot be receipted, no actuation is attempted.
 */
export function executeRepairPlan(
  plan: readonly PlannedRepair[],
  options: RepairExecutionOptions
): HardenedRepairExecutionReport {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const runId = options.runId ?? randomUUID();
  const now = options.now ?? (() => new Date());
  const workspaceRootHash = blake3Hex(workspaceRoot);
  const admittedPlanHash = planHash(plan);
  const authorityHash = blake3Hex(
    canonicalJson({ run_id: runId, authorized: options.authorized, dry_run: Boolean(options.dryRun) })
  );
  const admission = receiptWithHash<AdmissionReceiptPayload>({
    schema_version: CHAIN_SCHEMA,
    receipt_kind: 'admission',
    run_id: runId,
    workspace_root_hash: workspaceRootHash,
    plan_hash: admittedPlanHash,
    authority_hash: authorityHash,
    authorized: options.authorized,
    dry_run: Boolean(options.dryRun),
    previous_receipt_hash: null,
    timestamp: now().toISOString(),
  });

  let admissionAbsolute: string;
  try {
    admissionAbsolute = writeChainReceipt(
      workspaceRoot,
      `${runId}-chain-admission.json`,
      admission
    );
  } catch (error) {
    return blockedReport(
      plan,
      options,
      runId,
      `PRE_ACTUATION_CHAIN_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const execution = executeLegacyRepairPlan(plan, {
    ...options,
    workspaceRoot,
    runId,
    now,
  });
  const artifacts = execution.outcomes.map<ConsequenceArtifact>((outcome) => ({
    intent_id: outcome.intent_id,
    pending_receipt: outcome.pending_receipt,
    pending_receipt_hash: hashFile(workspaceRoot, outcome.pending_receipt),
    outcome_receipt: outcome.outcome_receipt,
    outcome_receipt_hash: hashFile(workspaceRoot, outcome.outcome_receipt),
  }));
  const consequence = receiptWithHash<ConsequenceReceiptPayload>({
    schema_version: CHAIN_SCHEMA,
    receipt_kind: 'consequence',
    run_id: runId,
    workspace_root_hash: workspaceRootHash,
    plan_hash: admittedPlanHash,
    report_hash: blake3Hex(canonicalJson(coreReport(execution))),
    standing: execution.standing,
    artifacts,
    previous_receipt_hash: admission.receipt_hash,
    timestamp: now().toISOString(),
  });

  let consequenceAbsolute: string;
  try {
    consequenceAbsolute = writeChainReceipt(
      workspaceRoot,
      `${runId}-chain-consequence.json`,
      consequence
    );
  } catch (error) {
    return {
      ...execution,
      standing: 'BLOCKED',
      receipt_chain: {
        admission_receipt: relativePath(workspaceRoot, admissionAbsolute),
        admission_hash: admission.receipt_hash,
        valid: false,
        issues: [
          `CONSEQUENCE_CHAIN_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`,
        ],
      },
    };
  }

  const admissionRelative = relativePath(workspaceRoot, admissionAbsolute);
  const consequenceRelative = relativePath(workspaceRoot, consequenceAbsolute);
  const verification = verifyRepairReceiptChain({
    workspaceRoot,
    admissionReceipt: admissionRelative,
    consequenceReceipt: consequenceRelative,
    expectedReport: execution,
  });
  return {
    ...execution,
    standing: verification.valid ? execution.standing : 'BLOCKED',
    receipt_chain: {
      admission_receipt: admissionRelative,
      admission_hash: verification.admission_hash,
      consequence_receipt: consequenceRelative,
      consequence_hash: verification.consequence_hash,
      valid: verification.valid,
      issues: verification.issues,
    },
  };
}
