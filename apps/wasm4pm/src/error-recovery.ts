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
 */

import { EXIT_CODES as _EXIT_CODES } from './exit-codes.js';
import { ALGORITHM_CLI_ALIASES as _ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';

export interface RecoveryHint {
  /** Human-readable recovery suggestion (1-2 sentences max) */
  suggestion: string;
  /** Related command to run (e.g., 'wpm init --preset fast') */
  command?: string;
  /** Related environment variable name */
  envVar?: string;
  /** List of alternatives or options to try */
  alternatives?: string[];
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
      const badAlgo = algoMatch ? algoMatch[1] : undefined;
      const suggestions: string[] = [
        'dfg',
        'heuristic',
        'inductive',
        'ilp',
        'genetic',
        'simulated-annealing',
      ];
      return {
        suggestion: `Algorithm '${badAlgo}' not recognized. See available algorithms below or run 'wpm algorithms' to list all options.`,
        command: 'wpm run --help',
        envVar: 'WASM4PM_ALGORITHM',
        alternatives: suggestions,
      };
    }

    // Invalid execution profile
    if (errorMessage.includes('profile') && errorMessage.includes('not')) {
      return {
        suggestion: `Invalid execution profile. Use one of: fast, balanced, quality, or stream. Use 'wpm init --preset <name>' to create a new config with the correct profile.`,
        command: 'wpm init --preset balanced',
        envVar: 'WASM4PM_PROFILE',
        alternatives: ['fast', 'balanced', 'quality', 'stream'],
      };
    }

    // Invalid configuration structure
    if (errorMessage.includes('Failed to parse') && errorMessage.includes('.toml')) {
      return {
        suggestion: `Configuration file has invalid syntax. Check wasm4pm.toml for TOML formatting errors (indentation, quotes, brackets).`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose', 'cat wasm4pm.toml'],
      };
    }

    if (errorMessage.includes('Failed to parse') && errorMessage.includes('.json')) {
      return {
        suggestion: `Configuration file has invalid JSON syntax. Check wasm4pm.json for missing commas, quotes, or brackets. Use a JSON validator for details.`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose', 'cat wasm4pm.json'],
      };
    }

    // Missing required field
    if (errorMessage.includes('required') || errorMessage.includes('missing')) {
      return {
        suggestion: `Configuration is missing a required field. Run 'wpm init --force' to regenerate a complete, valid configuration.`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm init --preset balanced', 'wpm status --verbose'],
      };
    }

    // Invalid data type in config
    if (errorMessage.includes('must be')) {
      return {
        suggestion: `Configuration field has the wrong type. Verify all values match expected types (string, number, boolean, array).`,
        command: 'wpm init --force',
        envVar: undefined,
        alternatives: ['wpm status --verbose'],
      };
    }

    // Default config error
    return {
      suggestion: `Configuration is invalid. Run 'wpm init --force' to generate a valid default config, or check syntax in wasm4pm.toml / wasm4pm.json.`,
      command: 'wpm init --force',
      envVar: 'WASM4PM_*',
      alternatives: ['wpm init --preset fast', 'wpm doctor'],
    };
  }

  // Source error patterns
  if (errorType === 'source') {
    // File not found
    if (errorMessage.includes('not found') || errorMessage.includes('No such file')) {
      const fileMatch = errorMessage.match(/['"]([^'"]+\.(xes|json|csv))['"]/);
      const fileName = fileMatch ? fileMatch[1] : 'log.xes';
      return {
        suggestion: `Input file not found: ${fileName}. Verify the file path is correct and the file exists.`,
        command: `wpm run --input ${fileName}`,
        envVar: 'WASM4PM_SOURCE_*',
        alternatives: ['ls -la log.xes', 'wpm doctor'],
      };
    }

    // Cannot parse log
    if (
      errorMessage.includes('parse') &&
      (errorMessage.includes('XES') || errorMessage.includes('event'))
    ) {
      return {
        suggestion: `Event log format is invalid or corrupted. Verify the file is valid XES/JSON and uses the correct encoding (UTF-8 recommended).`,
        command: 'wpm validate --input log.xes',
        envVar: undefined,
        alternatives: [
          'wpm run --input log.xes --preflight',
          'file log.xes',
          'wpm doctor',
        ],
      };
    }

    // Trace/log too large
    if (errorMessage.includes('exceed') || errorMessage.includes('too large')) {
      return {
        suggestion: `Event log is too large for the current profile. Use a simpler algorithm (dfg) or increase timeout/memory in config.`,
        command: 'wpm run --algorithm dfg --input log.xes',
        envVar: 'WASM4PM_EXECUTION_*',
        alternatives: [
          'wpm init --preset stream',
          'wpm explain --algorithm dfg',
        ],
      };
    }

    // Invalid attributes
    if (errorMessage.includes('attribute') || errorMessage.includes('key')) {
      return {
        suggestion: `Event log is missing required attributes. Verify your log has concept:name and time:timestamp, or use --activity-key to specify the activity attribute name.`,
        command: 'wpm run --activity-key "Activity" --input log.xes',
        envVar: undefined,
        alternatives: ['wpm validate --input log.xes', 'wpm doctor'],
      };
    }

    // Default source error
    return {
      suggestion: `Event log is invalid or cannot be read. Verify the file exists, is valid XES/JSON, and has the required attributes (concept:name, time:timestamp).`,
      command: 'wpm validate --input log.xes',
      envVar: 'WASM4PM_SOURCE_*',
      alternatives: [
        'wpm run --input log.xes --preflight',
        'wpm doctor',
        'file log.xes',
      ],
    };
  }

  // Execution error patterns
  if (errorType === 'execution') {
    // WASM not loaded
    if (errorMessage.includes('WASM') && errorMessage.includes('not loaded')) {
      return {
        suggestion: `WASM module failed to load. This is likely an environment issue. Run 'wpm doctor' to diagnose.`,
        command: 'wpm doctor',
        envVar: undefined,
        alternatives: [
          'wpm status',
          'rm -rf node_modules/.cache',
          'pnpm install',
        ],
      };
    }

    // Algorithm not available in build
    if (errorMessage.includes('not available') || errorMessage.includes('feature')) {
      return {
        suggestion: `Algorithm is not compiled into this WASM build (feature flag disabled). Use a different algorithm or rebuild with the required feature flag.`,
        command: 'wpm algorithms',
        envVar: undefined,
        alternatives: [
          'wpm run --algorithm dfg --input log.xes',
          'wpm explain --algorithm dfg',
        ],
      };
    }

    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
      return {
        suggestion: `Algorithm execution timed out. Increase the timeout, use a faster algorithm (dfg), or reduce log complexity.`,
        command:
          'wpm run --algorithm dfg --timeout 600 --input log.xes',
        envVar: 'WASM4PM_EXECUTION_TIMEOUT',
        alternatives: [
          'wpm init --preset fast',
          'wpm explain --algorithm dfg',
        ],
      };
    }

    // Out of memory
    if (errorMessage.includes('memory') || errorMessage.includes('heap')) {
      return {
        suggestion: `Algorithm ran out of memory. Use a faster algorithm (dfg), reduce log size, or increase available system memory.`,
        command: 'wpm run --algorithm dfg --input log.xes',
        envVar: 'WASM4PM_EXECUTION_MAX_MEMORY',
        alternatives: [
          'wpm init --preset fast',
          'wpm doctor',
          'free -h',
        ],
      };
    }

    // Panic/crash
    if (
      errorMessage.includes('panic') ||
      errorMessage.includes('crash') ||
      errorMessage.includes('fatal')
    ) {
      return {
        suggestion: `Algorithm crashed. This may be a bug. Try a different algorithm or enable verbose logging with 'RUST_LOG=debug'.`,
        command: 'RUST_LOG=debug wpm run --algorithm dfg --input log.xes',
        envVar: undefined,
        alternatives: [
          'wpm doctor',
          'wpm run --algorithm heuristic --input log.xes',
          'wpm prolog8 show',
        ],
      };
    }

    // Default execution error
    return {
      suggestion: `Algorithm execution failed. Check the error details, try a simpler algorithm, or run 'wpm doctor' to diagnose.`,
      command: 'wpm doctor',
      envVar: undefined,
      alternatives: [
        'wpm run --algorithm dfg --input log.xes',
        'wpm status --verbose',
      ],
    };
  }

  // System error patterns
  if (errorType === 'system') {
    // Permission denied
    if (errorMessage.includes('Permission denied') || errorMessage.includes('EACCES')) {
      return {
        suggestion: `Permission denied. Check file/directory permissions. Use 'chmod' to adjust, or run from a directory with write access.`,
        command: 'chmod 755 . && wpm run --input log.xes',
        envVar: undefined,
        alternatives: ['ls -la', 'wpm doctor'],
      };
    }

    // Disk full
    if (errorMessage.includes('No space') || errorMessage.includes('ENOSPC')) {
      return {
        suggestion: `Disk is full. Free up disk space or move output directory to another location.`,
        command: 'df -h && rm -rf .wasm4pm/results/*',
        envVar: undefined,
        alternatives: ['du -sh .', 'wpm doctor'],
      };
    }

    // Network error
    if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return {
        suggestion: `Network error (if using remote OTEL/sink). Check network connectivity or disable observability with 'WASM4PM_OTEL_ENABLED=false'.`,
        command: 'WASM4PM_OTEL_ENABLED=false wpm run --input log.xes',
        envVar: 'WASM4PM_OTEL_ENDPOINT',
        alternatives: ['ping 8.8.8.8', 'wpm doctor'],
      };
    }

    // Environment variable issue
    if (
      errorMessage.includes('env') ||
      errorMessage.includes('environment')
    ) {
      return {
        suggestion: `Environment variable issue. Verify required environment variables are set correctly (e.g., WASM4PM_OTEL_ENDPOINT).`,
        command: 'env | grep WASM4PM',
        envVar: 'WASM4PM_*',
        alternatives: ['wpm doctor', 'set -a && source .env && set +a'],
      };
    }

    // Default system error
    return {
      suggestion: `System error encountered. Run 'wpm doctor' to diagnose environment, permissions, and resource issues.`,
      command: 'wpm doctor',
      envVar: undefined,
      alternatives: ['wpm status', 'uname -a', 'node --version'],
    };
  }

  // Fallback for unknown error types
  return {
    suggestion: `An error occurred. Run 'wpm doctor' for diagnostics or use '--verbose' for more details.`,
    command: 'wpm doctor',
    envVar: undefined,
    alternatives: ['wpm status', 'wpm --help'],
  };
}

/**
 * Format a recovery hint into user-friendly text.
 * Used in error messages and in the output.ts remediation field.
 *
 * Example output:
 *   Suggestion: Algorithm 'foo' not recognized. See available algorithms below or run 'wpm algorithms' to list all.
 *   Run: wpm run --help
 *   Available: dfg, heuristic, inductive, ilp, genetic, simulated-annealing
 */
export function formatRecoveryHint(hint: RecoveryHint): string {
  const lines: string[] = [];

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
