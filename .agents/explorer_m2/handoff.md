# Handoff Report — M2: Conformance and Quality Diagnostics (QoL-002, QoL-005, QoL-008, QoL-009)

## Executive Summary
This report details the implementation strategy and exact code modifications required to resolve four critical Quality-of-Life (QoL) and Developer Experience (DX) gaps identified in the `@wasm4pm/cli` package, specifically in the conformance and quality commands. The recommended changes introduce `--explain-fitness`, `--explain-ci`, `--explain-quality-dims`, and `--diagnose-deviations` to provide process mining practitioners with clear, actionable, and statistically sound guidance directly inside the CLI.

---

## 1. Observation
We analyzed the implementation of conformance checking and quality metrics inside `@wasm4pm/cli` (specifically in `apps/wasm4pm/src/commands/conformance.ts` and `apps/wasm4pm/src/commands/quality.ts`). The following key observations were made:
- **`apps/wasm4pm/src/commands/conformance.ts`**:
  - The CLI argument parsing is defined using the `citty` framework starting at line 130.
  - The `ConformancePayload` interface (lines 84-125) represents the structured data passed to output formatters.
  - The Agresti-Coull confidence interval is computed at lines 588-597 but printed as a raw range without explanation (lines 839-842) under `printHumanConformance`.
  - Deviations are listed but lack contextual categorization and remediation strategies (lines 950-997).
- **`apps/wasm4pm/src/commands/quality.ts`**:
  - The `QualityPayload` interface (lines 32-84) defines the output format for the `quality` command.
  - The command arguments are defined starting at line 86, which includes a boolean `--explain` flag (lines 156-161).
  - The dimensions (fitness, precision, generalization, simplicity) are printed via `printHumanQuality` (lines 993-1156) and `printExplainQuality` (lines 1162-1275), but no details are provided concerning relative importance or tradeoffs (e.g. how optimizing fitness degrades precision).
- **`/Users/sac/wasm4pm-qol-audit-2026-05-18.json`**:
  - The JSON audit report outlines the exact requirements and severity for `QoL-002`, `QoL-005`, `QoL-008`, and `QoL-009`.

---

## 2. Logic Chain
To address these gaps without breaking the decoupled CLI design (where output rendering is separated from core calculations):
1. **Command Arguments**: We must define the new flags (`--explain-fitness`, `--explain-ci`, `--diagnose-deviations` in `conformance.ts`, and `--explain-quality-dims` in `quality.ts`) inside the `args` section of `defineCommand`.
2. **Payload Enrichment**: Since the print formatters (`printHumanConformance` and `printHumanQuality`/`printExplainQuality`) only accept the payload and projection as arguments, the parsed boolean flags must be carried inside the `ConformancePayload` and `QualityPayload` objects.
3. **Formatted Outputs**:
   - For `conformance.ts`, default outputs should include a brief explanation of default vs. academic targets and a CI diagnostic line. Passing `--explain-fitness`, `--explain-ci`, or `--diagnose-deviations` should trigger detailed console logs.
   - For `quality.ts`, default outputs should list the relative importance of the 4 dimensions. Passing `--explain-quality-dims` should trigger a deep-dive section outlining the tradeoffs.

---

## 3. Caveats
- **Playout-based Generalization**: Generalization in `quality.ts` is currently computed structurally rather than via playout sample paths. Tradeoff explanations must reflect this structural proxy limitation.
- **Node.js Environment**: The local development package manager is `npm` (workspaces) rather than `pnpm`. Tests must be run via `npm run test --workspace=@wasm4pm/cli`.

---

## 4. Proposed Code Changes

### 4.1 QoL-002: Fitness Thresholds (`conformance.ts`)
Add a single context line to the default human output of conformance, and support the `--explain-fitness` option.

#### Code Modifications:

**File**: `apps/wasm4pm/src/commands/conformance.ts`

1. **Extend `ConformancePayload` interface** (add after line 125):
```typescript
  explain_fitness?: boolean;
```

