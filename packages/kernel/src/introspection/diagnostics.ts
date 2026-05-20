/**
 * introspection/diagnostics.ts
 *
 * Error message generation and diagnostic helpers.
 * Transforms generic errors into actionable guidance.
 *
 * Domain oracle: Error messages are derived from ml-rl-testing.md critical constraints (Rank 2: domain contract).
 * All suggestions are specific and actionable, not generic.
 */

/**
 * Diagnostic error with actionable suggestions.
 */
export interface DiagnosticError {
  /** Error message */
  message: string;

  /** Likely root causes */
  rootCauses: string[];

  /** Suggested fixes (ordered by likelihood) */
  suggestions: string[];

  /** Code snippet example (if applicable) */
  example?: string;

  /** Related documentation link */
  docLink?: string;
}

/**
 * Error diagnostics helper.
 */
export class DiagnosticsEngine {
  /**
   * Generate diagnostic for invalid feature matrix.
   *
   * @example
   * Expected: `number[][]` with consistent column counts
   * Got: `[ [1, 2], [3, 4, 5] ]` (row 2 has too many columns)
   */
  public static invalidFeatureMatrix(details: {
    actualType: string;
    expectedType: string;
    context?: string;
  }): DiagnosticError {
    return {
      message: `Invalid feature matrix: expected ${details.expectedType}, got ${details.actualType}`,
      rootCauses: [
        'Inconsistent column counts across rows',
        'Non-numeric values in matrix',
        'Missing or null values not handled',
        'Array vs nested array mismatch',
      ],
      suggestions: [
        'Use `buildFeatureMatrix()` from @wasm4pm/ml to normalize your data',
        'Verify all rows have the same number of columns: `Math.max(...rows.map(r => r.length))`',
        'Replace null/undefined with numeric placeholders: `value ?? 0`',
        'Check for NaN values: `!Number.isNaN(value)`',
        `If migrating from external ML: validate schema with \`validateFeatureMatrix()\``,
      ],
      example: `
// ❌ WRONG: Inconsistent columns
const matrix = [ [1, 2], [3, 4, 5] ];

// ✅ RIGHT: Use buildFeatureMatrix
import { buildFeatureMatrix } from '@wasm4pm/ml';
const matrix = buildFeatureMatrix(traces, ['duration', 'cost']);
      `,
      docLink: 'https://docs.example.com/ml/feature-engineering',
    };
  }

  /**
   * Generate diagnostic for empty feature matrix.
   */
  public static emptyFeatureMatrix(): DiagnosticError {
    return {
      message: 'Feature matrix is empty (no rows)',
      rootCauses: [
        'No training traces provided',
        'Feature extraction returned 0 rows',
        'Filter operation removed all data',
        'Log is empty',
      ],
      suggestions: [
        'Provide at least 10 traces for reliable ML models',
        'Check your input log: `log.traces.length > 0`',
        'If filtering, verify predicates: `traces.filter(...).length > 0`',
        'Use @wasm4pm/ml sample datasets for testing: `loadPublicDataset("simple")`',
      ],
      example: `
import { loadPublicDataset } from 'wasm4pm/introspection';
const { log } = await loadPublicDataset('simple');
console.log(log.traces.length);  // > 0 guaranteed
      `,
    };
  }

  /**
   * Generate diagnostic for NaN in predictions.
   */
  public static nanInPredictions(): DiagnosticError {
    return {
      message: 'Predictions contain NaN (Not a Number)',
      rootCauses: [
        'Division by zero in calculations',
        'Missing feature values (null/undefined)',
        'Invalid mathematical operations (sqrt of negative)',
        'No variance in training data (degenerate case)',
      ],
      suggestions: [
        'Validate input features: `data.every(row => row.every(v => Number.isFinite(v)))`',
        'Check for constant features: if all values are identical, algorithm may fail',
        'Use min/max normalization: `(x - min) / (max - min)`',
        'Add small epsilon to denominators: `sum / (count + 1e-10)`',
        'Increase training data diversity',
      ],
      example: `
// Validate before passing to ML
function validateFinite(data) {
  return data.every(row =>
    row.every(v => Number.isFinite(v))
  ) ? data : null;
}

const safeData = validateFinite(features);
if (!safeData) throw new Error('Invalid features: contains NaN or Infinity');
      `,
    };
  }

