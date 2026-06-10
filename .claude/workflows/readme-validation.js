export const meta = {
  name: 'readme-validation',
  description: 'Validate every README.md capability claim with live execution evidence',
  phases: [
    { title: 'Probe', detail: 'Run Quick Start, Truex/Supabase, Cognition, Programmatic API, OTEL in parallel' },
    { title: 'All-60', detail: 'Execute all 60 registered algorithms via CLI' },
    { title: 'Profiles', detail: 'Build all 5 deployment profiles and capture bundle sizes' },
    { title: 'Global-Install', detail: 'npm install -g @wasm4pm/cli and smoke-test' },
    { title: 'Write-Suite', detail: 'Write playground/scenarios/33-readme-capabilities.ts' },
    { title: 'Run-Suite', detail: 'Run the new playground scenario via vitest' },
    { title: 'Report', detail: 'Write validation report + apply confirmed README fixes' },
  ],
};

const WPM = 'node /Users/sac/wasm4pm/apps/wasm4pm/dist/bin/wpm.js';
const REPO = '/Users/sac/wasm4pm';

// ─── Phase 1: Parallel probes ───────────────────────────────────────────────
phase('Probe');

const [quickStartEvidence, truexEvidence, cognitionEvidence, apiEvidence, otelEvidence] = await parallel([
  () => agent(`You are a validation agent. Run these commands from the repo root (${REPO}) and collect exact output/exit-codes as evidence for a README validation report.

WPM="${WPM}"

Run ALL of the following, capturing stdout/stderr/exitCode for each:
1. cd ${REPO} && $WPM run data/small-example.xes --no-save 2>&1; echo "EXIT:$?"
2. cd ${REPO} && $WPM run data/small-example.xes -a dfg --no-save 2>&1; echo "EXIT:$?"
3. cd ${REPO} && $WPM run data/small-example.xes -a inductive --no-save 2>&1; echo "EXIT:$?"
4. cd ${REPO} && $WPM algorithms 2>&1 | head -80; echo "EXIT:$?"
5. cd ${REPO} && $WPM compare dfg,heuristic,inductive -i data/small-example.xes --no-save 2>&1 | head -60; echo "EXIT:$?"
6. cd ${REPO} && $WPM doctor check 2>&1 | head -40; echo "EXIT:$?"
7. cd ${REPO} && $WPM status --format json 2>&1 | head -40; echo "EXIT:$?"
8. cd ${REPO} && $WPM --help 2>&1 | head -80; echo "EXIT:$?"
9. After step 1, check: cat ${REPO}/.wasm4pm/receipts/latest.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('input_hash:', bool(d.get('input_hash')), 'output_hash:', bool(d.get('output_hash')))" 2>&1

Count the number of top-level commands in step 8 output.
From step 4 output, count how many algorithms are listed.
Report a structured JSON summary:
{
  "commands": [{"cmd": "...", "exitCode": N, "firstLine": "..."}],
  "algorithmCount": N,
  "topLevelCommandCount": N,
  "receiptHasInputHash": true/false,
  "receiptHasOutputHash": true/false,
  "defaultAlgoUsed": "name from step 1 output",
  "andonTriggered": false
}`, {label: 'quickstart-probe', phase: 'Probe'}),

  () => agent(`You are a validation agent for ${REPO}. Run these commands and collect evidence.

WPM="${WPM}"

1. cd ${REPO} && $WPM truex verify examples/out/truex_ocel2_valid.json 2>&1; echo "EXIT:$?"
2. cd ${REPO} && $WPM truex verify examples/out/truex_ocel2_forged.json 2>&1; echo "EXIT:$?"
3. cd ${REPO} && $WPM supabase doctor 2>&1 | head -30; echo "EXIT:$?"
4. cd ${REPO} && $WPM supabase sync-receipts 2>&1 | head -30; echo "EXIT:$?"

For truex valid: expect "verified" or status ok. For truex forged: expect structured refusal (NOT a crash/stacktrace — look for a taxonomy code or refusal field). For supabase: expect graceful error with exit code 0 or 1 (config_error), NOT a stack trace.

Return JSON:
{
  "truexValid": {"exitCode": N, "status": "verified|ok|...", "firstLine": "..."},
  "truexForged": {"exitCode": N, "isStructuredRefusal": true/false, "hasStackTrace": true/false, "firstLine": "..."},
  "supabaseDoctor": {"exitCode": N, "isGraceful": true/false, "firstLine": "..."},
  "supabaseSyncReceipts": {"exitCode": N, "isGraceful": true/false, "firstLine": "..."}
}`, {label: 'truex-supabase-probe', phase: 'Probe'}),

  () => agent(`You are a validation agent for ${REPO}. Run cognition commands and collect evidence.

WPM="${WPM}"

1. cd ${REPO} && $WPM cognition run --contract mycin --input examples/cognition/mycin/intent.json 2>&1; echo "EXIT:$?"
2. cd ${REPO} && make cognition-smoke 2>&1 | tail -20; echo "EXIT:$?"
3. ls ${REPO}/examples/cognition/ 2>&1
4. cd ${REPO}/crates/wasm4pm-cognition/src/breeds && ls *.rs 2>&1

From step 4 (breed .rs files) and step 3 (example dirs), count actual breeds available.
For step 1: check output has status="ok" and output_hash non-empty (per field contract: never use .decision or .hash).

Return JSON:
{
  "mycin": {"exitCode": N, "statusOk": true/false, "hasOutputHash": true/false, "firstLine": "..."},
  "makeCognitionSmoke": {"exitCode": N, "passed": true/false, "summary": "..."},
  "exampleDirs": ["eliza", "mycin", ...],
  "breedFiles": ["eliza.rs", ...],
  "actualBreedCount": N,
  "readmeBreedCount": 9,
  "discrepancy": "..."
}`, {label: 'cognition-probe', phase: 'Probe'}),

  () => agent(`You are a validation agent for ${REPO}. Test the programmatic API from the README.

The README shows this exact snippet:
\`\`\`typescript
import { readFileSync } from 'fs';
import { Kernel } from 'wasm4pm';
import * as wasm from 'wasm4pm';

const logHandle = wasm.load_eventlog_from_xes(
  readFileSync('data/small-example.xes', 'utf8')
);
const kernel = new Kernel(wasm);
await kernel.init();

const { output } = await kernel.discover('dfg', logHandle, {
  activity_key: 'concept:name',
});
console.log(output);
\`\`\`

Create a temp JS file and run it against the WORKSPACE build (not published npm):
1. Write to /tmp/api-test.mjs:
\`\`\`js
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use workspace Kernel
const { Kernel } = await import('/Users/sac/wasm4pm/packages/kernel/dist/index.js');
const wasm = await import('/Users/sac/wasm4pm/packages/kernel/dist/index.js');

const logHandle = wasm.load_eventlog_from_xes(
  readFileSync('/Users/sac/wasm4pm/data/small-example.xes', 'utf8')
);
const kernel = new Kernel(wasm);
await kernel.init();
const result = await kernel.discover('dfg', logHandle, { activity_key: 'concept:name' });
console.log('output length:', result.output ? result.output.length : 0);
console.log('output non-empty:', Boolean(result.output && result.output.length > 0));
\`\`\`
2. node /tmp/api-test.mjs 2>&1; echo "EXIT:$?"

If the import fails, check what packages/kernel/dist exports and try alternative paths. Also check if 'wasm4pm' package name resolves from workspace root:
node -e "require.resolve('wasm4pm')" 2>&1 from ${REPO}

Return JSON:
{
  "importPath": "what worked",
  "exitCode": N,
  "outputNonEmpty": true/false,
  "kernelExported": true/false,
  "loadEventlogExported": true/false,
  "error": null or "..."
}`, {label: 'api-probe', phase: 'Probe'}),

  () => agent(`You are a validation agent for ${REPO}. Test OTEL telemetry claims from README.

README claims:
- Telemetry is OFF by default
- Enable with: WASM4PM_OTEL_ENABLED=1 WASM4PM_OTEL_ENDPOINT=https://your-collector:4318

WPM="${WPM}"

1. Test telemetry OFF by default:
cd ${REPO} && $WPM run data/small-example.xes -a dfg --no-save 2>&1 | grep -i "otel\|telemetry\|export\|span" | head -10; echo "OTEL_GREP_EXIT:$?"

2. Test OTEL opt-in (endpoint won't be running, but CLI should try to export, not crash):
cd ${REPO} && WASM4PM_OTEL_ENABLED=1 WASM4PM_OTEL_ENDPOINT=http://localhost:4318 $WPM run data/small-example.xes -a dfg --no-save 2>&1 | head -30; echo "EXIT:$?"

3. Check if observability package writes JSONL spans:
cd ${REPO} && WASM4PM_OTEL_ENABLED=1 WASM4PM_OTEL_ENDPOINT=http://localhost:4318 $WPM run data/small-example.xes -a dfg --no-save 2>&1 | grep -i "service_name\|service.name\|span\|otel" | head -10

4. Check config resolver for OTEL env var handling:
grep -n "WASM4PM_OTEL" ${REPO}/packages/config/src/resolver.ts | head -10

Return JSON:
{
  "defaultOff": true/false,
  "otelWithEnvVarExitCode": N,
  "otelWithEnvVarCrashes": true/false,
  "spanEvidenceInOutput": true/false,
  "configResolverHandlesOtelEnv": true/false
}`, {label: 'otel-probe', phase: 'Probe'}),
]);

