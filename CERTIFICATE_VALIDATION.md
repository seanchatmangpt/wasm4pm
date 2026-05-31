# Release Certificate Validation Guide

This document provides step-by-step commands to independently verify every field in
`RELEASE_CERTIFICATE.v26.5.29.json`. All commands assume the repo root as the working
directory and a standard POSIX shell with `jq`, `shasum`/`sha512sum`, and `openssl`
available.

```bash
# Read the certificate once and check it is valid JSON
jq . RELEASE_CERTIFICATE.v26.5.29.json
```

---

## 1. Package identity

```json
"package": {
  "name": "wasm4pm",
  "version": "26.5.29",
  "git_commit": "86236b02f62254f49fca4746f569d4d865cd0a7f"
}
```

**What it proves:** The certificate is bound to a specific npm package name, version, and
exact git tree.

**How to verify:**

```bash
# Confirm the package name and version match package.json
node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version"
# Expected: wasm4pm@26.5.29

# Confirm the git commit matches the current HEAD (or the tag)
git rev-parse HEAD
# Expected: 86236b02f62254f49fca4746f569d4d865cd0a7f
# (or verify the tag: git show v26.5.29 --format="%H" -s)
```

---

## 2. reachability.reachability_hash

```json
"reachability": {
  "algorithm_count": 60,
  "algorithms_reachable": 60,
  "reachability_hash": "ce603c2937a9c3b0a4f1225dfa69bcdeb394233ee8706034610f27f6cffab818"
}
```

**What it proves:** All 60 registered algorithms have a verified dispatch path from the kernel
registry through the TypeScript API to a real WASM export or structured CLI surface. No
algorithm is registered but unreachable.

**How to verify:**

```bash
# 1. Confirm the evidence file exists and contains exactly 60 rows
jq '.algorithms | length' artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json
# Expected: 60

# 2. Recompute the hash from the evidence file
shasum -a 256 artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json
# The SHA-256 of that file must match reachability_hash in the certificate.
# Note: the hash algorithm used here is the one recorded at release time.
# Compare to: ce603c2937a9c3b0a4f1225dfa69bcdeb394233ee8706034610f27f6cffab818

# 3. Run the reachability check from source
pnpm run release:full 2>&1 | grep -E "reachability|60"
```

---

## 3. behavior.* counts and behavior_evidence_hash

```json
"behavior": {
  "algorithm_count": 60,
  "positive_case_count": 60,
  "negative_case_count": 120,
  "invariant_case_count": 60,
  "behavior_evidence_hash": "deba097224a8fba15eedc664e5d3d95b406617f110b72ddef9ce9c14811d9794",
  "all_failed_correctly": true
}
```

**What each count proves:**

| Field | Meaning |
|-------|---------|
| `positive_case_count: 60` | Every algorithm has at least one happy-path test that returns a valid result |
| `negative_case_count: 120` | Every algorithm has at least two tests with malformed / invalid inputs that produce the correct typed failure code — never a panic, silent fallback, or generic error |
| `invariant_case_count: 60` | Every algorithm has at least one property-invariant test (e.g. determinism, bounds, schema shape) |
| `all_failed_correctly: true` | No negative case silently succeeded, returned a wrong error code, or panicked |

**How to verify:**

```bash
# 1. Check the evidence file summary
jq '.summary' artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
# Expected:
# {
#   "positive_cases": 60,
#   "negative_cases": 120,
#   "invariant_cases": 60,
#   "all_positive_passed": true,
#   "all_negative_failed_correctly": true,
#   "all_invariants_passed": true
# }

# 2. Confirm the evidence file contains exactly 60 algorithm rows
jq '.algorithms | length' artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
# Expected: 60

# 3. Confirm no algorithm is missing a negative case
jq '[.algorithms[] | select(.negative_cases | length == 0)] | length' \
  artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
# Expected: 0

# 4. Count behavior receipts on disk (must match total case count)
find artifacts/release/algorithm-behavior-receipts -name '*.receipt.json' | wc -l

# 5. Recompute the behavior evidence hash
shasum -a 256 artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
# Compare to: deba097224a8fba15eedc664e5d3d95b406617f110b72ddef9ce9c14811d9794

# 6. Re-run the verifier
pnpm run release:verify-algorithm-behavior
# Expected: exits 0, all rows verified
```

---

## 4. examples.manifest_hash

```json
"examples": {
  "example_count": 8,
  "examples_total_executions": 64,
  "manifest_hash": "203be58db68be7810eac029393ab5a370dde0c8a76b616ffb57fa2d16853cc15"
}
```

**What it proves:** Eight real-world example pipelines (benevolence_route, prayer_pipeline,
volunteer_serving, kids_safety, cg_belonging, sunday_andon, supply_chain_port, finance_audit)
were each executed 8 times (64 total) and produced valid receipts. The manifest hash binds all
eight receipt files into a single digest that cannot be fabricated from prose alone.

**How to verify:**

```bash
# 1. List the 8 example receipts
ls examples/out/*.receipt.json
# Expected: 8 files

# 2. Confirm each receipt is valid JSON with a non-empty run_id
for f in examples/out/*.receipt.json; do
  echo "$f:"; jq -r '.run_id // "MISSING"' "$f"
done

# 3. Recompute the manifest hash
# The manifest hash is the SHA-256 of the concatenation of all receipt hashes in sorted
# filename order. Use the project verifier:
pnpm run examples:verify-receipts
# Expected: exits 0, manifest hash confirmed

# 4. Run the examples gate end-to-end
pnpm run examples:gate
# Expected: exits 0, all 8 examples produce fresh receipts
```

