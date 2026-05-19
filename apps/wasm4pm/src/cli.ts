import { defineCommand } from 'citty';
import { run } from './commands/run.js';
import { batch } from './commands/batch.js';
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
import { proof } from './commands/proof.js';
import { benchmark } from './commands/benchmark.js';
import { cognition } from './commands/cognition.js';
import { completions } from './commands/completions.js';
import { claude } from './commands/claude.js';
import { adversary } from './commands/adversary.js';
import { trace } from './commands/trace.js';
import { prolog8 } from './commands/prolog8.js';
import { algorithms } from './commands/algorithms.js';
import { examples } from './commands/examples.js';
import { interpret } from './commands/interpret.js';
import { exitCodes } from './commands/exit-codes.js';
import { repl } from './commands/repl.js';
import { prolog8 } from './commands/prolog8.js';
import { feedback } from './commands/feedback.js';
import { wasmServer } from './commands/wasm-server.js';
import { timeout } from './commands/timeout.js';
import cache from './commands/cache.js';
import deduplicate from './commands/deduplicate.js';
import models from './commands/models.js';
import pkg from '../package.json' with { type: 'json' };

export const main = defineCommand({
  meta: {
    name: 'wpm',
    version: pkg.version,
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
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output (also set NO_COLOR env var)',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output for terminal compatibility',
    },
  },
  async run() {
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`
${BOLD}wpm${RESET} (wasm4pm) v${pkg.version}  —  Process Mining CLI  ${DIM}(wasm4pm)${RESET}

${DIM}Configuration precedence: CLI args > wasm4pm.toml > wasm4pm.json > env vars > defaults${RESET}

${BOLD}QUICK START${RESET}
  ${CYAN}wpm run log.xes${RESET}                                     Discover a model from an event log (try this first!)
  ${CYAN}wpm run --help${RESET}                                      Show full documentation for any command
  ${CYAN}wpm doctor${RESET}                                          Diagnose environment, WASM, and config issues

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
  ${GREEN}wpm proof promote${RESET} [--pack <path>]        Seal a proof-work pack into proof-packs/

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
  ${GREEN}wpm cache stats${RESET}                     Show discovery cache hit rate, entry count, memory usage
  ${GREEN}wpm cache clear${RESET} [--algorithm algo]  Clear cache entries (all or by algorithm)
  ${GREEN}wpm models list${RESET}                     List cached process models from warm-start cache
  ${GREEN}wpm models stats${RESET}                    Show model cache statistics and performance metrics
  ${GREEN}wpm models clear${RESET}                    Clear cached models (all or by algorithm)
  ${GREEN}wpm models warm${RESET}                     Show warm-start caching status and recommendations
  ${GREEN}wpm deduplicate scan${RESET} <dir>          Identify duplicate logs by content hash
  ${GREEN}wpm deduplicate report${RESET}              Show deduplication statistics
  ${GREEN}wpm deduplicate clear${RESET}               Clear deduplication data
  ${GREEN}wpm deduplicate load${RESET}                Load persisted deduplication database
  ${GREEN}wpm doctor${RESET}                          Check environment health + pipeline integrity (24 checks)
  ${GREEN}wpm doctor hooks${RESET}                    JTBD verification: test whether each Claude Code hook does its job
  ${GREEN}wpm status${RESET}                          WASM module status and memory usage

${BOLD}WASM SERVER${RESET}  ${DIM}(reduce latency from 2,273ms → <500ms)${RESET}
  ${GREEN}wpm wasm-server start${RESET}               Start the long-lived WASM server (one-time 1,872ms init)
  ${GREEN}wpm wasm-server stop${RESET}                Stop the running WASM server
  ${GREEN}wpm wasm-server status${RESET}              Check server status and statistics
  ${GREEN}wpm wasm-server reset${RESET}               Kill and restart the server

${BOLD}TRACE-TO-POWL v2 PIPELINE${RESET}  ${DIM}(stack traces → object evidence → conformance)${RESET}
  ${GREEN}wpm trace ingest${RESET} --from rust|ts [-i f]  Parse stack trace → TraceGraph JSON-LD
  ${GREEN}wpm trace ocel${RESET}   [-i graph.json]        TraceGraph → OCEL object-centric events
  ${GREEN}wpm trace powl${RESET}   [-i ocel.json]         OCEL → observed POWL route
  ${GREEN}wpm trace conform${RESET} -m model.powl.json    Observed route vs. declared POWL v2 model

${BOLD}CLAUDE CODE INTEGRATION${RESET}  ${DIM}(session evidence, hook verification)${RESET}
  ${GREEN}wpm claude${RESET}                          Claude Code integration status (hooks, session, proof audit)
  ${GREEN}wpm claude session${RESET}                  Show today's tool evidence and work orders
  ${GREEN}wpm claude session verify${RESET}           Verify BLAKE3 hash chain + CHAIN_HEAD anchor integrity
  ${GREEN}wpm claude hooks${RESET}                    JTBD verification of all hook jobs
  ${GREEN}wpm adversary${RESET}                       Adversarial proof lifecycle convergence test (18 probes)

${BOLD}PROLOG8${RESET}  ${DIM}(byte-capped proof engine, BLAKE3 receipt chains)${RESET}
  ${GREEN}wpm prolog8 show${RESET}                     Report engine version and capabilities
  ${GREEN}wpm prolog8 query${RESET} -i <input.json>    Evaluate a query (Allow / Deny / Invalid + proof)
  ${GREEN}wpm prolog8 replay${RESET} -i <input.json>   Verify a receipt (detect tampering)

${BOLD}UTILITY${RESET}
  ${GREEN}wpm batch${RESET} <dir/>                    Process all XES/OCEL files in a directory, write results to --output-dir
  ${GREEN}wpm swarm${RESET} <log.xes>                 Multi-worker swarm: parallel algorithm runs, convergence voting
  ${GREEN}wpm config show${RESET}                     Print the resolved config (all 5 layers merged), provenance included
  ${GREEN}wpm config validate${RESET}                 Validate wasm4pm.toml / wasm4pm.json against Zod schema
  ${GREEN}wpm explain${RESET} <algorithm>             Plain-English explanation + academic reference for any algorithm
  ${GREEN}wpm verify${RESET} <receipt.json>           Re-hash and validate a saved receipt for tamper detection
  ${GREEN}wpm repl${RESET}                            Interactive REPL: run commands without re-loading WASM each time

${BOLD}SETUP${RESET}
  ${GREEN}wpm init${RESET}                            Scaffold wasm4pm.toml + .env.example in current dir

${BOLD}UNDERSTANDING & HELP${RESET}
  ${GREEN}wpm interpret${RESET} <metric> <value>      Understand quality metrics (fitness, precision, etc.)
  ${GREEN}wpm exit-codes${RESET}                       Show exit code reference with examples
  ${GREEN}wpm examples${RESET}                         Browse command examples by category
  ${GREEN}wpm algorithms${RESET}                       List all available algorithms with speed/quality ratings

${BOLD}COMMON FLAGS${RESET}
  ${GREEN}-i, --input${RESET} <file>         Event log file (XES, JSON, OCEL)
  ${GREEN}-v, --verbose${RESET}              Show detailed output (can be repeated: -vv, -vvv)
  ${GREEN}-q, --quiet${RESET}                Suppress non-error output
  ${GREEN}-o, --output${RESET} <path>        Write result to file
  ${GREEN}--format${RESET} {human|json}      Output format (default: human)
  ${GREEN}--no-color${RESET}                 Disable ANSI colors

${DIM}Run ${BOLD}wpm <command> --help${RESET}${DIM} for detailed usage and all flags.${RESET}
${DIM}Algorithms: dfg, alpha, heuristic, inductive, ilp, genetic, pso, astar, hill-climbing, ant-colony, declare${RESET}
${CYAN}
Activity key defaults to "concept:name" (XES standard). Pass --activity-key to override.${RESET}

`);
  },
  subCommands: {
    run,
    batch,
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
    proof,
    cognition,
    completions,
    claude,
    adversary,
    trace,
    prolog8,
    algorithms,
    examples,
    interpret,
    'exit-codes': exitCodes,
    repl,
    prolog8,
    feedback,
    timeout,
    'wasm-server': wasmServer,
    cache,
    deduplicate,
    models,
  },
});

/**
 * Export all commands for testing and programmatic use
 */
export {
  run,
  batch,
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
  claude,
  examples,
  interpret,
  exitCodes,
};