// ─── Phase 2: All 60 algorithms ─────────────────────────────────────────────
phase('All-60');

const allAlgosEvidence = await agent(`You are a validation agent for ${REPO}. Run ALL 60 registered algorithms via CLI and collect pass/fail evidence.

WPM="${WPM}"
XES="${REPO}/data/small-example.xes"

Step 1: Get the list of all algorithm IDs from the registry:
grep -o '"id": "[^"]*"' ${REPO}/packages/kernel/src/registry.ts | sed 's/"id": //g' | tr -d '"' | sort -u 2>&1

Or alternatively: cd ${REPO} && $WPM algorithms --format json 2>&1 | python3 -c "import sys,json; data=json.load(sys.stdin); [print(a['id']) for a in data.get('payload', data.get('data', data)).get('algorithms', [])]" 2>&1

Step 2: For each algorithm ID, run:
cd ${REPO} && $WPM run "$XES" -a <ID> --no-save 2>&1; echo "EXIT:$?"

For ocel_* algorithms, also try with an OCEL input if available:
ls ${REPO}/examples/ && ls ${REPO}/bench_data/ 2>/dev/null | grep -i "ocel\|json" | head -5

Acceptable exit codes: 0 (success) or 3 (execution_error). Exit codes 1 (config) or 2 (source) indicate the algorithm is broken or needs a different input format.

Run ALL algorithms. For ocel_* algorithms that fail on XES, try:
${REPO}/examples/out/truex_ocel2_valid.json as input with --format ocel2 or similar flag.

Return a JSON array of results:
[
  {"id": "dfg", "exitCode": 0, "status": "pass", "note": ""},
  {"id": "ocel_dfg", "exitCode": 3, "status": "warn", "note": "execution error on XES, needs OCEL input"},
  ...
]
Plus a summary: {"total": 60, "pass": N, "warn": N, "fail": N, "failList": [...]}`, {label: 'all-60-probe', phase: 'All-60'});

