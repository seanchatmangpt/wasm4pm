# Handoff Report — Explorer M3: CLI Workflows, Formats, and Controls (QoL-003, QoL-007, QoL-012, QoL-013)

This report details the investigation findings and implementation design for QoL-003, QoL-007, QoL-012, and QoL-013 inside the `@wasm4pm/cli` package, specifically targetting `apps/wasm4pm/src/commands/workflow.ts` (new file), `apps/wasm4pm/src/commands/compare.ts`, `apps/wasm4pm/src/first-run-ux.ts`, `apps/wasm4pm/src/output.ts`, and `apps/wasm4pm/src/exit-codes.ts`.

---

## 1. Observation

### 1.1 First-Run hints & Guided Next Steps (`run.ts` & `first-run-ux.ts`)
- **File**: `apps/wasm4pm/src/first-run-ux.ts`
  - Defines `formatFirstRunHints` (lines 87–117) which prints Process Model Discovered title, fitness percentage and interpretation, and four numbered next step suggestions:
    ```typescript
    hints.push(`  1. Review model: wpm results --latest`);
    hints.push(`  2. Validate: wpm conformance -i ${path.basename(inputPath)}`);
    hints.push(`  3. Compare algorithms: wpm compare dfg,heuristic -i ${path.basename(inputPath)}`);
    hints.push(`  4. Learn more: wpm algorithms --show-ratings`);
    ```
- **File**: `apps/wasm4pm/src/commands/run.ts`
  - Implements first-run checking on success (lines 1418–1445):
    ```typescript
    if (isFirstRunResult && format === 'human') {
      const hints = formatFirstRunHints(...);
      ...
    } else {
      projection.log('Next steps:');
      projection.log(`  wpm conformance -i ${path.basename(p.input)} ...`);
      ...
    }
    ```
  - Currently, there is no `--guide-next-steps` command flag or handler, nor is there a `wpm workflow` command file under `apps/wasm4pm/src/commands/`.

### 1.2 Output Formats & CSV Export (`run.ts`, `compare.ts`, `output.ts`)
- **File**: `apps/wasm4pm/src/output.ts`
  - Defines `EmitOptions` (lines 61-68) which accepts format: `'json' | 'sarif' | 'jsonl' | 'human'`. There is no `'csv'` option.
  - `emitResult` (lines 80-120) dispatches rendering to `'json'`, `'jsonl'`, `'sarif'`, and `'human'`.
- **File**: `apps/wasm4pm/src/commands/compare.ts`
  - Early format validation (lines 516-529) throws a `config_error` if format is not `'json'` or `'human'`:
    ```typescript
    if (format !== 'json' && format !== 'human') { ... }
    ```
  - Similarly, `run.ts` validates format options and only renders `'json'` or `'human'` console outputs.

### 1.3 Exit Code 4: Partial Failure (`compare.ts` & `commands/exit-codes.ts`)
- **File**: `apps/wasm4pm/src/commands/compare.ts`
  - Implements exit code 4 logic (lines 815–817) when at least one compared algorithm fails:
    ```typescript
    const resultExitCode = algorithmErrors.length > 0 ? EXIT_CODES.partial_failure : EXIT_CODES.success;
    ```
  - Renders errors as warnings in a loop (lines 992–998), but does not print a clear summary of which portion succeeded versus which failed, nor is the exit code 4 meaning explained in the help documentation.
- **File**: `apps/wasm4pm/src/commands/exit-codes.ts`
  - Displays exit codes (lines 23-29):
    ```typescript
    ${RED}4${RESET}     Partial Failure      Some operations succeeded, some failed
    ```
    No further explanatory text or CI routing context is given for code 4.

### 1.4 Color and Emoji Suppressions (`output.ts` & `cli.ts`)
- **File**: `apps/wasm4pm/src/cli.ts`
  - Accepts global flags `--no-color` and `--no-emoji` (lines 72–79), but they are not passed to or respected by the underlying `ConsoleProjection` methods (`info()`, `warn()`, `success()`, etc.) which delegate directly to `consola`.
- **File**: `apps/wasm4pm/src/output.ts`
  - `ConsoleProjection` constructor (lines 303–308) does not parse or set color/emoji preferences, resulting in standard colored/unicode layouts regardless of CLI flags or environment variables (e.g. `process.env.CI`).

---

## 2. Logic Chain

