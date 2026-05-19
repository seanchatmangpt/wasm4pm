/**
 * first-run-ux.ts
 * First-run user experience detection and hints for wpm run command.
 * Reduces zero-to-first-result time from 9-17 minutes to <5 minutes.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const RESULTS_DIR = '.wasm4pm/results';

/**
 * Detects if this is a first-run by checking if results directory
 * has fewer than 2 result files.
 *
 * @param cwdOverride - Optional directory to search instead of process.cwd().
 *   Pass a temp path in tests to avoid process.chdir() which is unsupported
 *   in vitest worker threads.
 */
export async function isFirstRun(cwdOverride?: string): Promise<boolean> {
  try {
    const cwd = cwdOverride ?? process.cwd();
    const resultsPath = path.join(cwd, RESULTS_DIR);

    try {
      const files = await fs.readdir(resultsPath);
      // Filter to discovery result JSON files.
      // Filenames use format: <timestamp>-discover-<algo>.json (e.g. 20260518T110410-discover-heuristic.json)
      // The original filter used startsWith('discover-') which never matched; now uses includes('-discover-').
      const resultFiles = files.filter((f) => f.endsWith('.json') && f.includes('-discover-'));
      return resultFiles.length < 2;
    } catch (err) {
      // Directory doesn't exist yet - definitely first run
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }
      throw err;
    }
  } catch {
    // If we can't determine, assume not first run (don't error)
    return false;
  }
}

/**
 * Interprets fitness score for end users
 * 0-1 scale (fitness * 100 = percentage)
 */
export function interpretFitness(fitness: number): {
  level: 'High' | 'Medium' | 'Low' | 'Critical';
  emoji: string;
  explanation: string;
} {
  if (fitness >= 0.85) {
    return {
      level: 'High',
      emoji: '✓',
      explanation: 'Model explains most observed behavior. Suitable for process improvement analysis.',
    };
  }
  if (fitness >= 0.60) {
    return {
      level: 'Medium',
      emoji: '◐',
      explanation:
        'Model covers about 60-85% of behavior. Consider running with --algorithm genetic_algorithm for higher quality.',
    };
  }
  if (fitness >= 0.40) {
    return {
      level: 'Low',
      emoji: '◕',
      explanation: 'Low fitness suggests noisy log. Try --algorithm heuristic_miner or validate log quality with wpm validate.',
    };
  }
  return {
    level: 'Critical',
    emoji: '✗',
    explanation: 'Fitness <40% indicates major structural mismatch. Run wpm doctor to diagnose.',
  };
}

/**
 * Formats hints for first-time users after discovery.
 * Integrates fitness interpretation with actionable next steps.
 */
export function formatFirstRunHints(
  fitness: number | undefined,
  algorithm: string,
  inputPath: string,
  savedPath: string | null
): string[] {
  const hints: string[] = [];

  hints.push('');
  hints.push('🎯 Process Model Discovered');

  if (fitness !== undefined) {
    const interpretation = interpretFitness(fitness);
    hints.push(`Fitness: ${(fitness * 100).toFixed(1)}% — ${interpretation.level} ${interpretation.emoji}`);
    hints.push(interpretation.explanation);
  }

  hints.push('');
  hints.push('📊 Next Steps:');
  hints.push(`  1. Review model: wpm results --latest`);
  hints.push(`  2. Validate: wpm conformance -i ${path.basename(inputPath)}`);
  hints.push(`  3. Compare algorithms: wpm compare dfg,heuristic -i ${path.basename(inputPath)}`);
  hints.push(`  4. Learn more: wpm algorithms --show-ratings`);

  if (savedPath) {
    hints.push('');
    hints.push(`✓ Result saved to: ${path.relative(process.cwd(), savedPath)}`);
  }

  return hints;
}
