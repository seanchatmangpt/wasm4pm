# CLI UX Improvements — Integration Guide

**Iteration 4 deliverables & how to use them**

---

## Quick Start: Using the New Helpers

### 1. Config Tracing (Gap 1 Fix)

**Module:** `apps/wasm4pm/src/config-trace.ts`

**What it does:** Formats config provenance for verbose output. Shows users which config file, ENV var, or default was loaded.

**Usage:**

```typescript
import { formatConfigTrace } from './config-trace.js';

export const myCommand = defineCommand({
  async run(ctx) {
    const config = await resolveConfig();
    const verbose = Boolean(ctx.args.verbose);
    const verboseLevel = normalizeVerboseLevel({ verbose });
    
    // Show config provenance at -vv level
    const trace = formatConfigTrace(config, { verbose, verboseLevel });
    if (verboseLevel >= 2) {
      projection.debug(trace);  // Prints config sources
    }
  }
});
```

**Output example (at -vv):**
```
Config Trace:
  source.kind: file (wasm4pm.toml)
  algorithm.name: cli
  execution.profile: env (WASM4PM_PROFILE)
  observability.logLevel: default
```

---

### 2. Help Text Standards (Gap 2 Fix)

**Module:** `apps/wasm4pm/src/help-standards.ts`

**What it does:** Provides canonical help text for all common flags. Prevents missing descriptions.

**Usage:**

```typescript
import { STANDARD_HELP } from './help-standards.js';

export const myCommand = defineCommand({
  args: {
    // Before: missing description
    // algorithm: { type: 'string', alias: 'a' }
    
    // After: use standard
    algorithm: {
      type: 'string',
      description: STANDARD_HELP.algorithm,  // Consistent across all commands
      alias: 'a',
    },
    verbose: {
      type: 'boolean',
      description: STANDARD_HELP.verbose,
      alias: 'v',
    },
    format: {
      type: 'string',
      description: STANDARD_HELP.format,
    },
  },
});
```

**Available constants** (in `STANDARD_HELP`):
- `verbose`, `quiet`, `format`, `noSave`, `noRetry`, `noCache`
- `input`, `file`, `output`, `model`, `config`
- `algorithm`, `method`, `timeout`, `workers`, `profile`
- `threshold`, `withQuality`, `setBaseline`, `assertImprovement`
- `activityKey`, `targetKey`, `prefix`, `topK`, `driftWindow`, `ngramOrder`

**To validate help coverage:**

```typescript
import { validateHelpCoverage } from './help-standards.js';

// In your command's run() function:
const coverage = validateHelpCoverage('mycommand', myArgs);
if (coverage.hasErrors) {
  console.warn('Help text gaps:', coverage.warnings);
}
```

---

### 3. Error Context Enhancement (Gap 3 Fix)

**Module:** `apps/wasm4pm/src/error-context.ts`

**What it does:** Enriches error messages with config source info and recovery steps.

**Usage:**

```typescript
import {
  buildContextualErrorMessage,
  suggestRecoverySteps,
  formatRecoverySuggestions,
  suggestClosestMatch,
} from './error-context.js';

export const myCommand = defineCommand({
  async run(ctx) {
    try {
      const config = await resolveConfig();
    } catch (err) {
      // Before: "Config error: invalid algorithm"
      // After: includes source info + recovery steps
      
      const contextualMsg = buildContextualErrorMessage(
        (err as Error).message,
        {
          command: 'run',
          parameter: 'algorithm.name',
          config,  // Adds source info
        }
      );
      
      const steps = suggestRecoverySteps('CONFIG_ERROR', {
        command: 'run',
        configPath: 'wasm4pm.toml',
      });
      
      const formatted = formatRecoverySuggestions(steps);
      
      const result = makeErrorResult(
        'run',
        new Error(contextualMsg + '\n' + formatted),
        EXIT_CODES.config_error,
        'CONFIG_ERROR'
      );
      emitResult(result, { format: 'json' });
    }
  }
});
```

**Output example:**
```
Config error: algorithm 'xyz' not found
Parameter source: env WASM4PM_ALGORITHM
Debug hint: Run 'wpm config show --detailed' to see all active settings

Recovery suggestions:
  • Validate config syntax: wpm config verify
  • Check active sources: wpm config show --detailed
  • Review config file: cat wasm4pm.toml
```

**For typo correction:**

```typescript
const validAlgos = ['dfg', 'heuristic', 'inductive', 'ilp'];
const suggested = suggestClosestMatch('heur', validAlgos);
// Returns: 'heuristic'

if (suggested) {
  const msg = `Algorithm '${attempted}' not found. Did you mean '${suggested}'?`;
}
```

---

## Integration Roadmap

### Phase 1: Pilot Commands (Week 1)

Apply improvements to 3 highest-traffic commands:

1. **`wpm run`** — Most used command
   - Add `formatConfigTrace()` to show config at -vv
   - Apply `STANDARD_HELP` to all args
   - Enhance error messages with context

2. **`wpm conformance`** — Quality-critical
   - Apply help standards
   - Contextual errors for model validation

3. **`wpm predict`** — Next heavily used
   - Help standards for prediction-specific flags

### Phase 2: Broad Rollout (Week 2-3)

Apply to all ~35 commands in `apps/wasm4pm/src/commands/*.ts`:

```bash
# For each command file:
# 1. Replace custom help text with STANDARD_HELP
# 2. Add formatConfigTrace() to run() if uses resolveConfig()
# 3. Wrap error paths with buildContextualErrorMessage()
```

### Phase 3: Validation & CI Integration (Week 4)

