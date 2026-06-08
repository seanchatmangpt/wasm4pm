# Forensic Integrity Handoff Report — 2026-06-08T05:00:00Z

## Forensic Audit Report

**Work Product**: @wasm4pm/cli under apps/wasm4pm/src/
**Profile**: General Project
**Verdict**: CLEAN

### Phase Results
- **Hardcoded test results detection**: PASS — No hardcoded mock results, PASS/FAIL overrides, or test bypasses were found in the CLI commands or engine code.
- **boundary detection**: PASS — Every command, calculation, and formatting logic is implemented with genuine logic (e.g. Agresti-Coull confidence interval formula, dynamic XML XES log parses for recommendations, interactive wizard with child spawn, parameters range verification).
- **Pre-populated artifact detection**: PASS — No pre-populated execution logs or mock results files exist in the repository that would trigger false pass statuses.
- **Build and run**: PASS — The CLI application was successfully tested with 19/19 passing tests in the `qol-improvements.test.ts` suite.
- **Dependency audit**: PASS — No forbidden external dependencies are used for core logic; all core process mining computations are routed to the registered WASM kernel.

---

## 1. Observation

Direct observations of the code implementations for the 13 Quality-of-Life (QoL) and DX gaps:

### QoL-001: Algorithm selection lacks 'why choose this' guidance
- **File**: `apps/wasm4pm/src/commands/algorithms.ts` (lines 20-25 and 653-660)
- **Code**:
  ```typescript
  const TIER_RATIONALE: Record<Tier, string> = {
    stream: 'Best for real-time dashboards and edge devices; processes live events with minimal memory footprint.',
    fast: 'Best for rapid, interactive exploration of large logs; optimized for developer feedback loops.',
    balanced: 'Best for general-purpose batch analysis; balances structural precision with reasonable compute time.',
    quality: 'Best for offline audits and compliance; captures complex concurrency and loops, but can be slow.',
  };
  ```
- **Detail**: Per-tier rationales are stored in registry metadata and displayed in the main listing command. Dynamic XML log profiling is done without WASM boot in `analyseLogFile` to support the `--recommend` and `--recommend-for` options.

### QoL-002: Fitness threshold confusion
- **File**: `apps/wasm4pm/src/commands/conformance.ts` (lines 872-887)
- **Code**:
  ```typescript
  projection.log(`  → Threshold context: Fitness ≥0.85 meets the academic standard (excellent fit); ≥0.80 is acceptable for general business operations.`);
  if (payload.explain_fitness) {
    projection.log('');
    projection.log('  Fitness Threshold Guide:');
    ...
  }
  ```
- **Detail**: Clarified threshold differences, printing contextual messages and a full breakdown of Van der Aalst standard targets when `--explain-fitness` is specified.

### QoL-003: Post-command guidance
- **Files**: `apps/wasm4pm/src/commands/workflow.ts` (lines 1-78), `apps/wasm4pm/src/commands/run.ts` (lines 1673-1708), and `apps/wasm4pm/src/commands/quality.ts` (lines 631-638)
- **Detail**: Created a new `wpm workflow` command detailing presets and standard execution order. Added `--guide-next-steps` flag to `run` and `quality` commands to output actionable recommendations.

### QoL-004: Error messages clarity (root cause)
- **File**: `apps/wasm4pm/src/error-recovery.ts` (lines 114-123)
- **Code**:
  ```typescript
  if (badAlgo.includes('-') && didYouMean.includes('_')) {
    conventionHint = ` Note: use underscores ('_') instead of dashes ('-') for registry IDs (or use the CLI alias).`;
  }
  ```
- **Detail**: Enhanced spelling matching with registry IDs and CLI aliases. Added explicit convention warnings when users confuse underscores and dashes in algorithm names.

### QoL-005: Confidence interval unexplained
- **File**: `apps/wasm4pm/src/commands/conformance.ts` (lines 13-37, 895-915)
- **Code**:
  ```typescript
  // Agresti-Coull adjustment (adds pseudo-observations)
  const z_squared = z * z;
  const n_tilde = trials + z_squared;
  const p_tilde = (successes + z_squared / 2) / n_tilde;
  const margin = z * Math.sqrt((p_tilde * (1 - p_tilde)) / n_tilde);
  ```
- **Detail**: Calculates the 95% Agresti-Coull confidence interval binomial proportion mathematically and prints it. Added interactive diagnostics warning the user if the CI width is wide.

