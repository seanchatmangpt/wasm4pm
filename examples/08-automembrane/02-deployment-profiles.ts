/**
 * Example — AutoMembrane: Deployment Profile Selection
 *
 * Demonstrates: `classify_motion()` with the five deployment profiles:
 *   mobile · IoT · edge · fog · browser
 * Docs reference: WASM_API.md § AutoMembrane — RequestMotion JSON Schema
 *
 * `deployment_profile` is an optional field on RequestMotion that attaches a
 * deployment context hint to every motion. The stateless heuristic evaluators
 * pass the profile through to the VerdictReceipt so downstream envelope agents
 * can apply profile-specific scoring. Setting the field must not error and must
 * not suppress the verdict.
 *
 * This example:
 *   1. Builds one valid RequestMotion per documented profile
 *   2. Calls `classify_motion()` for each
 *   3. Asserts: a VerdictReceipt is returned, `final_verdict` is non-empty,
 *      and no profile causes the call to throw or return malformed JSON
 */
import assert from 'node:assert/strict';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

const PROFILES = ['mobile', 'IoT', 'edge', 'fog', 'browser'] as const;
type Profile = typeof PROFILES[number];

function buildMotion(profile: Profile | null, seq: number) {
  return {
    request_id: `req-profile-${profile ?? 'null'}-${seq}`,
    actor: 'auditor@example.com',
    role: 'analyst',
    origin_system: 'erp-001',
    target_system: 'crm-002',
    object_ids: [`ORDER-${seq}`],
    object_types: ['order'],
    requested_action: 'read',
    claimed_evidence: ['audit-token-001'],
    timestamp_ms: 1714940400000 + seq,
    route_context: 'example-profile-witness',
    deployment_profile: profile,
  };
}

async function main(): Promise<void> {
  logger.header(
    '📡',
    'AutoMembrane: Deployment Profile Selection',
    'classify_motion() × 5 profiles — mobile · IoT · edge · fog · browser'
  );

  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }

  const VALID_VERDICTS = new Set([
    'allow', 'allowwithreceipt', 'require_evidence', 'stopline',
    'defer', 'challenge', 'deny',
  ]);

  // ── Step 1: null profile baseline ───────────────────────────────────────────
  logger.step(1, 2, 'Baseline: classify_motion with deployment_profile: null');
  const baselineMotion = buildMotion(null, 0);
  const baselineRaw = (core as any).classify_motion(JSON.stringify(baselineMotion));
  const baseline = JSON.parse(typeof baselineRaw === 'string' ? baselineRaw : JSON.stringify(baselineRaw));

  assert.ok(baseline.final_verdict, 'Baseline VerdictReceipt missing final_verdict');
  assert.ok(VALID_VERDICTS.has(baseline.final_verdict.toLowerCase()),
    `Baseline final_verdict not in expected set: ${baseline.final_verdict}`);
  logger.success(`Baseline verdict (no profile): ${baseline.final_verdict}`);

  // ── Step 2: Each of the 5 documented profiles ────────────────────────────────
  logger.step(2, 2, `Classifying motion for each of ${PROFILES.length} deployment profiles`);

  const results: { profile: Profile; verdict: string }[] = [];

  for (const [i, profile] of PROFILES.entries()) {
    const motion = buildMotion(profile, i + 1);
    const raw = (core as any).classify_motion(JSON.stringify(motion));
    const receipt = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));

    assert.ok(receipt.final_verdict,
      `Profile '${profile}': VerdictReceipt missing final_verdict`);
    assert.ok(typeof receipt.final_verdict === 'string',
      `Profile '${profile}': final_verdict must be a string`);
    assert.ok(VALID_VERDICTS.has(receipt.final_verdict.toLowerCase()),
      `Profile '${profile}': final_verdict '${receipt.final_verdict}' not in valid set`);

    results.push({ profile, verdict: receipt.final_verdict });
    logger.info(`  [${profile}] → ${receipt.final_verdict} (request_id: ${receipt.request_id})`);
  }

  assert.strictEqual(results.length, PROFILES.length,
    `Expected ${PROFILES.length} profile results, got ${results.length}`);

  logger.success(`All ${PROFILES.length} deployment profiles accepted — each returned a valid VerdictReceipt.`);
  logger.info('✅ Deployment profile selection witness complete.');
}

main().catch(err => {
  console.error('Deployment profiles example failed:', err);
  process.exit(1);
});