1. **For QoL-003 (Post-run hints, `--guide-next-steps`, and `wpm workflow` command)**:
   - Introducing `guide-next-steps` to `run` and `quality` arguments allows users to request guided next-step instructions.
   - When `--guide-next-steps` is enabled (or `isFirstRunResult` is true), we can reuse and display the descriptive next-step checklist from `first-run-ux.ts`.
   - Creating a new `wpm workflow` command file that lists built-in preset pipelines (`quick`, `full`, `compliance`, `discovery`) and custom JSON/CLI options satisfies the documentation command requirement.
2. **For QoL-007 (Format explanations and CSV format)**:
   - Extending the `format` type definition in `EmitOptions` (in `output.ts`) and adding a `'csv'` case to the renderer will support CSV output routing.
   - Updating `meta.description` of commands allows us to explain the difference: `human` (development/debugging layout), `json` (automated processing payload), and `csv` (flat statistics table).
   - In both `run.ts` and `compare.ts`, adding a condition to output raw comma-separated values in the console renderer callback when `--format csv` is set achieves clean CSV export.
3. **For QoL-012 (Exit code 4 partial success explanation)**:
   - Modifying the console renderer in `compare.ts` to output a prominent warning line: `⚠ Command finished with PARTIAL FAILURE (Exit Code 4)` when errors occur, along with a tally of successful versus failed algorithms, clarifies execution results.
   - Expanding `commands/exit-codes.ts` with explicit documentation about partial failure scenarios in batch comparisons helps scripting developers.
4. **For QoL-013 (Color/emoji flags and CI detection)**:
   - Adding checks for `process.env.CI`, `process.env.NO_COLOR`, and `process.argv.includes('--no-color'|'--no-emoji')` in `ConsoleProjection` ensures options are applied globally without having to pipe arguments down to every subcommand.
   - Intercepting `projection.log` and standard consola wrappers to strip ANSI color codes (`/\x1b\[[0-9;]*[a-zA-Z]/g`) and map emojis (e.g. `🎯` -> `[Goal]`, `▓` -> `#`) to plain characters produces a clean text-only terminal output.

---

## 3. Caveats

- **CI Detection**: Some CI providers might support colors while missing emoji fonts. However, checking `process.env.CI` to disable both is a standard and robust baseline that guarantees maximum compatibility.
- **CSV formatting**: For single-run commands (`wpm run`), the CSV is a single row with headers; for multi-algorithm comparisons (`wpm compare`), it is a multi-row table.

---

## 4. Conclusion & Concrete Code Proposals

Below are the exact code modifications recommended to address the four QoL requirements.

### 4.1 QoL-003: Post-run Hints, `--guide-next-steps`, and `wpm workflow`

#### 4.1.1 Create `apps/wasm4pm/src/commands/workflow.ts`
Create the file with the following contents:
```typescript
import { defineCommand } from 'citty';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

export const workflow = defineCommand({
  meta: {
    name: 'workflow',
    description: 'Show guidance and documentation for process mining workflows (pipelines)',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    if (format === 'human') {
      process.stdout.write(`
${BOLD}wpm Workflows & Pipelines Reference${RESET}

${DIM}Workflows chain individual process mining operations into automated pipelines.${RESET}
${DIM}Configure custom workflows in wasm4pm.toml or execute presets directly.${RESET}

${BOLD}Built-in Pipeline Presets:${RESET}
  ${GREEN}quick${RESET}       — Fast 2-step pipeline: validate log → discover DFG model.
                ${DIM}Run: wpm pipeline run quick -i log.xes${RESET}
  ${GREEN}full${RESET}        — 6-step complete analysis: validate → discover → quality → temporal → social → predict.
                ${DIM}Run: wpm pipeline run full -i log.xes${RESET}
  ${GREEN}compliance${RESET}  — 4-step conformance: validate → conformance checking → quality check → prolog8.
                ${DIM}Run: wpm pipeline run compliance -i log.xes${RESET}
  ${GREEN}discovery${RESET}   — 3-step discovery: validate → compare top algorithms → quality assessment.
                ${DIM}Run: wpm pipeline run discovery -i log.xes${RESET}

${BOLD}Running Custom Pipelines:${RESET}
  You can execute a pipeline defined in a JSON file:
  ${CYAN}wpm pipeline run <pipeline.json> -i log.xes${RESET}

${BOLD}Creating Custom Pipelines:${RESET}
  Generate a new pipeline scaffolding:
  ${CYAN}wpm pipeline create --name my-workflow --steps validate,run,quality${RESET}

