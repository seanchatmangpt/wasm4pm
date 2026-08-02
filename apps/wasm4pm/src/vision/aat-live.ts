import { verify as verifySignature } from 'node:crypto';
import { blake3Hex } from '../receipts/_shared.js';
import {
  canonicalJson as canonicalReleaseJson,
  computeCertificateHash,
  type ReleaseCertificateV2,
  type ReleaseCertificateVerification,
} from '../release/certificate.js';
import {
  VISION_SESSION_SCHEMA,
  canonicalVisionJson,
  type VisionSessionEvidence,
} from './session-v2.js';

export const AAT_LIVE_SCHEMA = 'wasm4pm.aat-live.v1' as const;
export const WEAVER_ADMISSION_SCHEMA = 'wasm4pm.weaver-admission.v1' as const;
export const MCP_PLUS_PROOF_SCHEMA = 'wasm4pm.mcp-plus-proof.v1' as const;

export type AatStage =
  | 'aat.observe'
  | 'weaver.validate'
  | 'powl.validate'
  | 'wasm.certify'
  | 'mcp.validate';

export interface AatObservation {
  readonly sequence: number;
  readonly stage: AatStage;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface WeaverAdmission {
  readonly schema_version: typeof WEAVER_ADMISSION_SCHEMA;
  readonly authority: 'otel-weaver';
  readonly weaver_version: string;
  readonly exit_code: number;
  readonly status: 'PASS' | 'FAIL';
  readonly trace_hash: string;
  readonly registry_hash: string;
  readonly violations: readonly string[];
  readonly signer_public_key_pem: string;
  readonly signature_base64: string;
  readonly report_hash: string;
}

export interface McpPlusProof {
  readonly schema_version: typeof MCP_PLUS_PROOF_SCHEMA;
  readonly decision: 'Accepted' | 'Refused';
  readonly subject_hash: string;
  readonly trace_hash: string;
  readonly route_hash: string;
  readonly wasm_part_hash: string;
  readonly manifest_hash: string;
  readonly weaver_report_hash: string;
  readonly signer_public_key_pem: string;
  readonly signature_base64: string;
  readonly proof_hash: string;
}

export interface AatLiveInput {
  readonly trace_text: string;
  readonly session: VisionSessionEvidence;
  readonly weaver: WeaverAdmission;
  readonly proof: McpPlusProof;
  readonly release: ReleaseCertificateV2;
  readonly release_verification: ReleaseCertificateVerification;
}

export interface AatLivePassport {
  readonly schema_version: 'wasm4pm.aat-live-passport.v1';
  readonly verdict: 'Accepted';
  readonly subject_hash: string;
  readonly trace_hash: string;
  readonly route_hash: string;
  readonly wasm_part_hash: string;
  readonly manifest_hash: string;
  readonly weaver_registry_hash: string;
  readonly weaver_report_hash: string;
  readonly mcp_proof_hash: string;
  readonly release_certificate_hash: string;
  readonly git_commit: string;
  readonly passport_hash: string;
}

export interface AatLiveVerdict {
  readonly schema_version: typeof AAT_LIVE_SCHEMA;
  readonly verdict: 'Accepted' | 'Refused';
  readonly standing: 'ALIVE' | 'BLOCKED';
  readonly observations: readonly AatObservation[];
  readonly refusals: readonly {
    readonly code: string;
    readonly message: string;
  }[];
  readonly passport?: AatLivePassport;
  readonly evidence_hash: string;
}

export interface AatLiveReplay {
  readonly schema_version: 'wasm4pm.aat-live-replay.v1';
  readonly standing: 'ALIVE' | 'BLOCKED';
  readonly expected_hash: string;
  readonly observed_hash: string;
  readonly mismatches: readonly string[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const STAGES: readonly AatStage[] = [
  'aat.observe',
  'weaver.validate',
  'powl.validate',
  'wasm.certify',
  'mcp.validate',
];

function unsigned<T extends Record<string, unknown>>(value: T, ...excluded: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.includes(key)));
}

function signedPayloadHash(value: WeaverAdmission | McpPlusProof): string {
  const excluded = 'report_hash' in value
    ? ['signature_base64', 'report_hash']
    : ['signature_base64', 'proof_hash'];
  return blake3Hex(canonicalVisionJson(unsigned(value as unknown as Record<string, unknown>, ...excluded)));
}

export function computeWeaverReportHash(report: WeaverAdmission): string {
  return blake3Hex(canonicalVisionJson(unsigned(report as unknown as Record<string, unknown>, 'report_hash')));
}

export function computeMcpProofHash(proof: McpPlusProof): string {
  return blake3Hex(canonicalVisionJson(unsigned(proof as unknown as Record<string, unknown>, 'proof_hash')));
}

function signatureValid(value: WeaverAdmission | McpPlusProof): boolean {
  try {
    return verifySignature(
      null,
      Buffer.from(signedPayloadHash(value), 'hex'),
      value.signer_public_key_pem,
      Buffer.from(value.signature_base64, 'base64')
    );
  } catch {
    return false;
  }
}

function parseTrace(traceText: string): AatObservation[] {
  const lines = traceText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`trace line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`trace line ${index + 1} must be an object`);
    }
    const row = parsed as Record<string, unknown>;
    if (!Number.isInteger(row.sequence) || typeof row.stage !== 'string') {
      throw new Error(`trace line ${index + 1} lacks integer sequence or stage`);
    }
    if (!row.attributes || typeof row.attributes !== 'object' || Array.isArray(row.attributes)) {
      throw new Error(`trace line ${index + 1} lacks attributes`);
    }
    const attributes = Object.fromEntries(
      Object.entries(row.attributes as Record<string, unknown>).map(([key, value]) => {
        if (typeof value !== 'string') throw new Error(`trace attribute ${key} must be a string`);
        return [key, value];
      })
    );
    return { sequence: row.sequence as number, stage: row.stage as AatStage, attributes };
  });
}

function sessionSelfHash(session: VisionSessionEvidence): string {
  const { evidence_hash: _ignored, ...payload } = session;
  return blake3Hex(canonicalVisionJson(payload));
}

function attribute(
  observations: readonly AatObservation[],
  stage: AatStage,
  key: string
): string | undefined {
  return observations.find((observation) => observation.stage === stage)?.attributes[key];
}

function passportHash(passport: Omit<AatLivePassport, 'passport_hash'>): string {
  return blake3Hex(canonicalVisionJson(passport));
}

export function evaluateAatLive(input: AatLiveInput): AatLiveVerdict {
  const refusals: Array<{ code: string; message: string }> = [];
  let observations: AatObservation[] = [];
  const refuse = (code: string, message: string): void => {
    refusals.push({ code, message });
  };

  try {
    observations = parseTrace(input.trace_text);
  } catch (error) {
    refuse('TRACE_PARSE_REFUSED', error instanceof Error ? error.message : String(error));
  }
  if (observations.length > 0) {
    if (
      observations.length !== STAGES.length ||
      observations.some(
        (observation, index) => observation.sequence !== index + 1 || observation.stage !== STAGES[index]
      )
    ) {
      refuse(
        'TRACE_STAGE_SEQUENCE_REFUSED',
        `Expected exact stage sequence: ${STAGES.join(' → ')}`
      );
    }
  }

  const traceHash = blake3Hex(input.trace_text);
  if (input.session.schema_version !== VISION_SESSION_SCHEMA || sessionSelfHash(input.session) !== input.session.evidence_hash) {
    refuse('SESSION_EVIDENCE_HASH_REFUSED', 'Session evidence self-hash does not recompute');
  }
  if (!input.release_verification.valid) {
    refuse(
      'RELEASE_CERTIFICATE_REFUSED',
      input.release_verification.issues.map((issue) => issue.code).join(', ') || 'release verification failed'
    );
  }
  if (computeCertificateHash(input.release) !== input.release.certificate.hash) {
    refuse('RELEASE_CERTIFICATE_HASH_REFUSED', 'Release certificate self-hash does not recompute');
  }

  if (
    input.weaver.schema_version !== WEAVER_ADMISSION_SCHEMA ||
    input.weaver.authority !== 'otel-weaver' ||
    input.weaver.status !== 'PASS' ||
    input.weaver.exit_code !== 0 ||
    input.weaver.violations.length !== 0
  ) {
    refuse('WEAVER_VERDICT_REFUSED', 'Weaver admission did not report a zero-violation PASS');
  }
  if (input.weaver.trace_hash !== traceHash || !HEX64.test(input.weaver.registry_hash)) {
    refuse('WEAVER_BINDING_REFUSED', 'Weaver report is not bound to this trace and registry');
  }
  if (computeWeaverReportHash(input.weaver) !== input.weaver.report_hash) {
    refuse('WEAVER_REPORT_HASH_REFUSED', 'Weaver report hash does not recompute');
  }
  if (!signatureValid(input.weaver)) {
    refuse('WEAVER_SIGNATURE_REFUSED', 'Weaver Ed25519 authority signature is invalid');
  }

  const routeHash = input.session.route.model_hash;
  const wasmHash = input.release.package_artifact.wasm_bundle_sha256;
  const manifestHash = input.release.certificate.hash;
  const bindings: Array<[string, string, string]> = [
    ['proof.subject_hash', input.proof.subject_hash, input.session.evidence_hash],
    ['proof.trace_hash', input.proof.trace_hash, traceHash],
    ['proof.route_hash', input.proof.route_hash, routeHash],
    ['proof.wasm_part_hash', input.proof.wasm_part_hash, wasmHash],
    ['proof.manifest_hash', input.proof.manifest_hash, manifestHash],
    ['proof.weaver_report_hash', input.proof.weaver_report_hash, input.weaver.report_hash],
    ['trace.session.evidence_hash', attribute(observations, 'aat.observe', 'session.evidence_hash') ?? '', input.session.evidence_hash],
    ['trace.weaver.registry_hash', attribute(observations, 'weaver.validate', 'weaver.registry_hash') ?? '', input.weaver.registry_hash],
    ['trace.powl.route_hash', attribute(observations, 'powl.validate', 'powl.route_hash') ?? '', routeHash],
    ['trace.wasm.part_hash', attribute(observations, 'wasm.certify', 'wasm.part_hash') ?? '', wasmHash],
    ['trace.manifest_hash', attribute(observations, 'wasm.certify', 'manifest_hash') ?? '', manifestHash],
    ['trace.mcp.subject_hash', attribute(observations, 'mcp.validate', 'mcp.subject_hash') ?? '', input.session.evidence_hash],
  ];
  for (const [name, observed, expected] of bindings) {
    if (observed !== expected) refuse('IDENTITY_BINDING_REFUSED', `${name} does not match the admitted subject`);
  }
  if (input.proof.schema_version !== MCP_PLUS_PROOF_SCHEMA || input.proof.decision !== 'Accepted') {
    refuse('MCP_PROOF_VERDICT_REFUSED', 'MCP+ proof did not return Accepted');
  }
  if (computeMcpProofHash(input.proof) !== input.proof.proof_hash) {
    refuse('MCP_PROOF_HASH_REFUSED', 'MCP+ proof hash does not recompute');
  }
  if (!signatureValid(input.proof)) {
    refuse('MCP_SIGNATURE_REFUSED', 'MCP+ Ed25519 authority signature is invalid');
  }

  let passport: AatLivePassport | undefined;
  if (refusals.length === 0) {
    const unsignedPassport: Omit<AatLivePassport, 'passport_hash'> = {
      schema_version: 'wasm4pm.aat-live-passport.v1',
      verdict: 'Accepted',
      subject_hash: input.session.evidence_hash,
      trace_hash: traceHash,
      route_hash: routeHash,
      wasm_part_hash: wasmHash,
      manifest_hash: manifestHash,
      weaver_registry_hash: input.weaver.registry_hash,
      weaver_report_hash: input.weaver.report_hash,
      mcp_proof_hash: input.proof.proof_hash,
      release_certificate_hash: input.release.certificate.hash,
      git_commit: input.release.package.git_commit,
    };
    passport = { ...unsignedPassport, passport_hash: passportHash(unsignedPassport) };
  }

  const unsignedVerdict = {
    schema_version: AAT_LIVE_SCHEMA,
    verdict: passport ? ('Accepted' as const) : ('Refused' as const),
    standing: passport ? ('ALIVE' as const) : ('BLOCKED' as const),
    observations,
    refusals,
    ...(passport ? { passport } : {}),
  };
  return {
    ...unsignedVerdict,
    evidence_hash: blake3Hex(canonicalVisionJson(unsignedVerdict)),
  };
}

export function replayAatLive(expected: AatLiveVerdict, observed: AatLiveVerdict): AatLiveReplay {
  const mismatches: string[] = [];
  if (expected.verdict !== observed.verdict) mismatches.push('verdict');
  if (expected.evidence_hash !== observed.evidence_hash) mismatches.push('evidence_hash');
  if (expected.passport?.passport_hash !== observed.passport?.passport_hash) {
    mismatches.push('passport_hash');
  }
  return {
    schema_version: 'wasm4pm.aat-live-replay.v1',
    standing: mismatches.length === 0 ? 'ALIVE' : 'BLOCKED',
    expected_hash: expected.evidence_hash,
    observed_hash: observed.evidence_hash,
    mismatches,
  };
}

/** Re-exported for generators/tests that must sign the exact admitted payload. */
export function weaverSigningHash(report: WeaverAdmission): string {
  return signedPayloadHash(report);
}

/** Re-exported for generators/tests that must sign the exact admitted payload. */
export function mcpSigningHash(proof: McpPlusProof): string {
  return signedPayloadHash(proof);
}

/** Release canonicalization is exposed to keep cross-tool report generation exact. */
export { canonicalReleaseJson };
