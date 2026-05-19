/**
 * CLI Error Recovery Hints
 *
 * Provides actionable recovery suggestions for common error scenarios.
 * Every error message includes at least one recovery hint plus relevant commands.
 *
 * Pattern:
 * - Identify error type (config, source, execution, system)
 * - Return 1-2 sentence recovery hint
 * - Include relevant command(s) with examples
 * - Include related env var names where applicable
 *
 * Structured error codes for JSON output:
 *   CONFIG_* — configuration/parameter errors
 *   SOURCE_* — input file/format errors
 *   EXEC_* — algorithm/WASM execution errors
 *   SYS_* — system/environment errors
 */

import { EXIT_CODES as _EXIT_CODES } from './exit-codes.js';
import { ALGORITHM_CLI_ALIASES as _ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';

/**
 * Compute Levenshtein distance between two strings (for fuzzy matching).
 * Used to suggest "did you mean?" alternatives.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find the closest matching algorithm to a user input (for "did you mean?" suggestions).
 * Returns the best match if distance <= 3, otherwise undefined.
 */
function findClosestAlgorithm(input: string, candidates: string[]): string | undefined {
  const threshold = 3;
  let closest: { name: string; distance: number } | null = null;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { name: candidate, distance };
    }
  }

  return closest?.name;
}

export interface RecoveryHint {
  /** Human-readable recovery suggestion (1-2 sentences max) */
  suggestion: string;
  /** Related command to run (e.g., 'wpm init --preset fast') */
  command?: string;
  /** Related environment variable name */
  envVar?: string;
  /** List of alternatives or options to try */
  alternatives?: string[];
  /** Structured error code for JSON output (CONFIG_*, SOURCE_*, EXEC_*, SYS_*) */
  code?: string;
  /** If this is a "did you mean?" suggestion, the closest matching value */
  didYouMean?: string;
  /** Deep link to documentation if applicable */
  docsUrl?: string;
}

/**
 * Analyze an error message and return actionable recovery hints.
 *
 * @param errorMessage - The error message string
 * @param errorType - Type of error (config, source, execution, system)
 * @param command - The CLI command that failed (e.g., 'run', 'conformance')
 * @returns Recovery hint with suggestion, command, and alternatives
 */
