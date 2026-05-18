/**
 * Error Context Enhancement
 *
 * Enriches error messages with config context and structured remediation paths.
 * Helps users understand why a command failed by showing relevant config state.
 */

import type { Config } from '@wasm4pm/config';

export interface ErrorContextOptions {
  config?: Config;
  configPath?: string;
  command: string;
  parameter?: string;
}

/**
 * Build a contextual error message that includes where the error came from
 * (config file, ENV var, CLI flag) and how to debug it.
 *
 * @param baseError - The underlying error message
 * @param context - Config and context information
 * @returns Enhanced error message with config context
 */
export function buildContextualErrorMessage(
  baseError: string,
  context: ErrorContextOptions
): string {
  const lines: string[] = [baseError];

  // Add parameter source info if available
  if (context.parameter && context.config?.metadata?.provenance) {
    const provEntry = context.config.metadata.provenance[context.parameter];
    if (provEntry) {
      const source = (() => {
        if (provEntry.source === 'cli') return 'CLI flag';
        if (provEntry.source === 'env') return `ENV var ${provEntry.path || ''}`;
        if (provEntry.source === 'json' || provEntry.source === 'toml' || provEntry.source === 'default') return `config file ${provEntry.path || ''}`;
        return provEntry.source || 'default';
      })();
      lines.push(`\nParameter source: ${source}`);
    }
  }

  // Add diagnostic hint
  lines.push(`\nDebug hint: Run 'wpm config show --detailed' to see all active settings`);
  if (context.configPath) {
    lines.push(`Config search path: ${context.configPath}`);
  }

  return lines.join('\n');
}

/**
 * Suggest recovery steps based on error type and config state.
 * Returns structured remediation that's more specific than generic hints.
 */
export function suggestRecoverySteps(
  errorCode: string,
  context: ErrorContextOptions
): string[] {
  const steps: string[] = [];

  if (errorCode.includes('CONFIG')) {
    steps.push('Validate config syntax: wpm config verify');
    steps.push('Check active sources: wpm config show --detailed');
    if (context.configPath) {
      steps.push(`Review config file: cat ${context.configPath}`);
    }
  }

  if (errorCode.includes('SOURCE')) {
    steps.push('Verify input file exists and is readable');
    if (context.parameter === 'input') {
      steps.push('Check file format: .xes, .xes.gz, .json, or .ocel.json');
    }
  }

  if (errorCode.includes('EXECUTION')) {
    steps.push('Try with a simpler algorithm: wpm run <log> --algorithm dfg');
    steps.push('Check memory: wpm doctor');
    steps.push('Increase timeout: wpm run <log> --timeout 600');
  }

  if (errorCode.includes('SYSTEM')) {
    steps.push('Check disk space and file permissions');
    steps.push('Review system logs: wpm doctor');
  }

  return steps;
}

/**
 * Format multiple recovery suggestions into readable output.
 */
export function formatRecoverySuggestions(steps: string[]): string {
  if (steps.length === 0) return '';
  const lines = ['Recovery suggestions:', ...steps.map((s) => `  • ${s}`)];
  return lines.join('\n');
}

/**
 * Extract the config value that caused an error (if applicable).
 * Useful for error messages like: "Invalid value 'xyz' for parameter 'algorithm'"
 */
export function extractErrorValue(
  config: Config | undefined,
  parameterKey: string
): unknown {
  if (!config) return undefined;

  // Navigate nested keys like "algorithm.name" → config.algorithm.name
  const parts = parameterKey.split('.');
  let current: any = config;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) break;
  }

  return current;
}

/**
 * Build a "did you mean?" suggestion based on the attempted value and available options.
 * For example: "algorithm 'hlm' not found. Did you mean 'heuristic'?"
 */
export function suggestClosestMatch(
  attempted: string,
  validOptions: string[]
): string | null {
  // Simple Levenshtein-like heuristic: find closest match by common prefix length
  // and edit distance
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const option of validOptions) {
    // Prefer prefix matches (e.g., 'heu' → 'heuristic')
    if (option.startsWith(attempted)) {
      return option; // Exact prefix match is best
    }

    // Fallback: edit distance (simple: count matching characters)
    const score = attemptMatchScore(attempted, option);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = option;
    }
  }

  // Only suggest if reasonably close (>60% match)
  return bestScore > 0.6 ? bestMatch : null;
}

function attemptMatchScore(a: string, b: string): number {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  let matches = 0;

  for (const char of shorter) {
    if (longer.includes(char)) matches++;
  }

  return matches / Math.max(a.length, b.length);
}