  /**
   * Generate diagnostic for parameter out of bounds.
   */
  public static parameterOutOfBounds(details: {
    paramName: string;
    value: number;
    min: number;
    max: number;
    algorithmId: string;
  }): DiagnosticError {
    const { paramName, value, min, max, algorithmId } = details;
    return {
      message: `Parameter '${paramName}' is out of bounds: ${value} not in [${min}, ${max}]`,
      rootCauses: [
        'Value exceeds algorithm constraints',
        'Copy-paste from different algorithm',
        'Typo in parameter value',
        'Unit mismatch (e.g., milliseconds vs seconds)',
      ],
      suggestions: [
        `Use constrained value: clamp(${value}, ${min}, ${max})`,
        `Get example config: import { getMlRegistry } from 'wasm4pm/introspection'; const ex = getMlRegistry().getExampleConfig('${algorithmId}');`,
        `Consult domain range: ${paramName} should be in [${min}, ${max}] based on ml-rl-testing.md`,
        'Reduce value for faster execution, increase for better quality',
      ],
      example: `
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const clampValue = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const safeValue = clampValue(${value}, ${min}, ${max});  // ${Math.max(min, Math.min(max, value))}
      `,
    };
  }

  /**
   * Generate diagnostic for unsupported algorithm in profile.
   */
  public static algorithmNotInProfile(details: {
    algorithmId: string;
    profile: string;
    availableInProfiles: string[];
  }): DiagnosticError {
    return {
      message: `Algorithm '${details.algorithmId}' is not available in '${details.profile}' profile`,
      rootCauses: [
        `Algorithm requires features not in '${details.profile}' profile`,
        'Profile size constraints exclude this algorithm',
        'Deployment target does not support this algorithm',
      ],
      suggestions: [
        `Switch to profile: ${details.availableInProfiles[0]} (has ${details.algorithmId})`,
        `Use deployment profile '${details.availableInProfiles.join("' or '")}' if possible`,
        'If using mobile/iot profile, consider: fast alternatives include dfg, skeleton, heuristic_miner',
        'Rebuild WASM with larger profile: `npm run build:fog` or `build:browser`',
      ],
      example: `
// Algorithm: ${details.algorithmId}, Available in: ${details.availableInProfiles.join(', ')}
// Current: ${details.profile} ❌

// Solution: Use one of these profiles
import { getRegistry } from 'wasm4pm';
const algo = getRegistry().getAlgorithm('${details.algorithmId}');
console.log('Try these:', algo.deploymentProfiles);  // ${details.availableInProfiles}
      `,
    };
  }

  /**
   * Generate diagnostic for prediction model mismatch.
   */
  public static predictionModelMismatch(): DiagnosticError {
    return {
      message: 'Prediction model mismatch: model trained on different perspective or parameters',
      rootCauses: [
        'Model from next_activity perspective used with remaining_time',
        'Training parameters changed (ngramOrder, windowSize)',
        'Log structure incompatible with model',
      ],
      suggestions: [
        'Verify model.perspective matches task.perspective',
        'Check model training parameters match inference parameters',
        'Retrain model with current log: `mode: "fit_predict"`',
        'Use model.fingerprint to cache trained models by signature',
      ],
      example: `
// ❌ WRONG
const model = trainedNextActivityModel;  // trained on next_activity
await predict({
  task: { perspective: 'outcome', ... },  // expects outcome
  model,  // mismatch!
});

// ✅ RIGHT
if (model.perspective !== task.perspective) {
  throw new Error(\`Model mismatch: \${model.perspective} vs \${task.perspective}\`);
}
      `,
    };
  }

  /**
   * Generate diagnostic for type validation failure.
   */
  public static typeValidationFailure(details: {
    fieldPath: string;
    expectedType: string;
    actualType: string;
    value: unknown;
  }): DiagnosticError {
    return {
      message: `Type mismatch at '${details.fieldPath}': expected ${details.expectedType}, got ${details.actualType}`,
      rootCauses: [
        'JSON deserialization type loss (e.g., number becomes string)',
        'API response format changed',
        'Configuration file uses wrong type',
      ],
      suggestions: [
        `Coerce to correct type: \`JSON.parse(json, (k, v) => { /* type coercion */ })\``,
        `Use Zod schema validation: \`import { validateConfig } from '@wasm4pm/config';\``,
        `Check environment variable encoding: strings need explicit parsing`,
        `Inspect raw value: \`console.log(typeof ${details.value}, ${details.value})\``,
      ],
      example: `
// ❌ WRONG: ENV vars are always strings
const timeout = process.env.TIMEOUT;  // "5000" (string)

// ✅ RIGHT: Explicit coercion
const timeout = parseInt(process.env.TIMEOUT || "5000", 10);

// Or use validation schema
import { z } from 'zod';
const schema = z.object({ timeout: z.number().positive() });
const config = schema.parse({ timeout: 5000 });
      `,
    };
  }