export function getRecoveryHint(
  errorMessage: string,
  errorType: 'config' | 'source' | 'execution' | 'system',
  _command: string
): RecoveryHint {
  // Config error patterns
  if (errorType === 'config') {
    // Algorithm not found
    if (errorMessage.includes('Algorithm') && errorMessage.includes('not found')) {
      const algoMatch = errorMessage.match(/['"]([^'"]+)['"]/);
      const badAlgo = algoMatch ? algoMatch[1] : 'unknown';
      const suggestions: string[] = [
        'dfg',
        'heuristic',
        'inductive',
        'ilp',
        'genetic',
        'simulated-annealing',
      ];
      const didYouMean = findClosestAlgorithm(badAlgo, suggestions);
      return {
        code: 'CONFIG_ALGORITHM_NOT_FOUND',
        suggestion: `Algorithm '${badAlgo}' not recognized.${didYouMean ? ` Did you mean '${didYouMean}'?` : ''}`,
        command: 'wpm algorithms',
        envVar: 'WASM4PM_ALGORITHM',
        alternatives: suggestions,
        didYouMean,
        docsUrl: 'https://wasm4pm.dev/docs/algorithms',
      };
    }

    // Invalid execution profile
    if (errorMessage.includes('profile') && errorMessage.includes('not')) {
      const profileMatch = errorMessage.match(/['"]([^'"]+)['"]/);
      const badProfile = profileMatch ? profileMatch[1] : 'unknown';
      const profiles = ['fast', 'balanced', 'quality', 'stream'];
      const didYouMean = findClosestAlgorithm(badProfile, profiles);
      return {
        code: 'CONFIG_INVALID_PROFILE',
        suggestion: `Invalid execution profile '${badProfile}'.${didYouMean ? ` Did you mean '${didYouMean}'?` : ' Use one of: fast, balanced, quality, or stream.'}`,
        command: 'wpm init --preset balanced',
        envVar: 'WASM4PM_PROFILE',
        alternatives: profiles,
        didYouMean,
        docsUrl: 'https://wasm4pm.dev/docs/config#execution-profiles',
      };
    }

    // Invalid configuration structure
    if (errorMessage.includes('Failed to parse') && errorMessage.includes('.toml')) {
      return {
        code: 'CONFIG_INVALID_TOML',
        suggestion: `Configuration file has invalid TOML syntax. Check wasm4pm.toml for formatting errors (indentation, quotes, brackets).`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose', 'cat wasm4pm.toml'],
        docsUrl: 'https://wasm4pm.dev/docs/config#toml-format',
      };
    }

    if (errorMessage.includes('Failed to parse') && errorMessage.includes('.json')) {
      return {
        code: 'CONFIG_INVALID_JSON',
        suggestion: `Configuration file has invalid JSON syntax. Check wasm4pm.json for missing commas, quotes, or brackets. Use a JSON validator for details.`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose', 'cat wasm4pm.json'],
        docsUrl: 'https://wasm4pm.dev/docs/config#json-format',
      };
    }

    // Missing required field
    if (errorMessage.includes('required') || errorMessage.includes('missing')) {
      const fieldMatch = errorMessage.match(/['"]([^'"]+)['"]/);
      const field = fieldMatch ? fieldMatch[1] : 'field';
      return {
        code: 'CONFIG_MISSING_REQUIRED',
        suggestion: `Configuration is missing required field '${field}'. Run 'wpm init --force' to regenerate a complete, valid configuration.`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm init --preset balanced', 'wpm status --verbose'],
        docsUrl: 'https://wasm4pm.dev/docs/config#required-fields',
      };
    }

    // Invalid data type in config
    if (errorMessage.includes('must be')) {
      const fieldMatch = errorMessage.match(/['"]([^'"]+)['"]/);
      const field = fieldMatch ? fieldMatch[1] : 'field';
      return {
        code: 'CONFIG_INVALID_TYPE',
        suggestion: `Configuration field '${field}' has wrong type. Verify value matches expected type (string, number, boolean, array).`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose'],
        docsUrl: 'https://wasm4pm.dev/docs/config#field-types',
      };
    }

    // Default config error
    return {
      code: 'CONFIG_INVALID',
      suggestion: `Configuration is invalid. Run 'wpm init --force' to generate a valid default config, or check syntax in wasm4pm.toml / wasm4pm.json.`,
      command: 'wpm init --force',
      envVar: 'WASM4PM_*',
      alternatives: ['wpm init --preset fast', 'wpm doctor'],
      docsUrl: 'https://wasm4pm.dev/docs/config',
    };
  }

  // Source error patterns
  if (errorType === 'source') {
    // File not found
    if (errorMessage.includes('not found') || errorMessage.includes('No such file')) {
      const fileMatch = errorMessage.match(/['"]([^'"]+\.(xes|json|csv))['"]/);
      const fileName = fileMatch ? fileMatch[1] : 'log.xes';
      return {
        code: 'SOURCE_FILE_NOT_FOUND',
        suggestion: `Input file not found: ${fileName}. Verify the file path is correct and the file exists.`,
        command: `wpm run --input ${fileName}`,
        envVar: 'WASM4PM_SOURCE_*',
        alternatives: ['ls -la log.xes', 'wpm doctor'],
        docsUrl: 'https://wasm4pm.dev/docs/input-formats',
      };
    }

    // Cannot parse log
    if (
      errorMessage.includes('parse') &&
      (errorMessage.includes('XES') || errorMessage.includes('event'))
    ) {
      return {
        code: 'SOURCE_PARSE_ERROR',
        suggestion: `Event log format is invalid or corrupted. Verify the file is valid XES/JSON and uses correct encoding (UTF-8 recommended).`,
        command: 'wpm validate --input log.xes',
        envVar: undefined,
        alternatives: [
          'wpm run --input log.xes --preflight',
          'file log.xes',
          'wpm doctor',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/input-formats#xes',
      };
    }

    // Trace/log too large
    if (errorMessage.includes('exceed') || errorMessage.includes('too large')) {
      return {
        code: 'SOURCE_TOO_LARGE',
        suggestion: `Event log is too large for the current profile. Use a simpler algorithm (dfg) or increase timeout/memory in config.`,
        command: 'wpm run --algorithm dfg --input log.xes',
        envVar: 'WASM4PM_EXECUTION_*',
        alternatives: [
          'wpm init --preset stream',
          'wpm explain --algorithm dfg',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/profiles',
      };
    }

    // Invalid attributes
    if (errorMessage.includes('attribute') || errorMessage.includes('key')) {
      return {
        code: 'SOURCE_MISSING_ATTRIBUTES',
        suggestion: `Event log is missing required attributes. Verify your log has concept:name and time:timestamp, or use --activity-key to specify the activity attribute name.`,
        command: 'wpm run --activity-key "Activity" --input log.xes',
        envVar: undefined,
        alternatives: ['wpm validate --input log.xes', 'wpm doctor'],
        docsUrl: 'https://wasm4pm.dev/docs/input-formats#required-attributes',
      };
    }

    // Default source error
    return {
      code: 'SOURCE_INVALID',
      suggestion: `Event log is invalid or cannot be read. Verify the file exists, is valid XES/JSON, and has required attributes (concept:name, time:timestamp).`,
      command: 'wpm validate --input log.xes',
      envVar: 'WASM4PM_SOURCE_*',
      alternatives: [
        'wpm run --input log.xes --preflight',
        'wpm doctor',
        'file log.xes',
      ],
      docsUrl: 'https://wasm4pm.dev/docs/input-formats',
    };
  }

  // Execution error patterns
  if (errorType === 'execution') {
    // WASM not loaded
    if (errorMessage.includes('WASM') && errorMessage.includes('not loaded')) {
      return {
        code: 'EXEC_WASM_LOAD_FAILED',
        suggestion: `WASM module failed to load. This is likely an environment issue. Run 'wpm doctor' to diagnose.`,
        command: 'wpm doctor',
        envVar: undefined,
        alternatives: [
          'wpm status',
          'rm -rf node_modules/.cache',
          'pnpm install',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#wasm-load',
      };
    }

    // Algorithm not available in build
    if (errorMessage.includes('not available') || errorMessage.includes('feature')) {
      return {
        code: 'EXEC_ALGORITHM_NOT_AVAILABLE',
        suggestion: `Algorithm is not compiled into this WASM build (feature flag disabled). Use a different algorithm or rebuild with the required feature flag.`,
        command: 'wpm algorithms',
        envVar: undefined,
        alternatives: [
          'wpm run --algorithm dfg --input log.xes',
          'wpm explain --algorithm dfg',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/profiles',
      };
    }

    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
      return {
        code: 'EXEC_TIMEOUT',
        suggestion: `Algorithm execution timed out. Increase the timeout, use a faster algorithm (dfg), or reduce log complexity.`,
        command:
          'wpm run --algorithm dfg --timeout 600 --input log.xes',
        envVar: 'WASM4PM_EXECUTION_TIMEOUT',
        alternatives: [
          'wpm init --preset fast',
          'wpm explain --algorithm dfg',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/config#timeout',
      };
    }

    // Out of memory
    if (errorMessage.includes('memory') || errorMessage.includes('heap')) {
      return {
        code: 'EXEC_OUT_OF_MEMORY',
        suggestion: `Algorithm ran out of memory. Use a faster algorithm (dfg), reduce log size, or increase available system memory.`,
        command: 'wpm run --algorithm dfg --input log.xes',
        envVar: 'WASM4PM_EXECUTION_MAX_MEMORY',
        alternatives: [
          'wpm init --preset fast',
          'wpm doctor',
          'free -h',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#memory',
      };
    }

    // Panic/crash
    if (
      errorMessage.includes('panic') ||
      errorMessage.includes('crash') ||
      errorMessage.includes('fatal')
    ) {
      return {
        code: 'EXEC_PANIC',
        suggestion: `Algorithm crashed. This may be a bug. Try a different algorithm or enable verbose logging with 'RUST_LOG=debug'.`,
        command: 'RUST_LOG=debug wpm run --algorithm dfg --input log.xes',
        envVar: undefined,
        alternatives: [
          'wpm doctor',
          'wpm run --algorithm heuristic --input log.xes',
          'wpm prolog8 show',
        ],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#crash',
      };
    }

    // Default execution error
    return {
      code: 'EXEC_FAILED',
      suggestion: `Algorithm execution failed. Check the error details, try a simpler algorithm, or run 'wpm doctor' to diagnose.`,
      command: 'wpm doctor',
      envVar: undefined,
      alternatives: [
        'wpm run --algorithm dfg --input log.xes',
        'wpm status --verbose',
      ],
      docsUrl: 'https://wasm4pm.dev/docs/troubleshooting',
    };
  }

  // System error patterns
  if (errorType === 'system') {
    // Permission denied
    if (errorMessage.includes('Permission denied') || errorMessage.includes('EACCES')) {
      return {
        code: 'SYS_PERMISSION_DENIED',
        suggestion: `Permission denied. Check file/directory permissions. Use 'chmod' to adjust, or run from a directory with write access.`,
        command: 'chmod 755 . && wpm run --input log.xes',
        envVar: undefined,
        alternatives: ['ls -la', 'wpm doctor'],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#permissions',
      };
    }

    // Disk full
    if (errorMessage.includes('No space') || errorMessage.includes('ENOSPC')) {
      return {
        code: 'SYS_DISK_FULL',
        suggestion: `Disk is full. Free up disk space or move output directory to another location.`,
        command: 'df -h && rm -rf .wasm4pm/results/*',
        envVar: undefined,
        alternatives: ['du -sh .', 'wpm doctor'],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#disk',
      };
    }

    // Network error
    if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return {
        code: 'SYS_NETWORK_ERROR',
        suggestion: `Network error (if using remote OTEL/sink). Check network connectivity or disable observability with 'WASM4PM_OTEL_ENABLED=false'.`,
        command: 'WASM4PM_OTEL_ENABLED=false wpm run --input log.xes',
        envVar: 'WASM4PM_OTEL_ENDPOINT',
        alternatives: ['ping 8.8.8.8', 'wpm doctor'],
        docsUrl: 'https://wasm4pm.dev/docs/troubleshooting#network',
      };
    }

    // Environment variable issue
    if (
      errorMessage.includes('env') ||
      errorMessage.includes('environment')
    ) {
      return {
        code: 'SYS_ENV_ERROR',
        suggestion: `Environment variable issue. Verify required environment variables are set correctly (e.g., WASM4PM_OTEL_ENDPOINT).`,
        command: 'env | grep WASM4PM',
        envVar: 'WASM4PM_*',
        alternatives: ['wpm doctor', 'set -a && source .env && set +a'],
        docsUrl: 'https://wasm4pm.dev/docs/config#environment-variables',
      };
    }

    // Default system error
    return {
      code: 'SYS_ERROR',
      suggestion: `System error encountered. Run 'wpm doctor' to diagnose environment, permissions, and resource issues.`,
      command: 'wpm doctor',
      envVar: undefined,
      alternatives: ['wpm status', 'uname -a', 'node --version'],
      docsUrl: 'https://wasm4pm.dev/docs/troubleshooting',
    };
  }

  // Fallback for unknown error types
  return {
    code: 'UNKNOWN_ERROR',
    suggestion: `An error occurred. Run 'wpm doctor' for diagnostics or use '--verbose' for more details.`,
    command: 'wpm doctor',
    envVar: undefined,
    alternatives: ['wpm status', 'wpm --help'],
    docsUrl: 'https://wasm4pm.dev/docs/troubleshooting',
  };
}

/**
 * Format a recovery hint into user-friendly text.
 * Used in error messages and in the output.ts remediation field.
 *
 * Example output:
 *   [CONFIG_ALGORITHM_NOT_FOUND]
 *   Suggestion: Algorithm 'foo' not recognized. Did you mean 'dfg'?
 *   Run: wpm algorithms
 *   Available: dfg, heuristic, inductive, ilp, genetic, simulated-annealing
 *   Learn more: https://wasm4pm.dev/docs/algorithms
 */
export function formatRecoveryHint(hint: RecoveryHint): string {
  const lines: string[] = [];

  if (hint.code) {
    lines.push(`[${hint.code}]`);
  }

  lines.push(`Suggestion: ${hint.suggestion}`);

  if (hint.command) {
    lines.push(`\nTo recover, try:`);
    lines.push(`  ${hint.command}`);
  }

  if (hint.envVar) {
    lines.push(`\nRelated environment variable: ${hint.envVar}`);
  }

  if (hint.alternatives && hint.alternatives.length > 0) {
    lines.push(`\nAlternatives:`);
    hint.alternatives.forEach((alt) => {
      lines.push(`  • ${alt}`);
    });
  }

  if (hint.docsUrl) {
    lines.push(`\nLearn more: ${hint.docsUrl}`);
  }

  return lines.join('\n');
}

/**
 * One-liner recovery suggestion for compact error output (e.g., JSON remediation field).
 */
export function getQuickRecoverySuggestion(
  errorMessage: string,
  errorType: 'config' | 'source' | 'execution' | 'system'
): string {
  const hint = getRecoveryHint(errorMessage, errorType, '');

  if (hint.command) {
    return `${hint.suggestion} Try: ${hint.command}`;
  }

  if (hint.envVar) {
    return `${hint.suggestion} Check: ${hint.envVar}`;
  }

  return hint.suggestion;
}

/**
 * Get full recovery hint object for structured JSON output.
 * Useful for APIs that want to include error codes, docs URLs, and alternatives.
 */
export function getRecoveryHintStructured(
  errorMessage: string,
  errorType: 'config' | 'source' | 'execution' | 'system'
): RecoveryHint {
  return getRecoveryHint(errorMessage, errorType, '');
}
