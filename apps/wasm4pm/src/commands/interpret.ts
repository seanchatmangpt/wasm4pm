import { defineCommand } from 'citty';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

// ─── Metric Level Types ───────────────────────────────────────────────────────

export type MetricLevel = 'good' | 'ok' | 'low' | 'poor';

export interface MetricInterpretation {
  metric: string;
  value: number;
  level: MetricLevel;
  level_label: string;
  percentage: string;
  what_it_means: string;
  context_by_range: RangeEntry[];
  causes: CauseEntry[];
  actions: ActionEntry[];
  academic_context: string;
}

export interface RangeEntry {
  range: string;
  label: string;
  description: string;
  current?: boolean;
}

export interface CauseEntry {
  rank: number;
  cause: string;
}

export interface ActionEntry {
  command: string;
  description: string;
}

export interface CompareInterpretation {
  metric: string;
  value1: number;
  value2: number;
  difference: number;
  difference_pct: string;
  level1: MetricLevel;
  level2: MetricLevel;
  label1: string;
  label2: string;
  interpretation: string;
  significance: string;
  significant: boolean;
  threshold_crossed: boolean;
}

export interface ReportInterpretation {
  input: string;
  algorithm: string;
  dimensions: MetricInterpretation[];
  overall_verdict: string;
  overall_score: number;
  dimensions_above_threshold: number;
  total_dimensions: number;
  key_insight: string;
  root_causes: RootCauseEntry[];
}

export interface RootCauseEntry {
  dimension: string;
  level: MetricLevel;
  cause: string;
  fix: string;
}

// ─── Level Thresholds ────────────────────────────────────────────────────────

const THRESHOLDS: Record<string, { good: number; ok: number; low: number }> = {
  fitness:        { good: 0.85, ok: 0.60, low: 0.40 },
  precision:      { good: 0.85, ok: 0.60, low: 0.40 },
  generalization: { good: 0.75, ok: 0.50, low: 0.30 },
  simplicity:     { good: 0.75, ok: 0.50, low: 0.30 },
  silhouette:     { good: 0.70, ok: 0.40, low: 0.20 },
  drift_score:    { good: 0.20, ok: 0.40, low: 0.60 }, // inverted: lower is better
  anomaly_rate:   { good: 0.05, ok: 0.15, low: 0.30 }, // inverted: lower is better
};

/** Metrics where lower is better */
const INVERTED_METRICS = new Set(['drift_score', 'anomaly_rate']);

function getLevel(metric: string, value: number): MetricLevel {
  const t = THRESHOLDS[metric] ?? { good: 0.85, ok: 0.60, low: 0.40 };
  if (INVERTED_METRICS.has(metric)) {
    if (value <= t.good) return 'good';
    if (value <= t.ok)  return 'ok';
    if (value <= t.low) return 'low';
    return 'poor';
  }
  if (value >= t.good) return 'good';
  if (value >= t.ok)  return 'ok';
  if (value >= t.low) return 'low';
  return 'poor';
}

function levelLabel(level: MetricLevel): string {
  return level.toUpperCase();
}

function levelIcon(level: MetricLevel): string {
  return { good: '✔', ok: '◐', low: '◕', poor: '✗' }[level];
}

// ─── Metric Specifications ────────────────────────────────────────────────────

interface MetricSpec {
  label: string;
  description: string;
  ranges: (value: number) => RangeEntry[];
  causes: (value: number, level: MetricLevel) => CauseEntry[];
  actions: (value: number, level: MetricLevel) => ActionEntry[];
  academic_context: string;
}

