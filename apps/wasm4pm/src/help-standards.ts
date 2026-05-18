/**
 * Help Text Standardization
 *
 * Provides canonical help text and descriptions for common CLI flags and arguments
 * to ensure consistency across all 35+ commands.
 *
 * Use these constants instead of hand-writing flag descriptions in individual commands.
 */

export const STANDARD_HELP = {
  /** Common boolean flags */
  verbose:
    'Show detailed output (levels: -v debug, -vv decisions, -vvv spans)',
  quiet: 'Suppress non-error output',
  format:
    'Output format: human (colored, default) | json | jsonl | sarif',
  noSave:
    'Do not auto-save results to .wasm4pm/results/',
  noDiff:
    'Do not compare against previous result; skip validation',
  noRetry:
    'Fail immediately on error; do not retry with fallback algorithms',
  noCache:
    'Disable all caching (parse, columnar, interner)',

  /** Common input/output flags */
  input:
    'Input event log file (.xes, .xes.gz, .json, .ocel.json; default: stdin)',
  file:
    'Event log file path (alternative to positional argument)',
  output:
    'Write result to this file path (JSON or text format)',
  model:
    'Process model (Petri net JSON handle, file path, or model ID)',
  config:
    'Configuration file path (wasm4pm.toml or wasm4pm.json; searched in cwd and parent dirs if not specified)',

  /** Algorithm/method selection */
  algorithm:
    'Discovery algorithm (run `wpm algorithms --tier balanced` to list; default: heuristic)',
  method:
    'Method variant (e.g., token-replay, alignment; check command help for valid options)',

  /** Execution control */
  timeout:
    'Execution timeout in seconds (default: 300)',
  workers:
    'Number of parallel workers for batch/distributed operations (default: CPU count)',
  profile:
    'Execution profile: fast (dfg only) | balanced (heuristic + ml) | quality (ilp + genetic)',

  /** Quality & conformance */
  threshold:
    'Fitness threshold (0-1): fail with exit 4 if fitness < threshold (default: 0.75)',
  withQuality:
    'Compute and display quality metrics (fitness, precision, simplicity)',
  setBaseline:
    'Save quality metrics as baseline to .wasm4pm/baseline.json for regression detection',
  assertImprovement:
    'Fail if quality metrics regress versus .wasm4pm/baseline.json',

  /** Activity/data mapping */
  activityKey:
    'XES activity attribute key (default: concept:name)',
  targetKey:
    'Target variable for ML regression (default: outcome)',

  /** Prediction & drift */
  prefix:
    'Comma-separated activity sequence for case-level predictions (e.g., "Register,Approve")',
  topK:
    'Number of top predictions to return (default: 3)',
  driftWindow:
    'Sliding window size for drift detection (default: from config or 10)',
  ngramOrder:
    'N-gram order for sequence analysis (default: from config or 2)',
};

/**
 * Canonical flag aliases — use these consistently across all commands.
 */
export const STANDARD_ALIASES = {
  verbose: 'v',
  quiet: 'q',
  input: 'i',
  output: 'o',
  file: 'f',
  algorithm: 'a',
  model: 'm',
  config: 'c',
};

/**
 * Validate that all positional arguments have descriptions.
 * Log warnings if not; enforcement is non-blocking (soft check).
 */
export function validateHelpCoverage(
  commandName: string,
  args: Record<string, { type?: string; description?: string }>
): { hasErrors: boolean; warnings: string[] } {
  const warnings: string[] = [];

  for (const [argName, argDef] of Object.entries(args)) {
    // Positional and string args MUST have descriptions
    if ((argDef.type === 'positional' || argDef.type === 'string') && !argDef.description) {
      warnings.push(
        `${commandName}: argument '${argName}' missing description (type: ${argDef.type})`
      );
    }
  }

  return {
    hasErrors: warnings.length > 0,
    warnings,
  };
}

/**
 * Format a command's full help text with standardized structure:
 * 1. Short description
 * 2. Usage examples (if provided)
 * 3. Options grouped by category
 * 4. Exit codes
 * 5. See also (related commands)
 */
export function formatCommandHelp(options: {
  name: string;
  description: string;
  usage?: string[];
  groups?: {
    title: string;
    items: Array<{ flag: string; description: string }>;
  }[];
  exitCodes?: { code: number; meaning: string }[];
  seeAlso?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`${options.name} — ${options.description}`);
  lines.push('');

  if (options.usage && options.usage.length > 0) {
    lines.push('Usage:');
    for (const u of options.usage) {
      lines.push(`  ${u}`);
    }
    lines.push('');
  }

  if (options.groups && options.groups.length > 0) {
    for (const group of options.groups) {
      lines.push(`${group.title}:`);
      for (const item of group.items) {
        lines.push(`  ${item.flag}`);
        lines.push(`    ${item.description}`);
      }
      lines.push('');
    }
  }

  if (options.exitCodes && options.exitCodes.length > 0) {
    lines.push('Exit Codes:');
    for (const { code, meaning } of options.exitCodes) {
      lines.push(`  ${code}   ${meaning}`);
    }
    lines.push('');
  }

  if (options.seeAlso && options.seeAlso.length > 0) {
    lines.push('See Also:');
    for (const cmd of options.seeAlso) {
      lines.push(`  wpm ${cmd}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
