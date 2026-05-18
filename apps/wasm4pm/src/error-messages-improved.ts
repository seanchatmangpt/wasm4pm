/**
 * error-messages-improved.ts
 *
 * Enhanced error messages for wasm4pm CLI.
 * Maps 5 identified vague errors to improved versions with:
 * - Clear root cause explanation
 * - Context (what was being attempted)
 * - Actionable remediation (concrete commands/steps)
 *
 * Audit findings: 5 errors identified (WASM memory, module loading, ML tasks, metrics)
 * All follow 4-part format: WHAT + WHY + CONTEXT + FIX
 *
 * Usage:
 *   import { improveErrorMessage } from './error-messages-improved';
 *   const message = improveErrorMessage('WASM_MEMORY_INIT', { available: 512, required: 1024 });
 */

export type ImprovedErrorKey =
  | 'WASM_MEMORY_INACCESSIBLE'
  | 'WASM_MODULE_NOT_LOADED'
  | 'WASM_MEMORY_WRITE_FAILED'
  | 'ML_TASK_UNHANDLED'
  | 'MODEL_METRICS_INCOMPLETE'
  | 'KERNEL_NOT_INITIALIZED'
  | 'LOG_FILE_NOT_FOUND'
  | 'CONFIG_VALIDATION_FAILED';

/**
 * Enhanced error message factory
 * Takes a vague error key and optional context, returns a 4-part error explanation
 */
export function improveErrorMessage(key: ImprovedErrorKey, context?: Record<string, any>): string {
  const messages: Record<ImprovedErrorKey, (ctx?: Record<string, any>) => string> = {
    WASM_MEMORY_INACCESSIBLE: (ctx) => {
      const detail = ctx?.detail || 'buffer initialization';
      const required = ctx?.required || 'Node.js 16+';
      return (
        `WASM memory initialization failed. ` +
        `\n\nWHAT: Unable to access WASM memory buffer during ${detail}. ` +
        `\n\nWHY: The WASM module cannot allocate or access heap memory. ` +
        `Common causes: (1) Node.js version too old (${required} required), ` +
        `(2) WASM binary corrupted or incompatible, (3) System out of memory. ` +
        `\n\nCONTEXT: Memory buffer at offset 0x0 is inaccessible. ` +
        `Current: ${ctx?.current || 'unknown'} | Required: ${required}. ` +
        `\n\nFIX:\n` +
        `  1. Check Node.js version: node --version\n` +
        `  2. Reinstall WASM package: npm reinstall @wasm4pm/engine\n` +
        `  3. Diagnose your environment: wpm doctor\n` +
        `  4. If memtest fails, try smaller dataset or increase heap: --max-memory 2048m`
      );
    },

    WASM_MODULE_NOT_LOADED: (ctx) => {
      const phase = ctx?.phase || 'algorithm execution';
      return (
        `WASM kernel module not loaded. ` +
        `\n\nWHAT: Attempted to ${phase}, but WASM runtime is not initialized. ` +
        `\n\nWHY: The WASM kernel must be bootstrapped before any process mining operations. ` +
        `This usually happens automatically on first CLI invocation, but can fail if: ` +
        `(1) WASM binary is missing, (2) Node.js is incompatible, ` +
        `(3) Previous initialization failed (cached state is corrupted). ` +
        `\n\nCONTEXT: Current phase: ${phase}. ` +
        `WASM module path: ${ctx?.modulePath || 'wasm4pm/pkg/'}. ` +
        `\n\nFIX:\n` +
        `  1. Diagnose the issue: wpm doctor --verbose\n` +
        `  2. If recovery suggests re-init: rm .wasm4pm/state.json (cached state)\n` +
        `  3. Retry your command (auto-bootstrap will attempt)\n` +
        `  4. If still failing: npm reinstall @wasm4pm/engine\n` +
        `  5. Check compatibility: wpm status --verbose`
      );
    },

    WASM_MEMORY_WRITE_FAILED: (ctx) => {
      const offset = ctx?.offset ?? '0x0';
      const expected = ctx?.expected ?? '0x2a';
      const actual = ctx?.actual ?? 'undefined';
      return (
        `WASM memory write verification failed. ` +
        `\n\nWHAT: Verification test wrote to memory at ${offset}, ` +
        `but read-back did not match. ` +
        `\n\nWHY: Memory is not behaving as expected. Root causes: ` +
        `(1) Memory protection (readonly), (2) WASM runtime allocation unstable, ` +
        `(3) Physical memory fault (check RAM health). ` +
        `\n\nCONTEXT: ` +
        `Wrote: ${expected} | Read: ${actual} | Address: ${offset}. ` +
        `Memory may be corrupted or unmapped. ` +
        `\n\nFIX:\n` +
        `  1. Run hardware check: wpm doctor (includes RAM health assessment)\n` +
        `  2. Verify WASM binary: npm list @wasm4pm/engine\n` +
        `  3. Clear WASM cache: rm -rf node_modules/.wasm4pm-cache\n` +
        `  4. Rebuild: npm reinstall @wasm4pm/engine\n` +
        `  5. Retest: wpm status`
      );
    },

    ML_TASK_UNHANDLED: (ctx) => {
      const task = ctx?.task || 'unknown_task';
      return (
        `ML task "${task}" is not supported. ` +
        `\n\nWHAT: Requested an ML task that is not available in this version. ` +
        `\n\nWHY: The task name is not recognized or the feature is not compiled ` +
        `into this WASM build. ` +
        `\n\nCONTEXT: Your deployment profile may not include all ML algorithms. ` +
        `Valid tasks: classify, cluster, forecast, anomaly, regress, pca. ` +
        `\n\nFIX:\n` +
        `  1. Use a valid task: wpm ml classify -i log.xes --method knn\n` +
        `  2. List available algorithms: wpm algorithms --filter ml\n` +
        `  3. Check your build profile: wpm status --profile\n` +
        `  4. If task should exist: npm reinstall (may have incomplete build)`
      );
    },

    MODEL_METRICS_INCOMPLETE: (ctx) => {
      const missing = ctx?.missing || 'complexity';
      const variants = ctx?.variants ?? 'unknown';
      const density = ctx?.density ?? 'unknown';
      return (
        `Model quality assessment incomplete (missing ${missing}). ` +
        `\n\nWHAT: Computed some quality metrics but not others. ` +
        `Variants: ${variants}, Density: ${density}, ${missing}: NOT_COMPUTED. ` +
        `\n\nWHY: The ${missing} metric could not be computed. ` +
        `Common causes: (1) Model structure invalid (gateway/merge mismatch), ` +
        `(2) Algorithm timeout, (3) Dataset too small (<100 traces). ` +
        `\n\nCONTEXT: Quality assessment is partial; cannot rank model simplicity/fitness. ` +
        `\n\nFIX:\n` +
        `  1. Verify model structure: wpm conformance -i log.xes -m model.pnml\n` +
        `  2. Try larger dataset (>1000 traces) for metric stability\n` +
        `  3. Use simpler algorithm (dfg) to avoid timeouts: --algorithm dfg\n` +
        `  4. Increase timeout: --timeout 60\n` +
        `  5. Check logs for timeout/memory warnings: wpm status --verbose`
      );
    },

    KERNEL_NOT_INITIALIZED: (ctx) => {
      const operation = ctx?.operation || 'discovery';
      return (
        `Kernel not initialized. ` +
        `\n\nWHAT: Cannot proceed with ${operation}; kernel bootstrap did not complete. ` +
        `\n\nWHY: The WASM kernel requires explicit initialization before operations. ` +
        `Bootstrap may have failed silently. ` +
        `\n\nCONTEXT: Operation: ${operation}. ` +
        `Kernel state: not_ready. ` +
        `\n\nFIX:\n` +
        `  1. Initialize kernel: engine.bootstrap() (if using API)\n` +
        `  2. Check kernel state: wpm status\n` +
        `  3. Run diagnostics: wpm doctor\n` +
        `  4. Force recovery: wpm doctor --repair`
      );
    },

    LOG_FILE_NOT_FOUND: (ctx) => {
      const path = ctx?.path || '<unknown>';
      const searchDir = ctx?.searchDir || 'current directory';
      return (
        `Log file not found: ${path}. ` +
        `\n\nWHAT: Could not locate input event log. ` +
        `\n\nWHY: File path does not exist or is not readable. ` +
        `Searched: ${searchDir}. ` +
        `\n\nCONTEXT: Current working directory: ${process.cwd()}. ` +
        `Attempted path: ${path} (absolute: ${require('path').resolve(path)}). ` +
        `\n\nFIX:\n` +
        `  1. Verify file exists: ls -la ${path}\n` +
        `  2. Check permissions: chmod 644 ${path}\n` +
        `  3. Use absolute path: wpm run /full/path/to/log.xes\n` +
        `  4. Verify format: file ${path} (should be XML for .xes)`
      );
    },

    CONFIG_VALIDATION_FAILED: (ctx) => {
      const field = ctx?.field || 'unknown field';
      const reason = ctx?.reason || 'invalid syntax';
      return (
        `Configuration validation failed: ${field} — ${reason}. ` +
        `\n\nWHAT: Your wasm4pm.toml or wasm4pm.json does not validate. ` +
        `\n\nWHY: ${reason}. ` +
        `\n\nCONTEXT: Field: ${field}. Config file: ${ctx?.file || 'wasm4pm.toml'}. ` +
        `\n\nFIX:\n` +
        `  1. Generate valid config: wpm init\n` +
        `  2. Check syntax: npm install -g toml-cli && toml-cli validate wasm4pm.toml\n` +
        `  3. Review schema: wpm explain (shows all config options)\n` +
        `  4. Manual fix: edit ${ctx?.file || 'wasm4pm.toml'} and verify format`
      );
    },
  };

  return messages[key](context);
}

