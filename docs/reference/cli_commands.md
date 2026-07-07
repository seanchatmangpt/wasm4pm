# Reference: CLI Commands

> **Generated from the live noun/verb registry.** Do not hand-edit — run
> `pnpm --filter @wasm4pm/cli run gen:docs` after changing anything under
> `apps/wasm4pm/src/nouns/`. CI checks this file for drift with
> `pnpm --filter @wasm4pm/cli run gen:docs -- --check`.
>
> Source of truth: `apps/wasm4pm/src/cli.ts` (`ALL_NOUNS`), the exact
> registry `buildCli()` dispatches from — this doc, `--help`, and
> `--introspect` can never drift from each other or from actual dispatch.
>
> Version: **v26.7.1** · **61** verbs across **8** nouns
> (40 stable, 21 experimental under `wpm lab`).

## Noun tree

`wpm <noun> <verb> [args]` — nouns: log, model, pipeline, evidence, config, system, lab, help.

| Noun | Verbs | Stability |
|------|-------|-----------|
| `log` | validate, stats, dedupe, query, convert, sample | stable |
| `model` | discover, check, compare, diff, explain, simulate, predict | stable |
| `pipeline` | run, plan, suggest, watch, resume | mixed |
| `evidence` | show, verify, chain, keygen, report, replay | stable |
| `config` | show, get, set, reset, env, export, diff, check, init | stable |
| `system` | doctor, status, cache, models, completions | stable |
| `lab` | membrane, cell, adversary, cognition, agent, autoprocess, oracle, truex, prolog8, repl, claude, supabase, wasm-server, trace, benchmark, timeout, feedback, ml, temporal, social | experimental |
| `help` | algorithms, examples, exit-codes | stable |

## Output contract

Every verb prints **exactly one JSON value to stdout** by default — either
the verb's plain result, or a structured error envelope
`{ error: { code, message, action_template } }`. `JSON.parse(stdout)`
always succeeds, success or failure. Human-readable text (from `--human`,
or the `[experimental]` banner for `wpm lab` verbs) is written to
**stderr only**, never stdout.

```bash
wpm model discover log.xes -a heuristic_miner   # JSON result on stdout
wpm model discover log.xes --human              # same stdout JSON, plus a
                                                 # human summary on stderr
```

## Introspection

Every verb accepts `--introspect` to print its Anthropic/OpenAI tool-schema
JSON instead of running:

```bash
wpm model discover --introspect       # schema for one verb
wpm --introspect                      # schema for the whole registry
```

## Chaining (`++`) and stdin extraction (`@-`)

```bash
# Run two verbs in one process; @{1.field} extracts from step 1's JSON result
wpm model discover log.xes ++ model check --mode replay --model @{1.handle}

# @- injects stdin; @-::json.path extracts a field from it
cat receipt.json | wpm evidence verify @-
echo '{"model":{"handle":"abc"}}' | wpm model check --model @-::model.handle
```

## Removed commands (hard break)

wpm v1's flat ~44-command surface was retired in this release. Every
removed invocation exits `1` and names its replacement — see
`apps/wasm4pm/src/nouns/_removed.ts`:

