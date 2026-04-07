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
  async run() {
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`
${BOLD}pmctl${RESET} v26.4.6  —  Process Mining CLI  ${DIM}(wasm4pm)${RESET}

${BOLD}DISCOVERY${RESET}
  ${GREEN}pmctl run${RESET} <log.xes>                   Discover a process model (default: heuristic miner)
  ${GREEN}pmctl run${RESET} <log.xes> --algorithm dfg   Use a specific algorithm
  ${GREEN}pmctl compare${RESET} dfg,heuristic -i <log>  Compare algorithms side-by-side with sparklines
  ${GREEN}pmctl diff${RESET} <log1.xes> <log2.xes>      Compare two logs — activities, edges, Jaccard distance

${BOLD}PREDICTION${RESET}  ${DIM}(van der Aalst's six perspectives)${RESET}
  ${GREEN}pmctl predict${RESET} next-activity  -i <log> --prefix "Submit,Approve"
  ${GREEN}pmctl predict${RESET} remaining-time -i <log> --prefix "Submit"
  ${GREEN}pmctl predict${RESET} outcome        -i <log>
  ${GREEN}pmctl predict${RESET} drift          -i <log>
  ${GREEN}pmctl predict${RESET} features       -i <log>
  ${GREEN}pmctl predict${RESET} resource       -i <log>

${BOLD}MONITORING${RESET}
  ${GREEN}pmctl drift-watch${RESET} --input <log.xes>   Live EWMA concept drift monitor (Ctrl+C to stop)

${BOLD}RESULTS & HEALTH${RESET}
  ${GREEN}pmctl results${RESET}                         View all saved discovery & prediction results
  ${GREEN}pmctl results${RESET} --last                  Print the most recent result
  ${GREEN}pmctl doctor${RESET}                          Check environment health (Node, WASM, config, XES)
  ${GREEN}pmctl status${RESET}                          WASM module status and memory usage

${BOLD}SETUP${RESET}
  ${GREEN}pmctl init${RESET}                            Scaffold wasm4pm.toml + .env.example in current dir

${DIM}Run ${BOLD}pmctl <command> --help${RESET}${DIM} for detailed usage and all flags.${RESET}
${DIM}Algorithms: dfg, alpha, heuristic, inductive, ilp, genetic, pso, astar, hill-climbing, ant-colony, declare${RESET}
${CYAN}
Activity key defaults to "concept:name" (XES standard). Pass --activity-key to override.${RESET}

`);
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
