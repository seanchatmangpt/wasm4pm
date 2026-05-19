import { defineCommand } from 'citty';
import * as fs from 'fs/promises';

/**
 * GAP-CONF-3: Compute Agresti-Coull 95% confidence interval for a binomial proportion.
 * Uses adjusted Wald interval (more accurate than standard Wald for small samples).
 *
 * @param successes - Number of successful outcomes
 * @param trials - Total number of trials
 * @param confidence - Confidence level (default: 0.95)
 * @returns { point_estimate, ci_lower, ci_upper }
 */
function computeConfidenceInterval(
  successes: number,
  trials: number,
  confidence = 0.95
): { point_estimate: number; ci_lower: number; ci_upper: number } {
  if (trials === 0) {
    return { point_estimate: 0, ci_lower: 0, ci_upper: 1 };
  }

  const p_hat = successes / trials;
  const z = 1.96; // 95% CI critical value

  // Agresti-Coull adjustment (adds pseudo-observations)
  const z_squared = z * z;
  const n_tilde = trials + z_squared;
  const p_tilde = (successes + z_squared / 2) / n_tilde;

  const margin = z * Math.sqrt((p_tilde * (1 - p_tilde)) / n_tilde);

  return {
    point_estimate: p_hat,
    ci_lower: Math.max(0, p_tilde - margin),
    ci_upper: Math.min(1, p_tilde + margin),
  };
}
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan, withWasmSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import {
  captureFeedback,
  diagnose,
  validateConformanceResultFromCases,
  estimateGeneralization,
  type InvariantViolation,
  type LogStats,
} from '@wasm4pm/observability';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

interface TraceDeviation {
  event_index: number;
  activity: string;
  deviation_type: string;
}

interface TraceResult {
  case_id: string;
  is_conforming: boolean;
  trace_fitness: number;
  tokens_missing: number;
  tokens_remaining: number;
  deviations: TraceDeviation[];
  // NEW (Gap CF-2): Root-cause classification for trace deviations
  primary_deviation_class?: string;
  deviation_summary?: {
    missing_activities: number;
    extra_activities: number;
    late_activities: number;
    reordered_activities: number;
  };
}

interface ConformancePayload {
  schema: string;
  status: string;
  input: string;
  activityKey: string;
  method: string;
  threshold: number;
  fitness: number;
  precision: number | null;
  precision_available: boolean;
  computed_at: 'fast' | 'lazy' | 'full';
  generalization: number | null;
  isFit: boolean;
  // GAP-CONF-3: Confidence interval for fitness (binomial proportion)
  fitness_ci_lower?: number;
  fitness_ci_upper?: number;
  sample_size_warning?: string;
  summary: {
    total_cases: number;
    conforming_cases: number;
    deviating_cases: number;
    conformance_rate: number;
  };
  diagnostics: {
    traced: number;
    remaining: number;
    missing: number;
    consumed: number;
    produced: number;
  };
  deviating_traces: TraceResult[];
  modelHandle: string;
  diagnosis?: {
    category: string;
    severity: string;
    explanation: string;
    recommendations: string[];
    confidence: number;
  };
  invariant_violations?: InvariantViolation[];
  invariant_status?: 'clean' | 'warnings' | 'critical';
}

const VALID_PRECISION_MODES = ['fast', 'lazy', 'full'] as const;
type PrecisionMode = (typeof VALID_PRECISION_MODES)[number];