// ─── Phase 3: Profile builds ─────────────────────────────────────────────────
phase('Profiles');

const profileEvidence = await agent(`You are a validation agent. Build all 5 deployment profiles for ${REPO}/wasm4pm/ and capture wasm bundle sizes.

README claims:
| mobile  | ~500KB  |
| iot     | ~1.0MB  |
| edge    | ~1.5MB  |
| fog     | ~2.0MB  |
| browser | ~3.4MB  |

IMPORTANT: All profile builds output to the SAME pkg/ directory — capture size after each before the next overwrites it. AFTER all profiles, restore the nodejs target so the CLI keeps working.

Run sequentially:
1. cd ${REPO}/wasm4pm && npm run build:mobile 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm
2. cd ${REPO}/wasm4pm && npm run build:iot 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm
3. cd ${REPO}/wasm4pm && npm run build:edge 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm
4. cd ${REPO}/wasm4pm && npm run build:fog 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm
5. cd ${REPO}/wasm4pm && npm run build:browser 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm
6. RESTORE: cd ${REPO}/wasm4pm && npm run build:nodejs 2>&1 | tail -5; echo "EXIT:$?" && ls -lh pkg/wasm4pm_bg.wasm

Each build may take 1-3 minutes. Be patient and wait for completion.

Return JSON:
{
  "profiles": {
    "mobile": {"exitCode": N, "sizeBytes": N, "sizeHuman": "...", "withinReadmeClaim": true/false},
    "iot": {...},
    "edge": {...},
    "fog": {...},
    "browser": {...}
  },
  "nodejsRestored": true/false,
  "allBuildsSucceeded": true/false
}`, {label: 'profile-builds', phase: 'Profiles', model: 'sonnet'});

// ─── Phase 4: Global install ─────────────────────────────────────────────────
phase('Global-Install');

