import { defineCommand } from 'citty';
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
// import { agent } from './commands/agent.js'; // Pre-existing type errors in agent commands
export const main = defineCommand({
    meta: {
        name: 'wasm4pm',
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
${BOLD}wasm4pm${RESET} v26.4.17  —  Process Mining CLI  ${DIM}(wasm4pm)${RESET}

${BOLD}DISCOVERY${RESET}
  ${GREEN}wasm4pm run${RESET} <log.xes>                   Discover a process model (default: heuristic miner)
  ${GREEN}wasm4pm run${RESET} <log.xes> --algorithm dfg   Use a specific algorithm
  ${GREEN}wasm4pm compare${RESET} dfg,heuristic -i <log>  Compare algorithms side-by-side with sparklines
  ${GREEN}wasm4pm diff${RESET} <log1.xes> <log2.xes>      Compare two logs — activities, edges, Jaccard distance

${BOLD}PREDICTION${RESET}  ${DIM}(van der Aalst's six perspectives)${RESET}
  ${GREEN}wasm4pm predict${RESET} next-activity  -i <log> --prefix "Submit,Approve"
  ${GREEN}wasm4pm predict${RESET} remaining-time -i <log> --prefix "Submit"
  ${GREEN}wasm4pm predict${RESET} outcome        -i <log>
  ${GREEN}wasm4pm predict${RESET} drift          -i <log>
  ${GREEN}wasm4pm predict${RESET} features       -i <log>
  ${GREEN}wasm4pm predict${RESET} resource       -i <log>

${BOLD}CONFORMANCE & QUALITY${RESET}
  ${GREEN}wasm4pm conformance${RESET} -i <log>              Measure log-to-model fitness and precision
  ${GREEN}wasm4pm quality${RESET} -i <log>                  Assess multi-dimensional quality (fitness, precision, generalization)
  ${GREEN}wasm4pm validate${RESET} <log.xes>                Validate event log schema, required attributes, and data quality

${BOLD}ANALYSIS & SIMULATION${RESET}
  ${GREEN}wasm4pm temporal${RESET} -i <log>                 Analyze temporal profiles and performance patterns
  ${GREEN}wasm4pm social${RESET} -i <log>                   Mine social networks (handover, working together)
  ${GREEN}wasm4pm simulate${RESET} -i <log>                 Monte Carlo simulation and process tree playout

${BOLD}MONITORING${RESET}
  ${GREEN}wasm4pm drift-watch${RESET} --input <log.xes>   Live EWMA concept drift monitor (Ctrl+C to stop)

${BOLD}ML ANALYSIS${RESET}  ${DIM}(classification, clustering, forecasting, anomaly, regression, PCA)${RESET}
  ${GREEN}wasm4pm ml${RESET} classify   -i <log>           Classify traces (knn, logistic_regression)
  ${GREEN}wasm4pm ml${RESET} cluster    -i <log>           Cluster traces (kmeans, dbscan)
  ${GREEN}wasm4pm ml${RESET} forecast   -i <log>           Forecast drift trends
  ${GREEN}wasm4pm ml${RESET} anomaly    -i <log>           Detect anomalies in drift signal
  ${GREEN}wasm4pm ml${RESET} regress    -i <log>           Regress remaining time
  ${GREEN}wasm4pm ml${RESET} pca        -i <log>           PCA dimensionality reduction

${BOLD}POWL${RESET}  ${DIM}(process-oriented workflow language)${RESET}
  ${GREEN}wasm4pm powl${RESET} construct  -i <log>          Construct POWL model from log
  ${GREEN}wasm4pm powl${RESET} replay     -i <log>          Replay log against POWL model

${BOLD}AUTOPROCESS${RESET}  ${DIM}(Perception → Decision → Protection → Optimization)${RESET}
  ${GREEN}wasm4pm autoprocess${RESET} <log.xes>              Run full autonomic control loop
  ${GREEN}wasm4pm autoprocess${RESET} <log.xes> --format json  JSON output

${BOLD}VAN DER AALST AGENTS${RESET}  ${DIM}(8 autonomous adversarial validators)${RESET}
  ${GREEN}wasm4pm agent list${RESET}                       List all registered agents
  ${GREEN}wasm4pm agent execute${RESET} <agent> -i <log>    Execute a specific agent
  ${GREEN}wasm4pm agent execute${RESET} <agent> --dry-run    Detect violations only
  ${GREEN}wasm4pm agent audit${RESET} [--last 10]            View correction audit trail
  ${GREEN}wasm4pm agent status${RESET} <agent>              Check agent health
  ${GREEN}wasm4pm agent register${RESET} <config.json>       Register custom agent

${BOLD}RESULTS & HEALTH${RESET}
  ${GREEN}wasm4pm results${RESET}                         View all saved discovery & prediction results
  ${GREEN}wasm4pm results${RESET} --last                  Print the most recent result
  ${GREEN}wasm4pm doctor${RESET}                          Check environment health + pipeline integrity (24 checks)
  ${GREEN}wasm4pm status${RESET}                          WASM module status and memory usage

${BOLD}SETUP${RESET}
  ${GREEN}wasm4pm init${RESET}                            Scaffold wasm4pm.toml + .env.example in current dir

${DIM}Run ${BOLD}wasm4pm <command> --help${RESET}${DIM} for detailed usage and all flags.${RESET}
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
        // agent, // Pre-existing type errors in agent commands
    },
});
/**
 * Export all commands for testing and programmatic use
 */
export { run, watch, status, explain, init, predict, driftWatch, doctor, diff, results, compare, ml, powl, conformance, simulate, temporal, social, quality, validate, autoprocess,
// agent, // Pre-existing type errors in agent commands
 };
//# sourceMappingURL=cli.js.map