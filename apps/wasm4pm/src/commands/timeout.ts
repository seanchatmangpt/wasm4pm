/**
 * timeout.ts
 *
 * Utility command: `wpm timeout estimate <log.xes> <algorithm>`
 *
 * Shows the adaptive timeout value that would be applied for a given log and algorithm.
 * Useful for understanding timeout behavior without running the full algorithm.
 *
 * Example:
 *   wpm timeout estimate process.xes genetic
 *   # Output: Estimated timeout for 'genetic' on 50,234 events: 120 seconds
 *   #   (base 30s + event_factor 50s + complexity 1.0× + algorithm 4.0×)
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { computeTimeout, classifyComplexity, detectAlgorithmTier } from '@wasm4pm/kernel';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

export interface TimeoutOptions {
  algorithm?: string;
  format?: string;
  verbose?: boolean;
}

export const timeout = defineCommand({
  meta: {
    name: 'timeout',
    description: 'Estimate adaptive timeout for an algorithm on a given event log',
  },
  subCommands: {
    estimate: defineCommand({
      meta: {
        name: 'estimate',
        description: 'Calculate timeout value based on log size and algorithm',
      },
      args: {
        log: {
          type: 'positional',
          description: 'Path to XES or JSON event log',
          required: true,
        },
        algorithm: {
          type: 'positional',
          description: 'Algorithm name (e.g., dfg, heuristic, genetic, ilp)',
          required: true,
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
        verbose: {
          type: 'boolean',
          description: 'Show detailed timeout breakdown (base, factors, multipliers)',
          alias: 'v',
        },
      },
      async run(ctx) {
        const logPath = ctx.args.log as string;
        const algorithmName = ctx.args.algorithm as string;
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const verbose = Boolean(ctx.args.verbose);

        return withSpan(
          'timeout-estimate',
          { logPath, algorithm: algorithmName },
          async () => {
            try {
              // Step 1: Load the event log
              let logContent: string;
              try {
                logContent = await fs.readFile(logPath, 'utf-8');
              } catch (err) {
                const result = makeErrorResult(
                  'timeout',
                  new Error(`Cannot read log file: ${logPath}`),
                  EXIT_CODES.source_error,
                  'SOURCE_ERROR'
                );
                emitResult(result, { format, verbose });
                return await exitWithFlush(result.exit_code);
              }

              // Step 2: Parse the log to extract event count and complexity
              let eventCount = 0;
              let distinctActivities = 0;
              let numTraces = 0;

              if (logPath.endsWith('.json')) {
                // Parse JSON log — simplified counting (just count object entries)
                try {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const _parsed = JSON.parse(logContent) as Record<string, unknown>;

                  // Count events by looking for common event patterns
                  eventCount = (logContent.match(/"concept:name"/g) ?? []).length;

                  // Extract distinct activities from JSON
                  const activityRegex = /"concept:name"\s*:\s*"([^"]+)"/g;
                  const activities = new Set<string>();
                  let match;
                  while ((match = activityRegex.exec(logContent)) !== null) {
                    activities.add(match[1]);
                  }
                  distinctActivities = activities.size;

                  // Count distinct case IDs
                  const caseIdRegex = /"case:concept:name"\s*:\s*"([^"]+)"/g;
                  const caseIds = new Set<string>();
                  while ((match = caseIdRegex.exec(logContent)) !== null) {
                    caseIds.add(match[1]);
                  }
                  numTraces = caseIds.size;

                  // If we couldn't extract via regex, use simpler heuristics
                  if (eventCount === 0) {
                    eventCount = (logContent.match(/\{/g) ?? []).length;
                  }
                  if (distinctActivities === 0) {
                    distinctActivities = Math.max(1, Math.ceil(eventCount / 10));
                  }
                  if (numTraces === 0) {
                    numTraces = Math.max(1, Math.ceil(eventCount / 50));
                  }
                } catch (err) {
                  const result = makeErrorResult(
                    'timeout',
                    new Error(`Invalid JSON log format: ${logPath}`),
                    EXIT_CODES.source_error,
                    'SOURCE_ERROR'
                  );
                  emitResult(result, { format, verbose });
                  return await exitWithFlush(result.exit_code);
                }
              } else {
                // Parse XES log — simplified counting
                eventCount = (logContent.match(/<event>/g) ?? []).length;
                numTraces = (logContent.match(/<trace>/g) ?? []).length;

                // Extract unique activity names
                const activityRegex =
                  /<string key="concept:name" value="([^"]+)"/g;
                const activities = new Set<string>();
                let match;
                while ((match = activityRegex.exec(logContent)) !== null) {
                  activities.add(match[1]);
                }
                distinctActivities = activities.size;
              }

              // Step 3: Estimate complexity
              const complexity = classifyComplexity(
                eventCount,
                distinctActivities,
                numTraces
              );

              // Step 4: Detect algorithm tier
              const algorithmTier = detectAlgorithmTier(algorithmName);

              // Step 5: Compute timeout
              const timeoutResult = computeTimeout({
                eventCount,
                complexity,
                algorithmTier,
                algorithmName,
              });

              // Step 6: Format output
              if (format === 'json') {
                const result = makeResult(
                  'timeout',
                  {
                    algorithm: algorithmName,
                    log_path: logPath,
                    event_count: eventCount,
                    distinct_activities: distinctActivities,
                    num_traces: numTraces,
                    complexity,
                    algorithm_tier: algorithmTier,
                    timeout_ms: timeoutResult.timeoutMs,
                    timeout_seconds: Math.round(timeoutResult.timeoutMs / 1000),
                    breakdown: timeoutResult.breakdown,
                  },
                  EXIT_CODES.success
                );
                emitResult(result, { format: 'json' });
              } else {
                // Human-readable output
                const timeoutSecs = Math.round(timeoutResult.timeoutMs / 1000);

                let output = `Estimated timeout for '${algorithmName}' on ${eventCount.toLocaleString()} events: ${timeoutSecs} seconds\n`;

                if (verbose) {
                  output += `\nLog characteristics:\n`;
                  output += `  Events: ${eventCount}\n`;
                  output += `  Traces: ${numTraces}\n`;
                  output += `  Activities: ${distinctActivities}\n`;
                  output += `  Complexity: ${complexity}\n`;
                  output += `\nTimeout factors:\n`;
                  output += `  Algorithm tier: ${algorithmTier}\n`;
                  output += `  Base timeout: ${timeoutResult.breakdown.base_ms}ms\n`;
                  output += `  Event factor: ${timeoutResult.breakdown.event_factor_ms}ms (+${Math.round((eventCount / 10_000) * 100)}ms per 10K events)\n`;
                  output += `  Complexity multiplier: ${timeoutResult.breakdown.complexity_multiplier}×\n`;
                  output += `  Algorithm multiplier: ${timeoutResult.breakdown.algorithm_multiplier}×\n`;
                }

                console.log(output);

                const result = makeResult('timeout', { output }, EXIT_CODES.success);
                emitResult(result, { format: 'human', verbose: false });
              }

              return await exitWithFlush(EXIT_CODES.success);
            } catch (err) {
              const result = makeErrorResult(
                'timeout',
                err instanceof Error ? err : new Error(String(err)),
                EXIT_CODES.execution_error,
                'EXECUTION_ERROR'
              );
              emitResult(result, { format, verbose });
              return await exitWithFlush(result.exit_code);
            }
          }
        );
      },
    }),
  },
});