2. **Add argument in CLI `args` definition** (add after line 212):
```typescript
    'explain-fitness': {
      type: 'boolean',
      description: 'Explain fitness thresholds (default 0.80 vs academic 0.85) and interpret the current score',
    },
```

3. **Populate payload in `run`** (add after line 681):
```typescript
                explain_fitness: Boolean(ctx.args['explain-fitness']),
```

4. **Enhance `printHumanConformance`** (replace lines 843-845):
*Before:*
```typescript
  projection.log(
    `  Fitness:   ${fitness.toFixed(3)}  ${fitnessPassFail}${colorReset} (threshold: ${threshold.toFixed(2)})${ciDisplay}`
  );
```
*After:*
```typescript
  projection.log(
    `  Fitness:   ${fitness.toFixed(3)}  ${fitnessPassFail}${colorReset} (threshold: ${threshold.toFixed(2)})${ciDisplay}`
  );
  projection.log(`  → Threshold context: Fitness ≥0.85 meets the academic standard (excellent fit); ≥0.80 is acceptable for general business operations.`);

  if (payload.explain_fitness) {
    projection.log('');
    projection.log('  Fitness Threshold Guide:');
    projection.log('    • 0.85 (Van der Aalst Academic Standard): High-conformance benchmark for process mining.');
    projection.log('      Achieving this suggests the process model represents the real process with high accuracy.');
    projection.log('    • 0.80 (Default Business Threshold): Pragmatic target for operational execution.');
    projection.log('      Suitable for most process discovery, automation, and general diagnostics.');
    const interpretation = fitness >= 0.85 
      ? 'EXCELLENT (meets both academic and operational targets)' 
      : fitness >= 0.80 
        ? 'ACCEPTABLE (meets operational target; fails academic benchmark)' 
        : 'UNACCEPTABLE (violates both targets; model needs refinement)';
    projection.log(`    • Current Score Assessment: ${fitness.toFixed(3)} is ${interpretation}.`);
    projection.log('');
  }
```

---

### 4.2 QoL-005: Confidence Intervals (`conformance.ts`)
Add a diagnostic interpretation line for statistical confidence intervals, and support the `--explain-ci` option.

#### Code Modifications:

**File**: `apps/wasm4pm/src/commands/conformance.ts`

1. **Extend `ConformancePayload` interface** (add after line 125):
```typescript
  explain_ci?: boolean;
```

2. **Add argument in CLI `args` definition** (add after line 212):
```typescript
    'explain-ci': {
      type: 'boolean',
      description: 'Provide detailed statistical explanation for the fitness confidence interval',
    },
```

3. **Populate payload in `run`** (add after line 681):
```typescript
                explain_ci: Boolean(ctx.args['explain-ci']),
```

4. **Enhance `printHumanConformance`** (add after line 850 / under the sample size warning):
```typescript
  if (payload.fitness_ci_lower !== undefined && payload.fitness_ci_upper !== undefined) {
    const ciLower = payload.fitness_ci_lower;
    const ciUpper = payload.fitness_ci_upper;
    const ciWidth = ciUpper - ciLower;
    const marginPct = ((ciWidth / 2) * 100).toFixed(0);

    if (ciWidth <= 0.15) {
      projection.log(`  → CI Diagnostic: Confidence interval [${ciLower.toFixed(3)}–${ciUpper.toFixed(3)}] is TIGHT (${marginPct}% margin). Model fitness is reliable.`);
    } else {
      projection.log(`  → CI Diagnostic: Confidence interval [${ciLower.toFixed(3)}–${ciUpper.toFixed(3)}] is WIDE (${marginPct}% margin). Run 20+ more traces to reduce uncertainty.`);
    }
  }

  if (payload.explain_ci) {
    projection.log('');
    projection.log('  Statistical Confidence Interval (Agresti-Coull) Guide:');
    projection.log('    • Method: Computes a 95% confidence interval for binomial proportion (successes = conforming cases, trials = total cases).');
    projection.log('    • Purpose: Quantifies statistical uncertainty due to sample size. A small log yields a wide interval.');
    projection.log('    • Rule of Thumb: If the interval is wide (e.g. >15% margin), trust the point estimate with caution. Obtain more traces to narrow the interval.');
    projection.log('');
  }
```

