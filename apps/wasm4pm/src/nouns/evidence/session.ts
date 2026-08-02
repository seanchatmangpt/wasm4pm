import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { EXIT_CODES } from '../../exit-codes.js';
import { atomicWriteSync, blake3Hex } from '../../receipts/_shared.js';
import {
  VISION_SESSION_SCHEMA,
  VisionSessionError,
  canonicalVisionJson,
  executeVisionSession,
  replayVisionSession,
  type OcelPowlWasmModule,
  type VisionSessionEvidence,
  type VisionSessionOptions,
} from '../../vision/session-v2.js';

type SessionMode = 'run' | 'replay';

interface PendingReceipt {
  readonly schema_version: 'wasm4pm.vision-session-actuation.v1';
  readonly receipt_kind: 'pending';
  readonly run_id: string;
  readonly mode: SessionMode;
  readonly status: 'PENDING';
  readonly input_hash: string;
  readonly config_hash: string;
  readonly expected_evidence_hash?: string;
}

interface OutcomeReceipt {
  readonly schema_version: 'wasm4pm.vision-session-actuation.v1';
  readonly receipt_kind: 'outcome';
  readonly run_id: string;
  readonly mode: SessionMode;
  readonly status: 'ALIVE' | 'REFUSED' | 'BLOCKED';
  readonly input_hash: string;
  readonly evidence_hash?: string;
  readonly replay_standing?: 'ALIVE' | 'BLOCKED';
  readonly refusal_code?: string;
  readonly message?: string;
  readonly session_path?: string;
}

function workspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function relativeUnix(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseFiniteNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw NounVerbError.invalidInput(`${label} must be numeric`);
  return parsed;
}

function sessionOptions(args: Record<string, unknown>): VisionSessionOptions {
  const objectType = String(args['object-type'] ?? '').trim();
  if (!objectType) throw NounVerbError.invalidInput('--object-type is required');
  return {
    groupByObjectType: objectType,
    variant: String(args.variant ?? 'decision_graph_cyclic_strict'),
    activityKey: String(args['activity-key'] ?? 'concept:name'),
    minTraceCount: parseFiniteNumber(args['min-trace-count'], 1, '--min-trace-count'),
    noiseThreshold: parseFiniteNumber(args['noise-threshold'], 0, '--noise-threshold'),
    maxIters: parseFiniteNumber(args['max-iters'], 3, '--max-iters'),
  };
}

function evidenceSelfHash(evidence: VisionSessionEvidence): string {
  const { evidence_hash: _ignored, ...unsigned } = evidence;
  return blake3Hex(canonicalVisionJson(unsigned));
}

