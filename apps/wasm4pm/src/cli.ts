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
import { autoprocess } from './commands/autoprocess.js';
import { swarm } from './commands/swarm.js';
import { agent } from './commands/agent.js';
import { membrane } from './commands/membrane.js';
import { config } from './commands/config.js';
import { verify } from './commands/verify.js';
import { benchmark } from './commands/benchmark.js';
import { cognition } from './commands/cognition.js';
import { completions } from './commands/completions.js';

export const main = defineCommand({
  meta: {
    name: 'wpm',
    version: '26.4.17',
    description: 'High-performance process mining and workflow discovery CLI',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output results as JSON',
    },
    config: {
      type: 'string',
      description: 'Path to config file (wasm4pm.toml, wasm4pm.json, or PMC_CONFIG_PATH)',
    },
  },
  async run() {
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`
${BOLD}wpm${RESET} (wasm4pm) v26.4.17  —  Process Mining CLI  ${DIM}(wasm4pm)${RESET}

${BOLD}DISCOVERY${RESET}
  ${GREEN}wpm run${RESET} <log.xes>                   Discover a process model (default: heuristic miner)
  ${GREEN}wpm run${RESET} <log.xes> --algorithm dfg   Use a specific algorithm
  ${GREEN}wpm compare${RESET} dfg,heuristic -i <log>  Compare algorithms side-by-side with sparklines
  ${GREEN}wpm diff${RESET} <log1.xes> <log2.xes>      Compare two logs — activities, edges, Jaccard distance

${BOLD}PREDICTION${RESET}  ${DIM}(van der Aalst's six perspectives)${RESET}
  ${GREEN}wpm predict${RESET} next-activity  -i <log> --prefix "Submit,Approve"
  ${GREEN}wpm predict${RESET} remaining-time -i <log> --prefix "Submit"
  ${GREEN}wpm predict${RESET} outcome        -i <log>
  ${GREEN}wpm predict${RESET} drift          -i <log>
  ${GREEN}wpm predict${RESET} features       -i <log>
  ${GREEN}wpm predict${RESET} resource       -i <log>

${BOLD}CONFORMANCE & QUALITY${RESET}
  ${GREEN}wpm conformance${RESET} -i <log>              Measure log-to-model fitness and precision
  ${GREEN}wpm quality${RESET} -i <log>                  Assess multi-dimensional quality (fitness, precision, generalization)
  ${GREEN}wpm validate${RESET} <log.xes>                Validate event log schema, required attributes, and data quality

${BOLD}ANALYSIS & SIMULATION${RESET}
  ${GREEN}wpm temporal${RESET} -i <log>                 Analyze temporal profiles and performance patterns
  ${GREEN}wpm social${RESET} -i <log>                   Mine social networks (handover, working together)
  ${GREEN}wpm simulate${RESET} -i <log>                 Monte Carlo simulation and process tree playout

${BOLD}MONITORING${RESET}
  ${GREEN}wpm drift-watch${RESET} --input <log.xes>   Live EWMA concept drift monitor (Ctrl+C to stop)

${BOLD}ML ANALYSIS${RESET}  ${DIM}(classification, clustering, forecasting, anomaly, regression, PCA)${RESET}
  ${GREEN}wpm ml${RESET} classify   -i <log>           Classify traces (knn, logistic_regression)
  ${GREEN}wpm ml${RESET} cluster    -i <log>           Cluster traces (kmeans, dbscan)
  ${GREEN}wpm ml${RESET} forecast   -i <log>           Forecast drift trends
  ${GREEN}wpm ml${RESET} anomaly    -i <log>           Detect anomalies in drift signal
  ${GREEN}wpm ml${RESET} regress    -i <log>           Regress remaining time
  ${GREEN}wpm ml${RESET} pca        -i <log>           PCA dimensionality reduction

${BOLD}POWL${RESET}  ${DIM}(process-oriented workflow language)${RESET}
  ${GREEN}wpm powl${RESET} construct  -i <log>          Construct POWL model from log
  ${GREEN}wpm powl${RESET} replay     -i <log>          Replay log against POWL model

${BOLD}AUTOMEMBRANE${RESET}  ${DIM}(verb8: show · init · build · check · doctor · replay · verify · export)${RESET}
  ${GREEN}wpm membrane show${RESET}                        Show state, health, and installed envelopes
  ${GREEN}wpm membrane init${RESET}                        Scaffold [membrane] config in wasm4pm.toml
  ${GREEN}wpm membrane build${RESET} <log.xes>             Build all envelope layers from an event log
  ${GREEN}wpm membrane check${RESET}                       Fast preflight: profile, config, envelopes
  ${GREEN}wpm membrane doctor${RESET}                      Run 8 definition-of-done gate checks
  ${GREEN}wpm membrane replay${RESET} <motion.json>        Replay a RequestMotion through the classifier
  ${GREEN}wpm membrane verify${RESET}                      Run benchmarks — exit non-zero on failure
  ${GREEN}wpm membrane export${RESET} [--format sarif]     Emit SARIF / JSON / report

${BOLD}BENCHMARK${RESET}  ${DIM}(verb8: build · replay · verify · export)${RESET}
  ${GREEN}wpm benchmark build${RESET}  --corpus <path>     Validate JSONL corpus format
  ${GREEN}wpm benchmark replay${RESET} [--corpus <path>]   Run traces, show per-trace results
  ${GREEN}wpm benchmark verify${RESET} [--corpus <path>]   CI gate — exit non-zero on failure
  ${GREEN}wpm benchmark export${RESET} [--format sarif]    Export SARIF / JSON / CSV

${BOLD}AUTOPROCESS${RESET}  ${DIM}(Perception → Decision → Protection → Optimization)${RESET}
  ${GREEN}wpm autoprocess${RESET} <log.xes>              Run full autonomic control loop
  ${GREEN}wpm autoprocess${RESET} <log.xes> --format json  JSON output

${BOLD}VAN DER AALST AGENTS${RESET}  ${DIM}(8 autonomous adversarial validators)${RESET}
  ${GREEN}wpm agent list${RESET}                       List all registered agents
  ${GREEN}wpm agent execute${RESET} <agent> -i <log>    Execute a specific agent
  ${GREEN}wpm agent execute${RESET} <agent> --dry-run    Detect violations only
  ${GREEN}wpm agent audit${RESET} [--last 10]            View correction audit trail
  ${GREEN}wpm agent status${RESET} <agent>              Check agent health
  ${GREEN}wpm agent register${RESET} <config.json>       Register custom agent

${BOLD}RESULTS & HEALTH${RESET}
  ${GREEN}wpm results${RESET}                         View all saved discovery & prediction results
  ${GREEN}wpm results${RESET} --last                  Print the most recent result
  ${GREEN}wpm doctor${RESET}                          Check environment health + pipeline integrity (24 checks)
  ${GREEN}wpm status${RESET}                          WASM module status and memory usage

${BOLD}SETUP${RESET}
  ${GREEN}wpm init${RESET}                            Scaffold wasm4pm.toml + .env.example in current dir

${DIM}Run ${BOLD}wpm <command> --help${RESET}${DIM} for detailed usage and all flags.${RESET}
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
    autoprocess,
    swarm,
    agent,
    membrane,
    config,
    benchmark,
    verify,
    cognition,
    completions,
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
  autoprocess,
  swarm,
  agent,
  membrane,
  config,
  verify,
};
