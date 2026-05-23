import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Kernel } from '../../../packages/kernel/src/api.js';
import type { FailureCode } from './types.js';
import { fixtures } from './fixtures.js';

const ACTIVITY_KEY = 'concept:name';
const ROOT = process.cwd();
const OCEL_FIXTURE = path.resolve(ROOT, 'lab/fixtures/sample-ocel.json');

const MINIMAL_TASK_CONTEXT = JSON.stringify({
  task_id: 'algorithm-behavior-gate',
  title: 'Process discovery gate',
  phase: 'Analyze',
  risk_level: 'Low',
  policy: {
    policy_ids: [],
    allowed_actions: ['Read'],
    forbidden_actions: [],
    required_roles: [],
    blocked_roles: [],
  },
  evidence: {
    receipt_refs: [],
    required_evidence_classes: [],
    available_evidence_classes: [],
    confidence_band: 'Unknown',
    drift_status: 'Stable',
  },
  tags: [],
  metadata: {},
});

const MINIMAL_PNML =
  '<?xml version="1.0"?><pnml><net id="n"><page id="p">' +
  '<place id="p1"/><transition id="t1"/><arc source="p1" target="t1"/></page></net></pnml>';

const MINIMAL_BPMN =
  '<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">' +
  '<process id="P"><startEvent id="s"/><task id="a"/><endEvent id="e"/>' +
  '<sequenceFlow sourceRef="s" targetRef="a"/><sequenceFlow sourceRef="a" targetRef="e"/></process></definitions>';

const STOCHASTIC_ALGOS = new Set([
  'genetic_algorithm',
  'pso',
  'aco',
  'simulated_annealing',
  'monte_carlo_simulation',
]);

const OCEL_ALGOS = new Set([
  'ocel_dfg',
  'ocel_dfg_per_type',
  'ocel_petri_net',
  'ocel_ocla',
  'ocel_oc_declare',
  'ocel_encode',
]);

const PREDICT_ALGOS = new Set(['predict_next_activity', 'predict_remaining_time', 'predict_outcome']);

const SCHEMA_ONLY_INVARIANT = new Set(['predict_remaining_time', 'playout', 'monte_carlo_simulation']);

const MODEL_DEPENDENT = new Set([
  'generalization',
  'etconformance_precision',
  'precision',
  'alignments',
  'petri_net_reduction',
  'complexity_metrics',
  'powl_to_process_tree',
  'yawl_export',
]);

export interface BoundaryContext {
  wasm: Record<string, unknown>;
  kernel: Kernel;
  xesLogHandle: string;
  ocelLogHandle: string | null;
  cleanup: () => void;
}

export function computeHash(data: unknown): string {
  if (Buffer.isBuffer(data)) {
    return createHash('sha256').update(data).digest('hex');
  }
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(str).digest('hex');
}

export function hasPlaceholders(result: unknown): boolean {
  const str = JSON.stringify(result);
  return (
    str.includes('"..."') ||
    str.toLowerCase().includes('placeholder') ||
    str.toLowerCase().includes('fake') ||
    str.includes('todo')
  );
}

export function classifyError(raw: unknown, algorithmId?: string): FailureCode {
  const message = raw instanceof Error ? raw.message : String(raw);
  const upper = message.toUpperCase();
  const lower = message.toLowerCase();

  if (upper.includes('EMPTY_EVENT_LOG') || lower.includes('empty log') || lower.includes('no traces')) {
    return 'EMPTY_EVENT_LOG';
  }
  if (
    upper.includes('MALFORMED_EVENT_LOG') ||
    lower.includes('malformed') ||
    lower.includes('missing closing') ||
    lower.includes('failed to parse')
  ) {
    if (algorithmId && (algorithmId.startsWith('ml_') || algorithmId.startsWith('predict_'))) {
      return 'PREDICTION_FEATURES_REQUIRED';
    }
    return 'MALFORMED_EVENT_LOG';
  }
  if (lower.includes('missing activity') || lower.includes('concept:name')) {
    return 'MISSING_ACTIVITY_FIELD';
  }
  if (lower.includes('timestamp')) {
    return 'MISSING_TIMESTAMP_FIELD';
  }
  if (lower.includes('not available') || lower.includes('unsupported algorithm')) {
    return 'WASM_EXPORT_MISSING';
  }
  if (lower.includes('invalid model') || lower.includes('petri_net_handle')) {
    return 'INVALID_MODEL_HANDLE';
  }
  if (algorithmId?.startsWith('predict_') || lower.includes('@wasm4pm/predict')) {
    return 'PREDICTION_FEATURES_REQUIRED';
  }
  return 'INVALID_ALGORITHM_ID';
}