function readExpectedSession(filePath: string): VisionSessionEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw NounVerbError.invalidInput(
      `Cannot read session '${filePath}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw NounVerbError.invalidInput('Session evidence must be a JSON object');
  }
  const evidence = parsed as VisionSessionEvidence;
  if (evidence.schema_version !== VISION_SESSION_SCHEMA) {
    throw NounVerbError.invalidInput(
      `Unsupported session schema: ${String(evidence.schema_version)}`
    );
  }
  if (typeof evidence.evidence_hash !== 'string' || evidenceSelfHash(evidence) !== evidence.evidence_hash) {
    throw NounVerbError.invalidInput('Session evidence self-hash does not recompute');
  }
  return evidence;
}

function makeRunId(inputHash: string, mode: SessionMode, config: unknown, expected?: string): string {
  return blake3Hex(
    canonicalVisionJson({ input_hash: inputHash, mode, config, expected_evidence_hash: expected })
  ).slice(0, 32);
}

export const sessionVerb = defineVerb({
  noun: 'evidence',
  verb: 'session',
  summary:
    'Manufacture or replay one exact OCEL-v2 → POWL → WASM evidence session with pre-actuation and outcome receipts',
  args: {
    input: {
      type: 'positional',
      description: 'Path to an OCEL-v2 JSON subject',
      required: true,
    },
    mode: {
      type: 'string',
      description: 'run | replay (default: run)',
    },
    session: {
      type: 'string',
      description: 'Expected session evidence path (required for --mode replay)',
    },
    'object-type': {
      type: 'string',
      description: 'OCEL object type used to manufacture process episodes',
      required: true,
    },
    variant: {
      type: 'string',
      description: 'POWL discovery variant (default: decision_graph_cyclic_strict)',
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
    },
    'min-trace-count': {
      type: 'string',
      description: 'Minimum trace count (default: 1)',
    },
    'noise-threshold': {
      type: 'string',
      description: 'Noise threshold in [0,1] (default: 0)',
    },
    'max-iters': {
      type: 'string',
      description: 'POWL execution loop bound in [0,255] (default: 3)',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not persist session evidence; pending/outcome receipts remain mandatory',
    },
  } as const,
  handler: async (args, ctx) => {
    const mode = String(args.mode ?? 'run') as SessionMode;
    if (mode !== 'run' && mode !== 'replay') {
      throw NounVerbError.invalidInput(`Unknown --mode '${mode}'. Valid: run, replay`);
    }
    const inputPath = path.resolve(ctx.cwd, String(args.input));
    let content: string;
    try {
      content = fs.readFileSync(inputPath, 'utf8');
    } catch (error) {
      throw NounVerbError.invalidInput(
        `Cannot read OCEL subject '${inputPath}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const options = sessionOptions(args as unknown as Record<string, unknown>);
    const inputHash = blake3Hex(content);
    const root = workspaceRoot(ctx.cwd);
    let expected: VisionSessionEvidence | undefined;
    if (mode === 'replay') {
      if (!args.session) throw NounVerbError.invalidInput('--session is required for --mode replay');
      expected = readExpectedSession(path.resolve(ctx.cwd, String(args.session)));
    }
    const runId = makeRunId(inputHash, mode, options, expected?.evidence_hash);
    const receiptDir = path.join(root, '.wasm4pm/receipts/vision-session');
    const pendingPath = path.join(receiptDir, `${runId}.pending.json`);
    const outcomePath = path.join(receiptDir, `${runId}.outcome.json`);
    const defaultSessionPath = path.join(root, '.wasm4pm/sessions', `${runId}.json`);

    const pending: PendingReceipt = {
      schema_version: 'wasm4pm.vision-session-actuation.v1',
      receipt_kind: 'pending',
      run_id: runId,
      mode,
      status: 'PENDING',
      input_hash: inputHash,
      config_hash: blake3Hex(canonicalVisionJson(options)),
      ...(expected ? { expected_evidence_hash: expected.evidence_hash } : {}),
    };
    try {
      writeJsonAtomic(pendingPath, pending);
    } catch (error) {
      throw NounVerbError.permissionDenied(
        `PRE_ACTUATION_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as unknown as OcelPowlWasmModule;
      const observed = await executeVisionSession(wasm, content, options);
      if (mode === 'replay' && expected) {
        const replay = replayVisionSession(expected, observed);
        const outcome: OutcomeReceipt = {
          schema_version: 'wasm4pm.vision-session-actuation.v1',
          receipt_kind: 'outcome',
          run_id: runId,
          mode,
          status: replay.standing,
          input_hash: inputHash,
          evidence_hash: observed.evidence_hash,
          replay_standing: replay.standing,
          message:
            replay.standing === 'ALIVE'
              ? 'REPLAY_MATCH'
              : `Replay mismatches: ${replay.mismatches.join(', ')}`,
        };
        writeJsonAtomic(outcomePath, outcome);
        return {
          standing: replay.standing,
          run_id: runId,
          replay,
          evidence: observed,
          pending_receipt: relativeUnix(root, pendingPath),
          outcome_receipt: relativeUnix(root, outcomePath),
          exitCode:
            replay.standing === 'ALIVE' ? EXIT_CODES.success : EXIT_CODES.conformance_fail,
        };
      }

      let savedPath: string | undefined;
      if (!args['no-save']) {
        writeJsonAtomic(defaultSessionPath, observed);
        savedPath = relativeUnix(root, defaultSessionPath);
      }
      const outcome: OutcomeReceipt = {
        schema_version: 'wasm4pm.vision-session-actuation.v1',
        receipt_kind: 'outcome',
        run_id: runId,
        mode,
        status: 'ALIVE',
        input_hash: inputHash,
        evidence_hash: observed.evidence_hash,
        ...(savedPath ? { session_path: savedPath } : {}),
      };
      writeJsonAtomic(outcomePath, outcome);
      return {
        standing: 'ALIVE',
        run_id: runId,
        evidence: observed,
        session_path: savedPath,
        pending_receipt: relativeUnix(root, pendingPath),
        outcome_receipt: relativeUnix(root, outcomePath),
        exitCode: EXIT_CODES.success,
      };
    } catch (error) {
      if (error instanceof VisionSessionError) {
        const outcome: OutcomeReceipt = {
          schema_version: 'wasm4pm.vision-session-actuation.v1',
          receipt_kind: 'outcome',
          run_id: runId,
          mode,
          status: 'REFUSED',
          input_hash: inputHash,
          refusal_code: error.code,
          message: error.message,
        };
        writeJsonAtomic(outcomePath, outcome);
        return {
          standing: 'REFUSED',
          run_id: runId,
          refusal: { code: error.code, message: error.message, details: error.details },
          pending_receipt: relativeUnix(root, pendingPath),
          outcome_receipt: relativeUnix(root, outcomePath),
          exitCode: EXIT_CODES.source_error,
        };
      }
      const outcome: OutcomeReceipt = {
        schema_version: 'wasm4pm.vision-session-actuation.v1',
        receipt_kind: 'outcome',
        run_id: runId,
        mode,
        status: 'BLOCKED',
        input_hash: inputHash,
        message: error instanceof Error ? error.message : String(error),
      };
      writeJsonAtomic(outcomePath, outcome);
      throw NounVerbError.executionError(outcome.message ?? 'Vision session blocked', error);
    }
  },
  human: (result: Record<string, unknown>) => {
    const standing = String(result.standing ?? 'UNKNOWN');
    const session = result.session_path ? ` session=${String(result.session_path)}` : '';
    return `[${standing}] vision-session run=${String(result.run_id ?? 'unknown')}${session}`;
  },
});