  /**
   * Generate diagnostic for insufficient training data.
   */
  public static insufficientTrainingData(details: {
    perspectiveId: string;
    provided: number;
    minimum: number;
  }): DiagnosticError {
    return {
      message: `Insufficient training data: ${details.provided} traces provided, minimum ${details.minimum} required for '${details.perspectiveId}'`,
      rootCauses: [
        'Log is too small for reliable model training',
        'Filtering removed too many traces',
        'Perspective requires data diversity not present in small log',
      ],
      suggestions: [
        `Provide at least ${details.minimum} traces (you have ${details.provided})`,
        'Use public dataset for testing: `loadPublicDataset("bpi2020")` (~100 traces)',
        'If in production, collect more event logs',
        'Consider starting with simpler perspective (e.g., features) that needs less data',
      ],
      example: `
import { loadPublicDataset } from 'wasm4pm/introspection';
const { log } = await loadPublicDataset('bpi2020');
console.log('Traces:', log.traces.length);  // >= 100 guaranteed

// Then train
const result = await predict({
  task: { perspective: '${details.perspectiveId}', ... },
  log,
  mode: 'fit',
});
      `,
    };
  }
}

/**
 * Helper to get diagnostic suggestions for common errors.
 *
 * @param errorType - Type of error
 * @param details - Error-specific details
 * @returns Diagnostic with suggestions
 *
 * @example
 * ```typescript
 * const diagnostic = getDiagnostic('parameterOutOfBounds', {
 *   paramName: 'k',
 *   value: 1000,
 *   min: 2,
 *   max: 20,
 *   algorithmId: 'cluster'
 * });
 *
 * console.log(diagnostic.suggestions);
 * ```
 */
export function getDiagnostic(
  errorType: string,
  details?: Record<string, unknown>
): DiagnosticError {
  // Route to appropriate diagnostic method
  switch (errorType) {
    case 'invalidFeatureMatrix':
      return DiagnosticsEngine.invalidFeatureMatrix(details as any);
    case 'emptyFeatureMatrix':
      return DiagnosticsEngine.emptyFeatureMatrix();
    case 'nanInPredictions':
      return DiagnosticsEngine.nanInPredictions();
    case 'parameterOutOfBounds':
      return DiagnosticsEngine.parameterOutOfBounds(details as any);
    case 'algorithmNotInProfile':
      return DiagnosticsEngine.algorithmNotInProfile(details as any);
    case 'predictionModelMismatch':
      return DiagnosticsEngine.predictionModelMismatch();
    case 'typeValidationFailure':
      return DiagnosticsEngine.typeValidationFailure(details as any);
    case 'insufficientTrainingData':
      return DiagnosticsEngine.insufficientTrainingData(details as any);
    default:
      return {
        message: `Error: ${errorType}`,
        rootCauses: ['Unknown error type'],
        suggestions: ['Check documentation or file an issue'],
      };
  }
}

/**
 * Diagnose a general CLI or kernel error and return actionable guidance.
 *
 * Pattern-matches on error message content to identify the error type and
 * return specific root causes and suggestions.
 *
 * @example
 * ```typescript
 * try {
 *   await kernel.run('dfg', handle);
 * } catch (err) {
 *   const diag = diagnoseError(err);
 *   console.error(formatDiagnostic(diag));
 * }
 * ```
 */
