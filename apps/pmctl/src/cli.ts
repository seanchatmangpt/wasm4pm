import { defineCommand, runMain } from 'citty';
import { run } from './commands/run.js';
import { watch } from './commands/watch.js';
import { status } from './commands/status.js';
import { explain } from './commands/explain.js';
import { init } from './commands/init.js';
import { predict } from './commands/predict.js';
import { driftWatch } from './commands/drift-watch.js';
import { doctor } from './commands/doctor.js';
import { diff } from './commands/diff.js';
import { results } from './commands/results.js';
import { compare } from './commands/compare.js';

export const main = defineCommand({
  meta: {
    name: 'pmctl',
    version: '26.4.5',
    description: 'High-performance process mining and workflow discovery CLI',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output results as JSON',
    },
    config: {
      type: 'string',
      description: 'Path to config file (pmctl.toml, pmctl.json, or PMC_CONFIG_PATH)',
    },
  },
  subCommands: {
    run,
    watch,
    status,
    explain,
    init,
    predict,
    'drift-watch': driftWatch,
    doctor,
    diff,
    results,
    compare,
  },
});

/**
 * Export all commands for testing and programmatic use
 */
export { run, watch, status, explain, init, predict, driftWatch, doctor, diff, results, compare };