| Old (wpm v1) | Replacement (wpm v2) |
|--------------|------------------------|
| `wpm oracle conform` | `wpm model check --mode oracle` |
| `wpm oracle attest` | `wpm model check --mode oracle` |
| `wpm config validate` | `wpm config check` |
| `wpm config verify` | `wpm config check` |
| `wpm config doctor` | `wpm config check` |
| `wpm truex verify` | `wpm evidence verify` |
| `wpm prolog8 replay` | `wpm evidence replay` |
| `wpm cognition receipt` | `wpm evidence show` |
| `wpm pipeline create` | `wpm pipeline plan` |
| `wpm pipeline list` | `wpm pipeline plan` |
| `wpm pipeline validate` | `wpm pipeline plan` |
| `wpm powl replay` | `wpm model check --mode replay` |
| `wpm powl construct` | `wpm model discover` |
| `wpm run` | `wpm model discover` |
| `wpm analyze` | `wpm pipeline run` |
| `wpm suggest` | `wpm pipeline suggest` |
| `wpm autopilot` | `wpm pipeline run --auto` |
| `wpm compare` | `wpm model compare` |
| `wpm quality` | `wpm log stats` |
| `wpm conformance` | `wpm model check --mode replay` |
| `wpm predict` | `wpm model predict` |
| `wpm validate` | `wpm log validate` |
| `wpm diff` | `wpm model diff` |
| `wpm doctor` | `wpm system doctor` |
| `wpm init` | `wpm config init` |
| `wpm results` | `wpm evidence report` |
| `wpm repl` | `wpm lab repl` |
| `wpm explain` | `wpm model explain` |
| `wpm bench-data` | `wpm log sample` |
| `wpm data` | `wpm log, system, or lab (data was a grouping alias, not a noun)` |
| `wpm dev` | `wpm lab or system (dev was a grouping alias, not a noun)` |
| `wpm membrane` | `wpm lab membrane` |
| `wpm cell` | `wpm lab cell` |
| `wpm oracle` | `wpm lab oracle` |
| `wpm adversary` | `wpm lab adversary` |
| `wpm truex` | `wpm lab truex` |
| `wpm autoprocess` | `wpm lab autoprocess` |
| `wpm agent` | `wpm lab agent` |
| `wpm cache` | `wpm system cache` |
| `wpm models` | `wpm system models` |
| `wpm deduplicate` | `wpm log dedupe` |
| `wpm batch` | `wpm pipeline run` |
| `wpm supabase` | `wpm lab supabase` |
| `wpm wasm-server` | `wpm lab wasm-server` |
| `wpm trace` | `wpm lab trace` |
| `wpm prolog8` | `wpm lab prolog8` |
| `wpm claude` | `wpm lab claude` |
| `wpm proof` | `wpm evidence report` |
| `wpm benchmark` | `wpm lab benchmark` |
| `wpm timeout` | `wpm lab timeout` |
| `wpm feedback` | `wpm lab feedback` |
| `wpm completions` | `wpm system completions` |
| `wpm watch` | `wpm pipeline watch` |
| `wpm status` | `wpm system status` |
| `wpm drift-watch` | `wpm model check --mode drift` |
| `wpm ml` | `wpm lab ml` |
| `wpm powl` | `wpm model discover` |
| `wpm simulate` | `wpm model simulate` |
| `wpm temporal` | `wpm lab temporal` |
| `wpm social` | `wpm lab social` |
| `wpm verify` | `wpm evidence verify` |
| `wpm cognition` | `wpm lab cognition` |
| `wpm compile` | `wpm pipeline plan` |
| `wpm prefix-conformance` | `wpm model check --mode prefix` |
| `wpm algorithms` | `wpm help algorithms` |
| `wpm examples` | `wpm help examples` |
| `wpm interpret` | `wpm model explain` |
| `wpm exit-codes` | `wpm help exit-codes` |
| `wpm receipt` | `wpm evidence show` |
| `wpm workflow` | `wpm pipeline plan` |
| `wpm select-algorithm` | `wpm model discover --auto-select` |
| `wpm self-conformance` | `wpm model check --mode self` |
| `wpm query` | `wpm log query` |

## Exit codes

| Code | Meaning |
|-----:|---------|
| 0 | success |
| 1 | config_error |
| 2 | source_error |
| 3 | execution_error |
| 4 | partial_failure |
| 5 | system_error |
| 6 | conformance_fail |

Run `wpm help exit-codes` for the live, generated version of this table.

## Full noun/verb reference

### `wpm log`

Validate, profile, deduplicate, query, convert, and sample event logs

Verbs: `validate`, `stats`, `dedupe`, `query`, `convert`, `sample`

#### `wpm log validate`

Validate event log schema, required attributes, and data quality (was: wpm validate)

_No arguments._

#### `wpm log stats`

Show basic log statistics: event/case/activity counts (was: wpm quality, in part)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<input>` | positional | yes | — | Path to the event log or OCEL log |
| `--activity-key` | string | no | — | Event attribute key for activity names (default: concept:name) |

#### `wpm log dedupe`

Identify and manage duplicate logs by content hash: scan | report | clear | load (was: wpm deduplicate)

_No arguments._

#### `wpm log query`

Evaluate an OCPQ (Object-Centric Process Query) against an OCEL event log (was: wpm query)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--ocel` | string | yes | — | Path to the OCEL 2.0 JSON event log file |
| `--query` | string | yes | — | OCPQ query: inline JSON string (starts with '{') or path to a JSON file |