${BOLD}Standard Workflow Execution Flow (JTBD):${RESET}
  ${BOLD}1. Validate Log${RESET}        Ensure schema and data quality:
                           ${CYAN}wpm validate log.xes${RESET}
  ${BOLD}2. Discover Model${RESET}     Mine process models (e.g. Heuristic Miner):
                           ${CYAN}wpm run log.xes --algorithm heuristic_miner${RESET}
  ${BOLD}3. Assess Quality${RESET}     Measure fitness, precision, and simplicity:
                           ${CYAN}wpm conformance -i log.xes --model-from heuristic_miner${RESET}
  ${BOLD}4. Run Predictions${RESET}    Forecast next activities or remaining time:
                           ${CYAN}wpm predict next-activity -i log.xes${RESET}

${DIM}See: wpm pipeline --help for subcommand documentation.${RESET}
\n`);
    }

    const result = makeResult(
      'workflow',
      {
        status: 'success',
        presets: ['quick', 'full', 'compliance', 'discovery'],
      },
      0,
      EXIT_CODES.success
    );
    emitResult(result, { format, quiet: true });
    return await exitWithFlush(EXIT_CODES.success);
  },
});
```

#### 4.1.2 Register in `apps/wasm4pm/src/cli.ts`
Add the import and command registration:
```typescript
// Add near line 40:
import { workflow } from './commands/workflow.js';

// Add to subCommands map near line 311:
subCommands: {
  ...
  workflow,
  ...
}
```

#### 4.1.3 Add `--guide-next-steps` to `apps/wasm4pm/src/commands/run.ts`
1. Add argument to `args`:
```typescript
    'guide-next-steps': {
      type: 'boolean',
      description: 'Emit contextual next-step suggestions after successful discovery',
    },
```
2. Modify the Next Steps display in `run.ts` success block:
```typescript
                // First-run UX hints or --guide-next-steps
                if ((isFirstRunResult || ctx.args['guide-next-steps']) && format === 'human') {
                  const hints = formatFirstRunHints(
                    (p.quality as { fitness?: number } | undefined)?.fitness,
                    p.algorithm,
                    p.input,
                    savedPath
                  );
                  if (ctx.args['guide-next-steps']) {
                    projection.log('');
                    projection.log('🎯 Guided Next Steps:');
                  }
                  for (const hint of hints) {
                    if (ctx.args['guide-next-steps'] && hint === '🎯 Process Model Discovered') {
                      continue;
                    }
                    projection.log(hint);
                  }
                } else {
```

#### 4.1.4 Add `--guide-next-steps` to `apps/wasm4pm/src/commands/quality.ts`
1. Add argument to `args`:
```typescript
    'guide-next-steps': {
      type: 'boolean',
      description: 'Emit contextual next-step suggestions after successful quality analysis',
    },
```
2. Add output to the console renderer callback:
```typescript
  if (ctx.args['guide-next-steps'] && format === 'human') {
    projection.log('📊 Guided Next Steps:');
    projection.log('  1. Address quality deviations: run wpm conformance -i <log.xes> --diagnose-deviations');
    projection.log('  2. Benchmark alternative models: run wpm compare dfg,heuristic,genetic -i <log.xes>');
    projection.log('  3. Automate checks: configure quality gates in wasm4pm.toml');
    projection.log('');
  }
```

---

### 4.2 QoL-007: Output Formats & CSV Export

#### 4.2.1 Update format types in `apps/wasm4pm/src/output.ts`
1. Extend `EmitOptions`:
```typescript
export interface EmitOptions {
  format: 'json' | 'sarif' | 'jsonl' | 'human' | 'csv';
```
2. Add `csv` case to `emitResult`:
```typescript
    case 'csv':
      if (!options.quiet) {
        const projection = new ConsoleProjection(options);
        if (consoleRenderer) {
          consoleRenderer(result, projection);
        } else {
          projection.log('key,value');
          projection.log(`command,${result.command}`);
          projection.log(`status,${result.status}`);
          projection.log(`exit_code,${result.exit_code}`);
          projection.log(`message,"${result.message.replace(/"/g, '""')}"`);
        }
      }
      break;
```

#### 4.2.2 Implement CSV in `apps/wasm4pm/src/commands/run.ts`
1. Update format option help description in `args`:
```typescript
    format: {
      type: 'string',
      description: 'Output format: human (default, rich console), json (detailed API payload), or csv (flat metrics table)',
    },
```
2. Add `'csv'` to early validation check:
```typescript
    const format = (ctx.args.format as 'json' | 'human' | 'csv') ?? 'human';
    ...
    if (format !== 'json' && format !== 'human' && format !== 'csv') {
      // makeErrorResult format error output
    }
