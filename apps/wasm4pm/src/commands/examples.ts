import { defineCommand } from 'citty';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

const EXAMPLES_BY_CATEGORY = {
  'Core Discovery': [
    { cmd: 'wpm run process.xes', desc: 'Discover process model (default: heuristic miner)' },
    {
      cmd: 'wpm run log.xes --algorithm dfg',
      desc: 'Use fast DFG discovery',
    },
    {
      cmd: 'wpm run log.xes --algorithm genetic --with-quality',
      desc: 'High-quality discovery with fitness/precision metrics',
    },
    { cmd: 'wpm run log.ocel.json', desc: 'Discover from object-centric event log (OCEL)' },
  ],
  'Algorithm Comparison': [
    { cmd: 'wpm compare dfg,heuristic,genetic -i process.xes', desc: 'Side-by-side algorithm comparison' },
    { cmd: 'wpm compare dfg,alpha,ilp -i log.xes --verbose', desc: 'Comparison with detailed metrics' },
  ],
  'Predictive Mining': [
    {
      cmd: 'wpm predict next-activity -i log.xes --prefix "Submit,Approve"',
      desc: 'Predict next activity after sequence',
    },
    {
      cmd: 'wpm predict remaining-time -i log.xes --prefix "Submit"',
      desc: 'Estimate remaining case duration',
    },
    { cmd: 'wpm predict drift -i log.xes', desc: 'Detect concept drift' },
    { cmd: 'wpm drift-watch -i log.xes', desc: 'Real-time drift monitoring (live EWMA)' },
  ],
  'Conformance & Validation': [
    { cmd: 'wpm conformance -i process.xes', desc: 'Measure model fitness and precision' },
    { cmd: 'wpm validate process.xes', desc: 'Check event log schema and data quality' },
    {
      cmd: 'wpm diff log1.xes log2.xes',
      desc: 'Compare two logs (Jaccard similarity)',
    },
  ],
  'ML Analysis': [
    { cmd: 'wpm ml cluster -i log.xes --k 5', desc: 'Cluster similar traces (k-means)' },
    { cmd: 'wpm ml classify -i log.xes', desc: 'Classify traces (logistic regression)' },
    { cmd: 'wpm ml forecast -i log.xes --periods 10', desc: 'Forecast throughput trends' },
    { cmd: 'wpm ml anomaly -i log.xes', desc: 'Detect anomalous cases' },
  ],
  'Multi-Perspective Analysis': [
    { cmd: 'wpm temporal -i process.xes', desc: 'Analyze temporal patterns & bottlenecks' },
    { cmd: 'wpm social -i process.xes', desc: 'Mine social networks (handover, working-together)' },
    { cmd: 'wpm simulate -i log.xes --iterations 100', desc: 'Monte Carlo simulation' },
  ],
  'System & Quality': [
    { cmd: 'wpm doctor', desc: 'Environment health check (24 checks)' },
    {
      cmd: 'wpm run log.xes --with-quality',
      desc: 'Add van der Aalst quality metrics',
    },
    { cmd: 'wpm status', desc: 'WASM module status & memory' },
    { cmd: 'wpm algorithms', desc: 'List all 36+ available algorithms' },
    { cmd: 'wpm results', desc: 'Browse saved discovery & prediction results' },
  ],
  'Configuration & Setup': [
    { cmd: 'wpm init', desc: 'Scaffold wasm4pm.toml config file' },
    { cmd: 'wpm watch', desc: 'Auto-discover on config file changes' },
    {
      cmd: 'wpm run log.xes --format json -o result.json',
      desc: 'Save result to JSON file',
    },
  ],
};

export const examples = defineCommand({
  meta: {
    name: 'examples',
    description: 'Browse example commands organized by task. See docs/TUTORIALS.md for full learning path. Example: wpm examples',
  },
  async run() {
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`\n${BOLD}wpm Usage Examples${RESET}\n`);
    process.stdout.write(`${DIM}Organized by task. Use 'wpm <command> --help' for full documentation.${RESET}\n\n`);

    for (const [category, examples] of Object.entries(EXAMPLES_BY_CATEGORY)) {
      process.stdout.write(`${BOLD}${category}${RESET}\n`);
      for (const { cmd, desc } of examples) {
        process.stdout.write(`  ${GREEN}${cmd}${RESET}\n`);
        process.stdout.write(`    ${DIM}${desc}${RESET}\n`);
      }
      process.stdout.write('\n');
    }

    process.stdout.write(`${BOLD}Learning Resources${RESET}\n`);
    process.stdout.write(`  ${CYAN}docs/TUTORIALS.md${RESET}  —  8 step-by-step tutorials (5–10 min each)\n`);
    process.stdout.write(`  ${CYAN}wpm <command> --help${RESET}  —  Detailed command documentation\n`);
    process.stdout.write(`  ${CYAN}wpm doctor${RESET}  —  Verify your environment is set up correctly\n\n`);

    process.stdout.write(
      `${DIM}For process mining theory, see: https://www.xes-standard.org/ and https://www.ocel-standard.org/${RESET}\n\n`
    );

    const result = makeResult('examples', { status: 'success' }, 0, EXIT_CODES.success);
    emitResult(result, { format: 'human', verbose: false, quiet: true });
    return await exitWithFlush(EXIT_CODES.success);
  },
});
