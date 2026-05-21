# AGENT10-001: `wpm doctor <verb>` — 8 CLI Subcommands

**Status:** 🟡 PLANNED  
**Priority:** P1 — High  
**Effort:** 48 hours  
**Complexity:** Medium  
**Type:** Feature Implementation

---

## Summary

`wpm doctor` is currently a single flat command (24 checks, 3 flags). It has no subcommand structure, no auto-remediation, no publish gate, and no streaming watch mode. As wasm4pm approaches npm publication and production adoption, operators need a richer doctor surface: targeted sub-checks, auto-fix, a publish readiness gate, continuous monitoring, and a portable report artifact.

This ticket defines 8 CLI verbs for `wpm doctor <verb>` and the full implementation contract for each.

---

## Current State

```
wpm doctor [--verbose] [--quiet] [--format json]
```

- Runs all 24 checks in parallel, prints results, exits 0/1
- No subcommands
- No auto-remediation
- No publish-readiness checks
- No continuous monitoring
- No report artifact

---

## Target State

```
wpm doctor <verb> [options]

Verbs:
  check      Run all 24 checks (default, explicit)
  fix        Auto-remediate all fixable issues
  publish    Gate npm publish — fail fast if package is not release-ready
  env        Environment checks only (checks 1–17)
  tps        TPS pipeline integrity checks only (checks 18–24)
  perf       Performance baseline regression checks
  watch      Continuous monitoring (re-run on interval)
  report     Generate portable diagnostic report (JSON / HTML)
```

---

## Verb Specifications

---

### 1. `wpm doctor check`

**What:** Explicit invocation of the current default behavior. Makes the default subcommand addressable by name for scripting and CI.

**Exit codes:** 0 = all pass, 1 = any critical failure, 2 = any warning

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--verbose` / `-v` | false | Show all checks including passing |
| `--quiet` / `-q` | false | Suppress non-error output |
| `--format` | `human` | `human` \| `json` |
| `--checks` | all | Comma-separated check names to run |

**Acceptance criteria:**
- `wpm doctor` (no verb) delegates to `wpm doctor check` — backwards compatible
- `wpm doctor check --checks wasmBinary,algorithmRegistry` runs only named checks
- JSON output includes `{ checks: Diagnosis[], summary: { pass, warn, fail, critical } }`

---

### 2. `wpm doctor fix`

**What:** Auto-remediate every issue that has a machine-executable `fix` string. Issues without a fix are printed but not attempted.

**Fix categories (auto-executable):**
| Issue | Auto-fix action |
|-------|----------------|
| Missing node_modules | `pnpm install` |
| WASM binary missing | `cd wasm4pm && npm run build:nodejs` |
| Results dir missing | `mkdir -p .wasm4pm/results` |
| Git hooks missing | `pnpm prepare` |

**Non-auto-fixable (print only):**
- Node/pnpm version upgrades
- TypeScript errors (user must fix source)
- Disk/memory constraints

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | false | Print what would be fixed without executing |
| `--yes` / `-y` | false | Skip confirmation prompts |

**Exit codes:** 0 = all fixed or no issues, 1 = unfixed critical issues remain

**Acceptance criteria:**
- `--dry-run` prints fix commands without executing them
- Each fix is attempted sequentially; if one fails, others still run (no early exit)
- After all fixes, runs `wpm doctor check` and prints the new summary
- `fix` commands are the literal strings from each check's `fix` field — no ad-hoc logic

---

### 3. `wpm doctor publish`

**What:** Pre-publish readiness gate. Fails fast if the workspace is not ready for `pnpm -r publish`. Adds 6 npm-specific checks beyond the base 24.

**Additional checks (25–30):**

| # | Check | Pass condition |
|---|-------|----------------|
| 25 | Package versions consistent | All `package.json` versions match CalVer format `\d+\.\d+\.\d+[a-z]?` |
| 26 | Build artifacts present | `dist/` exists and is non-empty for every package with a `build` script |
| 27 | `files` field declared | Every publishable `package.json` has a `files` array |
| 28 | No `private: true` leakage | Packages intended for publish do not have `"private": true` |
| 29 | Registry reachable | `npm ping` succeeds (or `--registry` override is reachable) |
| 30 | Changelog entry | `CHANGELOG.md` contains an entry matching the current version |

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--registry` | npm default | Override npm registry URL |
| `--dry-run` | false | Run checks only; do not publish |
| `--publish` | false | If all checks pass, execute `pnpm -r publish --access public` |

**Exit codes:** 0 = ready, 1 = not ready (prints blocking checks), 2 = publish executed and failed