const installEvidence = await agent(`You are a validation agent. Validate the README's "Install" section by installing @wasm4pm/cli globally.

README claims:
\`\`\`bash
npm install -g @wasm4pm/cli
\`\`\`
Then: wpm --version, wpm doctor, and dual-binary shadowing detection.

Run:
1. npm install -g @wasm4pm/cli 2>&1 | tail -10; echo "EXIT:$?"
2. which wpm 2>&1; echo "EXIT:$?"
3. wpm --version 2>&1; echo "EXIT:$?"
4. wpm doctor 2>&1 | head -20; echo "EXIT:$?"
5. Check dual-binary claim: which -a wpm 2>&1 (list all wpm binaries on PATH)
6. wpm doctor check 2>&1 | grep -i "shadow\|binary\|path" | head -5

After validation, check if the global install shadows the local one:
node /Users/sac/wasm4pm/apps/wasm4pm/dist/bin/wpm.js --version 2>&1; echo "EXIT:$?"

NOTE: After testing, if the global install causes path confusion, npm uninstall -g @wasm4pm/cli

Return JSON:
{
  "installExitCode": N,
  "whichWpm": "...",
  "version": "...",
  "doctorExitCode": N,
  "allBinaries": ["...", "..."],
  "shadowingDetected": true/false,
  "dualBinaryClaimVerified": true/false
}`, {label: 'global-install', phase: 'Global-Install'});

// ─── Phase 5: Write playground scenario ─────────────────────────────────────
phase('Write-Suite');

// Collect all evidence for scenario writing
const scenarioContent = await agent(`You are writing a vitest playground scenario for ${REPO}.

FILE TO CREATE: ${REPO}/playground/scenarios/33-readme-capabilities.ts

This scenario validates README.md capabilities. Follow the exact style of existing scenarios (08-all-algorithms.ts and 11-utility-commands.ts) using the playground helpers.

Key facts from validation (incorporate as assertions):
- Quick Start evidence: ${JSON.stringify(quickStartEvidence)}
- Truex evidence: ${JSON.stringify(truexEvidence)}  
- Cognition evidence: ${JSON.stringify(cognitionEvidence)}
- OTEL evidence: ${JSON.stringify(otelEvidence)}
- All-60 summary: ${JSON.stringify(allAlgosEvidence)}

The scenario must cover:
1. Quick Start commands from README:
   - wpm run data/small-example.xes exits 0 or 3 (never 1/2)
   - wpm run data/small-example.xes -a dfg exits 0 or 3
   - wpm run data/small-example.xes -a inductive exits 0 or 3
   - wpm algorithms exits 0 and output contains >=60 algorithm entries
   - wpm compare dfg,heuristic,inductive -i data/small-example.xes exits 0 or 3
   - wpm doctor check exits 0 or 1 (never 2/3)
   - wpm status --format json exits 0 or 1, output is valid JSON

2. BLAKE3 receipts: after wpm run, .wasm4pm/receipts/latest.json has non-empty input_hash and output_hash

3. Truex verify:
   - truex_ocel2_valid.json → exit 0, status indicates verified
   - truex_ocel2_forged.json → exit 0 or 1, but NOT a stack trace (structured refusal)

4. Supabase graceful failure (no credentials):
   - wpm supabase doctor → exits 0 or 1, NOT stack trace

5. Cognition README example:
   - wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json → exit 0, status ok

6. Docs existence check: assert all README-linked docs exist using fs.existsSync (full paths from REPO root):
   docs/reference/algorithms.md, docs/reference/cli_commands.md, docs/reference/configuration_schema.md,
   docs/reference/deployment_profiles.md, docs/truex-ocel2-canonical-profile.md,
   docs/tutorials/getting_started.md, docs/tutorials/truex_receipts.md, docs/tutorials/predictive_monitoring.md,
   docs/tutorials/cognition_contracts.md, docs/how-to/configure_observability.md,
   docs/how-to/edge_deployment.md, docs/how-to/concept_drift.md, docs/how-to/supabase_integration.md,
   docs/explanation/architecture_overview.md, docs/explanation/old_ai_vs_llms.md,
   SECURITY.md, docs/ENTERPRISE.md, COMMERCIAL_LICENSE.md, LICENSE, AGENTS.md, CONTRIBUTING.md

7. Default algorithm resolution claim: wpm run with no -a flag uses a default (exit 0 or 3, never 1/2)

8. OTEL env var test: WASM4PM_OTEL_ENABLED=1 with unreachable endpoint exits 0 or 3 (graceful, not crash)

Use these imports (same as existing scenarios):
- import { wpm, EXIT_CODES } from '../helpers/cli.js';
- import { resolveRepo } from '../helpers/cli.js'; (or use path.resolve)

For the REPO root path use: path.resolve(import.meta.url, '../../../') via path + url modules.

File MUST:
- Use real WASM (no mocking)
- Have a top comment block documenting what it tests
- Use describe/it/expect from vitest
- Skip with test.skip for env-dependent tests (global install, actual OTEL collector)
- Have timeouts of 30_000ms per test

Write the complete TypeScript file content. Make it production-quality. DO NOT WRITE THE FILE — return only the complete TypeScript source as a string in your response.`, {label: 'write-scenario', phase: 'Write-Suite'});