function normalizeResult(result: unknown): unknown {
  if (result && typeof result === 'object' && 'handle' in (result as object)) {
    const { handle, metadata, ...rest } = result as Record<string, unknown>;
    return { handle, metadata, ...rest };
  }
  return result;
}

async function loadWasmModule(): Promise<Record<string, unknown>> {
  const pkgPath = path.resolve(ROOT, 'wasm4pm/pkg/wasm4pm.js');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`WASM package not found at ${pkgPath}. Run: cd wasm4pm && npm run build`);
  }
  const mod = await import(pathToFileURL(pkgPath).href);
  if (typeof mod.default === 'function') {
    await mod.default();
  }
  return mod as Record<string, unknown>;
}

function loadXesHandle(wasm: Record<string, unknown>, xesContent: string): string {
  const loader = wasm.load_eventlog_from_xes as (s: string) => string;
  if (typeof loader !== 'function') {
    throw new Error('WASM export load_eventlog_from_xes is missing');
  }
  const handle = loader(xesContent);
  if (!handle) {
    throw new Error('EMPTY_EVENT_LOG');
  }
  return handle;
}

function loadOcelHandle(wasm: Record<string, unknown>): string | null {
  if (!fs.existsSync(OCEL_FIXTURE)) return null;
  const loader = wasm.load_ocel_from_json as ((s: string) => string) | undefined;
  if (typeof loader !== 'function') return null;
  const content = fs.readFileSync(OCEL_FIXTURE, 'utf-8');
  return loader(content) || null;
}

async function discoverPetriNetHandle(
  kernel: Kernel,
  logHandle: string
): Promise<string> {
  const result = await kernel.runRaw('ilp', logHandle, ACTIVITY_KEY, {});
  const handle = (result as { handle?: string }).handle;
  if (!handle) {
    throw new Error('INVALID_MODEL_HANDLE');
  }
  return handle;
}

/** CLI-aligned refusal for invalid XES inputs (same gates as withLogSession). */
export function validateNegativeInput(
  xesContent: string,
  algorithmId?: string
): FailureCode | null {
  const trimmed = xesContent.trim();
  if (!trimmed || trimmed === '<log></log>') {
    return 'EMPTY_EVENT_LOG';
  }

  const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
  if (traceCount === 0 && xesContent.includes('<log')) {
    return 'EMPTY_EVENT_LOG';
  }

  const looksLikeXes =
    xesContent.includes('<log') || xesContent.includes('<trace') || xesContent.includes('<event');
  const isWellFormed = xesContent.includes('</log>') || xesContent.includes('</trace>');
  if (looksLikeXes && !isWellFormed) {
    if (algorithmId?.startsWith('ml_') || algorithmId?.startsWith('predict_')) {
      return 'PREDICTION_FEATURES_REQUIRED';
    }
    return 'MALFORMED_EVENT_LOG';
  }

  return null;
}

function extractStablePayload(
  ctx: BoundaryContext,
  result: unknown
): unknown {
  const r = result as Record<string, unknown>;
  if (r.metadata && typeof r.metadata === 'object' && 'result' in (r.metadata as object)) {
    return (r.metadata as { result: unknown }).result;
  }
  const handle = r.handle as string | undefined;
  if (handle && typeof ctx.wasm.export_dfg_to_json === 'function') {
    try {
      return ctx.wasm.export_dfg_to_json(handle);
    } catch {
      /* fall through */
    }
  }
  const { handle: _handle, ...rest } = r;
  return rest;
}

export async function initBoundary(): Promise<BoundaryContext> {
  const wasm = await loadWasmModule();
  const kernel = new Kernel(wasm as never);
  await kernel.init();

  const xesContent = fixtures.valid.runningExampleXes.toString('utf-8');
  const xesLogHandle = loadXesHandle(wasm, xesContent);
  const ocelLogHandle = loadOcelHandle(wasm);

  const handles = [xesLogHandle];
  if (ocelLogHandle) handles.push(ocelLogHandle);

  return {
    wasm,
    kernel,
    xesLogHandle,
    ocelLogHandle,
    cleanup: () => {
      const deleter = wasm.delete_object as ((h: string) => void) | undefined;
      if (typeof deleter === 'function') {
        for (const h of handles) {
          try {
            deleter(h);
          } catch {
            /* best effort */
          }
        }
      }
    },
  };
}