---

### 4.3 QoL-008: Van der Aalst Quality Tradeoffs (`quality.ts`)
Highlight relative metric importance by default, and support the `--explain-quality-dims` option to print detailed tradeoffs.

#### Code Modifications:

**File**: `apps/wasm4pm/src/commands/quality.ts`

1. **Extend `QualityPayload` interface** (add after line 84):
```typescript
  explain_quality_dims?: boolean;
```

2. **Add argument in CLI `args` definition** (add after line 162):
```typescript
    'explain-quality-dims': {
      type: 'boolean',
      description: 'Highlight relative metric importance and tradeoffs among Van der Aalst dimensions',
    },
```

3. **Populate payload in `run`** (add after line 592):
```typescript
                explain_quality_dims: Boolean(ctx.args['explain-quality-dims']),
```

4. **Enhance `printHumanQuality`** (add after line 1106 / after displaying meanings):
```typescript
  projection.log('  Relative Importance & Tradeoffs:');
  projection.log('    1. FITNESS (critical, target >= 0.85): Reflects model coverage. Optimizing fitness often degrades precision.');
  projection.log('    2. PRECISION (high priority, target >= 0.80): Measures over-permissiveness. Avoid low precision (< 0.50).');
  projection.log('    3. GENERALIZATION (medium priority, target >= 0.75): Measures ability to handle unseen traces. Avoid overfitting.');
  projection.log('    4. SIMPLICITY (secondary priority, target >= 0.50): Measures readability. Complex models are hard to interpret.');
  projection.log('');

  if (payload.explain_quality_dims) {
    projection.log('  Van der Aalst Quality Tradeoffs Deep Dive:');
    projection.log('    • Fitness vs Precision: A model with 100% fitness can have poor precision (e.g., flower model allowing all paths).');
    projection.log('      A tighter model increases precision but might decrease fitness by blocking some observed behaviors.');
    projection.log('    • Generalization vs Simplicity: Simpler models (fewer places/arcs) generalize better to unseen cases by avoiding overfitting.');
    projection.log('      However, oversimplifying (e.g., single-loop DFG) can collapse precision, allowing invalid traces.');
    projection.log('    • Strategy: Maintain fitness >= 0.85 as a hard constraint, then maximize precision (target >= 0.80) while keeping simplicity acceptable.');
    projection.log('');
  }
```

5. **Enhance `printExplainQuality`** (add at the end of the method before the closing brace, e.g., line 1275):
```typescript
  if (payload.explain_quality_dims) {
    projection.log('  Van der Aalst Quality Tradeoffs Deep Dive:');
    projection.log('    • Fitness vs Precision: Highly fit models can be underfit (low precision) if they permit too much behaviour.');
    projection.log('    • Generalization vs Simplicity: Simple structures avoid overfitting (better generalization) but must not lose precision.');
    projection.log('');
  }
```

---

### 4.4 QoL-009: Conformance Deviation Diagnostics (`conformance.ts`)
Provide detailed deviation diagnostics, and support the `--diagnose-deviations` option.

#### Code Modifications:

**File**: `apps/wasm4pm/src/commands/conformance.ts`

1. **Extend `ConformancePayload` interface** (add after line 125):
```typescript
  diagnose_deviations?: boolean;
```

2. **Add argument in CLI `args` definition** (add after line 212):
```typescript
    'diagnose-deviations': {
      type: 'boolean',
      description: 'Provide detailed diagnostic remediation guide for detected conformance deviations',
    },
```

3. **Populate payload in `run`** (add after line 681):
```typescript
                diagnose_deviations: Boolean(ctx.args['diagnose-deviations']),
```