**Acceptance criteria:**
- Without `--publish`, this is a read-only preflight — no side effects
- With `--publish`, confirmation prompt required unless `--yes` is passed
- JSON output includes `{ ready: boolean, blocking: Diagnosis[], warnings: Diagnosis[] }`
- Prints exact `pnpm -r publish` command that would be run before executing it

---

### 4. `wpm doctor env`

**What:** Runs only the 17 environment checks (Node, pnpm, WASM binary, WASM loads, SIMD, config, XES files, memory, disk, git hooks, TypeScript, @wasm4pm/ml, Rust toolchain, results dir, algorithm registry, workspace integrity). Skips TPS pipeline checks.

**Use case:** Fast local sanity check before running `wpm run`; CI environment setup validation.

**Flags:** Same as `check` (`--verbose`, `--quiet`, `--format`)

**Exit codes:** 0 = all 17 pass, 1 = any critical

**Acceptance criteria:**
- Runs in under 3 seconds on a healthy machine
- Does not import or execute any TPS source-analysis code
- `--format json` output includes `{ environment: Diagnosis[], summary }` key

---

### 5. `wpm doctor tps`

**What:** Runs only the 7 TPS Pipeline Integrity checks (18–24: StepTypeSync, RegistryConsistency, StateMachineIntegrity, ProfileCoverage, CanonicalNaming, StepTypeCoverage, StateMachineCompleteness).

**Use case:** Pre-commit hook, pre-merge gate, architecture drift detection.

**Flags:** Same as `check` plus:
| Flag | Default | Description |
|------|---------|-------------|
| `--fail-fast` | false | Exit on first failure |

**Exit codes:** 0 = all 7 pass, 1 = any failure

**Acceptance criteria:**
- Can run without a WASM binary present (source-only analysis)
- `--fail-fast` exits immediately after first failure with non-zero code
- Each failed check prints the specific mismatched symbol/transition name, not just "failed"

---

### 6. `wpm doctor perf`

**What:** Runs performance baseline regression checks against `packages/kernel/performance_baseline.json`. Measures actual Kernel.run() dispatch latency for DFG/heuristic/alpha++ at N=100 and N=1000 events, compares against stored ceilings.

**Checks:**

| Scenario | Ceiling source |
|----------|---------------|
| DFG N=100 | `performance_baseline.json:dfg_n100.ceiling_ms` |
| DFG N=1000 | `performance_baseline.json:dfg_n1k.ceiling_ms` |
| Heuristic N=100 | `performance_baseline.json:heuristic_n100.ceiling_ms` |
| Heuristic N=1000 | `performance_baseline.json:heuristic_n1k.ceiling_ms` |
| Cache hit N=1000 | `performance_baseline.json:cache_hit_n1k.ceiling_ms` |
| OTEL span overhead | `performance_baseline.json:span_capture_overhead.ceiling_ms` |

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--update-baseline` | false | Write new measured values back to baseline JSON |
| `--threshold` | 20 | Regression threshold % over baseline before warning |

**Exit codes:** 0 = within thresholds, 1 = regression detected

**Acceptance criteria:**
- Uses a WASM stub (not real WASM binary) so it runs without a build
- `--update-baseline` requires `--yes` confirmation before writing
- Output shows measured vs ceiling for each scenario in a table
- `--format json` includes `{ regressions: [], within_threshold: [] }`

---

### 7. `wpm doctor watch`

**What:** Continuous monitoring mode. Re-runs `wpm doctor check` on a configurable interval, printing a diff of status changes (new failures or recoveries) rather than the full check list each time.

**Behavior:**
- First run: full output (same as `wpm doctor check --verbose`)
- Subsequent runs: print only checks whose status changed since the last run
- Stable state: print a single heartbeat line `[HH:MM:SS] ✓ All 24 checks passing`
- On new failure: print full diagnosis for the newly-failed check + a summary

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--interval` | 30 | Seconds between checks |
| `--on-fail` | (none) | Shell command to run on new failure (e.g. `osascript -e 'display notification...'`) |

**Exit codes:** Exits only on SIGINT (Ctrl-C); exit 0

**Acceptance criteria:**
- Does not re-print passing checks on every tick
- `--on-fail` command is executed with `DOCTOR_FAIL_CHECK=<name>` env var set
- Interval < 5 is rejected with a warning ("Polling faster than 5s may impact build performance")
- Ctrl-C prints a final summary before exit

---

### 8. `wpm doctor report`

**What:** Generates a portable diagnostic snapshot — a self-contained JSON or HTML file that can be attached to a bug report, shared with a team, or archived for audit.

**Output formats:**