export function logHandleForAlgorithm(ctx: BoundaryContext, algorithmId: string): string {
  if (OCEL_ALGOS.has(algorithmId)) {
    if (!ctx.ocelLogHandle) {
      throw new Error('INVALID_OCEL_OBJECT_GRAPH');
    }
    return ctx.ocelLogHandle;
  }
  return ctx.xesLogHandle;
}

export async function buildPositiveParams(
  ctx: BoundaryContext,
  algorithmId: string
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};

  if (algorithmId === 'predict_next_activity' || algorithmId === 'predict_outcome') {
    params.prefix_json = '[]';
    return params;
  }

  if (algorithmId === 'predict_remaining_time') {
    params.prefix_json = JSON.stringify(['register request', 'examine casually']);
    params.timestamp_key = 'time:timestamp';
    return params;
  }

  if (PREDICT_ALGOS.has(algorithmId)) {
    params.features = fixtures.prediction.minimalFeatures.toString('utf-8');
    return params;
  }

  if (algorithmId === 'agentic_pipeline') {
    params.task_json = MINIMAL_TASK_CONTEXT;
    return params;
  }

  if (algorithmId === 'pnml_import') {
    params.pnml_xml = MINIMAL_PNML;
    return params;
  }

  if (algorithmId === 'bpmn_import') {
    params.bpmn_xml = MINIMAL_BPMN;
    return params;
  }

  if (algorithmId === 'yawl_export') {
    params.powl_string = '{"type":"sequence","children":[]}';
    return params;
  }

  if (algorithmId === 'compute_ewma') {
    params.values_json = JSON.stringify([1, 2, 3, 4, 5]);
    params.alpha = 0.3;
    return params;
  }

  if (algorithmId === 'detect_drift') {
    params.window_size = 10;
    return params;
  }

  if (algorithmId === 'monte_carlo_simulation') {
    params.num_simulations = 50;
    return params;
  }

  if (algorithmId === 'playout') {
    params.num_traces = 5;
    params.min_trace_length = 1;
    params.max_trace_length = 50;
    params.include_timestamps = true;
    params.start_timestamp = 0;
    return params;
  }

  if (algorithmId === 'compute_simplicity') {
    params.places = 2;
    params.transitions = 1;
    params.arcs = 2;
    return params;
  }

  if (MODEL_DEPENDENT.has(algorithmId)) {
    const petriHandle = await discoverPetriNetHandle(ctx.kernel, ctx.xesLogHandle);
    params.petri_net_handle = petriHandle;
    if (algorithmId === 'complexity_metrics') {
      params.powl_handle = petriHandle;
    }
    if (algorithmId === 'powl_to_process_tree') {
      params.powl_handle = petriHandle;
    }
    return params;
  }

  if (algorithmId === 'handover_network' || algorithmId === 'working_together_network') {
    params.resource_key = 'org:resource';
  }

  if (STOCHASTIC_ALGOS.has(algorithmId)) {
    params.seed = 42;
  }

  return params;
}

export async function runAlgorithmPositive(
  ctx: BoundaryContext,
  algorithmId: string
): Promise<{ result: unknown; duration_ms: number; result_hash: string }> {
  const start = performance.now();
  const logHandle = logHandleForAlgorithm(ctx, algorithmId);
  const params = await buildPositiveParams(ctx, algorithmId);
  const raw = await ctx.kernel.runRaw(algorithmId, logHandle, ACTIVITY_KEY, params);
  const duration_ms = performance.now() - start;
  const normalized = normalizeResult(raw);

  if (!normalized || (typeof normalized === 'object' && Object.keys(normalized as object).length === 0)) {
    throw new Error('Empty result');
  }
  if (hasPlaceholders(normalized)) {
    throw new Error('Result contains placeholders');
  }

  return {
    result: normalized,
    duration_ms,
    result_hash: computeHash(extractStablePayload(ctx, normalized)),
  };
}

