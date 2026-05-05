/**
 * Example — Predict the next activity for a running case
 *
 * Trains an n-gram model on completed prefixes from an XES log, then asks
 * "given this partial trace, what's most likely to happen next?".
 *
 * Run:
 *   tsx examples/prediction-next-activity.ts ./sample.xes
 *
 * Docs:
 *   docs/prediction.md  (`next-activity`)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveConfig } from '@wasm4pm/config';
import { plan } from '@wasm4pm/planner';
import { Engine } from '@wasm4pm/engine';

interface Prediction {
  activity: string;
  probability: number;
}

interface NextActivityResult {
  predictions: Array<{ caseId: string; predictions: Prediction[] }>;
  modelOrder: number;
}

async function main(logPath: string): Promise<void> {
  const xesPath = resolve(logPath);
  // Validate file exists / is readable.
  readFileSync(xesPath, 'utf8');

  // 1. Resolve config — predictive task = next-activity, n-gram order 3.
  const config = await resolveConfig({
    cli: {
      source: { kind: 'file', path: xesPath },
      sink: { kind: 'stdout' },
      algorithm: { name: 'dfg', parameters: {} },
      execution: { profile: 'balanced' },
      output: { format: 'json', destination: 'stdout', pretty: true, colorize: false },
      prediction: {
        enabled: true,
        activityKey: 'concept:name',
        ngramOrder: 3,
        driftWindowSize: 100,
        tasks: ['next-activity'],
      },
    },
  });

  // 2. Build a plan and execute.
  const planResult = plan(config);
  const engine = new Engine();
  await engine.bootstrap();
  const receipt = await engine.run(planResult);

  // 3. Pull the next-activity output from the receipt.
  const predOut = (receipt.summary as Record<string, unknown>)['prediction'] as
    | { 'next-activity'?: NextActivityResult }
    | undefined;
  const next = predOut?.['next-activity'];
  if (!next) {
    console.error('no next-activity result in receipt — is `prediction.enabled = true`?');
    process.exit(2);
  }

  console.log(`model order: ${next.modelOrder}`);
  console.log(`predictions for ${next.predictions.length} cases\n`);

  for (const c of next.predictions.slice(0, 5)) {
    console.log(`case ${c.caseId}:`);
    for (const p of c.predictions.slice(0, 3)) {
      const pct = (p.probability * 100).toFixed(1);
      const bar = '█'.repeat(Math.max(1, Math.round(p.probability * 30)));
      console.log(`  ${p.activity.padEnd(25)} ${pct.padStart(5)}% ${bar}`);
    }
    console.log();
  }
}

const logPath = process.argv[2] ?? './sample.xes';
main(logPath).catch((err) => {
  console.error('prediction failed:', err);
  process.exit(1);
});
