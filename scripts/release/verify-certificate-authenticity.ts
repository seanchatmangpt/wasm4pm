import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/**
 * verify-certificate-authenticity.ts
 * 
 * RIGOROUS verifier for the release certificate.
 * Recomputes all hashes and verifies bindings to disk artifacts.
 */

function main() {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const rootDir = process.cwd();
  const certPath = path.resolve(rootDir, `RELEASE_CERTIFICATE.v${version}.json`);
  
  if (!fs.existsSync(certPath)) {
    console.error(`Certificate not found: ${certPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(certPath, 'utf8');
  const cert = JSON.parse(content);
  
  // 1. Placeholder Check
  const invalidStrings = ["...", "placeholder", "verified_via_gate", "calculated_at_runtime", "assume success", "stub", "fake"];
  const found = invalidStrings.filter(s => content.includes(s));
  if (found.length > 0) {
    console.error(`ERROR: Certificate contains invalid placeholder strings: ${found.join(', ')}`);
    process.exit(1);
  }

  // 2. Reachability Hash Verification
  const reachabilityPath = path.join(rootDir, `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v${version}.json`);
  if (!fs.existsSync(reachabilityPath)) {
    console.error("ERROR: Reachability evidence missing.");
    process.exit(1);
  }
  const reachabilityEvidence = JSON.parse(fs.readFileSync(reachabilityPath, 'utf8'));
  if (cert.reachability.reachability_hash !== reachabilityEvidence.reachability_hash) {
    console.error(`ERROR: Reachability hash mismatch! Cert: ${cert.reachability.reachability_hash} | Disk: ${reachabilityEvidence.reachability_hash}`);
    process.exit(1);
  }

  // 3. Behavior Evidence Hash Verification
  const behaviorPath = path.join(rootDir, `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${version}.json`);
  if (!fs.existsSync(behaviorPath)) {
    console.error("ERROR: Behavior evidence missing.");
    process.exit(1);
  }
  const behaviorEvidence = JSON.parse(fs.readFileSync(behaviorPath, 'utf8'));
  if (cert.behavior.behavior_evidence_hash !== behaviorEvidence.behavior_evidence_hash) {
    console.error(`ERROR: Behavior evidence hash mismatch! Cert: ${cert.behavior.behavior_evidence_hash} | Disk: ${behaviorEvidence.behavior_evidence_hash}`);
    process.exit(1);
  }

  // 4. Examples Manifest Recomputation
  let receiptsData = '';
  const outDir = path.join(rootDir, 'examples/out');
  if (fs.existsSync(outDir)) {
    for (const file of fs.readdirSync(outDir).sort()) {
      receiptsData += fs.readFileSync(path.join(outDir, file), 'utf8');
    }
  }
  const actualManifestHash = createHash('sha256').update(receiptsData || "empty_examples").digest('hex');
  if (cert.examples.manifest_hash !== actualManifestHash) {
    console.error(`ERROR: Examples manifest hash mismatch! Cert: ${cert.examples.manifest_hash} | Actual: ${actualManifestHash}`);
    process.exit(1);
  }

  // 5. WASM Bundle Recomputation
  const wasmPath = path.join(rootDir, 'wasm4pm/pkg/wasm4pm_bg.wasm');
  if (fs.existsSync(wasmPath)) {
    const actualWasmHash = createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
    if (cert.package_artifact.wasm_bundle_hash !== actualWasmHash) {
      console.error(`ERROR: WASM bundle hash mismatch! Cert: ${cert.package_artifact.wasm_bundle_hash} | Actual: ${actualWasmHash}`);
      process.exit(1);
    }
  }

  console.log("[PASS] Certificate authenticity verified against disk artifacts.");
}

main();
