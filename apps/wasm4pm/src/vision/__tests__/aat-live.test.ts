import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { blake3Hex } from '../../receipts/_shared.js';
import {
  computeCertificateHash,
  type ReleaseCertificateV2,
  type ReleaseCertificateVerification,
} from '../../release/certificate.js';
import type { VisionSessionEvidence } from '../session-v2.js';
import {
  MCP_PLUS_PROOF_SCHEMA,
  WEAVER_ADMISSION_SCHEMA,
  computeMcpProofHash,
  computeWeaverReportHash,
  evaluateAatLive,
  mcpSigningHash,
  replayAatLive,
  weaverSigningHash,
  type McpPlusProof,
  type WeaverAdmission,
} from '../aat-live.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signed(hash: string): string {
  return sign(null, Buffer.from(hash, 'hex'), keys.privateKey).toString('base64');
}

function session(): VisionSessionEvidence {
  const unsigned = {
    schema_version: 'wasm4pm.vision-session.v1' as const,
    standing: 'ALIVE' as const,
    subject: {
      format: 'ocel-v2' as const,
      input_hash: '1'.repeat(64),
      admitted_ocel_hash: '2'.repeat(64),
      object_type: 'Order',
      event_count: 2,
      object_count: 1,
    },
    route: {
      variant: 'decision_graph_cyclic_strict',
      activity_key: 'concept:name',
      min_trace_count: 1,
      noise_threshold: 0,
      episode_count: 1,
      total_events: 2,
      ungrouped_event_count: 0,
      event_log_hash: '3'.repeat(64),
      model_hash: '4'.repeat(64),
      model_repr: '->(Create, Ship)',
      model_node_count: 3,
      partial_orders_valid: true as const,
    },
    execution: {
      max_iters: 3,
      output_hash: '5'.repeat(64),
      output: { completed: true },
    },
  };
  return { ...unsigned, evidence_hash: blake3Hex(JSON.stringify(unsigned, Object.keys(unsigned).sort())) } as VisionSessionEvidence;
}

function release(): ReleaseCertificateV2 {
  const draft: ReleaseCertificateV2 = {
    schema_version: 'wasm4pm.release-certificate.v2',
    package: {
      name: 'wasm4pm',
      version: '26.7.23',
      git_commit: 'a'.repeat(40),
      package_json_path: 'packages/kernel/package.json',
      package_json_sha256: '6'.repeat(64),
    },
    reachability: {
      evidence_path: 'reachability.json',
      evidence_file_sha256: '7'.repeat(64),
      evidence_claimed_hash: '8'.repeat(64),
      algorithm_count: 1,
      algorithms_reachable: 1,
      all_reachable: true,
    },
    behavior: {
      evidence_path: 'behavior.json',
      evidence_file_sha256: '9'.repeat(64),
      evidence_claimed_hash: 'b'.repeat(64),
      algorithm_count: 1,
      positive_case_count: 1,
      negative_case_count: 1,
      invariant_case_count: 1,
      all_positive_passed: true,
      all_negative_failed_correctly: true,
      all_invariants_passed: true,
      all_algorithm_receipts_recompute: true,
    },
    examples: {
      root: 'examples/out',
      file_count: 1,
      manifest_hash: 'c'.repeat(64),
      files: [{ path: 'receipt.json', size: 1, sha256: 'd'.repeat(64) }],
    },
    package_artifact: {
      tarball_path: 'artifacts/release/npm/wasm4pm-26.7.23.tgz',
      tarball_name: 'wasm4pm-26.7.23.tgz',
      tarball_size: 1,
      tarball_sha1: 'e'.repeat(40),
      tarball_sha256: 'f'.repeat(64),
      tarball_integrity: 'sha512-test',
      packed_package_name: 'wasm4pm',
      packed_package_version: '26.7.23',
      wasm_bundle_path: 'wasm4pm/pkg/wasm4pm_bg.wasm',
      wasm_bundle_size: 4,
      wasm_bundle_sha256: '0'.repeat(64),
    },
    generated_at: '2030-01-01T00:00:00Z',
    certificate: { algorithm: 'sha256', hash: '' },
  };
  return {
    ...draft,
    certificate: { algorithm: 'sha256', hash: computeCertificateHash(draft) },
  };
}

