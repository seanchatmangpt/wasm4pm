import { defineCommand, runMain } from 'citty';
import { run } from './commands/run.js';
import { watch } from './commands/watch.js';
import { status } from './commands/status.js';
import { explain } from './commands/explain.js';
import { init } from './commands/init.js';

export const main = defineCommand({
  meta: {
    name: 'pmctl',
    version: '26.4.5',
    description: 'High-performance process mining and workflow discovery CLI',
  },
  subCommands: {
    run,
    watch,
    status,
    explain,
    init,
  },
  async run(ctx) {
    // Show help by default when no command is provided
    if (!ctx.args._[0]) {
      // Display main help text
      const help = `
pmctl v26.4.5
High-performance process mining and workflow discovery CLI

USAGE:
  pmctl [COMMAND] [OPTIONS]

COMMANDS:
  run       Run process discovery on input event log
  watch     Watch for changes and re-run discovery automatically
  status    Show status of discovery operations and system health
  explain   Explain a discovered model or algorithm
  init      Initialize a new pmctl project with configuration

OPTIONS:
  -h, --help     Show this help message
  -v, --version  Show version number

EXAMPLES:
  pmctl run --config pmctl.json --input log.xes
  pmctl watch --config pmctl.json --interval 1000
  pmctl status --format json
  pmctl explain --algorithm genetic
  pmctl init --template basic --output ./my-project

For more information on a specific command, run:
  pmctl [COMMAND] --help
`;
      console.log(help);
    }
  },
});

/**
 * Export all commands for testing and programmatic use
 */
export { run, watch, status, explain, init };
