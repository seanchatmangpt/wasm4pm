import { defineCommand } from 'citty';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

export const workflow = defineCommand({
  meta: {
    name: 'workflow',
    description: 'Show guidance and documentation for process mining workflows (pipelines)',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    if (format === 'human') {
      process.stdout.write(`
${BOLD}wpm Workflows & Pipelines Reference${RESET}

${DIM}Workflows chain individual process mining operations into automated pipelines.${RESET}
${DIM}Configure custom workflows in wasm4pm.toml or execute presets directly.${RESET}

${BOLD}Built-in Pipeline Presets:${RESET}
  ${GREEN}quick${RESET}       — Fast 2-step pipeline: validate log → discover DFG model.
                ${DIM}Run: wpm pipeline run quick -i log.xes${RESET}
  ${GREEN}full${RESET}        — 6-step complete analysis: validate → discover → quality → temporal → social → predict.
                ${DIM}Run: wpm pipeline run full -i log.xes${RESET}
  ${GREEN}compliance${RESET}  — 4-step conformance: validate → conformance checking → quality check → prolog8.
                ${DIM}Run: wpm pipeline run compliance -i log.xes${RESET}
  ${GREEN}discovery${RESET}   — 3-step discovery: validate → compare top algorithms → quality assessment.
                ${DIM}Run: wpm pipeline run discovery -i log.xes${RESET}

${BOLD}Running Custom Pipelines:${RESET}
  You can execute a pipeline defined in a JSON file:
  ${CYAN}wpm pipeline run <pipeline.json> -i log.xes${RESET}

${BOLD}Creating Custom Pipelines:${RESET}
  Generate a new pipeline scaffolding:
  ${CYAN}wpm pipeline create --name my-workflow --steps validate,run,quality${RESET}

${BOLD}Standard Workflow Execution Flow (JTBD):${RESET}
  ${BOLD}1. Validate Log${RESET}        Ensure schema and data quality:
                           ${CYAN}wpm validate log.xes${RESET}
  ${BOLD}2. Discover Model${RESET}     Mine process models (e.g. Heuristic Miner):
                           ${CYAN}wpm run log.xes --algorithm heuristic_miner${RESET}
  ${BOLD}3. Assess Quality${RESET}     Measure fitness, precision, and simplicity:
                           ${CYAN}wpm conformance -i log.xes --model-from heuristic_miner${RESET}
  ${BOLD}4. Run Predictions${RESET}    Forecast next activities or remaining time:
                           ${CYAN}wpm predict next-activity -i log.xes${RESET}

${DIM}See: wpm pipeline --help for subcommand documentation.${RESET}
\n`);
    }

    const result = makeResult(
      'workflow',
      {
        status: 'success',
        presets: ['quick', 'full', 'compliance', 'discovery'],
      },
      0,
      EXIT_CODES.success
    );
    emitResult(result, { format, quiet: true });
    return await exitWithFlush(EXIT_CODES.success);
  },
});
