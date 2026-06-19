/**
 * AutoPM end-to-end example.
 *
 * Runs the deterministic evolutionary AutoPM engine over a sepsis.xes-like log
 * profile, prints the Pareto front (genome summary + quality/cost + receipt
 * hash), and writes the WINNING wasm4pm.toml to ./out/wasm4pm.toml.
 *
 * Run:  npm run start            (from examples/autopm)
 *   or: pnpm --filter wasm4pm-examples run:autopm   (from repo root)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as toml from 'toml';
import { configSchema } from '@wasm4pm/config';
import { runAutoPM, winnerToToml, type LogCharacteristics } from '@wasm4pm/autopm';

const __dirname = dirname(fileURLToPath(import.meta.url));

// sepsis.xes-like characteristics (~1050 traces, ~15000 events, ~16 activities).
const SEPSIS: LogCharacteristics = {
  traceCount: 1050,
  eventCount: 15000,
  activityCount: 16,
  avgTraceLength: 14,
  maxTraceLength: 185,
};

function genomeSummary(stages: { kind: string; algorithm?: string; breed?: string }[]): string {
  return stages
    .map((s) => {
      if (s.kind === 'discover') return `discover:${s.algorithm ?? '?'}`;
      if (s.kind === 'reason') return `reason:${s.breed ?? '?'}`;
      return s.kind;
    })
    .join(' -> ');
}

function main(): void {
  const seed = 7;
  console.log(`AutoPM — log: ${SEPSIS.traceCount} traces, ${SEPSIS.eventCount} events, ${SEPSIS.activityCount} activities (seed=${seed})\n`);

  const result = runAutoPM(SEPSIS, { seed, generations: 12, populationSize: 16 });

  console.log(`Pareto front (${result.paretoFront.length} candidates, ${result.evaluated} evaluated over ${result.generations} generations):`);
  for (const c of result.paretoFront) {
    const q = c.objectives.quality.toFixed(4);
    const cost = c.objectives.cost.toFixed(2);
    const hash = (c.receiptHash ?? '').slice(0, 16);
    console.log(`  q=${q}  cost=${cost}ms  ${hash}…  ${genomeSummary(c.genome.stages)}`);
  }

  console.log(`\nWinner: ${genomeSummary(result.winner.genome.stages)}`);
  console.log(`  quality=${result.winner.objectives.quality.toFixed(4)}  cost=${result.winner.objectives.cost.toFixed(2)}ms  receipt=${result.winner.receiptHash}`);

  const tomlText = winnerToToml(result, SEPSIS);

  // Self-check: emitted TOML must validate against the real @wasm4pm/config schema.
  const parsed = toml.parse(tomlText) as Record<string, unknown>;
  configSchema.parse(parsed);
  const algoName = (parsed.algorithm as { name: string }).name;

  const outPath = join(__dirname, 'out', 'wasm4pm.toml');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, tomlText, 'utf8');

  console.log(`\nEmitted + validated wasm4pm.toml ([algorithm].name = "${algoName}") -> ${outPath}\n`);
  console.log(tomlText);
}

main();
