
export const meta = {
  name: 'day3-wasm4pm-compat-yield',
  description: 'Day 3 EOD: Run ggen witness-marker first-fruit, bind use-site, verify fruit-after-kind, create yield doc',
  phases: [
    { title: 'Yield', detail: 'Run ggen sync --rule witness-markers, render src/witnesses.rs' },
    { title: 'Bind', detail: 'Add pub mod witnesses; use-site, verify cargo check' },
    { title: 'Verify', detail: 'Verify fruit-after-kind: no DO NOT EDIT, no generated/, no ORPHAN, no SECOND_CLASS' },
    { title: 'Seal', detail: 'Create DAY3_WASM4PM_COMPAT_TO_WASM4PM_YIELD.md and commit' },
  ],
}

// ─── Phase 1: Yield ───────────────────────────────────────────────────────
phase('Yield')

const yieldResult = await agent(`
You are executing Day 3 of the wasm4pm-compat genesis: causing the first ggen-provided,
first-class source surface to appear in wasm4pm-compat after kind.

RULES — DO NOT VIOLATE:
- Do not modify Rust hand-written source (only the generated witnesses.rs output from ggen is touched)
- Do not modify ggen.toml
- Do not touch templates
- Do not migrate POWL or BinaryRelation
- Do not delete unrelated files
- Do not claim downstream consequence

TASK: Run ggen sync for the witness-markers rule only.

Working directory: /Users/sac/wasm4pm-compat

Step 1: Run ggen sync with only the witness-markers rule:
  cd /Users/sac/wasm4pm-compat && ggen sync --rule witness-markers --manifest ggen/ggen.toml 2>&1

Step 2: Check the output file was created at src/witnesses.rs:
  cat /Users/sac/wasm4pm-compat/src/witnesses.rs | head -40

Step 3: Verify the output does NOT contain:
  - "DO NOT EDIT" (would make it second-class)
  - "generated" in any path comment or banner
  - Any competing authority claim

Step 4: Count how many witness_marker!() calls are in the output.

Report back:
1. Whether ggen ran successfully (exit code 0)
2. The first 40 lines of src/witnesses.rs
3. Count of witness_marker!() macro calls
4. Whether DO NOT EDIT appears (it must NOT)
5. Any errors or warnings from ggen (excluding the OTEL connection refused noise)
`, { label: 'ggen-yield', phase: 'Yield', schema: {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    witnessesRsHead: { type: 'string' },
    markerCount: { type: 'number' },
    hasDoNotEdit: { type: 'boolean' },
    errors: { type: 'string' },
    fileSizeBytes: { type: 'number' }
  },
  required: ['success', 'markerCount', 'hasDoNotEdit']
}})

log(`Yield: ggen success=${yieldResult?.success}, markers=${yieldResult?.markerCount}, DO NOT EDIT=${yieldResult?.hasDoNotEdit}`)

if (!yieldResult?.success || yieldResult?.hasDoNotEdit) {
  log(`ANDON: Yield failed or DO NOT EDIT found — stopping`)
  return { status: 'andon', reason: yieldResult?.errors || 'DO NOT EDIT found in output' }
}

// ─── Phase 2: Bind ────────────────────────────────────────────────────────
phase('Bind')

const bindResult = await agent(`
Day 3 witness-marker yield has completed. ggen rendered src/witnesses.rs with ${yieldResult.markerCount} witness_marker!() calls.

Now bind the use-site so the output is not ORPHAN.

RULES:
- Only add pub mod witnesses; to /Users/sac/wasm4pm-compat/src/lib.rs
- Do not modify any other hand-written source
- The line should go near line 220 where pub mod witness; is declared (keep alphabetical order or add after witness)

Step 1: Check current state of lib.rs around the witness module:
  grep -n "pub mod witness" /Users/sac/wasm4pm-compat/src/lib.rs

Step 2: If pub mod witnesses; is NOT already present, add it after pub mod witness; using the Edit tool.
  The declaration to add: pub mod witnesses;

Step 3: Run cargo check to verify the module compiles:
  cd /Users/sac/wasm4pm-compat && cargo check -p wasm4pm-compat 2>&1 | tail -5

Step 4: Verify witnesses.rs compiles by checking for any errors mentioning it.

Report:
1. Whether pub mod witnesses; was already present or was added
2. The cargo check result (Finished dev profile = success)
3. Whether any compile errors occurred in witnesses.rs
4. First 10 lines around the mod witness declaration in lib.rs (after your edit)
`, { label: 'bind-use-site', phase: 'Bind', schema: {
  type: 'object',
  properties: {
    modAlreadyPresent: { type: 'boolean' },
    modAdded: { type: 'boolean' },
    cargoCheckPassed: { type: 'boolean' },
    cargoOutput: { type: 'string' },
    compileErrors: { type: 'string' }
  },
  required: ['cargoCheckPassed']
}})

log(`Bind: mod already=${bindResult?.modAlreadyPresent}, added=${bindResult?.modAdded}, cargo=${bindResult?.cargoCheckPassed}`)

if (!bindResult?.cargoCheckPassed) {
  log(`ANDON: cargo check failed — ${bindResult?.compileErrors}`)
  return { status: 'andon', reason: `cargo check failed: ${bindResult?.compileErrors}` }
}

// ─── Phase 3: Verify ──────────────────────────────────────────────────────
phase('Verify')