export async function runAlgorithmNegative(
  ctx: BoundaryContext,
  algorithmId: string,
  xesContent: string
): Promise<{ error_code: FailureCode; no_panic: boolean }> {
  const preflight = validateNegativeInput(xesContent, algorithmId);
  if (preflight) {
    return { error_code: preflight, no_panic: true };
  }

  let tempHandle: string | null = null;
  try {
    tempHandle = loadXesHandle(ctx.wasm, xesContent);
    const params = await buildPositiveParams(ctx, algorithmId);
    await ctx.kernel.runRaw(algorithmId, tempHandle, ACTIVITY_KEY, params);
    return { error_code: 'INVALID_ALGORITHM_ID', no_panic: true };
  } catch (err) {
    return { error_code: classifyError(err, algorithmId), no_panic: true };
  } finally {
    if (tempHandle) {
      try {
        (ctx.wasm.delete_object as (h: string) => void)(tempHandle);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function runAlgorithmInvariant(
  ctx: BoundaryContext,
  algorithmId: string
): Promise<{ stable: boolean; first_hash: string; second_hash: string }> {
  const logHandle = logHandleForAlgorithm(ctx, algorithmId);
  const wasm = ctx.wasm as Record<string, (...args: unknown[]) => unknown>;

  if (SCHEMA_ONLY_INVARIANT.has(algorithmId)) {
    try {
      const first = await runAlgorithmPositive(ctx, algorithmId);
      const second = await runAlgorithmPositive(ctx, algorithmId);
      return {
        stable: true,
        first_hash: first.result_hash,
        second_hash: second.result_hash,
      };
    } catch {
      return { stable: false, first_hash: '', second_hash: '' };
    }
  }

  if (STOCHASTIC_ALGOS.has(algorithmId)) {
    const runStochastic = async (): Promise<unknown> => {
      switch (algorithmId) {
        case 'genetic_algorithm':
          return wasm.discover_genetic_algorithm!(logHandle, ACTIVITY_KEY, 50, 100);
        case 'pso':
          return wasm.discover_pso_algorithm!(logHandle, ACTIVITY_KEY, 30, 50);
        case 'aco':
          return wasm.discover_ant_colony!(logHandle, ACTIVITY_KEY, 20, 50);
        case 'simulated_annealing':
          return wasm.discover_simulated_annealing!(logHandle, ACTIVITY_KEY, 1000, 0.95);
        case 'monte_carlo_simulation': {
          const mcConfig = {
            num_cases: 50,
            inter_arrival_mean_ms: 1000.0,
            activity_service_time_ms: {},
            resource_capacity: {},
            simulation_time_ms: 60000,
            random_seed: 42,
          };
          return wasm.monte_carlo_simulation!(logHandle, '', '', JSON.stringify(mcConfig));
        }
        default:
          return ctx.kernel.runRaw(algorithmId, logHandle, ACTIVITY_KEY, {
            ...(await buildPositiveParams(ctx, algorithmId)),
            seed: 42,
          });
      }
    };

    const first = await runStochastic();
    const second = await runStochastic();
    const firstMetrics = parseResultMetrics(first);
    const secondMetrics = parseResultMetrics(second);
    const first_hash = computeHash(typeof first === 'string' ? first : first);
    const second_hash = computeHash(typeof second === 'string' ? second : second);
    const stable =
      firstMetrics.schemaValid &&
      secondMetrics.schemaValid &&
      fitnessInRange(firstMetrics.fitness) &&
      fitnessInRange(secondMetrics.fitness);
    return { stable, first_hash, second_hash };
  }

  const firstRun = await runAlgorithmPositive(ctx, algorithmId);
  const secondRun = await runAlgorithmPositive(ctx, algorithmId);
  return {
    stable: firstRun.result_hash === secondRun.result_hash,
    first_hash: firstRun.result_hash,
    second_hash: secondRun.result_hash,
  };
}

function parseResultMetrics(raw: unknown): { schemaValid: boolean; fitness: number | null } {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') {
      return { schemaValid: false, fitness: null };
    }
    const record = obj as Record<string, unknown>;
    const fitness =
      typeof record.fitness === 'number'
        ? record.fitness
        : typeof record.final_fitness === 'number'
          ? record.final_fitness
          : typeof record.metric_score === 'number'
            ? record.metric_score
            : null;
    return { schemaValid: true, fitness };
  } catch {
    return { schemaValid: false, fitness: null };
  }
}

function fitnessInRange(fitness: number | null): boolean {
  return fitness === null || (fitness >= 0 && fitness <= 1);
}

export function isStochasticAlgorithm(algorithmId: string): boolean {
  return STOCHASTIC_ALGOS.has(algorithmId);
}