export function diagnoseError(error: unknown): DiagnosticError {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (msg.includes('wasm') && (msg.includes('init') || msg.includes('load') || msg.includes('instantiat'))) {
    return {
      message: 'WASM initialization failed',
      rootCauses: [
        'WASM binary not built — run `npm run build:wasm` in the wasm4pm/ directory',
        'Incompatible Node.js version — requires Node 18+',
        'pkg/ directory missing or stale — rebuild with wasm-pack',
      ],
      suggestions: [
        'Run `cd wasm4pm && npm run build` to rebuild the WASM module',
        'Check `node --version` — minimum Node.js 18.0.0 required',
        'Verify `wasm4pm/pkg/wasm4pm_bg.wasm` exists after build',
        'Run `wpm doctor` for a full 17-check environment diagnostic',
      ],
    };
  }

  if ((msg.includes('not found') || msg.includes('unknown')) && msg.includes('algorithm')) {
    return {
      message: 'Algorithm not found',
      rootCauses: [
        'Algorithm ID may be misspelled',
        'Algorithm is not available in the current deployment profile',
        'Algorithm requires a feature flag not compiled into this WASM build',
      ],
      suggestions: [
        'Run `wpm status` to list available algorithms for your profile',
        'Check the algorithm ID spelling against the registry (e.g. "heuristic_miner" not "heuristic")',
        'Use `listAlgorithmsByProfile("browser")` to see available algorithms',
        'Try a simpler algorithm first: "dfg" is available in all profiles',
      ],
    };
  }

  if (msg.includes('config') && (msg.includes('invalid') || msg.includes('missing') || msg.includes('not found'))) {
    return {
      message: 'Configuration error',
      rootCauses: [
        'wasm4pm.toml not found in the current directory',
        'Required field missing from configuration file',
        'ENV variable override has invalid value',
      ],
      suggestions: [
        'Run `wpm init` to create a default wasm4pm.toml in the current directory',
        'Check that `source.path` points to an existing .xes file',
        'Validate configuration with `wpm validate`',
        'See ENV variable reference: WASM4PM_PROFILE, WASM4PM_ALGORITHM, WASM4PM_OUTPUT_FORMAT',
      ],
    };
  }

  if ((msg.includes('not found') || msg.includes('enoent') || msg.includes('no such file')) && (msg.includes('.xes') || msg.includes('source') || msg.includes('log'))) {
    return {
      message: 'Source event log not found',
      rootCauses: [
        'Path in source.path does not exist',
        'Relative path resolved from wrong working directory',
        'File permissions deny read access',
      ],
      suggestions: [
        'Use an absolute path for source.path in wasm4pm.toml',
        'Run the command from the directory containing the .xes file',
        'Check file permissions with `ls -la <path>`',
        'Use `loadSampleDataset("simple")` for a built-in test log',
      ],
    };
  }

  if (msg.includes('memory') && (msg.includes('exceed') || msg.includes('out of') || msg.includes('heap'))) {
    return {
      message: 'WASM memory limit exceeded',
      rootCauses: [
        'Event log is too large for the current deployment profile',
        'Algorithm memory usage exceeds WASM linear memory limit (typically 4GB max)',
        'Multiple large handles retained in memory simultaneously',
      ],
      suggestions: [
        'Use a lighter algorithm: "dfg" or "process_skeleton" use minimal memory',
        'Switch to the "stream" execution profile for memory-bounded processing',
        'Free unused handles with `kernel.freeHandle(handle)` before running',
        'Use the "fog" or "cloud" deployment profile for larger logs',
      ],
    };
  }

  if (msg.includes('algorithm') && msg.includes('fail')) {
    return {
      message: 'Algorithm execution failed',
      rootCauses: [
        'Algorithm parameter is out of valid range',
        'Event log has no traces or is malformed',
        'Activity key does not match any event attributes',
      ],
      suggestions: [
        'Validate the event log with `wpm validate -i <log.xes>`',
        'Check algorithm parameters against valid ranges in the registry metadata',
        'Use the default activity key "concept:name" unless your log uses a different attribute',
        'Try the "dfg" algorithm to verify the log parses correctly',
      ],
    };
  }

  if (msg.includes('conformance') && (msg.includes('fail') || msg.includes('mismatch') || msg.includes('fitness'))) {
    return {
      message: 'Conformance check failed',
      rootCauses: [
        'Process model does not fit the observed event log (fitness < 0.85)',
        'Log contains activities not present in the model',
        'Model is too restrictive for the actual process behaviour',
      ],
      suggestions: [
        'Run `wpm quality -i <log.xes>` to see fitness, precision, and generalization scores',
        'Rediscover the model from the same log to check for model/log divergence',
        'Use a less restrictive algorithm (heuristic_miner) to allow more flexible conformance',
        'Check for rework or loop activities that the model may not capture',
      ],
    };
  }

  // Generic fallback
  return {
    message: error instanceof Error ? error.message : String(error),
    rootCauses: [
      'Unexpected error — the specific cause could not be automatically determined',
      'Environment configuration may be incomplete',
      'A recent code change may have introduced a regression',
    ],
    suggestions: [
      'Run `wpm doctor --verbose` for a full environment diagnostic',
      'Check the error stack trace for more specific information',
      'Search the issue tracker or documentation for this error message',
    ],
  };
}

/**
 * Format diagnostic for console output.
 *
 * @param diagnostic - Diagnostic error
 * @returns Formatted string suitable for console output
 */
export function formatDiagnostic(diagnostic: DiagnosticError): string {
  const lines: string[] = [];
  lines.push(`\n❌ ${diagnostic.message}\n`);

  lines.push('Root causes:');
  diagnostic.rootCauses.forEach((cause, i) => {
    lines.push(`  ${i + 1}. ${cause}`);
  });

  lines.push('\nSuggestions:');
  diagnostic.suggestions.forEach((sugg, i) => {
    lines.push(`  ${i + 1}. ${sugg}`);
  });

  if (diagnostic.example) {
    lines.push(`\nExample:\n${diagnostic.example}`);
  }

  if (diagnostic.docLink) {
    lines.push(`\nLearn more: ${diagnostic.docLink}`);
  }

  return lines.join('\n');
}
