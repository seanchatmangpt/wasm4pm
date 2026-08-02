import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Diagnosis } from './types.js';
import { atomicWriteSync, blake3Hex } from '../../receipts/_shared.js';
import { canonicalJson } from './vision2030.js';

export type RepairIntentId =
  | 'ensure-results-directory'
  | 'scaffold-config'
  | 'install-workspace'
  | 'build-wasm'
  | 'prepare-git-hooks';

export type RepairAction =
  | {
      readonly kind: 'ensure_directory';
      readonly relative_path: string;
    }
  | {
      readonly kind: 'write_file_if_absent';
      readonly relative_path: string;
      readonly content: string;
    }
  | {
      readonly kind: 'spawn';
      readonly program: string;
      readonly args: readonly string[];
      readonly cwd_relative: string;
      readonly timeout_ms: number;
    };

export interface RepairIntent {
  readonly id: RepairIntentId;
  readonly title: string;
  readonly diagnoses: readonly string[];
  readonly action: RepairAction;
  readonly reversible: boolean;
}

export interface PlannedRepair {
  readonly intent: RepairIntent;
  readonly required_by: readonly string[];
}

export type RepairOutcomeStatus = 'PLANNED' | 'REFUSED' | 'ALIVE' | 'BLOCKED' | 'FAILED';

export interface RepairOutcome {
  readonly intent_id: RepairIntentId;
  readonly status: RepairOutcomeStatus;
  readonly changed: boolean | null;
  readonly message: string;
  readonly exit_code?: number;
  readonly pending_receipt?: string;
  readonly outcome_receipt?: string;
}

export interface RepairExecutionReport {
  readonly schema_version: 'wasm4pm.doctor-repair.v1';
  readonly run_id: string;
  readonly standing: 'ALIVE' | 'PARTIAL_ALIVE' | 'BLOCKED' | 'REFUSED';
  readonly authorized: boolean;
  readonly dry_run: boolean;
  readonly plan: readonly PlannedRepair[];
  readonly outcomes: readonly RepairOutcome[];
}

export class RepairBrokerError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_REPAIR_INTENT_REFUSED'
      | 'REPAIR_REGISTRY_INVALID'
      | 'REPAIR_PATH_ESCAPE_REFUSED',
    message: string,
    readonly alternatives: readonly string[] = []
  ) {
    super(message);
    this.name = 'RepairBrokerError';
  }
}

const DEFAULT_CONFIG = `# wasm4pm configuration — admitted by wpm system doctor fix\n[algorithm]\nname = "dfg"\n\n[execution]\nprofile = "balanced"\n`;

export const REPAIR_INTENTS: readonly RepairIntent[] = [
  {
    id: 'ensure-results-directory',
    title: 'Create the writable results directory',
    diagnoses: ['Results directory'],
    action: { kind: 'ensure_directory', relative_path: '.wasm4pm/results' },
    reversible: true,
  },
  {
    id: 'scaffold-config',
    title: 'Scaffold a default configuration when none exists',
    diagnoses: ['Config file'],
    action: {
      kind: 'write_file_if_absent',
      relative_path: 'wasm4pm.toml',
      content: DEFAULT_CONFIG,
    },
    reversible: true,
  },
  {
    id: 'install-workspace',
    title: 'Install the exact workspace dependency graph',
    diagnoses: ['Workspace integrity'],
    action: {
      kind: 'spawn',
      program: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      cwd_relative: '.',
      timeout_ms: 600_000,
    },
    reversible: false,
  },
  {
    id: 'build-wasm',
    title: 'Build the Node-target WASM package',
    diagnoses: ['WASM binary', 'WASM loads'],
    action: {
      kind: 'spawn',
      program: 'pnpm',
      args: ['run', 'build'],
      cwd_relative: 'wasm4pm',
      timeout_ms: 600_000,
    },
    reversible: true,
  },
  {
    id: 'prepare-git-hooks',
    title: 'Prepare repository-managed Git hooks',
    diagnoses: ['Git hooks'],
    action: {
      kind: 'spawn',
      program: 'pnpm',
      args: ['prepare'],
      cwd_relative: '.',
      timeout_ms: 120_000,
    },
    reversible: true,
  },
] as const;

function safeRelativePath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative)) {
    throw new RepairBrokerError(
      'REPAIR_PATH_ESCAPE_REFUSED',
      `Repair path must be non-empty and relative: ${relative}`
    );
  }
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, relative);
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new RepairBrokerError(
      'REPAIR_PATH_ESCAPE_REFUSED',
      `Repair path escapes the admitted workspace: ${relative}`
    );
  }
  return target;
}