/**
 * 4-part error format validator
 * Checks that an error message includes WHAT, WHY, CONTEXT, and FIX
 */
export function validateErrorFormat(message: string): { valid: boolean; missing: string[] } {
  const required = ['WHAT', 'WHY', 'CONTEXT', 'FIX'];
  const missing = required.filter((part) => !message.toUpperCase().includes(part));
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Usage examples
 */
export const EXAMPLES = {
  wasmMemoryInaccessible: () =>
    improveErrorMessage('WASM_MEMORY_INACCESSIBLE', {
      detail: 'heap allocation',
      required: 'Node.js 16+',
      current: 'Node.js 14.2.0',
    }),

  moduleNotLoaded: () =>
    improveErrorMessage('WASM_MODULE_NOT_LOADED', {
      phase: 'discover_dfg',
      modulePath: 'wasm4pm/pkg/wasm4pm.js',
    }),

  memoryWriteFailed: () =>
    improveErrorMessage('WASM_MEMORY_WRITE_FAILED', {
      offset: '0x0',
      expected: '0x2a',
      actual: '0x00',
    }),

  mlTaskUnhandled: () => improveErrorMessage('ML_TASK_UNHANDLED', { task: 'invalid_task' }),

  modelMetricsIncomplete: () =>
    improveErrorMessage('MODEL_METRICS_INCOMPLETE', {
      missing: 'complexity',
      variants: 5,
      density: 0.45,
    }),
};