```
3. Add CSV printing inside the console renderer:
```typescript
              emitResult(cmdResult, emitOptions, (res, projection) => {
                const p = res.payload as typeof payload;

                if (format === 'csv') {
                  const summary = extractModelSummary(p.model) || {};
                  const nodesVal = summary['Nodes'] || summary['Places'] || '';
                  const edgesVal = summary['Edges'] || summary['Transitions'] || '';
                  const q = p.quality as { fitness?: number; precision?: number; simplicity?: number } | undefined;
                  const fitVal = q?.fitness != null ? q.fitness.toFixed(3) : '';
                  const precVal = q?.precision != null ? q.precision.toFixed(3) : '';
                  const simpVal = q?.simplicity != null ? q.simplicity.toFixed(3) : '';
                  projection.log('algorithm,input,elapsed_ms,nodes,edges,fitness,precision,simplicity');
                  projection.log(`${p.algorithm},${p.input},${p.elapsedMs},${nodesVal},${edgesVal},${fitVal},${precVal},${simpVal}`);
                  return;
                }
```

#### 4.2.3 Implement CSV in `apps/wasm4pm/src/commands/compare.ts`
1. Update format option help description in `args`:
```typescript
    format: {
      type: 'string',
      description: 'Output format: human (default, sparkline table), json (detailed payload), or csv (flat metrics table)',
      default: 'human',
    },
```
2. Add `'csv'` to validation:
```typescript
    const format = (ctx.args.format as 'json' | 'human' | 'csv') ?? 'human';
    if (format !== 'json' && format !== 'human' && format !== 'csv') { ... }
```
3. Add CSV output to `emitResult` callback:
```typescript
              emitResult(cmdResult, emitOptions, (res, projection) => {
                const p = res.payload as typeof payload;
                const s = p.comparisons;

                if (format === 'csv') {
                  projection.log('algorithm,nodes,edges,elapsed_ms,quality_tier,live_fitness,live_precision');
                  for (const st of s) {
                    const nodesVal = st.nodes >= 0 ? st.nodes : 'ERROR';
                    const edgesVal = st.nodes >= 0 ? st.edges : '';
                    const timeVal = st.nodes >= 0 ? st.elapsedMs.toFixed(1) : '';
                    const qualVal = st.qualityTier;
                    const fitVal = st.liveFitness != null ? st.liveFitness.toFixed(3) : '';
                    const precVal = st.livePrecision != null ? st.livePrecision.toFixed(3) : '';
                    projection.log(`${st.algorithm},${nodesVal},${edgesVal},${timeVal},${qualVal},${fitVal},${precVal}`);
                  }
                  return;
                }
```

---

### 4.3 QoL-012: Exit Code 4 Partial Failure Explanation

#### 4.3.1 Update `apps/wasm4pm/src/commands/compare.ts` Meta and Render
1. Update `meta.description` to mention Exit Code 4:
```typescript
  meta: {
    name: 'compare',
    description:
      'Run multiple discovery algorithms on the same log side-by-side. ' +
      'Exits with code 4 (Partial Failure) if at least one algorithm fails but others succeed. ' +
      'Example: wpm compare dfg,heuristic -i process.xes',
  },
```
2. Highlight Partial Failure in the human console renderer:
```typescript
                // Partial failure notice
                if (p.algorithm_errors && p.algorithm_errors.length > 0) {
                  projection.warn(`\n  ⚠ Command finished with PARTIAL FAILURE (Exit Code 4):`);
                  projection.warn(`    ${s.filter(st => st.nodes >= 0).length} algorithm(s) succeeded, ${p.algorithm_errors.length} failed.`);
                  projection.log('  Failed algorithm details:');
                  for (const e of p.algorithm_errors) {
                    projection.warn(`    • ${e}`);
                  }
                  projection.log('');
                }
```

#### 4.3.2 Document Code 4 in `apps/wasm4pm/src/commands/exit-codes.ts`
Update the `exitCodes` text blocks to explicitly explain exit code 4:
```typescript
${RED}4${RESET}     Partial Failure      Some operations succeeded, some failed (e.g. in multi-algorithm comparisons or batch runs)
```
Add to Common Patterns:
```typescript
Batch comparison gate:
  wpm compare dfg,heuristic,genetic -i log.xes
  if [ $? -eq 4 ]; then
    echo "Warning: At least one algorithm failed execution"
  fi
```

---

### 4.4 QoL-013: Color & Emoji Suppressions

#### 4.4.1 Modify `ConsoleProjection` in `apps/wasm4pm/src/output.ts`
1. Export a helper function `stripEmojis` at the file level:
```typescript
function stripEmojis(text: string): string {
  const replacementMap: Record<string, string> = {
    '🎯': '[Goal]',
    '💡': '[Tip]',
    '📊': '[Chart]',
    '✔': '[OK]',
    '✓': '[OK]',
    '✗': '[ERR]',
    '⚠': '[WARN]',
    '◐': '[Medium]',
    '◕': '[Low]',
    '░': '-',
    '▓': '#',
  };

  let result = text;
  for (const [emoji, replacement] of Object.entries(replacementMap)) {
    result = result.replaceAll(emoji, replacement);
  }
  return result;
}
```
2. Intercept options in the constructor and define state variables:
```typescript
export class ConsoleProjection {
  readonly verbose: boolean;
  readonly verboseLevel: 0 | 1 | 2 | 3;
  readonly quiet: boolean;
  readonly noColor: boolean;
  readonly noEmoji: boolean;

  constructor(options: EmitOptions = {} as EmitOptions) {
    this.verbose = !!options.verbose;
    this.verboseLevel = normalizeVerboseLevel(options);
    this.quiet = options.quiet ?? false;

    // Check CI environments, NO_COLOR environment variables, and CLI parameters
    const isCI = !!process.env.CI;
    const hasNoColorArg = options.noColor || process.argv.includes('--no-color');
    const hasNoEmojiArg = options.noEmoji || process.argv.includes('--no-emoji');

    this.noColor = !!hasNoColorArg || !!process.env.NO_COLOR || isCI;
    this.noEmoji = !!hasNoEmojiArg || isCI;

    if (this.noColor) {
      process.env.NO_COLOR = '1';
    }
  }
```
3. Update log output wrappers to format text appropriately:
```typescript
  log(message: string, data?: Record<string, unknown>): void {
    if (!this.quiet) {
      let msg = message;
      if (this.noColor) msg = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (this.noEmoji) msg = stripEmojis(msg);

      if (data && Object.keys(data).length > 0) {
        console.log(msg, data);
      } else {
        console.log(msg);
      }
    }
  }

  success(message: string): void {
    if (this.quiet) return;
    let msg = message;
    if (this.noColor) msg = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (this.noEmoji) msg = stripEmojis(msg);

    if (this.noColor || this.noEmoji) {
      consola.log(`[OK] ${msg}`);
    } else {
      consola.success(msg);
    }
  }

  info(message: string): void {
    if (this.quiet) return;
    let msg = message;
    if (this.noColor) msg = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (this.noEmoji) msg = stripEmojis(msg);

    if (this.noColor || this.noEmoji) {
      consola.log(`[INFO] ${msg}`);
    } else {
      consola.info(msg);
    }
  }

  warn(message: string): void {
    let msg = message;
    if (this.noColor) msg = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (this.noEmoji) msg = stripEmojis(msg);

    if (this.noColor || this.noEmoji) {
      consola.log(`[WARN] ${msg}`);
    } else {
      consola.warn(msg);
    }
  }

  error(message: string): void {
    let msg = message;
    if (this.noColor) msg = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (this.noEmoji) msg = stripEmojis(msg);

    if (this.noColor || this.noEmoji) {
      consola.log(`[ERROR] ${msg}`);
    } else {
      consola.error(msg);
    }
  }
```

---

## 5. Verification Method

To verify these changes independently:

### 5.1 Unit and Integration Testing
Add a dedicated test suite `apps/wasm4pm/src/__tests__/qol-fixes-m3.test.ts`:
1. **Test `wpm workflow`**: Verify it runs cleanly, exits 0, and outputs preset names (`quick`, `full`, `compliance`, `discovery`).
2. **Test `--guide-next-steps`**: Execute `wpm run` with `--guide-next-steps` and assert the output matches the guided next steps text.
3. **Test CSV Format**: Run both `run` and `compare` with `--format csv` and verify output follows CSV layout:
   - Contains a header line.
   - Contains raw comma-separated values matching metrics.
4. **Test Color/Emoji Suppression**: Set `process.env.CI = '1'` (or pass `--no-color` / `--no-emoji` in test mock options) and verify output is stripped of ANSI escape sequences and emojis.

### 5.2 Commands to Execute
Run CLI building and test execution inside `@wasm4pm/cli`:
```bash
# Build the package
npm run build --workspace=@wasm4pm/cli

# Run the new test suite
npm run test --workspace=@wasm4pm/cli --apps/wasm4pm/src/__tests__/qol-fixes-m3.test.ts

# Manually inspect wpm workflow output
node apps/wasm4pm/dist/cli.js workflow
```

### 5.3 Invalidation Conditions
- If `citty` framework is updated in a way that breaks command definitions or args parsing, command registration in `cli.ts` might require matching changes.
- If `consola` configuration is modified globally elsewhere in the package, we should ensure `NO_COLOR=1` remains effective.