export const conformance = defineCommand({
  meta: {
    name: 'conformance',
    description:
      'Measure log-to-model fitness and precision. Ex: wpm conformance -i process.xes\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file — use -i as shorthand (named alternative to positional)',
      alias: 'i',
    },
    model: {
      type: 'string',
      description: 'Process model handle or file path — use -m as shorthand (Petri net JSON)',
      alias: 'm',
    },
    models: {
      type: 'string',
      description: 'Multiple model paths for comparison (comma-separated)',
      alias: 'M',
    },
    method: {
      type: 'string',
      description: 'Conformance checking method: token-replay (default) or alignment',
      default: 'token-replay',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    threshold: {
      type: 'string',
      description: 'Fitness threshold for "good" conformance, in [0, 1] (default: 0.8)',
      default: '0.8',
    },
    detailed: {
      type: 'boolean',
      description: 'Include per-trace conformance details in output',
      alias: 'd',
    },
    compare: {
      type: 'boolean',
      description: 'Compare metrics across models (used with --models)',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'precision-mode': {
      type: 'string',
      description:
        'Precision computation strategy: fast (fitness only, ~100ms faster), lazy (defer precision), full (bundled, default)',
      default: 'full',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the receipt to .wasm4pm/receipts/',
    },
    'full-quality': {
      type: 'boolean',
      description:
        'Run 5-layer invariant audit (bounds, ordering, case-count, token balance, final-state coherence). ' +
        'Critical violations exit 4 (partial_failure); warnings are included in output but exit 0.',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Validate --precision-mode before doing any I/O
    const rawPrecisionMode = (ctx.args['precision-mode'] as string) ?? 'full';
    if (!VALID_PRECISION_MODES.includes(rawPrecisionMode as PrecisionMode)) {
      const result = makeErrorResult(
        'conformance',
        new Error(
          `Invalid --precision-mode value '${rawPrecisionMode}': must be one of: fast, lazy, full.\n\n` +
            `  fast  — fitness only (~100ms faster, precision not computed)\n` +
            `  lazy  — cache fitness, defer precision computation\n` +
            `  full  — bundled fitness + precision (default)\n\n` +
            `  Example: wpm conformance log.xes --precision-mode fast`
        ),
        EXIT_CODES.config_error,
        'CONFIG_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    const precisionMode = rawPrecisionMode as PrecisionMode;

    // Validate --threshold before any I/O — it is a CLI config value, not a file-dependent check.
    // Doing this here (alongside --precision-mode validation) ensures config errors are caught
    // eagerly and exit code 1 (config_error) is returned even when no input file is given.
    const rawThresholdEarly = ctx.args.threshold as string | undefined;
    const parsedThresholdEarly =
      rawThresholdEarly != null ? parseFloat(rawThresholdEarly) : undefined;
    const thresholdIsInvalidEarly =
      parsedThresholdEarly !== undefined &&
      (Number.isNaN(parsedThresholdEarly) ||
        parsedThresholdEarly < 0 ||
        parsedThresholdEarly > 1);
    if (thresholdIsInvalidEarly) {
      const result = makeErrorResult(
        'conformance',
        new Error(
          `Invalid --threshold value '${rawThresholdEarly}': must be a number between 0.0 and 1.0 (inclusive).\n\n` +
            `  --threshold sets the minimum accepted fitness score (default: 0.80).\n` +
            `  Example: wpm conformance log.xes --threshold 0.85`
        ),
        EXIT_CODES.config_error,
        'CONFIG_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    const thresholdEarly = parsedThresholdEarly ?? 0.8;

    const t0 = Date.now();

    return withSpan(
      'conformance',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        method: String(ctx.args.method ?? ''),
        precision_mode: precisionMode,
        format,
      },
      async () => {
        try {
          // Resolve input path (positional OR --file/-i)
          const inputPath: string | undefined =
            (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

          if (!inputPath) {
            const result = makeErrorResult(
              'conformance',
              new Error(
                'Input file required.\n\nUsage:  wpm conformance <log.xes>\n        wpm conformance <log.xes> --model <model.json>\n\nRun "wpm conformance --help" for details.'
              ),
              EXIT_CODES.source_error,
              'SOURCE_ERROR'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // threshold is pre-validated at run() start — use the early-validated value
          const threshold = thresholdEarly;
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
          const method = ctx.args.method as 'token-replay' | 'alignment';

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'conformance',
              emitOptions: { format, verbose, quiet },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              // First discover a Petri Net model if none provided
              let petriNetHandle: string;
              const modelPath = ctx.args.model as string | undefined;

              if (modelPath) {
                // Load provided model from file, store it, and get a handle
                try {
                  await fs.access(modelPath);
                  const modelContent = await fs.readFile(modelPath, 'utf-8');
                  JSON.parse(modelContent);
                  // Note: For now, we assume the model file is a Petri Net JSON
                  // In the future, we could store it via WASM API
                  petriNetHandle = `model_${Date.now()}`;
                } catch {
                  const result = makeErrorResult(
                    'conformance',
                    new Error(`Model file not found or invalid: ${modelPath}`),
                    EXIT_CODES.source_error,
                    'SOURCE_ERROR'
                  );
                  emitResult(result, { format, verbose, quiet });
                  return await exitWithFlush(result.exit_code);
                }
              } else {
                // Auto-discover a Petri Net using Alpha++
                const discoveryResult = withWasmSpan(
                  'discover_alpha_plus_plus',
                  { algorithm: 'alpha', activity_key: activityKey },
                  () => wasm.discover_alpha_plus_plus(logHandle, activityKey, 0.1)
                );
                const resultData =
                  typeof discoveryResult === 'string'
                    ? JSON.parse(discoveryResult)
                    : discoveryResult;
                petriNetHandle = (resultData as Record<string, unknown>).handle as string;

                if (!petriNetHandle) {
                  const result = makeErrorResult(
                    'conformance',
                    new Error('Failed to discover Petri Net model'),
                    EXIT_CODES.execution_error,
                    'EXECUTION_ERROR'
                  );
                  emitResult(result, { format, verbose, quiet });
                  return await exitWithFlush(result.exit_code);
                }
              }

              // Run conformance checking based on method
              let precision: number | null = null;
              let precision_available = false;
              let conformanceResult: Record<string, unknown>;

              if (method === 'alignment') {
                const configJson = JSON.stringify({
                  max_iterations: 100000,
                  sync_cost: 0.0,
                  log_move_cost: 1.0,
                  model_move_cost: 1.0,
                });
                const raw = withWasmSpan(
                  'alignment_fitness',
                  { method: 'alignment', activity_key: activityKey },
                  () => wasm.alignment_fitness(logHandle, petriNetHandle, configJson)
                );
                conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
              } else {
                const raw = withWasmSpan(
                  'check_token_based_replay',
                  { method: 'token_replay', activity_key: activityKey },
                  () => wasm.check_token_based_replay(logHandle, petriNetHandle, activityKey)
                );
                conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
              }

              // The token-replay WASM function returns ConformanceResult with:
              //   avg_fitness, conforming_cases, total_cases, case_fitness[]
              // Each case_fitness entry has: case_id, is_conforming, trace_fitness,
              //   tokens_missing, tokens_remaining, deviations[]
              // alignment_fitness returns a different shape (fitness at top level).
              const isTokenReplay = method !== 'alignment';
              let fitnessValue: number;
              let totalCases: number;
              let conformingCases: number;
              let caseFitness: TraceResult[] = [];

              if (isTokenReplay) {
                fitnessValue = (conformanceResult.avg_fitness as number) ?? 0.0;
                totalCases = (conformanceResult.total_cases as number) ?? 0;
                conformingCases = (conformanceResult.conforming_cases as number) ?? 0;
                const rawCases = conformanceResult.case_fitness as TraceResult[] | undefined;
                caseFitness = Array.isArray(rawCases) ? rawCases : [];

                // DEGENERATE CASE 1: Empty log
                if (totalCases === 0) {
                  const result = makeErrorResult(
                    'conformance',
                    new Error(
                      'Degenerate case: Log contains no traces.\n\nDiagnostic: Ensure the XES file contains at least one <trace> element with at least one <event>.'
                    ),
                    EXIT_CODES.source_error,
                    'SOURCE_ERROR'
                  );
                  emitResult(result, { format, verbose, quiet });
                  return await exitWithFlush(result.exit_code);
                }

                // DEGENERATE CASE 2: All traces identical (schema mismatch or data quality issue)
                if (totalCases > 1 && caseFitness.length > 0) {
                  const fitnessValues = caseFitness.map((c) => c.trace_fitness);
                  const uniqueFitnesses = new Set(fitnessValues.map((f) => f.toFixed(3)));
                  const uniqueActivityCounts = new Set(caseFitness.map((c) => c.deviations.length));

                  if (uniqueFitnesses.size === 1 && uniqueActivityCounts.size === 1) {
                    if (verbose) {
                      console.warn(
                        '\nWARNING (Degenerate Case 2): All traces have identical structure and fitness.\n' +
                          'This suggests possible activity-key mismatch or intentional log homogeneity.\n' +
                          'Consider checking the activity key with: wpm run log.xes --algorithm dfg\n'
                      );
                    }
                  }
                }

                // DEGENERATE CASE 3: Single trace (no variance for statistical analysis)
                if (totalCases === 1 && verbose) {
                  console.warn(
                    '\nWARNING (Degenerate Case 3): Log contains only 1 trace.\n' +
                      'Statistical conformance analysis requires multiple traces for validity.\n'
                  );
                }
              } else {
                // alignment path — shape differs, fitness is at root
                fitnessValue = (conformanceResult.fitness as number) ?? 0.0;
                totalCases = 0;
                conformingCases = 0;
              }

              const deviatingCases = isTokenReplay ? totalCases - conformingCases : 0;
              const conformanceRate = totalCases > 0 ? conformingCases / totalCases : fitnessValue;

              // In full mode, attempt precision computation via ETConformance (wasm_compute_precision).
              // fast and lazy modes skip this call intentionally to save ~100ms.
              // Precision computation is hardened against edge cases (empty log, empty model, etc.)
              // and degrades gracefully if input is invalid.
              if (precisionMode === 'full' && typeof wasm.wasm_compute_precision === 'function') {
                try {
                  const precisionStartMs = Date.now();
                  const rawPrec = wasm.wasm_compute_precision(
                    logHandle,
                    petriNetHandle,
                    activityKey
                  );
                  const precisionElapsedMs = Date.now() - precisionStartMs;
                  const precResult = typeof rawPrec === 'string' ? JSON.parse(rawPrec) : rawPrec;
                  const p = (precResult as Record<string, unknown>).precision as number | undefined;

                  // GUARD: Validate precision is finite and in bounds [0, 1]
                  if (typeof p === 'number' && Number.isFinite(p) && p >= 0.0 && p <= 1.0) {
                    precision = p;
                    precision_available = true;

                    // OTEL: Log precision computation success with timing
                    if (verbose) {
                      console.log(
                        `[OTEL] conformance.precision.computation: status=ok, precision=${p.toFixed(3)}, elapsed_ms=${precisionElapsedMs}`
                      );
                    }
                  } else {
                    // Precision is out of bounds or invalid — degrade gracefully
                    if (verbose) {
                      console.warn(
                        `[OTEL] conformance.precision.computation: status=degraded, reason=out_of_bounds, precision_value=${p}, elapsed_ms=${precisionElapsedMs}`
                      );
                    }
                    // precision remains null, precision_available stays false
                  }
                } catch (precError) {
                  // Precision computation failed — degrade gracefully
                  if (verbose) {
                    console.warn(
                      `[OTEL] conformance.precision.computation: status=failed, reason=compute_error, error=${String(precError)}`
                    );
                  }
                  // Precision computation is best-effort in full mode; never block on fitness.
                  // Leave precision = null, precision_available = false.
                }
              }

              // Separate deviating traces for reporting (up to 20 to keep output manageable)
              let deviatingTraces = caseFitness.filter((t) => !t.is_conforming).slice(0, 20);

              // NEW (Gap CF-2): Classify trace deviations into root-cause categories
              const classifyDeviation = (dev: TraceDeviation): string => {
                if (!dev.deviation_type) return 'unknown';
                const dtype = dev.deviation_type.toLowerCase();
                if (dtype.includes('missing')) return 'missing_activity';
                if (dtype.includes('extra') || dtype.includes('skip')) return 'extra_activity';
                if (dtype.includes('late')) return 'late_activity';
                if (dtype.includes('reorder') || dtype.includes('sequence')) return 'reordered_activities';
                return 'other';
              };

              // Augment deviating traces with root-cause classification
              deviatingTraces = deviatingTraces.map((t) => ({
                ...t,
                primary_deviation_class:
                  t.deviations.length > 0 ? classifyDeviation(t.deviations[0]) : 'no_deviations',
                deviation_summary: {
                  missing_activities: t.deviations.filter((d) => classifyDeviation(d) === 'missing_activity')
                    .length,
                  extra_activities: t.deviations.filter((d) => classifyDeviation(d) === 'extra_activity')
                    .length,
                  late_activities: t.deviations.filter((d) => classifyDeviation(d) === 'late_activity')
                    .length,
                  reordered_activities: t.deviations.filter((d) =>
                    classifyDeviation(d) === 'reordered_activities'
                  ).length,
                },
              }));

              // Aggregate token counts across all traces for diagnostics
              let totalMissing = 0;
              let totalRemaining = 0;
              for (const t of caseFitness) {
                totalMissing += t.tokens_missing ?? 0;
                totalRemaining += t.tokens_remaining ?? 0;
              }

              // GAP-CONF-3: Compute statistical confidence interval for fitness
              // Only for token-replay method with multiple traces (sample size requirement)
              let fitnessCILower: number | undefined;
              let fitnessCIUpper: number | undefined;
              let sampleSizeWarning: string | undefined;

              if (isTokenReplay && totalCases > 0) {
                const ci = computeConfidenceInterval(conformingCases, totalCases, 0.95);
                fitnessCILower = ci.ci_lower;
                fitnessCIUpper = ci.ci_upper;

                // Warn if sample size is below statistical power threshold
                if (totalCases < 30) {
                  sampleSizeWarning = `Low statistical power: ${totalCases} traces < 30 recommended`;
                }
              }

              // Fitness decision: use CI lower bound (not point estimate)
              // Only declare fit if lower bound of CI >= threshold (more conservative)
              const isFit = fitnessCILower !== undefined ? fitnessCILower >= threshold : fitnessValue >= threshold;

              // GAP-CONF-1: Compute generalization score from trace variant analysis
              // Generalization = 1 - (unique_variants / total_traces)
              // High variants (low generalization) indicates overfitting risk
              let generalizationScore: number | null = null;
              if (isTokenReplay && totalCases > 0) {
                const uniqueVariants = new Set(
                  caseFitness.map((c) => JSON.stringify(c.deviations))
                ).size;
                generalizationScore = estimateGeneralization(uniqueVariants, totalCases);
              }

              // Perform root-cause diagnosis if fitness is below threshold
              let diagnosis;
              if (!isFit) {
                // Build log statistics for diagnosis
                const logStats: LogStats = {
                  event_count: 0, // Could be extracted from WASM
                  trace_count: totalCases,
                  unique_activities: 0, // Could be extracted from log metadata
                  unique_variants: 0, // Could be extracted from log analysis
                  min_trace_length: 0,
                  max_trace_length: 0,
                  avg_trace_length: totalCases > 0 ? deviatingTraces.length / totalCases : 0,
                  rework_ratio: undefined,
                  activity_coverage: undefined,
                };

                const conformanceResult = {
                  fitness: fitnessValue,
                  precision,
                  conformance_rate: conformanceRate,
                  deviating_cases: deviatingCases,
                  deviating_traces: deviatingTraces,
                };

                diagnosis = diagnose(conformanceResult, logStats);
              }

              const payload: ConformancePayload = {
                schema: 'chatmangpt.wasm4pm.conformance.v1',
                status: isFit ? 'success' : 'conformance_fail',
                input: inputPath,
                activityKey,
                method,
                threshold,
                fitness: fitnessValue,
                precision,
                precision_available,
                computed_at: precisionMode,
                generalization: generalizationScore,
                isFit,
                fitness_ci_lower: fitnessCILower,
                fitness_ci_upper: fitnessCIUpper,
                sample_size_warning: sampleSizeWarning,
                summary: {
                  total_cases: totalCases,
                  conforming_cases: conformingCases,
                  deviating_cases: deviatingCases,
                  conformance_rate: conformanceRate,
                },
                diagnostics: {
                  traced: totalCases,
                  remaining: totalRemaining,
                  missing: totalMissing,
                  consumed: 0,
                  produced: 0,
                },
                deviating_traces: deviatingTraces,
                modelHandle: petriNetHandle,
                diagnosis: diagnosis
                  ? {
                      category: diagnosis.category,
                      severity: diagnosis.severity,
                      explanation: diagnosis.explanation,
                      recommendations: diagnosis.recommendations,
                      confidence: diagnosis.confidence,
                    }
                  : undefined,
              };

              // GAP-CONF-5: Always run 5-layer invariant audit for critical validations (I-1, I-2).
              // Catch impossible metrics (e.g., fitness < precision) immediately.
              // --full-quality adds warning-level checks (I-3, I-4, I-5).
              if (isTokenReplay) {
                const violations = validateConformanceResultFromCases(
                  fitnessValue,
                  precision ?? null,
                  caseFitness
                );

                // Separate critical and warning violations
                const criticalViolations = violations.filter((v: InvariantViolation) => v.severity === 'critical');
                const warningViolations = violations.filter((v: InvariantViolation) => v.severity === 'warning');

                // Always block on critical violations (I-1: bounds, I-2: ordering)
                if (criticalViolations.length > 0) {
                  payload.invariant_violations = violations;
                  payload.invariant_status = 'critical';

                  const elapsedMs = Date.now() - t0;
                  const result = makeResult('conformance', payload, elapsedMs, EXIT_CODES.partial_failure);
                  emitResult(result, { format, verbose, quiet }, (res, projection) => {
                    printHumanConformance(res.payload, projection);
                  });
                  return await exitWithFlush(EXIT_CODES.partial_failure);
                }

                // Include warnings in output if --full-quality requested.
                // Without --full-quality: leave invariant_violations and invariant_status
                // absent from the payload (backward-compatible — consumers that do not
                // request the audit never see these fields).
                if (ctx.args['full-quality']) {
                  payload.invariant_violations = warningViolations;
                  payload.invariant_status = warningViolations.length === 0 ? 'clean' : 'warnings';
                }
                // else: payload.invariant_violations and payload.invariant_status remain
                // undefined (not set), so they are absent from the JSON envelope.
              }

              const elapsedMs = Date.now() - t0;

              // Capture feedback (non-blocking) — will be stored in .wasm4pm/algorithm-feedback/
              try {
                await captureFeedback(
                  'conformance_check',
                  totalCases,
                  {
                    fitness: fitnessValue,
                    precision,
                    generalization: generalizationScore,
                    simplicity: null, // Not computed in conformance
                  },
                  elapsedMs,
                  {
                    method,
                    threshold,
                    total_cases: totalCases,
                    activity_key: activityKey,
                    precision_mode: precisionMode,
                  }
                );
              } catch {
                // Silently ignore feedback capture failures — never block conformance
              }

              // Exit non-zero when fitness is below threshold so bash -e pipelines
              // and downstream tools can detect conformance failure.
              const exitCode = isFit ? EXIT_CODES.success : EXIT_CODES.conformance_fail;
              const result = makeResult('conformance', payload, elapsedMs, exitCode);

              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                printHumanConformance(res.payload, projection);
              });

              // Persist BLAKE3 receipt for proof-of-execution
              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs.readFile(inputPath);
                  const receipt: CommandReceipt = {
                    ...newReceipt('conformance'),
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(payload)),
                    status: isFit ? 'success' : 'partial',
                    summary: {
                      method: payload.method,
                      fitness: payload.fitness,
                      precision: payload.precision,
                      threshold: payload.threshold,
                      elapsedMs,
                      precision_mode: precisionMode,
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const result = makeErrorResult(
            'conformance',
            error,
            EXIT_CODES.execution_error,
            'EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

import type { ConsoleProjection } from '../output.js';

function printHumanConformance(payload: ConformancePayload, projection: ConsoleProjection): void {
  const fitness = payload.fitness ?? 0.0;
  const precisionRaw = payload.precision;
  const precisionAvailable = payload.precision_available;
  const threshold = payload.threshold ?? 1.0;
  const isFit = payload.isFit;
  const summary = payload.summary;
  const deviatingTraces = payload.deviating_traces ?? [];

  projection.log('');
  projection.success(`Conformance Check — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Method: ${payload.method}`);
  projection.log(`  Precision mode: ${payload.computed_at}`);
  projection.log('');

  // Primary fitness score with Van der Aalst threshold context
  // GAP-CONF-3: Include 95% confidence interval for statistical significance
  const fitnessStatus =
    fitness >= 0.85 ? 'excellent' : fitness >= threshold ? 'acceptable' : 'below threshold';
  const ciDisplay =
    payload.fitness_ci_lower !== undefined && payload.fitness_ci_upper !== undefined
      ? ` [95% CI: ${payload.fitness_ci_lower.toFixed(3)}–${payload.fitness_ci_upper.toFixed(3)}]`
      : '';
  projection.log(
    `  Fitness: ${fitness.toFixed(3)} ${isFit ? '✓' : '✗'}  [threshold: ${threshold.toFixed(2)}, Van der Aalst target: >=0.85 — ${fitnessStatus}]${ciDisplay}`
  );

  // Warn if sample size is below recommended threshold
  if (payload.sample_size_warning) {
    projection.log(`  ⚠ ${payload.sample_size_warning}`);
  }

  // Concrete implication: translate the fitness score into practitioner language
  if (summary.total_cases > 0) {
    const conformPct = (summary.conformance_rate * 100).toFixed(1);
    const deviatePct = (100 - summary.conformance_rate * 100).toFixed(1);
    if (summary.deviating_cases === 0) {
      projection.log(`  => All ${summary.total_cases} traces replay without deviation.`);
    } else {
      projection.log(
        `  => ${summary.conforming_cases} of ${summary.total_cases} traces conform (${conformPct}%); ` +
          `${summary.deviating_cases} deviate (${deviatePct}%) — each requires missing or extra tokens.`
      );
    }
  } else if (fitness < 1.0) {
    // Alignment path — no per-case breakdown; express as percentage
    const nonConformPct = ((1 - fitness) * 100).toFixed(1);
    projection.log(
      `  => Alignment cost suggests approximately ${nonConformPct}% of trace moves are non-conforming.`
    );
  } else {
    projection.log(`  => Perfect fitness — all trace moves align with the model.`);
  }

  const precisionDisplay =
    precisionAvailable && precisionRaw !== null ? precisionRaw.toFixed(3) : 'N/A (not computed)';
  projection.log(`  Precision: ${precisionDisplay}`);

  // GAP-CONF-1: Display generalization score (computed from trace variant analysis)
  const generalization = (payload.generalization as number | null | undefined) ?? null;
  const generalizationDisplay = generalization !== null ? generalization.toFixed(3) : 'N/A';
  projection.log(`  Generalization: ${generalizationDisplay}  [higher = less overfitting]`);

  // Edge case diagnostics
  if (!precisionAvailable) {
    if (payload.computed_at === 'fast') {
      projection.log(`  Hint: --precision-mode=fast skips precision; use --precision-mode=full to compute`);
    } else if (payload.computed_at === 'lazy') {
      projection.log(
        `  Hint: --precision-mode=lazy defers precision computation; call wpm results --precision to finalize`
      );
    } else if (payload.computed_at === 'full') {
      // Full mode but precision unavailable — degraded due to edge case
      if (summary.total_cases === 0) {
        projection.log(`  Note: Empty log — precision computation skipped (vacuous truth)`);
      } else if (summary.total_cases === 1) {
        projection.log(
          `  Note: Single trace — precision computation available but has low statistical power`
        );
      } else {
        projection.log(
          `  Note: Precision computation was attempted but degraded (model structure or edge case)`
        );
      }
    }
  }
  projection.log('');

  // Case summary — only shown for token-replay (alignment returns no case breakdown)
  if (summary.total_cases > 0) {
    const conformanceRatePct = (summary.conformance_rate * 100).toFixed(1);
    projection.log('  Case Summary:');
    projection.log(`    Total cases:      ${summary.total_cases}`);
    projection.log(`    Conforming:       ${summary.conforming_cases}  (${conformanceRatePct}%)`);
    projection.log(`    Deviating:        ${summary.deviating_cases}`);
    projection.log('');
  }

  // Deviating trace details — the key practitioner insight
  if (deviatingTraces.length > 0) {
    const totalDeviating = summary.deviating_cases;
    const shown = deviatingTraces.length;
    const suffix = totalDeviating > shown ? ` (showing first ${shown} of ${totalDeviating})` : '';
    projection.log(`  Deviating Traces${suffix}:`);
    projection.log(`    [missing_tokens = model expected activity but log skipped it]`);
    projection.log(`    [remaining_tokens = log ended before model reached final marking]`);

    for (const trace of deviatingTraces) {
      projection.log(
        `    Case ${trace.case_id}  fitness=${trace.trace_fitness.toFixed(3)}  missing_tokens=${trace.tokens_missing}  remaining_tokens=${trace.tokens_remaining}`
      );
      if (trace.deviations.length > 0) {
        for (const dev of trace.deviations) {
          const label =
            dev.deviation_type === 'missing_activity'
              ? `activity "${dev.activity}" was expected by the model but not found in the log (log move)`
              : dev.deviation_type === 'missing_tokens'
                ? `activity "${dev.activity}" fired but required tokens were not available (model move)`
                : `${dev.deviation_type} at "${dev.activity}"`;
          projection.log(`      [event ${dev.event_index}] ${label}`);
        }
      } else {
        projection.log(`      (deviation: final marking not reached)`);
      }
    }
    projection.log('');
    // Always explain deviation types when deviating traces are present — even
    // if fitness is above threshold, practitioners need to know what the
    // deviating cases mean so they can decide whether to investigate.
    projection.log('  How to interpret deviations:');
    projection.log(
      '    "log move"   — the log contains an activity the model does not expect; the model is too restrictive.'
    );
    projection.log(
      '    "model move" — the model requires an activity that was skipped in the log; the log is missing steps.'
    );
    if (!isFit) {
      projection.log(
        '  To fix: either relax the model (add transitions) or investigate why steps are skipped in the log.'
      );
    } else {
      projection.log(
        '  Fitness is above threshold, but deviating traces exist — investigate whether these represent exceptions or process variants.'
      );
    }
    projection.log('');
  }

  // Invariant audit results (only shown when --full-quality was used)
  const invariantStatus = payload.invariant_status;
  const invariantViolations = payload.invariant_violations;
  if (invariantStatus !== undefined) {
    projection.log('  Invariant Check:');
    if (invariantStatus === 'clean') {
      projection.log('    Status: CLEAN — all 5 invariants satisfied');
    } else if (invariantStatus === 'warnings') {
      const count = invariantViolations?.length ?? 0;
      projection.log(`    Status: ${count} warning(s) — no critical violations`);
      if (invariantViolations && invariantViolations.length > 0) {
        for (const v of invariantViolations) {
          projection.log(`    [${v.id}] ${v.violation}`);
          projection.log(`         Consequence: ${v.consequence}`);
        }
      }
    } else if (invariantStatus === 'critical') {
      const criticals = (invariantViolations ?? []).filter((v) => v.severity === 'critical');
      const warnings = (invariantViolations ?? []).filter((v) => v.severity === 'warning');
      projection.log(
        `    Status: CRITICAL — ${criticals.length} critical violation(s), ${warnings.length} warning(s)`
      );
      for (const v of invariantViolations ?? []) {
        projection.log(`    [${v.id}][${v.severity.toUpperCase()}] ${v.violation}`);
        projection.log(`         Consequence: ${v.consequence}`);
      }
    }
    projection.log('');
  }

  if (isFit) {
    projection.success('Log conforms to model (fitness >= threshold)');
  } else {
    projection.warn('Log does NOT conform to model (fitness < threshold)');
    projection.log('');
    projection.log('  Next steps:');
    projection.log('    wpm run -i <log.xes>              # discover a better-fitting model');
    projection.log(
      `    wpm conformance -i <log.xes> --threshold ${Math.max(0, threshold - 0.1).toFixed(2)}  # relax the threshold`
    );
    projection.log('    wpm validate -i <log.xes>         # check log quality first');
  }
  projection.log('');
}
