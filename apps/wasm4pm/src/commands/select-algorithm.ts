import { defineCommand } from 'citty';
import * as readline from 'node:readline/promises';
import * as fs from 'node:fs/promises';
import { getSuggestions } from '@wasm4pm/planner';
import { getRegistry } from 'wasm4pm';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { computeParetoFront } from './suggest.js';

export const selectAlgorithm = defineCommand({
  meta: {
    name: 'select-algorithm',
    description: 'Interactive wizard to recommend and execute the best algorithm for your log.',
  },
  args: {
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
    objectives: {
      type: 'string',
      default: 'fitness,speed',
      description: 'Comma-separated objectives for Pareto ranking',
    },
  },
  async run(ctx) {
    await withSpan('select-algorithm', { objectives: ctx.args.objectives }, async () => {
      // Non-TTY: print Pareto results from a default estimation and exit 0
      if (!process.stdout.isTTY) {
        const suggestions = getSuggestions(
          { traceCount: 500, eventCount: 2500, variantCount: 50 },
          'balanced',
          5,
        );
        const { front, dominated } = computeParetoFront(suggestions);
        console.log('PARETO FRONT (non-dominated algorithms for balanced goal):');
        for (const rec of front) {
          console.log(`  ${rec.algorithm} (quality=${rec.quality}, speed=${rec.speed}, score=${(rec.score * 100).toFixed(0)})`);
        }
        if (dominated.length > 0) {
          console.log('DOMINATED:');
          for (const rec of dominated) {
            console.log(`  ${rec.algorithm} (quality=${rec.quality}, speed=${rec.speed})`);
          }
        }
        return await exitWithFlush(EXIT_CODES.success);
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        console.log('\n=== Algorithm Recommendation Wizard ===\n');
        const logPath = await rl.question('Enter path to event log file: ');
        try {
          await fs.access(logPath);
        } catch {
          console.log(`Error: File not found at '${logPath}'`);
          return await exitWithFlush(EXIT_CODES.source_error);
        }

        console.log('\nChoose your primary goal:');
        console.log('  [F] Fast (interactive results, O(n))');
        console.log('  [B] Balanced (typical batch mining, sound process trees)');
        console.log('  [Q] Quality (highest quality, search optimization)');
        const goalInput = (await rl.question('Choose [F/B/Q] (default B): ')).toUpperCase();
        const goal = goalInput === 'F' ? 'fast' : goalInput === 'Q' ? 'quality' : 'balanced';

        // Load basic file stats for estimator
        const stat = await fs.stat(logPath);
        const estEvents = Math.max(1, Math.round(stat.size / 250));
        const estTraces = Math.max(1, Math.round(estEvents / 5));

        const suggestions = getSuggestions(
          { traceCount: estTraces, eventCount: estEvents, variantCount: Math.round(estTraces * 0.1) },
          goal,
          5,
        );

        if (suggestions.length === 0) {
          console.log('No algorithms match the given constraints.');
          return await exitWithFlush(EXIT_CODES.success);
        }

        console.log('\nTop recommendations:');
        suggestions.forEach((s, idx) => {
          console.log(`  ${idx + 1}. ${s.algorithm} (confidence: ${(s.score * 100).toFixed(0)}%) - ${s.reason}`);
        });

        // Show Pareto front table
        const { front, dominated } = computeParetoFront(suggestions);
        if (front.length > 0) {
          console.log('\nPARETO FRONT (non-dominated):');
          console.log('  Algorithm                     Quality  Speed  Score');
          console.log('  ' + '-'.repeat(52));
          for (const rec of front) {
            const name = rec.algorithm.padEnd(30);
            const q = String(rec.quality).padStart(7);
            const s = String(rec.speed).padStart(6);
            const sc = (rec.score * 100).toFixed(0).padStart(6);
            console.log(`  ${name}${q}  ${s}  ${sc}`);
          }
          if (dominated.length > 0) {
            console.log(`  (${dominated.length} dominated algorithm(s): ${dominated.map((d) => d.algorithm).join(', ')})`);
          }
        }

        const topAlgo = front[0]?.algorithm ?? suggestions[0]!.algorithm;
        const execute = await rl.question(`\nWould you like to run wpm discovery with '${topAlgo}' now? (y/n): `);
        if (execute.toLowerCase() === 'y') {
          const { spawn } = await import('child_process');
          const child = spawn('node', ['apps/wasm4pm/dist/bin/wpm.js', 'run', logPath, '--algorithm', topAlgo], {
            stdio: 'inherit'
          });
          child.on('close', (code) => {
            process.exit(code ?? 0);
          });
        }
      } finally {
        rl.close();
      }
    });
  }
});