4. **Enhance `printHumanConformance`** (add after line 997 / after the default instructions):
```typescript
  if (deviatingTraces.length > 0 && payload.diagnose_deviations) {
    let missingCount = 0;
    let extraCount = 0;
    let lateCount = 0;
    let incompleteCount = 0;

    for (const trace of deviatingTraces) {
      if (trace.deviations.length === 0) {
        incompleteCount++;
      } else {
        for (const dev of trace.deviations) {
          const dtype = dev.deviation_type?.toLowerCase() ?? '';
          if (dtype.includes('missing') || dtype.includes('model_move')) {
            missingCount++;
          } else if (dtype.includes('extra') || dtype.includes('log_move') || dtype.includes('skip')) {
            extraCount++;
          } else if (dtype.includes('late') || dtype.includes('reorder')) {
            lateCount++;
          } else {
            extraCount++;
          }
        }
      }
    }

    projection.log('  Deviation Diagnostics Report:');
    projection.log(`    • Skips / Missing Steps:    ${missingCount} (log skipped activities mandated by the model)`);
    projection.log(`    • Unexpected / Extra Steps: ${extraCount} (log performed activities not expected by the model)`);
    projection.log(`    • Sequence / Late Steps:    ${lateCount} (activities occurred in wrong sequence)`);
    projection.log(`    • Incomplete / Aborted:     ${incompleteCount} (cases terminated prior to final model state)`);
    projection.log('');
    
    projection.log('  Remediation & Action Plan:');
    if (missingCount > extraCount) {
      projection.log('    → Interpretation: Model is too restrictive (expects activities that are skipped in practice).');
      projection.log('    → Fix Strategy: Relax Petri net transitions, make missing activities optional, or re-run discovery with inductive_miner.');
    } else if (extraCount > missingCount) {
      projection.log('    → Interpretation: Log contains exceptional, noisy, or undocumented process paths.');
      projection.log('    → Fix Strategy: Filter rare events from the log or use genetic_algorithm to capture complex trace variants.');
    } else if (incompleteCount > 0) {
      projection.log('    → Interpretation: Traces end prematurely before reaching the process finish milestone.');
      projection.log('    → Fix Strategy: Check if log data was exported before completion, or adjust final marking requirements in the model.');
    } else {
      projection.log('    → Interpretation: Process steps are correct but executed out of sequence.');
      projection.log('    → Fix Strategy: Introduce parallel blocks or concurrent transitions in the model.');
    }
    projection.log('');
  }
```

---

## 5. Verification Method

### 5.1 Unit and Integration Testing
Implement test coverage by creating or expanding CLI test files:

1. **Create `apps/wasm4pm/src/__tests__/conformance-qol.test.ts`**:
   - Write tests that execute the `conformance` command with `--explain-fitness`, `--explain-ci`, and `--diagnose-deviations`.
   - Assert that the printed logs contain key diagnostic substrings:
     - `--explain-fitness` -> `"Academic Standard"`, `"Default Business Threshold"`
     - `--explain-ci` -> `"Agresti-Coull"`, `"Confidence Interval"`
     - `--diagnose-deviations` -> `"Deviation Diagnostics Report"`, `"Remediation & Action Plan"`

2. **Create `apps/wasm4pm/src/__tests__/quality-qol.test.ts`**:
   - Write tests that execute the `quality` command with `--explain-quality-dims`.
   - Assert that the printed logs contain:
     - `"Relative Importance & Tradeoffs"`
     - `"Fitness vs Precision"`
     - `"Generalization vs Simplicity"`

### 5.2 Verification Commands
Execute tests using the monorepo test harness:
```bash
# Run CLI tests only
npm run test --workspace=@wasm4pm/cli

# Run specific new tests
npx vitest run apps/wasm4pm/src/__tests__/conformance-qol.test.ts
npx vitest run apps/wasm4pm/src/__tests__/quality-qol.test.ts
```