- Add `validateHelpCoverage()` check to pre-commit hooks
- Add tests for each command's help coverage
- Document in CLAUDE.md as standard practice

---

## Before & After Examples

### Example 1: Help Text Gap

**Before:**
```typescript
export const ml = defineCommand({
  args: {
    method: { type: 'string' },  // ← What does this mean?
    k: { type: 'string' },
  },
});

$ wpm ml cluster --help
  --method    (no description)
  --k         (no description)
```

**After:**
```typescript
import { STANDARD_HELP } from './help-standards.js';

export const ml = defineCommand({
  args: {
    method: {
      type: 'string',
      description: STANDARD_HELP.method,  // "Method variant (e.g., token-replay...)"
    },
    k: {
      type: 'string',
      description: 'Number of clusters or neighbors (default: 3)',
    },
  },
});

$ wpm ml cluster --help
  --method    Method variant (e.g., token-replay, alignment; check command help for valid options)
  --k         Number of clusters or neighbors (default: 3)
```

---

### Example 2: Config Tracing Gap

**Before:**
```bash
$ wpm run log.xes -v
Discovery completed in 250ms
(verbose flag ignored for config info)
```

**After:**
```bash
$ wpm run log.xes -vv
Discovery completed in 250ms

[DEBUG] Config Resolution:
  source.kind: file (wasm4pm.toml)
  algorithm.name: cli
  execution.profile: env (WASM4PM_PROFILE)
  observability.logLevel: default

[DECISION] Algorithm Selection:
  Chosen: dfg
  Reason: User-provided via CLI flag
```

---

### Example 3: Error Context Gap

**Before:**
```bash
$ wpm run log.xes --algorithm xyz
Config error: algorithm 'xyz' not found
(User doesn't know if it came from CLI, env var, or config file)
```

**After:**
```bash
$ WASM4PM_ALGORITHM=xyz wpm run log.xes
Config error: algorithm 'xyz' not found
Parameter source: env var WASM4PM_ALGORITHM
Debug hint: Run 'wpm config show --detailed' to see all active settings

Recovery suggestions:
  • Validate config syntax: wpm config verify
  • Check active sources: wpm config show --detailed
```

---

## Testing

All helpers include comprehensive tests in:
- `apps/wasm4pm/src/__tests__/cli-ux-audit.test.ts` (14 tests, 100% passing)

Test coverage:
- ✓ Config trace at different verbose levels
- ✓ Help text validation
- ✓ Error context enrichment
- ✓ Typo suggestion
- ✓ Recovery step generation

Run tests:
```bash
pnpm test --filter @wasm4pm/cli -- cli-ux-audit
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting to import STANDARD_HELP

**Wrong:**
```typescript
const args = {
  algorithm: { description: 'Discovery algorithm' },  // ← Hand-written, inconsistent
};
```

**Right:**
```typescript
import { STANDARD_HELP } from './help-standards.js';

const args = {
  algorithm: { description: STANDARD_HELP.algorithm },  // ← Guaranteed consistent
};
```

### Pitfall 2: Not passing config to buildContextualErrorMessage()

**Wrong:**
```typescript
const msg = buildContextualErrorMessage(error.message, { command: 'run' });
// No config source shown
```

**Right:**
```typescript
const msg = buildContextualErrorMessage(error.message, {
  command: 'run',
  config,  // ← Include config so source can be extracted
  parameter: 'algorithm.name',
});
```

### Pitfall 3: Only showing trace at verboseLevel >= 1

**Wrong:**
```typescript
if (verbose) {  // Shows at -v (level 1)
  projection.debug(formatConfigTrace(config));
}
```

**Right:**
```typescript
const verboseLevel = normalizeVerboseLevel({ verbose });
if (verboseLevel >= 2) {  // Shows at -vv (level 2)
  projection.debug(formatConfigTrace(config));
}
```

---

## Checklist for New Commands

When adding a new command or enhancing an existing one:

- [ ] All string and positional args have `description` field
- [ ] Descriptions use `STANDARD_HELP` constants where applicable
- [ ] Command calls `formatConfigTrace()` if it uses `resolveConfig()`
- [ ] Error paths wrap messages with `buildContextualErrorMessage()`
- [ ] Recovery suggestions generated via `suggestRecoverySteps()`
- [ ] Tests include help coverage validation
- [ ] Tested with `-v`, `-vv`, `-vvv` flags

---

## Questions & Support

- **Config not showing in verbose output?** → Check `verboseLevel >= 2` (use -vv or --verbose=2)
- **Help text still missing?** → Use `validateHelpCoverage()` in tests to catch gaps
- **Error message too generic?** → Add `config` parameter to `buildContextualErrorMessage()`

---

## Related Documentation

- `CLI_UX_AUDIT_ITERATION4.md` — Full audit report with metrics and gap analysis
- `CLAUDE.md` — Project memory (updated with findings)
- `help-standards.ts` — Source code with all available constants
- `error-context.ts` — Detailed docstrings for each function
- `config-trace.ts` — ConfigTracer class for advanced usage

---

## Summary

**Quick integration path for commands:**

1. Import helpers: `import { STANDARD_HELP, formatConfigTrace, buildContextualErrorMessage } from ...`
2. Use STANDARD_HELP for all common flags
3. Call formatConfigTrace() in run() after config load
4. Wrap error messages with buildContextualErrorMessage()
5. Test with validateHelpCoverage()

**Expected impact:**
- Users can debug config issues (-vv shows provenance)
- All help text discoverable via --help
- Error messages explain where bad config came from and how to fix it
