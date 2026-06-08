# Handoff Report — M1: Algorithmic Helper & Diagnostics (QoL-001, QoL-004, QoL-006, QoL-010, QoL-011)

This report details how process mining algorithms are listed, executed, and how errors are recovered in `@wasm4pm/cli`, and outlines the exact implementation strategies and code changes to satisfy the Quality-of-Life (QoL) and Developer Experience (DX) requirements for M1.

---

## 1. Observations

### 1.1 Algorithm Listing (`wpm algorithms`)
- **File**: `apps/wasm4pm/src/commands/algorithms.ts`
- **Current Behavior**:
  - The registry's algorithms are listed and categorized by speed tier in lines 567-572 using `classifyTier(a.speedTier)`.
  - Currently, the printed output in lines 618-630 displays the tier header (e.g. `STREAMING (speed ≤10, real-time)`) but **lacks a detailed qualitative rationale** for the tier selection.
  - Recommendation is invoked via `recommendForLog(stats)` (lines 99-138) which parses basic log stats but does not support optimization goals (size/time).
  - Line 168: The `--recommend` option accepts a path to a log file but there is no `--recommend-for` parameter.

### 1.2 Run Command (`wpm run`)
- **File**: `apps/wasm4pm/src/commands/run.ts`
- **Current Behavior**:
  - Algorithms are executed in `runDiscovery` (lines 50-62) by calling `kernel.runRaw(algo, logHandle, activityKey, {})` with an empty object `{}` passed for custom parameters.
  - The `args` definition (lines 77-206) does not contain a `--parameters` CLI option.
  - Timeout is parsed as a string but is not validated or compared against estimated time budgets.
  - Dynamic `--auto-select` (lines 296-353) uses estimated event counts based on raw file sizes (`fs.stat`) to select algorithms before execution begins.

### 1.3 Error Recovery & Fuzzy Matching
- **File**: `apps/wasm4pm/src/error-recovery.ts`
- **Current Behavior**:
  - `getRecoveryHint` (lines 98-475) returns recovery suggestions for config, source, execution, and system errors.
  - For unknown algorithms (lines 106-127), candidates are hardcoded: `['dfg', 'heuristic', 'inductive', 'ilp', 'genetic', 'simulated-annealing']`. It does not pull from the canonical list of aliases, nor does it provide hints regarding underscores (`_`) vs. dashes (`-`).

---

## 2. Logic Chain

1. **For QoL-001 (Algorithm rationale)**: Adding a per-tier rationale map and updating the console formatter in `algorithms.ts` will give practitioners clear guidance on when to use each tier. Adding `--recommend-for <size|time>` to the arguments and routing it into `recommendForLog` allows optimizing recommendations for small model footprints (`size`) vs. sub-millisecond execution (`time`).
2. **For QoL-004 (CLI aliases & error clarity)**: Moving from a hardcoded candidate list to importing the canonical `ALGORITHM_CLI_ALIASES` map from `@wasm4pm/contracts` guarantees completeness. Comparing dashes vs. underscores and indicating the appropriate convention prevents confusion when a user types `genetic-algorithm` instead of `genetic` or `genetic_algorithm`.
3. **For QoL-006 (Parameters CLI help)**: Exposing `--parameters <json>` in `run.ts` and parsing it allows developers to pass custom hyperparameters. Pulling the parameters schema from `getRegistry().get(resolvedAlgo)` lets us validate parameter existence, types, ranges (`min`/`max`), and allowed `options` before invoking WASM.
4. **For QoL-010 (Algorithm time budgets)**: Validating `--timeout` via `validateTimeout` provides clamping and error reports. Running `wasm.analyze_event_statistics` early in `withLogSession` gives exact event counts, allowing `computeTimeout` to predict execution time accurately. We can then compare this value against the user-configured timeout and emit a warning to `stderr` if the user's budget is too low.
5. **For QoL-011 (Algorithm recommendation wizard)**: Building an interactive questionnaire command `wpm select-algorithm` based on the `readline` pattern used in `profile-guide.ts` and feeding inputs into `@wasm4pm/planner` provides a user-friendly wizard.

---

## 3. Caveats

- **Time estimation**: Timeout requirements are heuristic and depend on hardware. The warning is advisory and should not prevent execution.
- **Interactive wizard**: Interactive readline questions are not suitable for non-TTY or CI environments, so we should guard it by checking `process.stdout.isTTY`.

