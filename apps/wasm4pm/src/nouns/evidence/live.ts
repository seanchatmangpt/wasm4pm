import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { EXIT_CODES } from '../../exit-codes.js';
import { atomicWriteSync, blake3Hex } from '../../receipts/_shared.js';
import {
  verifyReleaseCertificate,
  type ReleaseCertificateV2,
} from '../../release/certificate.js';
import {
  AAT_LIVE_SCHEMA,
  evaluateAatLive,
  replayAatLive,
  type AatLiveVerdict,
  type McpPlusProof,
  type WeaverAdmission,
} from '../../vision/aat-live.js';
import type { VisionSessionEvidence } from '../../vision/session-v2.js';

function workspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function readText(cwd: string, value: unknown, label: string): string {
  if (!value) throw NounVerbError.invalidInput(`${label} is required`);
  const target = path.resolve(cwd, String(value));
  try {
    return fs.readFileSync(target, 'utf8');
  } catch (error) {
    throw NounVerbError.invalidInput(
      `Cannot read ${label} '${target}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function readJson<T>(cwd: string, value: unknown, label: string): T {
  try {
    return JSON.parse(readText(cwd, value, label)) as T;
  } catch (error) {
    if (error instanceof NounVerbError) throw error;
    throw NounVerbError.invalidInput(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeUnix(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

export const liveVerb = defineVerb({
  noun: 'evidence',
  verb: 'live',
  summary:
    'Admit and replay the signed AAT-Live → Weaver → POWL → wasm4pm → MCP+ chain',
  args: {
    trace: { type: 'string', description: 'AAT observation trace NDJSON', required: true },
    session: { type: 'string', description: 'OCEL→POWL→WASM session evidence', required: true },
    weaver: { type: 'string', description: 'Signed Weaver admission report', required: true },
    proof: { type: 'string', description: 'Signed MCP+ proof envelope', required: true },
    mode: { type: 'string', description: 'run | replay (default: run)' },
    expected: { type: 'string', description: 'Expected AAT-Live verdict for replay mode' },
    'no-save': {
      type: 'boolean',
      description: 'Do not persist verdict/passport artifacts; receipts remain mandatory',
    },
  } as const,
  handler: async (args, ctx) => {
    const mode = String(args.mode ?? 'run');
    if (mode !== 'run' && mode !== 'replay') {
      throw NounVerbError.invalidInput(`Unknown --mode '${mode}'. Valid: run, replay`);
    }
    if (mode === 'replay' && !args.expected) {
      throw NounVerbError.invalidInput('--expected is required for --mode replay');
    }

    const root = workspaceRoot(ctx.cwd);
    const traceText = readText(ctx.cwd, args.trace, '--trace');
    const session = readJson<VisionSessionEvidence>(ctx.cwd, args.session, '--session');
    const weaver = readJson<WeaverAdmission>(ctx.cwd, args.weaver, '--weaver');
    const proof = readJson<McpPlusProof>(ctx.cwd, args.proof, '--proof');
    const releaseVerification = verifyReleaseCertificate(root);
    if (!releaseVerification.certificate_path || releaseVerification.certificate_path === 'UNKNOWN') {
      throw NounVerbError.invalidInput('Release certificate identity is unavailable');
    }
    const releasePath = path.join(root, releaseVerification.certificate_path);
    const release = readJson<ReleaseCertificateV2>(root, releasePath, 'release certificate');
    const expected =
      mode === 'replay'
        ? readJson<AatLiveVerdict>(ctx.cwd, args.expected, '--expected')
        : undefined;
    if (expected && expected.schema_version !== AAT_LIVE_SCHEMA) {
      throw NounVerbError.invalidInput(
        `Unsupported expected verdict schema: ${String(expected.schema_version)}`
      );
    }

    const runId = blake3Hex(
      JSON.stringify({
        mode,
        trace_hash: blake3Hex(traceText),
        session_hash: session.evidence_hash,
        weaver_hash: weaver.report_hash,
        proof_hash: proof.proof_hash,
        release_hash: release.certificate?.hash,
        expected_hash: expected?.evidence_hash,
      })
    ).slice(0, 32);
    const receiptDir = path.join(root, '.wasm4pm/receipts/aat-live');
    const artifactDir = path.join(root, '.wasm4pm/aat-live');
    const pendingPath = path.join(receiptDir, `${runId}.pending.json`);
    const outcomePath = path.join(receiptDir, `${runId}.outcome.json`);
    const verdictPath = path.join(artifactDir, `${runId}.verdict.json`);
    const passportPath = path.join(artifactDir, `${runId}.passport.json`);

    try {
      writeJson(pendingPath, {
        schema_version: 'wasm4pm.aat-live-actuation.v1',
        receipt_kind: 'pending',
        run_id: runId,
        mode,
        status: 'PENDING',
        trace_hash: blake3Hex(traceText),
        subject_hash: session.evidence_hash,
      });
    } catch (error) {
      throw NounVerbError.permissionDenied(
        `PRE_ACTUATION_RECEIPT_BLOCKED: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const verdict = evaluateAatLive({
      trace_text: traceText,
      session,
      weaver,
      proof,
      release,
      release_verification: releaseVerification,
    });
    const replay = expected ? replayAatLive(expected, verdict) : undefined;
    const standing = replay?.standing === 'BLOCKED' ? 'BLOCKED' : verdict.standing;
    const accepted = verdict.verdict === 'Accepted' && standing === 'ALIVE';

    let savedVerdict: string | undefined;
    let savedPassport: string | undefined;
    if (!args['no-save']) {
      writeJson(verdictPath, verdict);
      savedVerdict = relativeUnix(root, verdictPath);
      if (verdict.passport) {
        writeJson(passportPath, verdict.passport);
        savedPassport = relativeUnix(root, passportPath);
      }
    }
    writeJson(outcomePath, {
      schema_version: 'wasm4pm.aat-live-actuation.v1',
      receipt_kind: 'outcome',
      run_id: runId,
      mode,
      status: accepted ? 'ALIVE' : 'BLOCKED',
      verdict: verdict.verdict,
      evidence_hash: verdict.evidence_hash,
      passport_hash: verdict.passport?.passport_hash,
      replay_standing: replay?.standing,
      refusals: verdict.refusals,
      verdict_path: savedVerdict,
      passport_path: savedPassport,
    });

    return {
      standing: accepted ? 'ALIVE' : 'BLOCKED',
      run_id: runId,
      verdict,
      replay,
      verdict_path: savedVerdict,
      passport_path: savedPassport,
      pending_receipt: relativeUnix(root, pendingPath),
      outcome_receipt: relativeUnix(root, outcomePath),
      exitCode: accepted ? EXIT_CODES.success : EXIT_CODES.conformance_fail,
    };
  },
  human: (result: Record<string, unknown>) => {
    const verdict = result.verdict as Record<string, unknown> | undefined;
    return `[${String(result.standing ?? 'UNKNOWN')}] AAT-Live ${String(
      verdict?.verdict ?? 'Unknown'
    )} run=${String(result.run_id ?? 'unknown')}`;
  },
});