const METRIC_SPECS: Record<string, MetricSpec> = {
  fitness: {
    label: 'Fitness',
    description:
      'How much of the observed trace behavior is explained by your process model. ' +
      'A fitness of 0.73 means 73% of trace events can be replayed on the model without errors.',
    ranges: (v) => [
      { range: '≥ 0.85',       label: 'GOOD', description: 'Model reliably represents the process — suitable for improvement', current: v >= 0.85 },
      { range: '0.60 – 0.85',  label: 'OK',   description: 'Acceptable — model explains most behavior, some deviation expected', current: v >= 0.60 && v < 0.85 },
      { range: '0.40 – 0.60',  label: 'LOW',  description: 'Significant portions of the process are unexplained', current: v >= 0.40 && v < 0.60 },
      { range: '< 0.40',       label: 'POOR', description: 'Major structural mismatch — model and log describe different processes', current: v < 0.40 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Model reliably explains observed behavior — no significant fitness issues' }];
      if (level === 'ok' || level === 'low') return [
        { rank: 1, cause: 'Simple discovery algorithm (DFG/alpha) under-captures behavior — try inductive_miner for ~+0.10' },
        { rank: 2, cause: 'Log contains noise/exceptions (test cases, system events, retries)' },
        { rank: 3, cause: 'Process has changed since the model was discovered (concept drift)' },
      ];
      return [
        { rank: 1, cause: 'Critical algorithm mismatch — the discovery algorithm cannot represent this process' },
        { rank: 2, cause: 'Log has severe quality issues (wrong concept:name mapping, missing timestamps)' },
        { rank: 3, cause: 'Multiple sub-processes mixed in one log (patient journey + lab process combined)' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [
        { command: 'wpm quality -i log.xes', description: 'Full quality report (4 dimensions)' },
        { command: 'wpm drift-watch -i log.xes', description: 'Monitor for future drift' },
      ];
      return [
        { command: 'wpm run log.xes --algorithm inductive_miner', description: 'Higher-quality algorithm (~+0.10 typical)' },
        { command: 'wpm validate -i log.xes --full', description: 'Check log quality issues' },
        { command: 'wpm drift-watch -i log.xes', description: 'Check for concept drift' },
        { command: 'wpm quality -i log.xes --compare dfg,inductive_miner,ilp', description: 'Side-by-side algorithm comparison' },
      ];
    },
    academic_context:
      'van der Aalst (2016): "Fitness above 0.85 is generally considered acceptable ' +
      'for process improvement purposes. Lower values indicate the model should be ' +
      'refined or the log should be pre-processed."',
  },

  precision: {
    label: 'Precision',
    description:
      'How tightly the model fits the observed log. High precision means the model only ' +
      'allows behavior seen in the log. Low precision means the model is too permissive — ' +
      'it allows many paths that were never observed.',
    ranges: (v) => [
      { range: '≥ 0.85',       label: 'GOOD', description: 'Model stays close to observed behavior — not over-generalizing', current: v >= 0.85 },
      { range: '0.60 – 0.85',  label: 'OK',   description: 'Model allows some extra behavior — reasonable balance', current: v >= 0.60 && v < 0.85 },
      { range: '0.40 – 0.60',  label: 'LOW',  description: 'Model is too permissive — allows many unobserved paths', current: v >= 0.40 && v < 0.60 },
      { range: '< 0.40',       label: 'POOR', description: 'Model is severely over-generalized — almost any sequence is allowed', current: v < 0.40 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Model is well-constrained — precision is not an issue' }];
      if (level === 'ok' || level === 'low') return [
        { rank: 1, cause: 'DFG or alpha algorithm creates flower model (allows all orderings)' },
        { rank: 2, cause: 'Rare activities inflate the model with seldom-used paths' },
        { rank: 3, cause: 'Parallel process variants merged into single model (should be split)' },
      ];
      return [
        { rank: 1, cause: 'Underfitting model — essentially a flower model allowing everything' },
        { rank: 2, cause: 'No dependency thresholds applied during discovery' },
        { rank: 3, cause: 'Log too heterogeneous — contains many unrelated process variants' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm quality -i log.xes', description: 'Full quality report' }];
      return [
        { command: 'wpm run log.xes --algorithm ilp', description: 'ILP miner maximizes precision' },
        { command: 'wpm validate -i log.xes', description: 'Identify rare activities inflating model' },
        { command: 'wpm quality -i log.xes --compare heuristic_miner,inductive_miner,ilp', description: 'Compare precision across algorithms' },
      ];
    },
    academic_context:
      'van der Aalst (2016): "Precision measures the fraction of behavior allowed by the model ' +
      'that is actually observed in the log. A flower model has precision 0 — it allows everything. ' +
      'ILP mining typically achieves the highest precision."',
  },

  generalization: {
    label: 'Generalization',
    description:
      'How well the model handles process behavior not yet seen in the training log. ' +
      'A model that memorizes the exact log (overfits) has low generalization. ' +
      'A model that captures the essential process structure generalizes well.',
    ranges: (v) => [
      { range: '≥ 0.75',       label: 'GOOD', description: 'Model handles unseen traces well — balanced structure', current: v >= 0.75 },
      { range: '0.50 – 0.75',  label: 'OK',   description: 'Reasonable generalization — may slightly overfit or underfit', current: v >= 0.50 && v < 0.75 },
      { range: '0.30 – 0.50',  label: 'LOW',  description: 'Model may not generalize — too specific to this log', current: v >= 0.30 && v < 0.50 },
      { range: '< 0.30',       label: 'POOR', description: 'Poor generalization — heavily overfitting or underfitting', current: v < 0.30 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Model structure is robust — good balance between specificity and generality' }];
      if (level === 'ok') return [
        { rank: 1, cause: 'Model captures most structure but some edge-case paths are missing' },
        { rank: 2, cause: 'Log may not represent all realistic process variants' },
      ];
      return [
        { rank: 1, cause: 'Model overfits the specific traces in the log (memorization)' },
        { rank: 2, cause: 'Too few traces to capture full process diversity' },
        { rank: 3, cause: 'High-quality algorithm (ILP/genetic) that is too log-specific' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm quality -i log.xes', description: 'Full quality report' }];
      return [
        { command: 'wpm run log.xes --algorithm inductive_miner', description: 'Inductive miner is designed for good generalization' },
        { command: 'wpm validate -i log.xes', description: 'Check if log is representative' },
        { command: 'wpm simulate -i log.xes', description: 'Simulate process to test generalization' },
      ];
    },
    academic_context:
      'van der Aalst (2016): "A model that is too precise (overfit) to the current log will ' +
      'fail on future behavior. Generalization measures the balance between precision and ' +
      'simplicity — a sound model should generalize beyond the observed sample."',
  },

  simplicity: {
    label: 'Simplicity',
    description:
      'How simple and understandable the process model is. Measured by the number of ' +
      'places, transitions, and silent activities. Simpler models are easier to explain ' +
      'and validate with domain experts.',
    ranges: (v) => [
      { range: '≥ 0.75',       label: 'GOOD', description: 'Simple and easy to understand — few places/transitions', current: v >= 0.75 },
      { range: '0.50 – 0.75',  label: 'OK',   description: 'Moderately complex — can still be understood and explained', current: v >= 0.50 && v < 0.75 },
      { range: '0.30 – 0.50',  label: 'LOW',  description: 'Complex — many places, transitions, or silent activities', current: v >= 0.30 && v < 0.50 },
      { range: '< 0.30',       label: 'POOR', description: 'Very complex — too many elements to explain or validate', current: v < 0.30 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Model structure is appropriate for the process complexity' }];
      if (level === 'ok') return [
        { rank: 1, cause: 'Process has genuine parallel paths or complex routing' },
        { rank: 2, cause: 'Some rare activities added complexity to the model' },
      ];
      return [
        { rank: 1, cause: 'High-quality algorithm (genetic, ILP) creates complex Petri nets' },
        { rank: 2, cause: 'Many rare/exceptional activities captured as separate paths' },
        { rank: 3, cause: 'Process is inherently complex — consider splitting by case type' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm quality -i log.xes', description: 'Full quality report' }];
      return [
        { command: 'wpm run log.xes --algorithm dfg', description: 'DFG gives the simplest representation' },
        { command: 'wpm powl simplify -i log.xes', description: 'Simplify POWL model structure' },
        { command: 'wpm validate -i log.xes', description: 'Filter rare activities before discovery' },
      ];
    },
    academic_context:
      'van der Aalst (2016): "Simplicity (sometimes called parsimony) follows Occam\'s razor — ' +
      'the simplest model that still explains the data is preferred. ' +
      'Fewer elements make models more interpretable and maintainable."',
  },

  silhouette: {
    label: 'Silhouette Score',
    description:
      'How well-separated your process clusters are. A score of 1.0 means perfect cluster ' +
      'separation. A score near 0 means clusters overlap. Negative values mean points are ' +
      'assigned to the wrong cluster.',
    ranges: (v) => [
      { range: '≥ 0.70',       label: 'GOOD', description: 'Well-defined clusters — clear separation between process variants', current: v >= 0.70 },
      { range: '0.40 – 0.70',  label: 'OK',   description: 'Reasonable clusters — some overlap between process variants', current: v >= 0.40 && v < 0.70 },
      { range: '0.20 – 0.40',  label: 'LOW',  description: 'Weak clusters — process variants are not well-distinguished', current: v >= 0.20 && v < 0.40 },
      { range: '< 0.20',       label: 'POOR', description: 'No meaningful clusters — cases cannot be reliably separated', current: v < 0.20 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Process variants are well-separated in feature space' }];
      if (level === 'ok') return [
        { rank: 1, cause: 'Some process variants share similar activity patterns' },
        { rank: 2, cause: 'Feature set may not fully capture variant differences' },
      ];
      return [
        { rank: 1, cause: 'Process is too homogeneous — not enough variant diversity to cluster' },
        { rank: 2, cause: 'Wrong number of clusters specified (k-means k parameter)' },
        { rank: 3, cause: 'Feature extraction missing key discriminating attributes' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm ml cluster -i log.xes', description: 'Explore cluster assignments' }];
      return [
        { command: 'wpm ml cluster -i log.xes --k 3', description: 'Try different cluster counts' },
        { command: 'wpm ml pca -i log.xes', description: 'PCA to understand feature space' },
        { command: 'wpm validate -i log.xes', description: 'Check log quality before clustering' },
      ];
    },
    academic_context:
      'Rousseeuw (1987): "The silhouette coefficient measures how similar an object is to ' +
      'its own cluster compared to other clusters. Values above 0.5 indicate reasonable ' +
      'structure; values above 0.7 indicate strong structure."',
  },

  drift_score: {
    label: 'Drift Score',
    description:
      'How much the process has changed over time (concept drift). A low score means the ' +
      'process is stable. A high score means significant behavioral changes were detected — ' +
      'the process mined from early traces may not apply to recent ones.',
    ranges: (v) => [
      { range: '≤ 0.20',       label: 'GOOD (stable)',   description: 'Process is stable — no significant behavioral changes detected', current: v <= 0.20 },
      { range: '0.20 – 0.40',  label: 'OK (minor drift)', description: 'Minor process changes — worth monitoring', current: v > 0.20 && v <= 0.40 },
      { range: '0.40 – 0.60',  label: 'LOW (notable)',   description: 'Notable drift — process changes may impact model validity', current: v > 0.40 && v <= 0.60 },
      { range: '> 0.60',       label: 'POOR (severe)',   description: 'Severe drift — existing models are likely outdated', current: v > 0.60 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Process is stable and consistent over time' }];
      if (level === 'ok') return [
        { rank: 1, cause: 'Minor process adjustments (seasonal variation, staff changes)' },
        { rank: 2, cause: 'New activities introduced at low frequency' },
      ];
      return [
        { rank: 1, cause: 'Process redesign or system change (ERP upgrade, new policy)' },
        { rank: 2, cause: 'Sudden influx of exceptional cases (crisis, regulatory change)' },
        { rank: 3, cause: 'Gradual drift accumulating over months — model needs refresh' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm drift-watch -i log.xes', description: 'Continuous monitoring' }];
      return [
        { command: 'wpm drift-watch -i log.xes --window 30d', description: 'Monitor with 30-day windows' },
        { command: 'wpm run log.xes --algorithm inductive_miner', description: 'Rediscover with recent data' },
        { command: 'wpm temporal -i log.xes', description: 'Temporal analysis to find when drift occurred' },
      ];
    },
    academic_context:
      'Ostovar et al. (2017): "Concept drift in process mining refers to changes in the ' +
      'underlying process over time. Early detection prevents using outdated models for ' +
      'compliance checking or performance analysis."',
  },

  anomaly_rate: {
    label: 'Anomaly Rate',
    description:
      'What fraction of your cases are classified as anomalous (unusual behavior). ' +
      'A low anomaly rate is good — most cases follow expected patterns. ' +
      'A high rate may indicate data quality issues or a heterogeneous process.',
    ranges: (v) => [
      { range: '≤ 5%',         label: 'GOOD (healthy)',  description: 'Normal anomaly level — occasional exceptions are expected', current: v <= 0.05 },
      { range: '5% – 15%',     label: 'OK (elevated)',   description: 'Elevated anomalies — worth investigating', current: v > 0.05 && v <= 0.15 },
      { range: '15% – 30%',    label: 'LOW (high)',      description: 'High anomaly rate — significant process deviation or log quality issues', current: v > 0.15 && v <= 0.30 },
      { range: '> 30%',        label: 'POOR (critical)', description: 'Critical anomaly rate — process is severely non-conforming or log is corrupt', current: v > 0.30 },
    ],
    causes: (_v, level) => {
      if (level === 'good') return [{ rank: 1, cause: 'Process is well-behaved — anomaly detection working normally' }];
      if (level === 'ok') return [
        { rank: 1, cause: 'Some exceptional cases (escalations, errors, rework loops)' },
        { rank: 2, cause: 'Seasonal or event-driven process variations' },
      ];
      return [
        { rank: 1, cause: 'Log quality issues (missing events, wrong case assignments)' },
        { rank: 2, cause: 'Multiple sub-processes mixed — discovery model is wrong baseline' },
        { rank: 3, cause: 'Genuine non-conformance — process not following intended model' },
      ];
    },
    actions: (_v, level) => {
      if (level === 'good') return [{ command: 'wpm ml anomaly -i log.xes', description: 'Inspect anomaly details' }];
      return [
        { command: 'wpm validate -i log.xes --full', description: 'Check log quality' },
        { command: 'wpm conformance -i log.xes', description: 'Measure conformance to identify deviations' },
        { command: 'wpm ml anomaly -i log.xes', description: 'Get anomaly score breakdown' },
      ];
    },
    academic_context:
      'Bezerra & Wainer (2013): "Anomaly detection in event logs helps identify cases that ' +
      'deviate from the expected process. High anomaly rates (>20%) typically indicate ' +
      'data quality problems or fundamental process non-conformance."',
  },
};

// ─── Core Interpretation Functions ───────────────────────────────────────────

export function interpretMetric(metric: string, value: number): MetricInterpretation | null {
  const spec = METRIC_SPECS[metric];
  if (!spec) return null;

  const level = getLevel(metric, value);
  const pct = INVERTED_METRICS.has(metric)
    ? `${(value * 100).toFixed(1)}% (lower is better)`
    : `${(value * 100).toFixed(1)}%`;

  return {
    metric,
    value,
    level,
    level_label: levelLabel(level),
    percentage: pct,
    what_it_means: spec.description,
    context_by_range: spec.ranges(value),
    causes: spec.causes(value, level),
    actions: spec.actions(value, level),
    academic_context: spec.academic_context,
  };
}

export function compareMetrics(metric: string, value1: number, value2: number): CompareInterpretation | null {
  if (!METRIC_SPECS[metric]) return null;

  const level1 = getLevel(metric, value1);
  const level2 = getLevel(metric, value2);
  const difference = value2 - value1;
  const sign = difference >= 0 ? '+' : '';
  const differencePct = value1 !== 0
    ? `${sign}${((difference / value1) * 100).toFixed(1)}%`
    : 'N/A';

  const t = THRESHOLDS[metric] ?? { good: 0.85, ok: 0.60, low: 0.40 };
  const thresholdCrossed =
    (value1 < t.good && value2 >= t.good) ||
    (value1 >= t.good && value2 < t.good) ||
    (value1 < t.ok   && value2 >= t.ok  ) ||
    (value1 >= t.ok  && value2 < t.ok   );
  const significant = thresholdCrossed || Math.abs(difference) >= 0.10;

  const interpretation = buildCompareInterpretation(metric, value1, value2, difference);
  const significance = thresholdCrossed
    ? `YES — crossing a quality threshold: ${level1.toUpperCase()} → ${level2.toUpperCase()}`
    : significant
    ? `YES — change of ${sign}${(Math.abs(difference) * 100).toFixed(1)} percentage points is practically meaningful`
    : `MARGINAL — change of ${sign}${(Math.abs(difference) * 100).toFixed(1)} percentage points is below the 10% significance threshold`;

  return {
    metric,
    value1,
    value2,
    difference,
    difference_pct: differencePct,
    level1,
    level2,
    label1: levelLabel(level1),
    label2: levelLabel(level2),
    interpretation,
    significance,
    significant,
    threshold_crossed: thresholdCrossed,
  };
}

function buildCompareInterpretation(metric: string, v1: number, v2: number, diff: number): string {
  const spec = METRIC_SPECS[metric];
  const label = spec?.label ?? metric;
  const absDiff = Math.abs(diff);
  const sign = diff >= 0 ? '+' : '-';
  const isInverted = INVERTED_METRICS.has(metric);

  if (absDiff < 0.005) {
    return 'Values are essentially identical — no meaningful difference.';
  }

  const improved = isInverted ? diff < 0 : diff > 0;

  if (metric === 'fitness') {
    if (improved && absDiff >= 0.15)
      return `Large fitness improvement (${sign}${(absDiff*100).toFixed(1)}pp). Typically indicates an algorithm upgrade (dfg → inductive_miner gives ~+0.15) or log quality improvement.`;
    if (improved && absDiff >= 0.05)
      return `Meaningful fitness improvement (${sign}${(absDiff*100).toFixed(1)}pp). Likely a better algorithm selection or removal of log noise.`;
    if (improved)
      return `Small fitness improvement (${sign}${(absDiff*100).toFixed(1)}pp). Marginal — may be within algorithmic variance.`;
    return `Fitness degraded by ${(absDiff*100).toFixed(1)}pp (${v1.toFixed(2)} → ${v2.toFixed(2)}). May indicate concept drift, log quality decline, or a precision/fitness trade-off.`;
  }

  if (metric === 'precision') {
    if (improved)
      return `Precision improved by ${(absDiff*100).toFixed(1)}pp — the model is now tighter, allowing fewer unobserved paths.` +
        (absDiff >= 0.10 ? ' This typically indicates switching to ILP or constraining rare activities.' : '');
    return `Precision decreased by ${(absDiff*100).toFixed(1)}pp — the model is more permissive. Higher-fitness algorithms often trade precision.`;
  }

  const direction = improved ? 'improved' : 'decreased';
  return `${label} ${direction} by ${sign}${(absDiff*100).toFixed(1)} percentage points (${v1.toFixed(4)} → ${v2.toFixed(4)}).`;
}

// ─── Root Cause Analysis ──────────────────────────────────────────────────────

export function analyzeRootCauses(dimensions: MetricInterpretation[]): RootCauseEntry[] {
  const causes: RootCauseEntry[] = [];

  for (const dim of dimensions) {
    if (dim.level === 'good') continue;
    const topCause = dim.causes[0];
    if (!topCause) continue;

    const topAction = dim.actions[0];
    const secondAction = dim.actions[1];
    const fix =
      dim.level === 'poor'
        ? `Critical: ${topAction?.command ?? 'wpm doctor'}` + (secondAction ? ` + ${secondAction.command}` : '')
        : dim.level === 'low'
        ? `Recommended: ${topAction?.command ?? 'wpm quality -i log.xes'}`
        : `Minor: ${topAction?.command ?? 'wpm quality -i log.xes'}`;

    causes.push({ dimension: dim.metric, level: dim.level, cause: topCause.cause, fix });
  }

  return causes;
}

// ─── Human Output Rendering ───────────────────────────────────────────────────

const C = {
  BOLD: '\x1b[1m', DIM: '\x1b[2m', RESET: '\x1b[0m',
  CYAN: '\x1b[36m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m', RED: '\x1b[31m',
};

function levelColor(level: MetricLevel): string {
  return { good: C.GREEN, ok: C.YELLOW, low: C.YELLOW, poor: C.RED }[level];
}

function renderSingleHuman(interp: MetricInterpretation): string {
  const spec = METRIC_SPECS[interp.metric];
  const label = spec?.label ?? interp.metric;
  const lc = levelColor(interp.level);
  const icon = levelIcon(interp.level);

  let out = `\n${C.BOLD}Interpreting: ${label} = ${interp.value.toFixed(4)}${C.RESET}\n`;
  out += '='.repeat(50) + '\n';
  out += `${lc}${icon} ${interp.level_label} ${label.toUpperCase()} (${interp.percentage})${C.RESET}\n\n`;

  out += `${C.BOLD}What it means:${C.RESET}\n`;
  out += wrapText(interp.what_it_means, '  ', 72) + '\n\n';

  out += `${C.BOLD}Context by range:${C.RESET}\n`;
  for (const r of interp.context_by_range) {
    const marker = r.current ? ` ${C.CYAN}← YOU ARE HERE${C.RESET}` : '';
    const col = r.current ? C.CYAN : C.DIM;
    out += `  ${col}${r.range.padEnd(14)} ${r.label.padEnd(12)}${C.RESET}→ ${r.description}${marker}\n`;
  }
  out += '\n';

  const hasRealCauses = interp.level !== 'good' || interp.causes.some(c => c.cause.includes('No significant'));
  if (hasRealCauses && interp.causes.length > 0) {
    out += `${C.BOLD}Likely causes:${C.RESET}\n`;
    for (const c of interp.causes) {
      out += `  ${c.rank}. ${c.cause}\n`;
    }
    out += '\n';
  }

  out += `${C.BOLD}Recommended actions:${C.RESET}\n`;
  for (const a of interp.actions) {
    out += `  ${C.DIM}→${C.RESET} ${C.CYAN}${a.command}${C.RESET}  ${C.DIM}(${a.description})${C.RESET}\n`;
  }
  out += '\n';

  out += `${C.BOLD}Academic context:${C.RESET}\n`;
  out += `  ${C.DIM}${interp.academic_context}${C.RESET}\n\n`;

  return out;
}

function renderCompareHuman(comp: CompareInterpretation): string {
  const spec = METRIC_SPECS[comp.metric];
  const label = spec?.label ?? comp.metric;
  const sign = comp.difference >= 0 ? '+' : '';
  const diffCol = comp.difference > 0 ? C.GREEN : comp.difference < 0 ? C.RED : C.DIM;

  let out = `\n${C.BOLD}${label} Comparison: ${comp.value1.toFixed(4)} vs ${comp.value2.toFixed(4)}${C.RESET}\n`;
  out += '='.repeat(50) + '\n';
  out += `Difference: ${diffCol}${sign}${(comp.difference * 100).toFixed(2)} percentage points (${comp.difference_pct})${C.RESET}\n\n`;

  out += `${comp.value1.toFixed(4)} → ${levelColor(comp.level1)}${comp.label1}${C.RESET}\n`;
  out += `${comp.value2.toFixed(4)} → ${levelColor(comp.level2)}${comp.label2}${C.RESET}\n\n`;

  out += `${C.BOLD}Interpretation:${C.RESET}\n`;
  out += `  ${comp.interpretation}\n\n`;

  out += `${C.BOLD}Is this change significant?${C.RESET}\n`;
  const sigCol = comp.significant ? C.GREEN : C.DIM;
  out += `  ${sigCol}${comp.significance}${C.RESET}\n\n`;

  if (comp.threshold_crossed) {
    out += `${C.BOLD}Quality threshold crossed:${C.RESET} ${C.CYAN}YES${C.RESET} — level changed from ${comp.level1.toUpperCase()} to ${comp.level2.toUpperCase()}\n\n`;
  }

  return out;
}

function renderReportHuman(report: ReportInterpretation): string {
  const verdictScore = report.overall_score;
  const verdictCol = verdictScore >= 0.75 ? C.GREEN : verdictScore >= 0.55 ? C.YELLOW : C.RED;

  let out = `\n${C.BOLD}Process Mining Interpretation Report${C.RESET}\n`;
  out += '='.repeat(50) + '\n';
  out += `Log: ${report.input} | Algorithm: ${report.algorithm}\n\n`;

  for (const dim of report.dimensions) {
    const label = (METRIC_SPECS[dim.metric]?.label ?? dim.metric).padEnd(20);
    const pct = `${(dim.value * 100).toFixed(1)}%`.padStart(7);
    const icon = levelIcon(dim.level);
    const lc = levelColor(dim.level);
    const brief = dim.what_it_means.split('.')[0];
    out += `${label} ${pct}  ${lc}${icon} ${dim.level_label.padEnd(8)}${C.RESET}  — ${brief}\n`;
  }

  out += '\n';
  out += `${C.BOLD}Overall verdict:${C.RESET} ${verdictCol}${report.overall_verdict}${C.RESET}`;
  out += ` (${report.dimensions_above_threshold}/${report.total_dimensions} dimensions above threshold)\n\n`;

  out += `${C.BOLD}Key insight:${C.RESET}\n  ${report.key_insight}\n\n`;

  if (report.root_causes.length > 0) {
    out += `${C.BOLD}Root Cause Analysis:${C.RESET}\n`;
    for (const rc of report.root_causes) {
      const label = METRIC_SPECS[rc.dimension]?.label ?? rc.dimension;
      const col = rc.level === 'poor' ? C.RED : rc.level === 'low' ? C.YELLOW : C.DIM;
      out += `  ${col}${rc.level.toUpperCase()} ${label.toUpperCase()}:${C.RESET}\n`;
      out += `    Cause: ${rc.cause}\n`;
      out += `    Fix:   ${C.CYAN}${rc.fix}${C.RESET}\n`;
    }
    out += '\n';
  }

  return out;
}

function wrapText(text: string, indent: string, maxWidth: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = indent;
  for (const w of words) {
    if (current.length + w.length + 1 > maxWidth && current.trim()) {
      lines.push(current.trimEnd());
      current = indent + w + ' ';
    } else {
      current += w + ' ';
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.join('\n');
}

// ─── Command Definition ───────────────────────────────────────────────────────

export const interpret = defineCommand({
  meta: {
    name: 'interpret',
    description:
      'Interpret process mining metrics with causes, actions, and root cause analysis.\n\n' +
      'Usage:\n' +
      '  wpm interpret <metric> <value>                — single metric interpretation\n' +
      '  wpm interpret compare <metric> <v1> <v2>      — compare two values\n' +
      '  wpm interpret report -i <log.xes>             — full quality interpretation report\n\n' +
      'Metrics: fitness, precision, generalization, simplicity, silhouette, drift_score, anomaly_rate\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    subcommand: {
      type: 'positional',
      description: 'A metric name, "compare", or "report"',
      required: false,
    },
    arg1: {
      type: 'positional',
      description: 'Metric value (single mode), or metric name (compare mode)',
      required: false,
    },
    arg2: {
      type: 'positional',
      description: 'First comparison value (compare mode)',
      required: false,
    },
    arg3: {
      type: 'positional',
      description: 'Second comparison value (compare mode)',
      required: false,
    },
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to XES event log file (report mode)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (alias for --input)',
      required: false,
    },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm for report (default: inductive_miner)',
      required: false,
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) | json',
      required: false,
    },
  },

  async run(ctx) {
    const format = ((ctx.args.format as string | undefined) ?? 'human') as 'json' | 'human';
    const sub = (ctx.args.subcommand as string | undefined)?.toLowerCase();

    return withSpan('interpret', { subcommand: sub ?? 'help', format }, async () => {
      if (!sub) {
        showHelp();
        return;
      }
      if (sub === 'report') return doReport(ctx, format);
      if (sub === 'compare') return doCompare(ctx, format);
      return doSingle(sub, ctx.args.arg1 as string | undefined, format);
    });
  },
});

// ─── Subcommand: single metric ────────────────────────────────────────────────

async function doSingle(metric: string, valueStr: string | undefined, format: 'json' | 'human') {
  if (!METRIC_SPECS[metric]) {
    const msg = `Unknown metric: "${metric}". Supported: ${Object.keys(METRIC_SPECS).join(', ')}`;
    if (format === 'json') {
      process.stdout.write(JSON.stringify({ status: 'error', message: msg, exit_code: EXIT_CODES.config_error }, null, 2) + '\n');
    } else {
      process.stderr.write(msg + '\n');
    }
    return exitWithFlush(EXIT_CODES.config_error);
  }

  if (!valueStr) {
    process.stderr.write(`Usage: wpm interpret ${metric} <value>\n`);
    return exitWithFlush(EXIT_CODES.config_error);
  }

  const value = parseFloat(valueStr);
  if (isNaN(value) || value < 0 || value > 1) {
    process.stderr.write(`Error: Value must be between 0 and 1, got "${valueStr}"\n`);
    return exitWithFlush(EXIT_CODES.config_error);
  }

  const interp = interpretMetric(metric, value)!;
  const spec = METRIC_SPECS[metric];

  if (format === 'json') {
    const result = makeResult('interpret', {
      status: 'ok',
      message: `${spec.label} = ${value.toFixed(4)} → ${interp.level.toUpperCase()}`,
      ...interp,
    }, 0, EXIT_CODES.success);
    emitResult(result, { format: 'json' });
  } else {
    process.stdout.write(renderSingleHuman(interp));
  }
}

// ─── Subcommand: compare ──────────────────────────────────────────────────────

async function doCompare(ctx: { args: Record<string, unknown> }, format: 'json' | 'human') {
  const metric = (ctx.args.arg1 as string | undefined)?.toLowerCase();
  const v1Str  = ctx.args.arg2 as string | undefined;
  const v2Str  = ctx.args.arg3 as string | undefined;

  if (!metric || !METRIC_SPECS[metric]) {
    process.stderr.write(`Usage: wpm interpret compare <metric> <value1> <value2>\nSupported: ${Object.keys(METRIC_SPECS).join(', ')}\n`);
    return exitWithFlush(EXIT_CODES.config_error);
  }

  const v1 = parseFloat(v1Str ?? '');
  const v2 = parseFloat(v2Str ?? '');
  if (isNaN(v1) || isNaN(v2) || v1 < 0 || v1 > 1 || v2 < 0 || v2 > 1) {
    process.stderr.write(`Error: Both values must be between 0 and 1. Got "${v1Str}" and "${v2Str}"\n`);
    return exitWithFlush(EXIT_CODES.config_error);
  }

  const comp = compareMetrics(metric, v1, v2)!;
  const spec = METRIC_SPECS[metric];

  if (format === 'json') {
    const result = makeResult('interpret.compare', {
      status: 'ok',
      message: `${spec.label}: ${v1.toFixed(4)} vs ${v2.toFixed(4)}, diff ${comp.difference_pct}`,
      ...comp,
    }, 0, EXIT_CODES.success);
    emitResult(result, { format: 'json' });
  } else {
    process.stdout.write(renderCompareHuman(comp));
  }
}

// ─── Subcommand: report ───────────────────────────────────────────────────────

async function doReport(ctx: { args: Record<string, unknown> }, format: 'json' | 'human') {
  const inputPath = (ctx.args.input as string | undefined) ?? (ctx.args.file as string | undefined);
  const algorithm = (ctx.args.algorithm as string | undefined) ?? 'inductive_miner';

  if (!inputPath) {
    process.stderr.write('Usage: wpm interpret report -i <log.xes> [--algorithm <algo>]\n');
    return exitWithFlush(EXIT_CODES.config_error);
  }

  return withLogSession(
    {
      inputPath,
      activityKey: 'concept:name',
      commandName: 'interpret.report',
      emitOptions: { format, verbose: false, quiet: false },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (wasmBase: Record<string, unknown>, logHandle: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wasm = wasmBase as Record<string, (...args: any[]) => any>;
      const t0 = Date.now();

      // Discover model
      const discoveryMap: Record<string, string> = {
        inductive_miner:   'discover_inductive_miner',
        ilp:               'discover_ilp_petri_net',
        heuristic_miner:   'discover_heuristic_miner',
        dfg:               'discover_dfg',
        genetic_algorithm: 'discover_genetic_algorithm',
      };
      const discoveryFn = discoveryMap[algorithm] ?? 'discover_inductive_miner';

      let modelHandle: string | null = null;
      try {
        if (discoveryFn === 'discover_heuristic_miner') {
          modelHandle = wasm[discoveryFn]?.(logHandle, 'concept:name', 0.5) as string | null;
        } else {
          modelHandle = wasm[discoveryFn]?.(logHandle, 'concept:name') as string | null;
        }
      } catch {
        try { modelHandle = wasm['discover_dfg']?.(logHandle, 'concept:name') as string | null; } catch { /* noop */ }
      }

      // Compute fitness via token replay
      let fitness = 0.0;
      let precision: number | null = null;
      if (modelHandle) {
        try {
          const raw = wasm['token_replay_fitness']?.(logHandle, modelHandle);
          if (raw != null) {
            const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof r?.fitness === 'number') fitness = r.fitness;
          }
        } catch { /* use 0.0 */ }

        try {
          const raw = wasm['compute_precision']?.(logHandle, modelHandle);
          if (raw != null) {
            const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof r?.precision === 'number') precision = r.precision;
          }
        } catch { /* null */ }
      }

      const toInterpret: [string, number][] = [['fitness', fitness]];
      if (precision != null) toInterpret.push(['precision', precision]);

      const dimensions: MetricInterpretation[] = toInterpret
        .map(([d, v]) => interpretMetric(d, v))
        .filter((x): x is MetricInterpretation => x != null);

      const overallScore = dimensions.length > 0
        ? dimensions.reduce((s, d) => s + d.value, 0) / dimensions.length
        : 0;

      const aboveThreshold = dimensions.filter(d => d.level === 'good').length;
      const overallVerdict =
        overallScore >= 0.85 ? 'EXCELLENT MODEL' :
        overallScore >= 0.70 ? 'GOOD MODEL' :
        overallScore >= 0.55 ? 'ACCEPTABLE MODEL' : 'POOR MODEL';

      const sorted = [...dimensions].sort((a, b) => a.value - b.value);
      const weakest = sorted[0];
      const keyInsight = weakest && weakest.level !== 'good'
        ? `${METRIC_SPECS[weakest.metric]?.label ?? weakest.metric} is the weak point (${(weakest.value * 100).toFixed(1)}%). ` +
          (weakest.actions[0] ? `Consider: ${weakest.actions[0].command}` : '')
        : 'All computed dimensions are performing well.';

      const rootCauses = analyzeRootCauses(dimensions);
      const elapsedMs = Date.now() - t0;

      const report: ReportInterpretation = {
        input: inputPath,
        algorithm,
        dimensions,
        overall_verdict: overallVerdict,
        overall_score: overallScore,
        dimensions_above_threshold: aboveThreshold,
        total_dimensions: dimensions.length,
        key_insight: keyInsight,
        root_causes: rootCauses,
      };

      if (format === 'json') {
        const result = makeResult('interpret.report', {
          status: 'ok',
          message: `${overallVerdict}: ${aboveThreshold}/${dimensions.length} dimensions above threshold`,
          ...report,
        }, elapsedMs, EXIT_CODES.success);
        emitResult(result, { format: 'json' });
      } else {
        process.stdout.write(renderReportHuman(report));
      }

      if (modelHandle) {
        try { wasm['delete_object']?.(modelHandle); } catch { /* best-effort */ }
      }
    }
  );
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  process.stdout.write(`
${C.BOLD}wpm interpret${C.RESET} — Understand process mining metric values

${C.BOLD}Usage:${C.RESET}
  wpm interpret <metric> <value>
  wpm interpret compare <metric> <value1> <value2>
  wpm interpret report -i <log.xes> [--algorithm <algo>] [--format json]

${C.BOLD}Supported Metrics:${C.RESET}
  ${C.CYAN}fitness${C.RESET}          How well the model explains observed behavior (0–1)
  ${C.CYAN}precision${C.RESET}        How tightly the model fits the log (0–1)
  ${C.CYAN}generalization${C.RESET}   Balance between overfitting and underfitting (0–1)
  ${C.CYAN}simplicity${C.RESET}       How simple/understandable the model is (0–1)
  ${C.CYAN}silhouette${C.RESET}       Cluster quality score (0–1)
  ${C.CYAN}drift_score${C.RESET}      Concept drift magnitude (0–1, lower is better)
  ${C.CYAN}anomaly_rate${C.RESET}     Fraction of anomalous cases (0–1, lower is better)

${C.BOLD}Examples:${C.RESET}
  wpm interpret fitness 0.73
  wpm interpret precision 0.85
  wpm interpret compare fitness 0.71 0.87
  wpm interpret report -i log.xes
  wpm interpret report -i log.xes --algorithm ilp --format json

${C.BOLD}Source Data:${C.RESET}
  ${C.DIM}• wpm quality -i <log.xes>${C.RESET}
  ${C.DIM}• wpm conformance -i <log.xes>${C.RESET}
  ${C.DIM}• wpm ml cluster -i <log.xes>${C.RESET}

`);
}