---

## 5. package_artifact.tarball_integrity

```json
"tarball_integrity": "sha512-GJAIWQ3vBL7HjKAR2Q6OFarznSTrrVDRWPHcJdcZXdCXIuBQCNzU2KsotTeYDiOUC/fNsYFWAYl0FuRK5+1s1w=="
```

**What it proves:** The published npm tarball `wasm4pm-26.5.29.tgz` has not been tampered with
since release. The value is a standard `sha512-<base64>` Subresource Integrity string.

**How to verify:**

```bash
# Method A: shasum (macOS / Linux)
shasum -a 512 packages/kernel/wasm4pm-26.5.29.tgz | awk '{print $1}' | \
  xxd -r -p | base64
# The output must equal the base64 portion after "sha512-":
# GJAIWQ3vBL7HjKAR2Q6OFarznSTrrVDRWPHcJdcZXdCXIuBQCNzU2KsotTeYDiOUC/fNsYFWAYl0FuRK5+1s1w==

# Method B: openssl
openssl dgst -sha512 -binary packages/kernel/wasm4pm-26.5.29.tgz | base64

# Method C: node (matches npm's own integrity format)
node -e "
const fs = require('fs');
const crypto = require('crypto');
const data = fs.readFileSync('packages/kernel/wasm4pm-26.5.29.tgz');
const hash = crypto.createHash('sha512').update(data).digest('base64');
console.log('sha512-' + hash);
"
# Expected: sha512-GJAIWQ3vBL7HjKAR2Q6OFarznSTrrVDRWPHcJdcZXdCXIuBQCNzU2KsotTeYDiOUC/fNsYFWAYl0FuRK5+1s1w==

# Confirm the tarball was produced from the correct source
pnpm run prepublish:pack-smoke
pnpm run release:pack-contents
```

---

## 6. package_artifact.wasm_bundle_hash

```json
"wasm_bundle_hash": "349f210999ee8a7e7eefd204a9509de91a831cb221ea15c18c20e32017f4761e"
```

**What it proves:** The compiled WASM binary (`wasm4pm_bg.wasm`) inside the published tarball
matches the binary produced from the committed source at `git_commit`. A different hash means
either the binary was swapped after compilation or the source tree changed between compile and
pack.

**How to verify:**

```bash
# Method A: hash the WASM binary directly from the build output
shasum -a 256 wasm4pm/pkg/wasm4pm_bg.wasm
# Expected: 349f210999ee8a7e7eefd204a9509de91a831cb221ea15c18c20e32017f4761e

# Method B: extract the binary from the tarball and hash it
mkdir -p /tmp/wasm-verify
tar -xzf packages/kernel/wasm4pm-26.5.29.tgz -C /tmp/wasm-verify
shasum -a 256 /tmp/wasm-verify/package/wasm4pm_bg.wasm
# Must match: 349f210999ee8a7e7eefd204a9509de91a831cb221ea15c18c20e32017f4761e
rm -rf /tmp/wasm-verify

# Method C: rebuild from source and confirm the hash matches
cd wasm4pm
npm run build   # wasm-pack bundler target
shasum -a 256 pkg/wasm4pm_bg.wasm
# A reproducible build will produce the same hash. A mismatch indicates either a non-
# deterministic build or a source change since the certificate was generated.
cd ..
```

---

## Full verification in one pass

```bash
VERSION=26.5.29
CERT="RELEASE_CERTIFICATE.v${VERSION}.json"

echo "=== Package identity ==="
node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version"
git rev-parse HEAD

echo "=== Reachability ==="
jq '.algorithms | length' artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v${VERSION}.json
shasum -a 256 artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v${VERSION}.json

echo "=== Behavior evidence ==="
jq '.summary' artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json
shasum -a 256 artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json
pnpm run release:verify-algorithm-behavior

echo "=== Examples ==="
ls examples/out/*.receipt.json | wc -l
pnpm run examples:verify-receipts

echo "=== Tarball integrity ==="
node -e "
const fs = require('fs');
const crypto = require('crypto');
const data = fs.readFileSync('packages/kernel/wasm4pm-${VERSION}.tgz');
console.log('sha512-' + crypto.createHash('sha512').update(data).digest('base64'));
"

echo "=== WASM bundle hash ==="
shasum -a 256 wasm4pm/pkg/wasm4pm_bg.wasm

echo "=== Certificate ==="
jq . $CERT
```

---

## Interpreting a mismatch

| Field | Mismatch means |
|-------|---------------|
| `git_commit` | Certificate was generated on a different tree — re-run `release:certificate` from the correct commit |
| `reachability_hash` | An algorithm was added or removed after the certificate was generated, or the evidence file was regenerated |
| `behavior_evidence_hash` | A test case changed, a receipt was regenerated, or the evidence file does not match the committed state |
| `manifest_hash` | An example receipt was regenerated or the set of examples changed |
| `tarball_integrity` | Tarball was re-packed after the certificate was generated, or the file was corrupted |
| `wasm_bundle_hash` | WASM binary changed — either a rebuild occurred or the binary was swapped |

Any mismatch must be resolved by regenerating the affected evidence and re-issuing the
certificate. Do not manually adjust hash values.