export function validateRepairRegistry(
  registry: readonly RepairIntent[] = REPAIR_INTENTS
): readonly string[] {
  const violations: string[] = [];
  const ids = new Set<string>();
  for (const intent of registry) {
    if (ids.has(intent.id)) violations.push(`duplicate intent id: ${intent.id}`);
    ids.add(intent.id);
    if (intent.diagnoses.length === 0) violations.push(`${intent.id}: no diagnosis mapping`);
    if (intent.action.kind === 'spawn') {
      if (!intent.action.program || intent.action.program.includes(' ')) {
        violations.push(`${intent.id}: spawn program must be one executable token`);
      }
      if (intent.action.args.some((arg) => /[;&|`$<>\n\r]/.test(arg))) {
        violations.push(`${intent.id}: shell metacharacter in structured argument`);
      }
    }
  }
  return violations;
}

export function planRepairs(
  diagnoses: readonly Diagnosis[],
  only?: readonly string[]
): readonly PlannedRepair[] {
  const violations = validateRepairRegistry();
  if (violations.length > 0) {
    throw new RepairBrokerError(
      'REPAIR_REGISTRY_INVALID',
      `Repair registry refused: ${violations.join('; ')}`
    );
  }

  const available = REPAIR_INTENTS.map((intent) => intent.id).sort();
  const requested = only?.filter(Boolean) ?? [];
  const unknown = requested.filter((id) => !available.includes(id as RepairIntentId));
  if (unknown.length > 0) {
    throw new RepairBrokerError(
      'UNKNOWN_REPAIR_INTENT_REFUSED',
      `Unknown repair intent: ${unknown.join(', ')}`,
      available
    );
  }

  const unhealthyNames = new Set(
    diagnoses.filter((diagnosis) => diagnosis.severity !== 'INFO').map((diagnosis) => diagnosis.name)
  );

  return REPAIR_INTENTS.filter((intent) => {
    if (requested.length > 0 && !requested.includes(intent.id)) return false;
    return intent.diagnoses.some((name) => unhealthyNames.has(name));
  }).map((intent) => ({
    intent,
    required_by: intent.diagnoses.filter((name) => unhealthyNames.has(name)),
  }));
}

interface RepairReceipt {
  readonly schema_version: 'wasm4pm.doctor-repair-receipt.v1';
  readonly receipt_kind: 'pending' | 'outcome';
  readonly run_id: string;
  readonly intent_id: RepairIntentId;
  readonly action_hash: string;
  readonly status: 'PENDING' | RepairOutcomeStatus;
  readonly changed?: boolean | null;
  readonly exit_code?: number;
  readonly stdout_hash?: string;
  readonly stderr_hash?: string;
  readonly timestamp: string;
}

function writeRepairReceipt(
  receiptDir: string,
  receipt: RepairReceipt
): string {
  fs.mkdirSync(receiptDir, { recursive: true });
  const filename = `${receipt.run_id}-${receipt.intent_id}-${receipt.receipt_kind}.json`;
  const target = path.join(receiptDir, filename);
  atomicWriteSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return target;
}

function receiptPathForOutput(workspaceRoot: string, absolutePath: string): string {
  const relative = path.relative(workspaceRoot, absolutePath);
  return relative && !relative.startsWith('..') ? relative : path.basename(absolutePath);
}

function executeAction(
  workspaceRoot: string,
  action: RepairAction
): { changed: boolean | null; exitCode: number; stdout: string; stderr: string; message: string } {
  switch (action.kind) {
    case 'ensure_directory': {
      const target = safeRelativePath(workspaceRoot, action.relative_path);
      if (fs.existsSync(target)) {
        if (!fs.statSync(target).isDirectory()) {
          return {
            changed: false,
            exitCode: 1,
            stdout: '',
            stderr: '',
            message: `${action.relative_path} exists but is not a directory`,
          };
        }
        return {
          changed: false,
          exitCode: 0,
          stdout: '',
          stderr: '',
          message: `${action.relative_path} already exists`,
        };
      }
      fs.mkdirSync(target, { recursive: true });
      return {
        changed: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        message: `Created ${action.relative_path}`,
      };
    }
    case 'write_file_if_absent': {
      const target = safeRelativePath(workspaceRoot, action.relative_path);
      if (fs.existsSync(target)) {
        return {
          changed: false,
          exitCode: 0,
          stdout: '',
          stderr: '',
          message: `Preserved existing ${action.relative_path}`,
        };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, action.content, { encoding: 'utf8', flag: 'wx' });
      return {
        changed: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        message: `Created ${action.relative_path}`,
      };
    }
    case 'spawn': {
      const cwd = safeRelativePath(workspaceRoot, action.cwd_relative);
      const child = spawnSync(action.program, [...action.args], {
        cwd,
        shell: false,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: action.timeout_ms,
        maxBuffer: 4 * 1024 * 1024,
      });
      const stdout = child.stdout ?? '';
      const stderr = child.stderr ?? '';
      if (child.error) {
        return {
          changed: false,
          exitCode: typeof child.status === 'number' ? child.status : 1,
          stdout,
          stderr,
          message: child.error.message,
        };
      }
      const exitCode = child.status ?? 1;
      return {
        changed: null,
        exitCode,
        stdout,
        stderr,
        message:
          exitCode === 0
            ? `${action.program} ${action.args.join(' ')} completed`
            : `${action.program} exited with code ${exitCode}`,
      };
    }
  }
}

function reportStanding(outcomes: readonly RepairOutcome[]): RepairExecutionReport['standing'] {
  if (outcomes.some((outcome) => outcome.status === 'BLOCKED')) return 'BLOCKED';
  if (outcomes.some((outcome) => outcome.status === 'REFUSED')) return 'REFUSED';
  if (outcomes.some((outcome) => outcome.status === 'FAILED')) return 'PARTIAL_ALIVE';
  return 'ALIVE';
}

export function executeRepairPlan(
  plan: readonly PlannedRepair[],
  options: {
    readonly workspaceRoot: string;
    readonly authorized: boolean;
    readonly dryRun?: boolean;
    readonly now?: () => Date;
    readonly runId?: string;
  }
): RepairExecutionReport {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const runId = options.runId ?? randomUUID();
  const now = options.now ?? (() => new Date());

  if (options.dryRun) {
    const outcomes = plan.map<RepairOutcome>(({ intent }) => ({
      intent_id: intent.id,
      status: 'PLANNED',
      changed: false,
      message: 'Dry-run only; no actuation occurred.',
    }));
    return {
      schema_version: 'wasm4pm.doctor-repair.v1',
      run_id: runId,
      standing: plan.length === 0 ? 'ALIVE' : 'PARTIAL_ALIVE',
      authorized: options.authorized,
      dry_run: true,
      plan,
      outcomes,
    };
  }

  if (plan.length === 0) {
    return {
      schema_version: 'wasm4pm.doctor-repair.v1',
      run_id: runId,
      standing: 'ALIVE',
      authorized: options.authorized,
      dry_run: Boolean(options.dryRun),
      plan,
      outcomes: [],
    };
  }

  if (!options.authorized) {
    const outcomes = plan.map<RepairOutcome>(({ intent }) => ({
      intent_id: intent.id,
      status: 'REFUSED',
      changed: false,
      message: 'ACTUATION_AUTHORITY_REQUIRED: pass --yes to authorize this admitted plan.',
    }));
    return {
      schema_version: 'wasm4pm.doctor-repair.v1',
      run_id: runId,
      standing: 'REFUSED',
      authorized: false,
      dry_run: false,
      plan,
      outcomes,
    };
  }

  const receiptDir = safeRelativePath(workspaceRoot, '.wasm4pm/receipts/doctor-repair');
  const outcomes: RepairOutcome[] = [];

  for (const { intent } of plan) {
    const actionHash = blake3Hex(canonicalJson(intent.action));
    let pendingReceipt: string;
    try {
      pendingReceipt = writeRepairReceipt(receiptDir, {
        schema_version: 'wasm4pm.doctor-repair-receipt.v1',
        receipt_kind: 'pending',
        run_id: runId,
        intent_id: intent.id,
        action_hash: actionHash,
        status: 'PENDING',
        timestamp: now().toISOString(),
      });
    } catch (error) {
      outcomes.push({
        intent_id: intent.id,
        status: 'BLOCKED',
        changed: false,
        message: `PRE_ACTUATION_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    let executed: ReturnType<typeof executeAction>;
    try {
      executed = executeAction(workspaceRoot, intent.action);
    } catch (error) {
      executed = {
        changed: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const status: RepairOutcomeStatus = executed.exitCode === 0 ? 'ALIVE' : 'FAILED';
    let outcomeReceipt: string | undefined;
    try {
      outcomeReceipt = writeRepairReceipt(receiptDir, {
        schema_version: 'wasm4pm.doctor-repair-receipt.v1',
        receipt_kind: 'outcome',
        run_id: runId,
        intent_id: intent.id,
        action_hash: actionHash,
        status,
        changed: executed.changed,
        exit_code: executed.exitCode,
        stdout_hash: blake3Hex(executed.stdout),
        stderr_hash: blake3Hex(executed.stderr),
        timestamp: now().toISOString(),
      });
    } catch (error) {
      outcomes.push({
        intent_id: intent.id,
        status: 'BLOCKED',
        changed: executed.changed,
        exit_code: executed.exitCode,
        pending_receipt: receiptPathForOutput(workspaceRoot, pendingReceipt),
        message: `OUTCOME_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    outcomes.push({
      intent_id: intent.id,
      status,
      changed: executed.changed,
      exit_code: executed.exitCode,
      pending_receipt: receiptPathForOutput(workspaceRoot, pendingReceipt),
      outcome_receipt: receiptPathForOutput(workspaceRoot, outcomeReceipt),
      message: executed.message,
    });
  }

  return {
    schema_version: 'wasm4pm.doctor-repair.v1',
    run_id: runId,
    standing: reportStanding(outcomes),
    authorized: true,
    dry_run: false,
    plan,
    outcomes,
  };
}
