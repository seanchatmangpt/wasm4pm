import { defineCommand } from 'citty';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

interface MetricInfo {
  name: string;
  range: string;
  interpretation(value: number): string;
}

const METRICS: Record<string, MetricInfo> = {
  fitness: {
    name: 'Fitness',
    range: '0 (poor) to 1 (perfect)',
    interpretation: (v: number) => {
      if (v >= 0.85) return '✓ HIGH (≥0.85): Model explains most observed behavior.\n      → Suitable for process improvement, mining insights.';
      if (v >= 0.60) return '◐ MEDIUM (0.60–0.85): Model covers 60–85% of behavior.\n      → Acceptable, but consider trying a higher-quality algorithm (--algorithm genetic_algorithm).';
      if (v >= 0.40) return '◕ LOW (0.40–0.60): Model misses significant behavior.\n      → May indicate noisy log. Try --algorithm heuristic_miner or validate log with wpm validate.';
      return '✗ CRITICAL (<0.40): Major structural mismatch between model and log.\n      → Log quality issue or algorithm mismatch. Run wpm doctor to diagnose.';
    },
  },
  precision: {
    name: 'Precision',
    range: '0 (model too general) to 1 (model matches log exactly)',
    interpretation: (v: number) => {
      if (v >= 0.85) return '✓ HIGH (≥0.85): Model stays close to observed behavior.\n      → Model is not overfitting; good generalization expected.';
      if (v >= 0.60) return '◐ MEDIUM (0.60–0.85): Model allows some extra behavior beyond log.\n      → Reasonable balance. Consider this in combination with fitness.';
      if (v >= 0.40) return '◕ LOW (0.40–0.60): Model is too permissive.\n      → Suggests the log doesn\'t fully constrain the process. Try --algorithm ilp for tighter fit.';
      return '✗ CRITICAL (<0.40): Model allows vast behavior not in the log.\n      → Indicates overgeneralization or algorithm mismatch. Run wpm doctor.';
    },
  },
  generalization: {
    name: 'Generalization',
    range: '0 (overfitting) to 1 (perfect balance)',
    interpretation: (v: number) => {
      if (v >= 0.75) return '✓ HIGH (≥0.75): Model balances precision and simplicity well.\n      → Good potential to generalize to unseen process behavior.';
      if (v >= 0.50) return '◐ MEDIUM (0.50–0.75): Reasonable generalization.\n      → May slightly overfit or underfit. Acceptable for exploration.';
      if (v >= 0.30) return '◕ LOW (0.30–0.50): Model may not generalize well.\n      → Either too specific to this log or too simple to capture behavior.';
      return '✗ CRITICAL (<0.30): Poor generalization.\n      → Model is either heavily overfitting or underfitting. Review with wpm doctor.';
    },
  },
  simplicity: {
    name: 'Simplicity',
    range: '0 (complex) to 1 (simple)',
    interpretation: (v: number) => {
      if (v >= 0.75) return '✓ HIGH (≥0.75): Model is simple and easy to understand.\n      → Fewer places/transitions. Good for explanation and manual review.';
      if (v >= 0.50) return '◐ MEDIUM (0.50–0.75): Model is moderately complex.\n      → Acceptable complexity. Can still be understood and explained.';
      if (v >= 0.30) return '◕ LOW (0.30–0.50): Model is complex.\n      → Many places, transitions, or silent activities. Harder to explain.';
      return '✗ CRITICAL (<0.30): Very complex model.\n      → Too many elements. Try --algorithm dfg for simpler representation, or filter the log.';
    },
  },
};

export const interpret = defineCommand({
  meta: {
    name: 'interpret',
    description:
      `Interpret a quality metric value to understand what it means. ` +
      `Example: wpm interpret fitness 0.73 or wpm interpret precision 0.64

${STANDARD_EXIT_CODE_DOCS}`,
  },
  args: {
    metric: {
      type: 'positional',
      description: 'Metric name: fitness, precision, generalization, or simplicity',
      required: false,
    },
    value: {
      type: 'positional',
      description: 'Metric value as a decimal number (0.0 to 1.0)',
      required: false,
    },
  },
  async run(ctx) {
    const BOLD = '\x1b[1m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';
    const CYAN = '\x1b[36m';

    const { metric, value } = ctx.args;

    // Show help if no arguments
    if (!metric) {
      process.stdout.write(`
${BOLD}wpm interpret${RESET} — Understand quality metrics

${BOLD}Usage:${RESET}
  wpm interpret <metric> <value>

${BOLD}Supported Metrics:${RESET}
  fitness        How well the model explains observed behavior (0–1)
  precision      How tightly the model fits the log (0–1)
  generalization Balance between precision and simplicity (0–1)
  simplicity     How simple/understandable the model is (0–1)

${BOLD}Examples:${RESET}
  wpm interpret fitness 0.73         Understand what 73% fitness means
  wpm interpret precision 0.85       Check if 85% precision is good
  wpm interpret generalization 0.60  See generalization interpretation

${BOLD}Source Data:${RESET}
  These values come from:
  ${DIM}• wpm run <log.xes> --with-quality${RESET}
  ${DIM}• wpm quality -i <log.xes>${RESET}
  ${DIM}• wpm conformance -i <log.xes>${RESET}

${DIM}See: wpm run --help for more discovery options${RESET}

`);
      return;
    }

    // Validate metric name
    const metricKey = metric.toLowerCase();
    if (!METRICS[metricKey]) {
      process.stdout.write(
        `${DIM}Unknown metric: "${metric}"${RESET}\n` +
          `${DIM}Valid metrics: ${Object.keys(METRICS).join(', ')}${RESET}\n\n`
      );
      process.exit(1);
    }

    // Parse value
    if (!value) {
      process.stdout.write(`${DIM}Error: Please provide a value (0.0 to 1.0)${RESET}\n`);
      process.exit(1);
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 1) {
      process.stdout.write(
        `${DIM}Error: Value must be a number between 0 and 1, got "${value}"${RESET}\n`
      );
      process.exit(1);
    }

    const info = METRICS[metricKey];
    const interpretation = info.interpretation(numValue);

    process.stdout.write(`
${BOLD}${info.name}${RESET}
${DIM}Range: ${info.range}${RESET}

${CYAN}Your value: ${(numValue * 100).toFixed(1)}%${RESET}

${interpretation}

${BOLD}Next Steps:${RESET}
${DIM}• Compare algorithms: wpm compare dfg,heuristic,genetic -i <log.xes>${RESET}
${DIM}• Full quality report: wpm quality -i <log.xes>${RESET}
${DIM}• Model validation: wpm conformance -i <log.xes>${RESET}
${DIM}• Check fitness benchmark: wpm results --last${RESET}

`);
  },
});