#### `wpm log convert`

Normalize a log to JSON (OCEL v1 -> v2 JSON; XES/CSV -> {traces:[...]} JSON)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<input>` | positional | yes | — | Path to the event log |
| `--output` / `-o` | string | no | — | Write JSON to this path instead of returning it inline |
| `--activity-key` | string | no | — | Event attribute key for activity names (default: concept:name) |

#### `wpm log sample`

Sample N traces from an XES/CSV log

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<input>` | positional | yes | — | Path to the event log |
| `--count` / `-n` | string | no | — | Number of traces to sample (default: 10) |
| `--strategy` | string | no | — | first | random (default: first) |
| `--activity-key` | string | no | — | Event attribute key for activity names (default: concept:name) |

### `wpm model`

Discover, check, compare, and reason about process models

Verbs: `discover`, `check`, `compare`, `diff`, `explain`, `simulate`, `predict`

#### `wpm model discover`

Discover a process model from an event log or OCEL 2.0 log (was: wpm run)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<input>` | positional | yes | — | Path to the event log (XES, CSV, or OCEL JSON/NDJSON) |
| `--algorithm` / `-a` | string | no | — | Discovery algorithm id or alias (run "wpm help algorithms" for the full list) |
| `--activity-key` | string | no | — | Event attribute key for activity names (default: concept:name) |
| `--case-id-key` | string | no | — | CSV column holding the case id (default: case:concept:name) |
| `--timestamp-key` | string | no | — | CSV column holding the timestamp (default: time:timestamp) |

#### `wpm model check`

Check conformance of a log against a model. Modes: replay (token-based fitness), prefix (per-trace prefix conformance), self (log vs. a model mined from itself), oracle (OCEL episode-grouped prefix conformance, fail-closed), drift (one-shot concept-drift check)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<input>` | positional | yes | — | Path to the event log or OCEL log to check |
| `--model` / `-m` | string | no | — | Path to a PNML/DFG-JSON model file, or an existing WASM handle (required for replay/prefix/oracle) |
| `--mode` | string | no | — | Conformance strategy: replay | prefix | self | oracle | drift (default: replay) |
| `--activity-key` | string | no | — | Event attribute key for activity names (default: concept:name) |
| `--object-type` | string | no | — | OCEL object type to group episodes by, for --mode oracle (default: 'episode') |
| `--fitness-threshold` | string | no | — | Minimum fitness to conform, for replay/self modes (default: 1.0) |
| `--window-size` | string | no | — | Drift-detection window size, for --mode drift (default: 50) |

#### `wpm model compare`

Compare discovery algorithms side-by-side (was: wpm compare)

_No arguments._

#### `wpm model diff`

Compare two logs or models — activities, edges, Jaccard distance (was: wpm diff)

_No arguments._

#### `wpm model explain`

Plain-English explanation of an algorithm, metric, or result (was: wpm explain, wpm interpret)

_No arguments._

#### `wpm model simulate`

Monte Carlo simulation and process-tree playout (was: wpm simulate)

_No arguments._

#### `wpm model predict`

Predict next-activity, remaining-time, outcome, drift, features, or resource (was: wpm predict)

_No arguments._

### `wpm pipeline`

Plan, run, watch, and resume multi-step analysis pipelines

Verbs: `run`, `plan`, `suggest`, `watch`, `resume`

#### `wpm pipeline run`