// Write the scenario file
await agent(`Write this exact content to the file ${REPO}/playground/scenarios/33-readme-capabilities.ts.

Content:
${scenarioContent}

Use the Write tool to create the file. Verify the file was written successfully by reading it back and checking line count.`, {label: 'write-scenario-file', phase: 'Write-Suite'});

// ─── Phase 6: Run the suite ──────────────────────────────────────────────────
phase('Run-Suite');

const suiteResult = await agent(`Run the new playground scenario for ${REPO}.

cd ${REPO}/playground && npx vitest run scenarios/33-readme-capabilities.ts --reporter=verbose 2>&1; echo "SUITE_EXIT:$?"

If any test FAILs (not skips), analyze the failure and report:
- Which test failed
- What the assertion was
- Whether it's a README false claim or a code bug

Return JSON:
{
  "passed": N,
  "failed": N,
  "skipped": N,
  "exitCode": N,
  "failures": [{"test": "...", "reason": "...", "isReadmeDiscrepancy": true/false}],
  "suitePassed": true/false
}`, {label: 'run-suite', phase: 'Run-Suite'});

// ─── Phase 7: Write report ────────────────────────────────────────────────────
phase('Report');

await agent(`Write a validation report and apply confirmed README fixes for ${REPO}.

You have these evidence sources:
- Quick Start: ${JSON.stringify(quickStartEvidence)}
- Truex/Supabase: ${JSON.stringify(truexEvidence)}
- Cognition: ${JSON.stringify(cognitionEvidence)}
- Programmatic API: ${JSON.stringify(apiEvidence)}
- OTEL: ${JSON.stringify(otelEvidence)}
- All-60 algorithms: ${JSON.stringify(allAlgosEvidence)}
- Profile builds: ${JSON.stringify(profileEvidence)}
- Global install: ${JSON.stringify(installEvidence)}
- Test suite: ${JSON.stringify(suiteResult)}

TASK 1: Write ${REPO}/docs/audits/readme-validation-2026-06-09.md

First check if ${REPO}/docs/audits/ directory exists: ls ${REPO}/docs/audits/ 2>/dev/null || mkdir -p ${REPO}/docs/audits/

The report must have:
## README.md Capability Validation — 2026-06-09

### Executive Summary
- Total claims validated: N
- PASS: N | WARN: N | FAIL: N

### Evidence Table
A markdown table: | Claim | Evidence | Status |
Cover every section from README:
1. Install (npm install -g) 
2. Quick Start (all 5 commands)
3. Algorithms (count, named examples)
4. Programmatic API
5. Truex (valid + forged)
6. Supabase (graceful failure)
7. Cognition (9 vs actual breeds)
8. Deployment Profiles (sizes vs README table)
9. Documentation links
10. Telemetry (default-off + opt-in)

### Algorithm Execution Results
Full table of all 60 algorithms with pass/warn/fail per the all-60 evidence.

### Discrepancies
List every confirmed factual discrepancy between README and reality.

### Repeatable Test Suite
Note: playground/scenarios/33-readme-capabilities.ts + result from suite run.

TASK 2: Apply confirmed README fixes

Read ${REPO}/README.md and apply ONLY factually-wrong items:
- Breed count: if actual != 9, update the "Nine breeds" claim to the actual count
- Any other confirmed false claims from the evidence

Do NOT change style, structure, or claims that are "close enough" (e.g., "50+" commands where count is 48-60).

After writing report and fixing README, run:
cd ${REPO} && node apps/wasm4pm/dist/bin/wpm.js doctor check 2>&1 | tail -5; echo "EXIT:$?"
Confirm the system is healthy after all the profile builds and installs.`, {label: 'write-report', phase: 'Report'});

return {
  status: 'complete',
  report: `${REPO}/docs/audits/readme-validation-2026-06-09.md`,
  scenario: `${REPO}/playground/scenarios/33-readme-capabilities.ts`,
  suiteResult,
};