---

## 4. Conclusion & Concrete Code Proposals

### 4.1 QoL-001: Algorithm Rationale (`algorithms.ts`)

#### Code Changes:
1. Define the rationales and register `--recommend-for`:
```typescript
// Define rationales under TIER_SPEED_RANGES
const TIER_RATIONALE: Record<Tier, string> = {
  stream: 'Best for real-time dashboards and edge devices; processes live events with minimal memory footprint.',
  fast: 'Best for rapid, interactive exploration of large logs; optimized for developer feedback loops.',
  balanced: 'Best for general-purpose batch analysis; balances structural precision with reasonable compute time.',
  quality: 'Best for offline audits and compliance; captures complex concurrency and loops, but can be slow.',
};
```

2. Add the argument to `args`:
```typescript
    'recommend-for': {
      type: 'string',
      description: 'Optimize recommendation for: size (minimal model/memory) or time (fastest execution)',
    },
```

3. Update `recommendForLog` to handle the optimization mode:
```typescript
function recommendForLog(
  stats: {
    traceCount: number;
    uniqueVariants: number;
    uniqueActivities: number;
    avgTraceLength: number;
  },
  optimizeFor?: 'size' | 'time'
): { id: string; rationale: string } {
  if (optimizeFor === 'time') {
    return {
      id: 'dfg',
      rationale: 'Optimized for speed (time) — DFG runs in O(n) and returns immediately.'
    };
  }
  if (optimizeFor === 'size') {
    return {
      id: 'process_skeleton',
      rationale: 'Optimized for minimal footprint (size) — Process Skeleton produces the most compact structural representation.'
    };
  }
  // ... existing heuristics ...
}
```

4. Output the rationale during listing:
```typescript
        if (!quiet) {
          p.log('');
          p.log(`  ${TIER_LABEL[tier]}`);
          p.log(`  Rationale: ${TIER_RATIONALE[tier]}`);
        }
```

---

### 4.2 QoL-004: CLI Aliases & Error Clarity (`error-recovery.ts` & `run.ts`)

#### Code Changes (`error-recovery.ts`):
1. Import and utilize `ALGORITHM_CLI_ALIASES`:
```typescript
import { ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';

// Inside getRecoveryHint (config block for algorithm not found)
    if (errorMessage.includes('Algorithm') && errorMessage.includes('not found')) {
      const algoMatch = errorMessage.match(/['"]([^'"]+)['"]/);
      const badAlgo = algoMatch ? algoMatch[1] : 'unknown';
      
      const candidates = [...new Set([
        ...Object.keys(ALGORITHM_CLI_ALIASES),
        ...Object.values(ALGORITHM_CLI_ALIASES)
      ])];
      
      const didYouMean = findClosestAlgorithm(badAlgo, candidates);
      
      let conventionHint = '';
      if (didYouMean) {
        if (badAlgo.includes('-') && didYouMean.includes('_')) {
          conventionHint = ` Note: use underscores ('_') instead of dashes ('-') for registry IDs (or use the CLI alias).`;
        } else if (badAlgo.includes('_') && didYouMean.includes('-')) {
          conventionHint = ` Note: use dashes ('-') instead of underscores ('_') for CLI aliases.`;
        }
      }
      
      return {
        code: 'CONFIG_ALGORITHM_NOT_FOUND',
        suggestion: `Algorithm '${badAlgo}' not recognized.${didYouMean ? ` Did you mean '${didYouMean}'?${conventionHint}` : ''}`,
        command: 'wpm algorithms',
        envVar: 'WASM4PM_ALGORITHM',
        alternatives: candidates.slice(0, 8),
        didYouMean,
        docsUrl: 'https://wasm4pm.dev/docs/algorithms',
      };
    }
```

---

### 4.3 QoL-006: Parameters Validation & CLI Help (`run.ts`)

#### Code Changes:
1. Define `--parameters` in the argument list:
```typescript
    parameters: {
      type: 'string',
      description: 'JSON string of algorithm parameters (e.g. \'{"dependency_threshold": 0.8}\').',
    },
```