function fixture() {
  const admittedSession = session();
  const certificate = release();
  const registryHash = 'a'.repeat(64);
  const rows = [
    { sequence: 1, stage: 'aat.observe', attributes: { 'session.evidence_hash': admittedSession.evidence_hash } },
    { sequence: 2, stage: 'weaver.validate', attributes: { 'weaver.registry_hash': registryHash } },
    { sequence: 3, stage: 'powl.validate', attributes: { 'powl.route_hash': admittedSession.route.model_hash } },
    {
      sequence: 4,
      stage: 'wasm.certify',
      attributes: {
        'wasm.part_hash': certificate.package_artifact.wasm_bundle_sha256,
        manifest_hash: certificate.certificate.hash,
      },
    },
    { sequence: 5, stage: 'mcp.validate', attributes: { 'mcp.subject_hash': admittedSession.evidence_hash } },
  ];
  const traceText = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const traceHash = blake3Hex(traceText);

  let weaver: WeaverAdmission = {
    schema_version: WEAVER_ADMISSION_SCHEMA,
    authority: 'otel-weaver',
    weaver_version: '0.14.0',
    exit_code: 0,
    status: 'PASS',
    trace_hash: traceHash,
    registry_hash: registryHash,
    violations: [],
    signer_public_key_pem: publicKey,
    signature_base64: '',
    report_hash: '',
  };
  weaver = { ...weaver, signature_base64: signed(weaverSigningHash(weaver)) };
  weaver = { ...weaver, report_hash: computeWeaverReportHash(weaver) };

  let proof: McpPlusProof = {
    schema_version: MCP_PLUS_PROOF_SCHEMA,
    decision: 'Accepted',
    subject_hash: admittedSession.evidence_hash,
    trace_hash: traceHash,
    route_hash: admittedSession.route.model_hash,
    wasm_part_hash: certificate.package_artifact.wasm_bundle_sha256,
    manifest_hash: certificate.certificate.hash,
    weaver_report_hash: weaver.report_hash,
    signer_public_key_pem: publicKey,
    signature_base64: '',
    proof_hash: '',
  };
  proof = { ...proof, signature_base64: signed(mcpSigningHash(proof)) };
  proof = { ...proof, proof_hash: computeMcpProofHash(proof) };

  const verification: ReleaseCertificateVerification = {
    valid: true,
    certificate_path: 'RELEASE_CERTIFICATE.v26.7.23.json',
    certificate_hash: certificate.certificate.hash,
    git_commit: certificate.package.git_commit,
    issues: [],
  };
  return {
    trace_text: traceText,
    session: admittedSession,
    weaver,
    proof,
    release: certificate,
    release_verification: verification,
  };
}

describe('AAT-Live admission protocol', () => {
  it('manufactures Accepted passport only after every signed identity edge closes', () => {
    const input = fixture();
    const verdict = evaluateAatLive(input);

    expect(verdict).toMatchObject({ verdict: 'Accepted', standing: 'ALIVE', refusals: [] });
    expect(verdict.passport?.passport_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(replayAatLive(verdict, evaluateAatLive(input))).toMatchObject({
      standing: 'ALIVE',
      mismatches: [],
    });
  });

  it('refuses a forged Weaver signature', () => {
    const input = fixture();
    const verdict = evaluateAatLive({
      ...input,
      weaver: { ...input.weaver, signature_base64: Buffer.from('forged').toString('base64') },
    });

    expect(verdict).toMatchObject({ verdict: 'Refused', standing: 'BLOCKED' });
    expect(verdict.refusals.map((refusal) => refusal.code)).toContain('WEAVER_SIGNATURE_REFUSED');
  });

  it('refuses route identity drift', () => {
    const input = fixture();
    const verdict = evaluateAatLive({
      ...input,
      proof: { ...input.proof, route_hash: 'f'.repeat(64) },
    });

    expect(verdict.verdict).toBe('Refused');
    expect(verdict.refusals.map((refusal) => refusal.code)).toContain('IDENTITY_BINDING_REFUSED');
  });

  it('refuses an incomplete live stage sequence', () => {
    const input = fixture();
    const verdict = evaluateAatLive({
      ...input,
      trace_text: input.trace_text.split('\n').slice(0, 4).join('\n'),
    });

    expect(verdict.verdict).toBe('Refused');
    expect(verdict.refusals.map((refusal) => refusal.code)).toContain(
      'TRACE_STAGE_SEQUENCE_REFUSED'
    );
  });
});