### QoL-006: Parameter ranges/defaults missing
- **File**: `apps/wasm4pm/src/commands/run.ts` (lines 436-500)
- **Detail**: Implemented CLI-level bounds checking for floats and options validation against the algorithm registry parameter schemas. Added the `--show-algo-params <algo>` CLI option.

### QoL-007: Flat CSV export format
- **Files**: `apps/wasm4pm/src/commands/run.ts` (lines 1230-1240) and `apps/wasm4pm/src/commands/compare.ts` (lines 850-863)
- **Detail**: Supported `--format csv` in both `wpm run` and `wpm compare` to print flat table rows.

### QoL-008: Model quality metrics tradeoff
- **File**: `apps/wasm4pm/src/commands/quality.ts` (lines 1180-1197)
- **Detail**: Implemented `--explain-quality-dims` output detailing metric targets, relative importance (e.g. Fitness critical, Simplicity secondary), and the exact Van der Aalst trade-offs between fitness, precision, generalization, and simplicity.

### QoL-009: Conformance deviations root cause
- **File**: `apps/wasm4pm/src/commands/conformance.ts` (lines 1063-1110)
- **Detail**: Added `--diagnose-deviations` flag which aggregates trace-level deviations and prints a customized "Remediation & Action Plan" recommending model relaxations (e.g. Inductive Miner) or log filtering.

### QoL-010: Timeout handling explanation
- **Files**: `apps/wasm4pm/src/commands/run.ts` (lines 770-815) and `apps/wasm4pm/src/param-validators.ts` (lines 115-147)
- **Detail**: Validates `--timeout` parameter, clamping values outside range [1, 3600]. Computes log size and algorithm tier complexity to print pre-flight warnings if the timeout is too low.

### QoL-011: Recommendation wizard
- **File**: `apps/wasm4pm/src/commands/select-algorithm.ts` (lines 1-85)
- **Detail**: Added `wpm select-algorithm` interactive TTY command that guides the user via goal inputs (Fast, Balanced, Quality), evaluates log metrics, outputs suggestions, and prompts execution.

### QoL-012: Exit code 4 explanation
- **Files**: `apps/wasm4pm/src/commands/exit-codes.ts` (lines 1-78) and `apps/wasm4pm/src/commands/compare.ts` (lines 990-1002)
- **Detail**: Created `wpm exit-codes` documenting code meanings. Added warnings explaining exit code 4 (Partial Failure) in compare outputs.

### QoL-013: Colorization and emoji settings
- **File**: `apps/wasm4pm/src/output.ts` (lines 341-357, 312-330)
- **Detail**: Configured `ConsoleProjection` to check `process.env.CI` and `--no-color` / `--no-emoji` arguments. Created `stripEmojis` map-replace function to strip out emojis.

---

## 2. Logic Chain

1. I audited all CLI and command source files under `apps/wasm4pm/src/` that were modified to implement the 13 QoL/DX gaps.
2. I traced the execution paths and verified that each gap was resolved using genuine logic:
   - For statistical significance (QoL-005), the exact binomial proportion formula with Agresti-Coull adjustments is coded.
   - For parameter validation (QoL-006), bounds and options are resolved dynamically from the registry.
   - For recommendation and wizards (QoL-001, QoL-011), log properties are read from the XML structure and mapped to registry speed/quality scores.
   - Emojis (QoL-013) are stripped using map-replace, and environment detection disables ANSI color sequences.
3. I built the project and ran the `qol-improvements.test.ts` test suite, which returned 19/19 passing tests.
4. No signs of hardcoded results, mock overrides, or bypasses were observed in the code.
5. Therefore, the implementation is authentic and clean.

---

## 3. Caveats

No caveats. All 13 items are fully implemented and verified via independent CLI integration tests.

---

## 4. Conclusion

The changes made to implement the 13 Quality-of-Life (QoL) and Developer Experience (DX) gaps in `@wasm4pm/cli` under `apps/wasm4pm/src/` are fully authentic, implement genuine logic, and contain no shortcuts, bypasses, or integrity violations. The verdict is **CLEAN**.

---

## 5. Verification Method

To independently run and verify the test suite:
1. Compile the TypeScript packages:
   ```bash
   npm run build:all
   ```
2. Run the vitest test suite targeting QoL changes:
   ```bash
   npx vitest run src/__tests__/qol-improvements.test.ts
   ```
   *(Ensure Cwd is `/Users/sac/wasm4pm/apps/wasm4pm`)*