2. Modify `runDiscovery` to accept and pass the parameters:
```typescript
export async function runDiscovery(
  wasm: Record<string, any>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string,
  parameters: Record<string, any> = {}
): Promise<{ raw: unknown; elapsedMs: number }> {
  const t0 = performance.now();
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  const raw = await kernel.runRaw(algo, logHandle, activityKey, parameters);
  const elapsedMs = performance.now() - t0;
  return { raw, elapsedMs };
}
```

3. Parse and validate the parameters early inside `run(ctx)`:
```typescript
          let parsedParams: Record<string, any> = {};
          if (ctx.args.parameters) {
            try {
              parsedParams = JSON.parse(ctx.args.parameters as string);
            } catch {
              const errResult = makeErrorResult(
                'run',
                new Error(`Invalid JSON in --parameters: "${ctx.args.parameters}"`),
                EXIT_CODES.config_error,
                'PARAMETERS_INVALID_JSON'
              );
              emitResult(errResult, emitOptions);
              return await exitWithFlush(errResult.exit_code);
            }
          }

          const algoMeta = getRegistry().get(resolvedAlgo);
          if (algoMeta) {
            for (const param of algoMeta.parameters) {
              const val = parsedParams[param.name];
              if (val === undefined) {
                if (param.default !== undefined) {
                  parsedParams[param.name] = param.default;
                } else if (param.required) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Missing required parameter: "${param.name}" for algorithm "${resolvedAlgo}"`),
                    EXIT_CODES.config_error,
                    'PARAMETER_REQUIRED'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                continue;
              }

              if (param.type === 'number') {
                const num = Number(val);
                if (Number.isNaN(num)) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be a number (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_TYPE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                if (param.min !== undefined && num < param.min) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" value ${num} is below minimum ${param.min}`),
                    EXIT_CODES.config_error,
                    'PARAMETER_OUT_OF_BOUNDS'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                if (param.max !== undefined && num > param.max) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" value ${num} is above maximum ${param.max}`),
                    EXIT_CODES.config_error,
                    'PARAMETER_OUT_OF_BOUNDS'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                parsedParams[param.name] = num;
              } else if (param.type === 'boolean') {
                if (typeof val !== 'boolean') {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be a boolean (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_TYPE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
              } else if (param.type === 'select' && param.options) {
                if (!param.options.includes(val)) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be one of [${param.options.join(', ')}] (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_CHOICE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
              }
            }
          }
```

---

### 4.4 QoL-010: Timeout Estimation Validation (`run.ts`)

#### Code Changes:
1. Import validators and estimators:
```typescript
import { validateTimeout } from '../param-validators.js';
import { computeTimeout, classifyComplexity, detectAlgorithmTier } from 'wasm4pm';
```

2. Parse and clamp the timeout early:
```typescript
          const timeoutResult = validateTimeout(ctx.args.timeout as string | undefined, 300);
          if (!timeoutResult.valid) {
            const errResult = makeErrorResult(
              'run',
              new Error(timeoutResult.error ?? 'Invalid timeout'),
              EXIT_CODES.config_error,
              'TIMEOUT_INVALID'
            );
            emitResult(errResult, emitOptions);
            return await exitWithFlush(errResult.exit_code);
          }
          const currentTimeoutSecs = timeoutResult.value;
          if (timeoutResult.wasClamped && !quiet && format === 'human') {
            process.stderr.write(`⚠ ${timeoutResult.error}\n`);
          }
```

3. Inside `withLogSession`, run the estimation before executing discovery:
```typescript
              let eventCount = 1000;
              let traceCount = 100;
              let activityCount = 10;
              try {
                if (typeof wasm.analyze_event_statistics === 'function') {
                  const statsRaw = wasm.analyze_event_statistics(logHandle);
                  const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
                  eventCount = stats.total_events ?? stats.eventCount ?? 1000;
                  traceCount = stats.total_cases ?? stats.traceCount ?? 100;
                  activityCount = stats.unique_activities ?? stats.activityCount ?? 10;
                }
              } catch { /* best effort */ }

              const complexity = classifyComplexity(eventCount, activityCount, traceCount);
              const algorithmTier = detectAlgorithmTier(resolvedAlgo);
              const timeoutEst = computeTimeout({
                eventCount,
                complexity,
                algorithmTier,
                algorithmName: resolvedAlgo
              });
              const estimatedSecs = Math.round(timeoutEst.timeoutMs / 1000);

              if (currentTimeoutSecs < estimatedSecs && !quiet && format === 'human') {
                process.stderr.write(
                  `⚠ Warning: Configured timeout (${currentTimeoutSecs}s) is less than the estimated requirement ` +
                  `(${estimatedSecs}s) for '${resolvedAlgo}' on this log (${eventCount} events, complexity: ${complexity}).\n` +
                  `  To avoid premature termination, consider increasing the timeout:\n` +
                  `    wpm run ${path.basename(inputPath)} --algorithm ${resolvedAlgo} --timeout ${estimatedSecs}\n\n`
                );
              }
```

---

### 4.5 QoL-011: Algorithm Selection Wizard (`select-algorithm.ts`)

#### Proposed Structure (`apps/wasm4pm/src/commands/select-algorithm.ts`):
```typescript
import { defineCommand } from 'citty';
import * as readline from 'node:readline/promises';
import * as fs from 'node:fs/promises';
import { getSuggestions } from '@wasm4pm/planner';
import { getRegistry } from 'wasm4pm';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

export const selectAlgorithm = defineCommand({
  meta: {
    name: 'select-algorithm',
    description: 'Interactive wizard to recommend and execute the best algorithm for your log.',
  },
  async run() {
    if (!process.stdout.isTTY) {
      console.log('Interactive wizard requires a TTY terminal.');
      return await exitWithFlush(EXIT_CODES.config_error);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      console.log('\n=== Algorithm Recommendation Wizard ===\n');
      const logPath = await rl.question('Enter path to event log file: ');
      try {
        await fs.access(logPath);
      } catch {
        console.log(`Error: File not found at '${logPath}'`);
        return await exitWithFlush(EXIT_CODES.source_error);
      }

      console.log('\nChoose your primary goal:');
      console.log('  [F] Fast (interactive results, O(n))');
      console.log('  [B] Balanced (typical batch mining, sound process trees)');
      console.log('  [Q] Quality (highest quality, search optimization)');
      const goalInput = (await rl.question('Choose [F/B/Q] (default B): ')).toUpperCase();
      const goal = goalInput === 'F' ? 'fast' : goalInput === 'Q' ? 'quality' : 'balanced';

      // Load basic file stats for estimator
      const stat = await fs.stat(logPath);
      const estEvents = Math.max(1, Math.round(stat.size / 250));
      const estTraces = Math.max(1, Math.round(estEvents / 5));

      const suggestions = getSuggestions(
        { traceCount: estTraces, eventCount: estEvents, variantCount: Math.round(estTraces * 0.1) },
        goal,
        3
      );

      if (suggestions.length === 0) {
        console.log('No algorithms match the given constraints.');
        return await exitWithFlush(EXIT_CODES.success);
      }

      console.log('\nTop recommendations:');
      suggestions.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.algorithm} (confidence: ${(s.score * 100).toFixed(0)}%) - ${s.reason}`);
      });

      const execute = await rl.question(`\nWould you like to run wpm discovery with '${suggestions[0].algorithm}' now? (y/n): `);
      if (execute.toLowerCase() === 'y') {
        const { spawn } = await import('child_process');
        const child = spawn('node', ['apps/wasm4pm/dist/bin/wpm.js', 'run', logPath, '--algorithm', suggestions[0].algorithm], {
          stdio: 'inherit'
        });
        child.on('close', (code) => {
          process.exit(code ?? 0);
        });
      }
    } finally {
      rl.close();
    }
  }
});
```

---

## 5. Verification Method

1. **Unit Tests**:
   - Run `npm test` or `npx vitest run apps/wasm4pm/src/__tests__/ux-audit-improvements.test.ts` to verify timeout validators.
   - Run a new test suite targeting parameter validation inside `apps/wasm4pm/src/__tests__/run-parameters.test.ts`.
2. **CLI manual verification**:
   - `wpm algorithms` - verify rationales exist under each tier.
   - `wpm algorithms --recommend-for size` - verify `process_skeleton` is recommended.
   - `wpm run log.xes --algorithm genetic-algorithm` - verify did-you-mean suggestion points to CLI alias (`genetic`) or registry ID (`genetic_algorithm`), highlighting naming conventions.
   - `wpm run log.xes --parameters '{"dependency_threshold": 1.2}'` - verify exit 1 with range bound error.
   - `wpm run log.xes --timeout 5` - verify warning generated for genetic miner if estimated budget > 5s.