Build and execute a step plan from a preset, a plan file, or --auto, chaining a BLAKE3 receipt per step (was: wpm pipeline run, wpm analyze, wpm batch)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--preset` | string | no | — | Built-in preset: full | quick | compliance |
| `--plan-file` | string | no | — | Path to a custom plan JSON file ({steps: [{noun,verb,args,dependsOn}]}) |
| `--auto` | boolean | no | — | Auto-build a quick validate -> discover plan for --input |
| `--input` / `-i` | string | no | — | Input log path (required for --preset/--auto) |

#### `wpm pipeline plan`

Build a typed step DAG from a preset, a plan file, or --auto (was: wpm compile, wpm workflow, wpm pipeline create/list/validate)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--preset` | string | no | — | Built-in preset: full | quick | compliance |
| `--plan-file` | string | no | — | Path to a custom plan JSON file ({steps: [{noun,verb,args,dependsOn}]}) |
| `--auto` | boolean | no | — | Auto-build a quick validate -> discover plan for --input |
| `--input` / `-i` | string | no | — | Input log path (required for --preset/--auto) |

#### `wpm pipeline suggest`

Analyze a log and recommend top algorithms for a goal (was: wpm suggest)

_No arguments._

#### `wpm pipeline watch` `[experimental]`

Watch a log file and re-run discovery on change (was: wpm watch)

_No arguments._

#### `wpm pipeline resume`

Show the last saved receipt so a previous pipeline run can be inspected/continued manually

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--receipts-dir` | string | no | — | Receipts directory (default: .wasm4pm/receipts) |

### `wpm evidence`

Inspect, verify, and generate keys for BLAKE3 receipt-chain evidence

Verbs: `show`, `verify`, `chain`, `keygen`, `report`, `replay`

#### `wpm evidence show`

Show a saved receipt (was: wpm receipt show)

_No arguments._

#### `wpm evidence verify`

Re-hash and validate a saved receipt for tamper detection (was: wpm verify, wpm truex verify)

_No arguments._

#### `wpm evidence chain`

Verify the BLAKE3 receipt hash chain (was: wpm receipt verify-chain)

_No arguments._

#### `wpm evidence keygen`

Generate an ed25519 key pair for receipt signing (was: wpm receipt keygen)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--dir` | string | no | `".wasm4pm/keys"` | Directory to write key files |

#### `wpm evidence report`

View saved discovery/prediction results and evidence reports (was: wpm results, wpm proof)

_No arguments._

#### `wpm evidence replay`

Verify a receipt by replaying its proof, detecting tampering (was: wpm prolog8 replay)

_No arguments._

### `wpm config`

Inspect and manage wasm4pm configuration

Verbs: `show`, `get`, `set`, `reset`, `env`, `export`, `diff`, `check`, `init`

#### `wpm config show`

Display resolved configuration with provenance (CLI args > TOML > JSON > ENV vars > defaults)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--detailed` | boolean | no | `false` | Include all ENV variable mappings |

#### `wpm config get`

Get a single resolved config value by dot-path (e.g. algorithm.name)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<field>` | positional | yes | — | Dot-path to config field |

#### `wpm config set`

Set a value in wasm4pm.toml (was: wpm config set)

_No arguments._

#### `wpm config reset`

Reset wasm4pm.toml to defaults (was: wpm config reset)

_No arguments._

#### `wpm config env`

Show all WASM4PM_* env vars with SET/NOT SET status (was: wpm config env)

_No arguments._

#### `wpm config export`

Export resolved config (toml|json|env) or the algorithm registry as JSON Schema (was: wpm config export)

_No arguments._

#### `wpm config diff`

Compare configs across environments (was: wpm config diff)

_No arguments._

#### `wpm config check`

