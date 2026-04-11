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
import { ml } from './commands/ml.js';
import { powl } from './commands/powl.js';
import { conformance } from './commands/conformance.js';
import { simulate } from './commands/simulate.js';
import { temporal } from './commands/temporal.js';
import { social } from './commands/social.js';
import { quality } from './commands/quality.js';
import { validate } from './commands/validate.js';

export const main = defineCommand({
  meta: {
    name: 'pictl',
    version: '26.4.7',
    description: 'High-performance process mining and workflow discovery CLI',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output results as JSON',
    },
    config: {
      type: 'string',
      description: 'Path to config file (pictl.toml, wasm4pm.json, or PMC_CONFIG_PATH)',
    },
  },
  async run() {
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`
${BOLD}pictl${RESET} v26.4.6  —  Process Mining CLI  ${DIM}(wasm4pm)${RESET}

${BOLD}DISCOVERY${RESET}
  ${GREEN}pictl run${RESET} <log.xes>                   Discover a process model (default: heuristic miner)
  ${GREEN}pictl run${RESET} <log.xes> --algorithm dfg   Use a specific algorithm
  ${GREEN}pictl compare${RESET} dfg,heuristic -i <log>  Compare algorithms side-by-side with sparklines
  ${GREEN}pictl diff${RESET} <log1.xes> <log2.xes>      Compare two logs — activities, edges, Jaccard distance

${BOLD}PREDICTION${RESET}  ${DIM}(van der Aalst's six perspectives)${RESET}
  ${GREEN}pictl predict${RESET} next-activity  -i <log> --prefix "Submit,Approve"
  ${GREEN}pictl predict${RESET} remaining-time -i <log> --prefix "Submit"
  ${GREEN}pictl predict${RESET} outcome        -i <log>
  ${GREEN}pictl predict${RESET} drift          -i <log>
  ${GREEN}pictl predict${RESET} features       -i <log>
  ${GREEN}pictl predict${RESET} resource       -i <log>

${BOLD}CONFORMANCE & QUALITY${RESET}
  ${GREEN}pictl conformance${RESET} -i <log>              Measure log-to-model fitness and precision
  ${GREEN}pictl quality${RESET} -i <log>                  Assess multi-dimensional quality (fitness, precision, generalization)
  ${GREEN}pictl validate${RESET} <log.xes>                Validate event log schema, required attributes, and data quality

${BOLD}ANALYSIS & SIMULATION${RESET}
  ${GREEN}pictl temporal${RESET} -i <log>                 Analyze temporal profiles and performance patterns
  ${GREEN}pictl social${RESET} -i <log>                   Mine social networks (handover, working together)
  ${GREEN}pictl simulate${RESET} -i <log>                 Monte Carlo simulation and process tree playout

${BOLD}MONITORING${RESET}
  ${GREEN}pictl drift-watch${RESET} --input <log.xes>   Live EWMA concept drift monitor (Ctrl+C to stop)

${BOLD}ML ANALYSIS${RESET}  ${DIM}(classification, clustering, forecasting, anomaly, regression, PCA)${RESET}
  ${GREEN}pictl ml${RESET} classify   -i <log>           Classify traces (knn, logistic_regression)
  ${GREEN}pictl ml${RESET} cluster    -i <log>           Cluster traces (kmeans, dbscan)
  ${GREEN}pictl ml${RESET} forecast   -i <log>           Forecast drift trends
  ${GREEN}pictl ml${RESET} anomaly    -i <log>           Detect anomalies in drift signal
  ${GREEN}pictl ml${RESET} regress    -i <log>           Regress remaining time
  ${GREEN}pictl ml${RESET} pca        -i <log>           PCA dimensionality reduction

${BOLD}POWL${RESET}  ${DIM}(process-oriented workflow language)${RESET}
  ${GREEN}pictl powl${RESET} construct  -i <log>          Construct POWL model from log
  ${GREEN}pictl powl${RESET} replay     -i <log>          Replay log against POWL model

${BOLD}RESULTS & HEALTH${RESET}
  ${GREEN}pictl results${RESET}                         View all saved discovery & prediction results
  ${GREEN}pictl results${RESET} --last                  Print the most recent result
  ${GREEN}pictl doctor${RESET}                          Check environment health (Node, WASM, config, XES)
  ${GREEN}pictl status${RESET}                          WASM module status and memory usage

${BOLD}SETUP${RESET}
  ${GREEN}pictl init${RESET}                            Scaffold pictl.toml + .env.example in current dir

${DIM}Run ${BOLD}pictl <command> --help${RESET}${DIM} for detailed usage and all flags.${RESET}
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
    ml,
    powl,
    conformance,
    simulate,
    temporal,
    social,
    quality,
    validate,
  },
});

/**
 * Export all commands for testing and programmatic use
 */
export {
  run,
  watch,
  status,
  explain,
  init,
  predict,
  driftWatch,
  doctor,
  diff,
  results,
  compare,
  ml,
  powl,
  conformance,
  simulate,
  temporal,
  social,
  quality,
  validate,
};
