/**
 * Verbose flag parser — converts citty boolean flags to numeric levels.
 *
 * Citty parses -v, -vv, -vvv as boolean true, but we want numeric counting.
 * This helper extracts verbose level from raw process.argv or from the context.
 *
 * Usage:
 *   const verboseLevel = extractVerboseLevel(ctx.args);  // 0-3
 */

/**
 * Extract verbose level from command arguments.
 * Counts consecutive -v flags if present in raw argv, otherwise falls back to boolean.
 *
 * Examples:
 *   no flag → 0
 *   -v → 1
 *   -vv → 2
 *   -vvv → 3
 *   --verbose → 1
 */
export function extractVerboseLevel(args: Record<string, unknown>): 0 | 1 | 2 | 3 {
  // If verbose is passed as a number, use it directly
  if (typeof args.verbose === 'number') {
    return Math.min(3, Math.max(0, args.verbose)) as 0 | 1 | 2 | 3;
  }

  // If verbose is true, default to level 1
  if (args.verbose === true) {
    // Try to count from process.argv as fallback
    const argv = process.argv.join('');
    if (argv.includes('-vvv')) return 3;
    if (argv.includes('-vv')) return 2;
    return 1;
  }

  // No verbose flag
  return 0;
}

/**
 * Format verbose level for help text display.
 * Shows the user what levels mean.
 */
export const VERBOSE_HELP = `Verbosity level (use -v, -vv, or -vvv):
  (none)  Show only essential output
  -v      Debug: config sources, timing, algorithm selection
  -vv     Decisions: why algorithm/profile were chosen, precedence chains
  -vvv    Spans: OTEL span IDs for Jaeger trace correlation`;