Run config warnings check — non-zero exit if any warnings exist (was: config validate/verify/doctor)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--config` | string | no | — | Path to a specific config file |

#### `wpm config init`

Scaffold wasm4pm.toml + .env.example in the current directory (was: wpm init)

_No arguments._

### `wpm system`

Environment diagnostics, WASM status, caches, and shell completions

Verbs: `doctor`, `status`, `cache`, `models`, `completions`

#### `wpm system doctor`

Diagnose environment, WASM, and config issues; JTBD hook verification (was: wpm doctor)

_No arguments._

#### `wpm system status`

Show WASM module status and memory usage (was: wpm status)

_No arguments._

#### `wpm system cache`

Show discovery cache stats, or clear cache entries (was: wpm cache)

_No arguments._

#### `wpm system models`

List, clear, or inspect cached process models (was: wpm models)

_No arguments._

#### `wpm system completions`

Print shell completion script for bash, zsh, or fish (was: wpm completions)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `<shell>` | positional | yes | — | Target shell: bash | zsh | fish |

### `wpm lab`

Experimental and advanced command suites (legacy behavior, unchanged)

Verbs: `membrane`, `cell`, `adversary`, `cognition`, `agent`, `autoprocess`, `oracle`, `truex`, `prolog8`, `repl`, `claude`, `supabase`, `wasm-server`, `trace`, `benchmark`, `timeout`, `feedback`, `ml`, `temporal`, `social`

#### `wpm lab membrane` `[experimental]`

AutoMembrane: show | init | build | check | doctor | replay | verify | export (was: wpm membrane)

_No arguments._

#### `wpm lab cell` `[experimental]`

Cell/actor lifecycle experiments (was: wpm cell)

_No arguments._

#### `wpm lab adversary` `[experimental]`

Adversarial proof lifecycle convergence test, 18 probes (was: wpm adversary)

_No arguments._

#### `wpm lab cognition` `[experimental]`

Cognition breed run/verify/watch/doctor/receipt/explain/plan/replay/inspect/adversarial (was: wpm cognition)

_No arguments._

#### `wpm lab agent` `[experimental]`

Van der Aalst process-mining agents and RL autonomic agents (was: wpm agent)

_No arguments._

#### `wpm lab autoprocess` `[experimental]`

Full autonomic control loop: Perception -> Decision -> Protection -> Optimization (was: wpm autoprocess)

_No arguments._

#### `wpm lab oracle` `[experimental]`

[legacy, has known defects] OCEL episode conformance: conform | attest — prefer "model check --mode oracle" (was: wpm oracle)

_No arguments._

#### `wpm lab truex` `[experimental]`

Truex envelope lifecycle tooling (was: wpm truex)

_No arguments._

#### `wpm lab prolog8` `[experimental]`

Byte-capped proof engine: show | query | replay (was: wpm prolog8)

_No arguments._

#### `wpm lab repl` `[experimental]`

Interactive REPL: run commands without re-loading WASM each time (was: wpm repl)

_No arguments._

#### `wpm lab claude` `[experimental]`

Claude Code integration status: session, hooks, proof audit (was: wpm claude)

_No arguments._

#### `wpm lab supabase` `[experimental]`

Supabase sync: sync-receipts | ingest-truex | doctor | sync-queue (was: wpm supabase)

_No arguments._

#### `wpm lab wasm-server` `[experimental]`

Long-lived WASM server: start | stop | status | reset (was: wpm wasm-server)

_No arguments._

#### `wpm lab trace` `[experimental]`

Trace-to-POWL v2 pipeline: ingest | ocel | powl | conform (was: wpm trace)

_No arguments._

#### `wpm lab benchmark` `[experimental]`

Benchmark corpus tooling: build | replay | verify | export (was: wpm benchmark, wpm bench-data)

_No arguments._

#### `wpm lab timeout` `[experimental]`

Adaptive timeout inspection/tuning (was: wpm timeout)

_No arguments._

#### `wpm lab feedback` `[experimental]`

Algorithm feedback capture/ranking tooling (was: wpm feedback)

_No arguments._

#### `wpm lab ml` `[experimental]`

ML analysis: classify | cluster | forecast | anomaly | regress | pca (was: wpm ml)

_No arguments._

#### `wpm lab temporal` `[experimental]`

Analyze temporal profiles and performance patterns (was: wpm temporal)

_No arguments._

#### `wpm lab social` `[experimental]`

Mine social networks: handover, working-together (was: wpm social)

_No arguments._

### `wpm help`

Generated reference topics: algorithms, examples, exit codes

Verbs: `algorithms`, `examples`, `exit-codes`

#### `wpm help algorithms`

List all algorithms with their formats, model type, and WASM export (was: wpm algorithms)

_No arguments._

#### `wpm help examples`

Browse one example invocation per noun/verb (was: wpm examples)

| Arg | Type | Required | Default | Description |
|-----|------|:--------:|---------|-------------|
| `--noun` | string | no | — | Filter to a single noun (e.g. model, log, pipeline) |

#### `wpm help exit-codes`

Show the exit-code contract for legacy (bridged) and native noun-verb commands (was: wpm exit-codes)

_No arguments._