**JSON (`--format json`):**
```json
{
  "generated_at": "2026-05-05T23:00:00Z",
  "wpm_version": "26.4.23",
  "platform": { "os": "darwin", "arch": "arm64", "node": "22.x" },
  "checks": [ { "name": "...", "status": "pass|warn|fail", "message": "...", "fix": "..." } ],
  "summary": { "pass": 22, "warn": 1, "fail": 1, "critical": 0 },
  "environment": { "cwd": "...", "wasmBuildDate": "...", "algorithmCount": 41 }
}
```

**HTML (`--format html`):** Single-file report with inline CSS, collapsible check sections, copy-to-clipboard fix commands, and a pass/warn/fail badge.

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `json` | `json` \| `html` |
| `--out` | `wpm-doctor-report.<ext>` | Output file path |
| `--open` | false | Open the HTML report in the default browser after generation |

**Exit codes:** 0 always (report generation itself does not gate on check results)

**Acceptance criteria:**
- JSON report is valid JSON parseable by `JSON.parse`
- HTML report is a single file with no external dependencies (inline CSS/JS only)
- `--open` uses `open` (macOS), `xdg-open` (Linux), `start` (Windows)
- Report file path printed to stdout on success for easy piping

---

## Architecture

### Command Registration

`apps/wasm4pm/src/commands/doctor.ts` currently exports a single `defineCommand`. Refactor to export a `defineCommand` with `subCommands`:

```typescript
export const doctor = defineCommand({
  meta: { name: 'doctor', description: '...' },
  subCommands: {
    check:   doctorCheck,
    fix:     doctorFix,
    publish: doctorPublish,
    env:     doctorEnv,
    tps:     doctorTps,
    perf:    doctorPerf,
    watch:   doctorWatch,
    report:  doctorReport,
  },
  // Default (no verb) delegates to check
  run(ctx) { return doctorCheck.run(ctx); },
});
```

### Shared Check Groups

Extract the 24 existing checks into two named arrays for reuse by `env` and `tps`:

```typescript
const ENV_CHECKS = [
  checkNodeVersion, checkPnpmVersion, checkWasmBinary, checkWasmLoads,
  checkSimdSupport, checkConfigFound, checkConfigValidation, checkXesFiles,
  checkSystemMemory, checkDiskSpace, checkGitHooks, checkTypeScriptCompilation,
  checkMicroMl, checkRustToolchain, checkResultsDir, checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
];

const TPS_CHECKS = [
  checkStepTypeSync, checkRegistryConsistency, checkStateMachineIntegrity,
  checkProfileCoverage, checkCanonicalNaming, checkStepTypeCoverage,
  checkStateMachineCompleteness,
];
```

### Publish Checks (new)

New file: `apps/wasm4pm/src/commands/doctor-publish.ts`  
Six functions following the same `async (): Promise<Diagnosis>` signature as existing checks.

### Perf Harness

Reuse the existing `Kernel` stub pattern from `packages/kernel/src/__tests__/performance-baseline.test.ts`. The `perf` verb is a CLI wrapper around the same logic — no new measurement code.

### Report Generator

New file: `apps/wasm4pm/src/commands/doctor-report.ts`  
HTML template is a single template literal (no external template engine dependency).

---

## Critical Files

| File | Action |
|------|--------|
| `apps/wasm4pm/src/commands/doctor.ts` | **REFACTOR** — extract check arrays, add subcommand dispatch |
| `apps/wasm4pm/src/commands/doctor-publish.ts` | **CREATE** — 6 publish-readiness checks |
| `apps/wasm4pm/src/commands/doctor-report.ts` | **CREATE** — JSON + HTML report generator |
| `apps/wasm4pm/src/__tests__/doctor-verbs.test.ts` | **CREATE** — tests for all 8 verbs |
| `apps/wasm4pm/src/cli.ts` | **VERIFY** — subcommand routing works with citty |

---

## Acceptance Criteria Summary

| Verb | Key gate |
|------|---------|
| `check` | Backwards-compatible with current `wpm doctor`; `--checks` filter works |
| `fix` | `--dry-run` is read-only; auto-fixes run and re-check |
| `publish` | 6 new checks; `--publish` flag executes `pnpm -r publish` only when all pass |
| `env` | Runs in < 3s; only checks 1–17 |
| `tps` | Works without WASM binary; `--fail-fast` exits on first failure |
| `perf` | Uses WASM stub; `--update-baseline` writes baseline JSON |
| `watch` | Diff-only output after first run; `--on-fail` hook executes |
| `report` | Single-file HTML with no external deps; JSON is valid `JSON.parse` input |

---

## Non-Goals

- No telemetry or remote reporting
- No automatic git commit of baseline updates
- No integration with external monitoring systems (Datadog, PagerDuty)
- `fix` does not modify TypeScript source files