const verifyResult = await agent(`
Verify fruit-after-kind for the witnesses.rs Day 3 yield.

The Day 3 doctrine requires:
  κ(output) = RenderedSource
  σ(output) must NOT contain SECOND_CLASS (no generated/ path, no DO NOT EDIT banner)
  σ(output) must NOT contain ORPHAN (use-site must exist)
  σ(output) must NOT contain COMPETING_AUTHORITY

File to verify: /Users/sac/wasm4pm-compat/src/witnesses.rs

Step 1: Check for SECOND_CLASS indicators:
  grep -c "DO NOT EDIT\\|generated\\|auto-generated\\|automatically generated" /Users/sac/wasm4pm-compat/src/witnesses.rs

Step 2: Check use-site exists (ORPHAN check):
  grep -n "witnesses" /Users/sac/wasm4pm-compat/src/lib.rs

Step 3: Check that witness_marker!() calls are present (fruit exists):
  grep -c "witness_marker!" /Users/sac/wasm4pm-compat/src/witnesses.rs

Step 4: Check that rendered calls match the hand-written form in witness.rs:
  head -5 /Users/sac/wasm4pm-compat/src/witnesses.rs
  head -5 /Users/sac/wasm4pm-compat/src/witness.rs

Step 5: Confirm no competing authority claim — witnesses.rs must NOT export anything that
  src/witness.rs already exports (check for duplicate macro/type definitions):
  grep "pub enum WitnessFamily\\|pub trait Witness" /Users/sac/wasm4pm-compat/src/witnesses.rs

Step 6: Confirm the file is in src/ not src/generated/:
  ls -la /Users/sac/wasm4pm-compat/src/witnesses.rs

Report all 6 checks with pass/fail.
`, { label: 'verify-fruit', phase: 'Verify', schema: {
  type: 'object',
  properties: {
    secondClassIndicators: { type: 'number' },
    useSitePresent: { type: 'boolean' },
    markerCount: { type: 'number' },
    competingAuthority: { type: 'boolean' },
    correctPath: { type: 'boolean' },
    allPassed: { type: 'boolean' },
    firstFewLines: { type: 'string' }
  },
  required: ['allPassed', 'secondClassIndicators', 'useSitePresent']
}})

log(`Verify: allPassed=${verifyResult?.allPassed}, secondClass=${verifyResult?.secondClassIndicators}, useSite=${verifyResult?.useSitePresent}`)

if (!verifyResult?.allPassed) {
  log(`ANDON: Fruit-after-kind verification failed`)
  return { status: 'andon', reason: 'Fruit-after-kind checks failed', details: verifyResult }
}

// ─── Phase 4: Seal ────────────────────────────────────────────────────────
phase('Seal')

const sealResult = await agent(`
Day 3 first-fruit has yielded and been verified. Now seal it.

TASK: Create the yield document and commit.

Step 1: Create /Users/sac/wasm4pm-compat/docs/foundation/DAY3_WASM4PM_COMPAT_TO_WASM4PM_YIELD.md

The document must contain:
- What wasm4pm-compat provided (the witness-marker pack: ontology TTL with ${yieldResult.markerCount} WitnessMarker instances, extract-witnesses-full.rq, witness-marker.tera)
- What ggen rendered (src/witnesses.rs — ${yieldResult.markerCount} witness_marker!() calls)
- Where wasm4pm-compat received it (src/witnesses.rs — first-class source, not generated/, not second-class)
- Why it is source after kind (no DO NOT EDIT banner; indistinguishable from hand-written; κ=RenderedSource)
- Why it is not second-class (no generated/ path component; no DO NOT EDIT; the template comment says "This IS the source")
- Where the use-site is (pub mod witnesses; in src/lib.rs)
- What remains for downstream judgment (v2 receipt, replay verification, wasm4pm consumer surface)
- Verdict line: DAY3_WASM4PM_COMPAT_TO_WASM4PM_YIELD_READY

Step 2: Commit all changes:
  cd /Users/sac/wasm4pm-compat
  git add src/witnesses.rs src/lib.rs docs/foundation/DAY3_WASM4PM_COMPAT_TO_WASM4PM_YIELD.md
  git commit -m "feat(yield): Day 3 first-fruit — ggen renders witnesses.rs after kind"
  
  (If lib.rs was already correct, exclude it from the add if unchanged)

Step 3: Verify the commit:
  git log --oneline -3

Step 4: Confirm no Rust hand-written sources were modified:
  git show --name-only HEAD | grep -E "\\.rs$" | grep -v "witnesses.rs"

Report:
1. Whether the yield document was created
2. Whether the commit succeeded
3. The commit hash
4. What files were in the commit
5. Whether any non-witnesses Rust files were touched (should be zero or only lib.rs for mod declaration)
`, { label: 'seal-yield', phase: 'Seal', schema: {
  type: 'object',
  properties: {
    yieldDocCreated: { type: 'boolean' },
    commitSucceeded: { type: 'boolean' },
    commitHash: { type: 'string' },
    filesCommitted: { type: 'array', items: { type: 'string' } },
    nonWitnessRsModified: { type: 'array', items: { type: 'string' } }
  },
  required: ['commitSucceeded', 'commitHash']
}})

log(`Seal: committed=${sealResult?.commitSucceeded}, hash=${sealResult?.commitHash}`)

return {
  status: 'DAY3_WASM4PM_COMPAT_TO_WASM4PM_YIELD_READY',
  markerCount: yieldResult.markerCount,
  commitHash: sealResult?.commitHash,
  filesCommitted: sealResult?.filesCommitted,
  verificationPassed: verifyResult?.allPassed,
  cargoCheckPassed: bindResult?.cargoCheckPassed,
}
