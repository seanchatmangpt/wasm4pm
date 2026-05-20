import fs from 'fs';
import path from 'path';

function main() {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const certPath = path.resolve(process.cwd(), `RELEASE_CERTIFICATE.v${version}.json`);
  
  if (!fs.existsSync(certPath)) {
    console.error(`Certificate not found: ${certPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(certPath, 'utf8');
  const invalidStrings = ["...", "placeholder", "verified_via_gate", "calculated_at_runtime", "assume success", "stub", "fake"];
  
  const found = invalidStrings.filter(s => content.includes(s));
  
  if (found.length > 0) {
    console.error(`ERROR: Certificate contains invalid placeholder strings: ${found.join(', ')}`);
    process.exit(1);
  }

  const cert = JSON.parse(content);
  
  // Basic validation
  if (!cert.package?.git_commit || cert.package.git_commit.length < 40) {
    console.error("ERROR: Invalid or missing git_commit in certificate.");
    process.exit(1);
  }
  
  if (!cert.examples?.manifest_hash || cert.examples.manifest_hash.length < 32) {
    console.error("ERROR: Invalid or missing examples.manifest_hash in certificate.");
    process.exit(1);
  }
  
  if (!cert.package_artifact?.wasm_bundle_hash || cert.package_artifact.wasm_bundle_hash.length < 32) {
    console.error("ERROR: Invalid or missing wasm_bundle_hash in certificate.");
    process.exit(1);
  }

  console.log("[PASS] Certificate authenticity verified. No placeholders found.");
}

main();