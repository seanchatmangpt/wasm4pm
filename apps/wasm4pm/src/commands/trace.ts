import { defineCommand } from 'citty';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

// ── shared types ──────────────────────────────────────────────────────────────

interface TraceFrame {
  index: number;
  function: string;
  file?: string;
  line?: number;
  col?: number;
  language: 'rust' | 'typescript' | 'unknown';
}

interface TraceGraphEvent {
  '@id': string;
  '@type': 'ocel:Event';
  'ocel:activity': string;
  'ocel:relatedObject': Array<{ '@id': string; '@type': string }>;
  'trace:frame': {
    'trace:language': string;
    'trace:function': string;
    'trace:file'?: string;
    'trace:line'?: number;
  };
}

interface TraceGraph {
  '@context': Record<string, string>;
  '@id': string;
  '@type': 'trace:TraceRun';
  'trace:language': string;
  'trace:source': string;
  'trace:events': TraceGraphEvent[];
  'trace:objects': Array<{ '@id': string; '@type': string; 'trace:path'?: string }>;
}

interface OcelEvent {
  event_id: string;
  activity: string;
  timestamp: string;
  objects: Array<{ id: string; type: string }>;
  attributes: Record<string, unknown>;
}

interface OcelLog {
  ocel_version: string;
  ocel_global_log: { ocel_attribute_names: string[] };
  ocel_events: OcelEvent[];
  ocel_objects: Array<{ id: string; type: string; attributes: Record<string, unknown> }>;
}

interface Powl2Model {
  route_id: string;
  type: 'powl2';
  required_stages?: string[];
  model: {
    type?: 'choice_graph' | 'sequence' | 'loop' | 'partial_order';
    choice_graph?: { nodes: string[]; edges: [string, string][] };
    sequence?: string[];
    loop?: { body: string[]; redo?: string[] };
    partial_order?: { nodes: string[]; order: [string, string][] };
  };
}

interface ConformanceResult {
  route_id: string;
  fitness: number;
  precision: number;
  required_stage_coverage: number;
  receipt_coverage: number;
  object_lifecycle_validity: number;
  verdict: 'Accepted' | 'AndonPull';
  andon_reason?: string;
  details: Array<{ dimension: string; ok: boolean; detail: string }>;
}

// ── parsers ───────────────────────────────────────────────────────────────────

function frameToActivity(fn: string, lang: 'rust' | 'typescript' | 'unknown'): string {
  if (lang === 'rust') {
    // myapp::module::fn_name → myapp.module.fn_name
    return fn.replace(/::/g, '.').replace(/[^a-zA-Z0-9._<>]/g, '_');
  }
  // TypeScript: ClassName.method or standalone fn
  return fn.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._<>]/g, '_');
}

function parseRustTrace(text: string): TraceFrame[] {
  const frames: TraceFrame[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    // Match "   N: function::name" or "   N:0x... - function::name"
    const frameMatch = line.match(/^\s*(\d+):\s+(?:0x[0-9a-f]+ - )?(.+)$/);
    if (frameMatch) {
      const index = parseInt(frameMatch[1] ?? '0', 10);
      let fn = (frameMatch[2] ?? '').trim();
      let file: string | undefined;
      let lineNum: number | undefined;
      let col: number | undefined;
      // Next line may be "             at file:line:col"
      const nextLine = lines[i + 1] ?? '';
      const atMatch = nextLine.match(/^\s+at (.+):(\d+):(\d+)$/);
      if (atMatch) {
        file = atMatch[1];
        lineNum = parseInt(atMatch[2] ?? '0', 10);
        col = parseInt(atMatch[3] ?? '0', 10);
        i++;
      }
      // Strip hash suffix (e.g. fn::hABC123)
      fn = fn.replace(/::h[0-9a-f]{16}$/, '');
      frames.push({ index, function: fn, file, line: lineNum, col, language: 'rust' });
    }
    i++;
  }
  return frames;
}

function parseTypeScriptTrace(text: string): TraceFrame[] {
  const frames: TraceFrame[] = [];
  const lines = text.split('\n');
  let index = 0;
  for (const line of lines) {
    // "    at function (file:line:col)" or "    at file:line:col"
    const m1 = line.match(/^\s+at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    const m2 = line.match(/^\s+at\s+(.+):(\d+):(\d+)$/);
    if (m1) {
      frames.push({
        index: index++,
        function: m1[1]?.trim() ?? 'unknown',
        file: m1[2],
        line: parseInt(m1[3] ?? '0', 10),
        col: parseInt(m1[4] ?? '0', 10),
        language: 'typescript',
      });
    } else if (m2) {
      frames.push({
        index: index++,
        function: m2[1]?.trim() ?? 'unknown',
        file: undefined,
        line: parseInt(m2[2] ?? '0', 10),
        col: parseInt(m2[3] ?? '0', 10),
        language: 'typescript',
      });
    }
  }
  return frames;
}

// ── projectors ────────────────────────────────────────────────────────────────

function framesToTraceGraph(frames: TraceFrame[], runId: string, lang: string, source: string): TraceGraph {
  const ctx = {
    prov: 'http://www.w3.org/ns/prov#',
    ocel: 'https://www.ocel-standard.org/ns#',
    trace: 'https://example.org/trace#',
    powl: 'https://example.org/powl#',
  };

  const objects: TraceGraph['trace:objects'] = [];
  const seenFiles = new Set<string>();

  const events: TraceGraphEvent[] = frames.map((frame, i) => {
    const activity = frameToActivity(frame.function, frame.language);
    const relatedObjs: TraceGraphEvent['ocel:relatedObject'] = [];

    if (frame.file && !seenFiles.has(frame.file)) {
      seenFiles.add(frame.file);
      const fileId = `trace:SourceFile:${frame.file.replace(/[^a-zA-Z0-9]/g, '_')}`;
      objects.push({ '@id': fileId, '@type': 'trace:SourceFile', 'trace:path': frame.file });
    }
    if (frame.file) {
      const fileId = `trace:SourceFile:${frame.file.replace(/[^a-zA-Z0-9]/g, '_')}`;
      relatedObjs.push({ '@id': fileId, '@type': 'trace:SourceFile' });
    }
    relatedObjs.push({ '@id': `trace:Frame:${runId}:${i}`, '@type': 'trace:StackFrame' });

    return {
      '@id': `trace:e${i}`,
      '@type': 'ocel:Event',
      'ocel:activity': activity,
      'ocel:relatedObject': relatedObjs,
      'trace:frame': {
        'trace:language': frame.language,
        'trace:function': frame.function,
        ...(frame.file && { 'trace:file': frame.file }),
        ...(frame.line !== undefined && { 'trace:line': frame.line }),
      },
    };
  });

  return {
    '@context': ctx,
    '@id': `trace:run-${runId}`,
    '@type': 'trace:TraceRun',
    'trace:language': lang,
    'trace:source': source,
    'trace:events': events,
    'trace:objects': objects,
  };
}

function traceGraphToOcel(graph: TraceGraph): OcelLog {
  const now = new Date().toISOString();
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();

  for (const obj of graph['trace:objects']) {
    const id = obj['@id'].replace('trace:', '');
    objectSet.set(id, { id, type: obj['@type'].replace('trace:', ''), attributes: {} });
  }

  const events: OcelEvent[] = graph['trace:events'].map((ev, i) => {
    const objects = ev['ocel:relatedObject'].map((o) => ({
      id: o['@id'].replace('trace:', ''),
      type: o['@type'].replace('trace:', ''),
    }));
    // Ensure object entries exist
    for (const o of objects) {
      if (!objectSet.has(o.id)) objectSet.set(o.id, { id: o.id, type: o.type, attributes: {} });
    }
    return {
      event_id: ev['@id'].replace('trace:', ''),
      activity: ev['ocel:activity'],
      timestamp: now,
      objects,
      attributes: { frame_index: i, ...(ev['trace:frame']['trace:file'] && { file: ev['trace:frame']['trace:file'] }) },
    };
  });

  return {
    ocel_version: '2.0',
    ocel_global_log: { ocel_attribute_names: ['frame_index', 'file'] },
    ocel_events: events,
    ocel_objects: Array.from(objectSet.values()),
  };
}

function ocelToObservedRoute(ocel: OcelLog): string[] {
  return ocel.ocel_events.map((e) => e.activity);
}

// ── POWL v2 conformance ───────────────────────────────────────────────────────

function checkPowl2Conformance(observed: string[], model: Powl2Model): ConformanceResult {
  const details: ConformanceResult['details'] = [];
  const m = model.model;

  // Build adjacency from choice_graph, sequence, or partial_order
  let admissibleActivities: Set<string>;
  let validPaths: string[][] = [];

  if (m.choice_graph) {
    const { nodes, edges } = m.choice_graph;
    admissibleActivities = new Set(nodes.filter((n) => n !== '▷' && n !== '□'));

    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const [from, to] of edges) {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push(to);
    }

    // Find all paths from ▷ to □ via DFS (bounded depth)
    const findPaths = (current: string, path: string[], depth: number): void => {
      if (depth > nodes.length + 2) return; // cycle guard
      if (current === '□') { validPaths.push([...path]); return; }
      for (const next of (adj.get(current) ?? [])) {
        findPaths(next, next !== '□' ? [...path, next] : path, depth + 1);
      }
    };
    findPaths('▷', [], 0);
  } else if (m.sequence) {
    admissibleActivities = new Set(m.sequence);
    validPaths = [m.sequence];
  } else if (m.loop) {
    admissibleActivities = new Set([...m.loop.body, ...(m.loop.redo ?? [])]);
    validPaths = [m.loop.body];
  } else if (m.partial_order) {
    admissibleActivities = new Set(m.partial_order.nodes);
    validPaths = [m.partial_order.nodes];
  } else {
    admissibleActivities = new Set();
  }

  // Fitness: fraction of observed activities that appear in admissible set
  const observedSet = new Set(observed);
  const inModel = observed.filter((a) => admissibleActivities.has(a)).length;
  const fitness = observed.length > 0 ? inModel / observed.length : 0;
  details.push({
    dimension: 'fitness',
    ok: fitness >= 1.0,
    detail: `${inModel}/${observed.length} observed activities are in model (${(fitness * 100).toFixed(1)}%)`,
  });

  // Precision: fraction of model activities that appear in observed
  const modelActivitiesInObserved = [...admissibleActivities].filter((a) => observedSet.has(a)).length;
  const precision = admissibleActivities.size > 0
    ? modelActivitiesInObserved / admissibleActivities.size
    : 1.0;
  details.push({
    dimension: 'precision',
    ok: precision <= 1.0, // precision is always ok unless > 1 (impossible)
    detail: `${modelActivitiesInObserved}/${admissibleActivities.size} model activities observed (${(precision * 100).toFixed(1)}%)`,
  });

  // Required stage coverage: check required_stages all appear
  const requiredStages = model.required_stages ?? [];
  const missingStages = requiredStages.filter((s) => !observedSet.has(s));
  const stageCoverage = requiredStages.length > 0
    ? (requiredStages.length - missingStages.length) / requiredStages.length
    : 1.0;
  details.push({
    dimension: 'required_stage_coverage',
    ok: missingStages.length === 0,
    detail: missingStages.length === 0
      ? `all ${requiredStages.length} required stages present`
      : `missing: ${missingStages.join(', ')}`,
  });

  // Check if any valid path covers the observed sequence (order check)
  let routeValid = false;
  if (validPaths.length === 0) {
    // No complete paths found in model — check just for admissibility
    routeValid = fitness === 1.0;
  } else {
    // Try to match observed sequence against any valid path (subsequence check)
    for (const path of validPaths) {
      let pi = 0;
      for (const act of observed) {
        if (pi < path.length && path[pi] === act) pi++;
      }
      if (pi === path.length) { routeValid = true; break; }
    }
    if (!routeValid && fitness === 1.0) {
      // All activities in model but sequence doesn't match any path exactly
      // Consider it a partial match — report but don't fail fitness
      routeValid = false;
    }
  }
  details.push({
    dimension: 'route_sequence_valid',
    ok: routeValid || validPaths.length === 0,
    detail: routeValid
      ? 'observed sequence matches a valid route path'
      : validPaths.length === 0
        ? 'no complete route paths in model (use required_stages for coverage check)'
        : `observed sequence does not match any of ${validPaths.length} valid path(s)`,
  });

  // Receipt coverage and object lifecycle: NotMeasured in current phase
  details.push({ dimension: 'receipt_coverage', ok: false, detail: 'NotMeasured — Phase 5 implementation' });
  details.push({ dimension: 'object_lifecycle_validity', ok: false, detail: 'NotMeasured — Phase 5 implementation' });

  // Verdict: Accepted only if fitness=1.0, required stages covered, sequence valid
  // NotMeasured dimensions cause AndonPull(TestRouteIncomplete) per MCPP doctrine
  const fitnessOk = fitness >= 1.0;
  const stagesOk = missingStages.length === 0;
  const seqOk = routeValid || validPaths.length === 0;

  let verdict: 'Accepted' | 'AndonPull' = 'AndonPull';
  let andonReason: string | undefined;
  if (!fitnessOk) {
    andonReason = 'RouteConformanceGap';
  } else if (!stagesOk) {
    andonReason = 'MissingRequiredStages';
  } else if (!seqOk) {
    andonReason = 'RouteSequenceMismatch';
  } else {
    // receipt_coverage and object_lifecycle_validity are NotMeasured
    andonReason = 'TestRouteIncomplete';
  }

  return {
    route_id: model.route_id,
    fitness,
    precision,
    required_stage_coverage: stageCoverage,
    receipt_coverage: 0,
    object_lifecycle_validity: 0,
    verdict,
    andon_reason: andonReason,
    details,
  };
}

// ── ingest subcommand ─────────────────────────────────────────────────────────

const ingest = defineCommand({
  meta: { name: 'ingest', description: 'Parse a stack trace into TraceGraph JSON-LD' },
  args: {
    from: { type: 'string', default: 'typescript', description: 'Language: rust | typescript' },
    input: { type: 'string', alias: 'i', description: 'Input file (default: stdin)' },
    out: { type: 'string', alias: 'o', description: 'Output file (default: stdout)' },
    runId: { type: 'string', description: 'Run ID for trace graph identity' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const lang = (ctx.args.from as string) ?? 'typescript';
    const runId = (ctx.args.runId as string | undefined) ?? `trace-${Date.now()}`;

    let text: string;
    const inputPath = ctx.args.input as string | undefined;
    if (inputPath) {
      if (!existsSync(inputPath)) {
        const r = makeErrorResult('trace ingest', `Input file not found: ${inputPath}`, EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(r, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }
      text = readFileSync(inputPath, 'utf8');
    } else {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      text = Buffer.concat(chunks).toString('utf8');
    }

    const frames = lang === 'rust' ? parseRustTrace(text) : parseTypeScriptTrace(text);
    const graph = framesToTraceGraph(frames, runId, lang, inputPath ?? 'stdin');
    const graphJson = JSON.stringify(graph, null, 2);

    const outPath = ctx.args.out as string | undefined;
    if (outPath) {
      writeFileSync(outPath, graphJson, 'utf8');
    } else if (format === 'json') {
      // Pipe-friendly: emit only the raw TraceGraph JSON
      process.stdout.write(graphJson + '\n');
      return exitWithFlush(EXIT_CODES.success);
    }

    const result = makeResult('trace ingest', {
      run_id: runId,
      language: lang,
      frames: frames.length,
      events: graph['trace:events'].length,
      objects: graph['trace:objects'].length,
      out: outPath ?? 'stdout',
    }, performance.now() - t0, EXIT_CODES.success);

    emitResult(result, { format, verbose, quiet }, (res, p) => {
      const d = res.payload as { run_id: string; language: string; frames: number; events: number; out: string };
      p.log('');
      p.log(`wpm trace ingest — TraceGraph projection`);
      p.log(`  Language:  ${d.language}`);
      p.log(`  Frames:    ${d.frames}`);
      p.log(`  Events:    ${d.events}`);
      p.log(`  Output:    ${d.out}`);
      if (verbose && outPath && existsSync(outPath)) {
        p.log('  TraceGraph written to: ' + outPath);
      } else if (!outPath) {
        p.log(''); p.log(graphJson);
      }
    });

    return exitWithFlush(EXIT_CODES.success);
  },
});

// ── ocel subcommand ───────────────────────────────────────────────────────────

const ocel = defineCommand({
  meta: { name: 'ocel', description: 'Project TraceGraph JSON-LD to OCEL object-centric event log' },
  args: {
    input: { type: 'string', alias: 'i', description: 'TraceGraph JSON-LD file (default: stdin)' },
    out: { type: 'string', alias: 'o', description: 'Output OCEL JSON file (default: stdout)' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    let text: string;
    const inputPath = ctx.args.input as string | undefined;
    if (inputPath) {
      if (!existsSync(inputPath)) {
        const r = makeErrorResult('trace ocel', `Input file not found: ${inputPath}`, EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(r, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }
      text = readFileSync(inputPath, 'utf8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      text = Buffer.concat(chunks).toString('utf8');
    }

    let graph: TraceGraph;
    try { graph = JSON.parse(text) as TraceGraph; }
    catch {
      const r = makeErrorResult('trace ocel', 'Invalid TraceGraph JSON', EXIT_CODES.source_error, 'PARSE_ERROR');
      emitResult(r, { format, verbose, quiet });
      return exitWithFlush(EXIT_CODES.source_error);
    }

    const log = traceGraphToOcel(graph);
    const logJson = JSON.stringify(log, null, 2);

    const outPath = ctx.args.out as string | undefined;
    if (outPath) {
      writeFileSync(outPath, logJson, 'utf8');
    } else if (format === 'json') {
      process.stdout.write(logJson + '\n');
      return exitWithFlush(EXIT_CODES.success);
    }

    const result = makeResult('trace ocel', {
      events: log.ocel_events.length,
      objects: log.ocel_objects.length,
      activities: [...new Set(log.ocel_events.map((e) => e.activity))],
      out: outPath ?? 'stdout',
    }, performance.now() - t0, EXIT_CODES.success);

    emitResult(result, { format, verbose, quiet }, (res, p) => {
      const d = res.payload as { events: number; objects: number; activities: string[]; out: string };
      p.log('');
      p.log('wpm trace ocel — OCEL projection');
      p.log(`  Events:     ${d.events}`);
      p.log(`  Objects:    ${d.objects}`);
      p.log(`  Activities: ${d.activities.slice(0, 5).join(', ')}${d.activities.length > 5 ? ` +${d.activities.length - 5} more` : ''}`);
      p.log(`  Output:     ${d.out}`);
      if (!outPath) { p.log(''); p.log(logJson); }
    });

    return exitWithFlush(EXIT_CODES.success);
  },
});

// ── powl subcommand ───────────────────────────────────────────────────────────

const powlRoute = defineCommand({
  meta: { name: 'powl', description: 'Derive observed POWL route from OCEL event log' },
  args: {
    input: { type: 'string', alias: 'i', description: 'OCEL JSON file (default: stdin)' },
    out: { type: 'string', alias: 'o', description: 'Output observed route JSON (default: stdout)' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    let text: string;
    const inputPath = ctx.args.input as string | undefined;
    if (inputPath) {
      if (!existsSync(inputPath)) {
        const r = makeErrorResult('trace powl', `Input file not found: ${inputPath}`, EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(r, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }
      text = readFileSync(inputPath, 'utf8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      text = Buffer.concat(chunks).toString('utf8');
    }

    let log: OcelLog;
    try { log = JSON.parse(text) as OcelLog; }
    catch {
      const r = makeErrorResult('trace powl', 'Invalid OCEL JSON', EXIT_CODES.source_error, 'PARSE_ERROR');
      emitResult(r, { format, verbose, quiet });
      return exitWithFlush(EXIT_CODES.source_error);
    }

    const observed = ocelToObservedRoute(log);
    const uniqueActivities = [...new Set(observed)];

    // Build a simple DFG from the observed sequence
    const dfg: Record<string, Record<string, number>> = {};
    for (let i = 0; i < observed.length - 1; i++) {
      const a = observed[i]!;
      const b = observed[i + 1]!;
      if (!dfg[a]) dfg[a] = {};
      dfg[a]![b] = (dfg[a]![b] ?? 0) + 1;
    }

    const observedRoute = {
      observed_activities: observed,
      unique_activities: uniqueActivities,
      activity_count: observed.length,
      dfg,
    };

    const outPath = ctx.args.out as string | undefined;
    const outJson = JSON.stringify(observedRoute, null, 2);
    if (outPath) writeFileSync(outPath, outJson, 'utf8');
    else if (format === 'json') process.stdout.write(outJson + '\n');

    const result = makeResult('trace powl', {
      ...observedRoute,
      out: outPath ?? 'stdout',
    }, performance.now() - t0, EXIT_CODES.success);

    emitResult(result, { format, verbose, quiet }, (res, p) => {
      const d = res.payload as { activity_count: number; unique_activities: string[]; out: string };
      p.log('');
      p.log('wpm trace powl — Observed POWL route');
      p.log(`  Activities:   ${d.activity_count} total, ${d.unique_activities.length} unique`);
      p.log(`  Route:        ${d.unique_activities.slice(0, 6).join(' → ')}${d.unique_activities.length > 6 ? ' → ...' : ''}`);
      p.log(`  Output:       ${d.out}`);
      if (verbose) {
        p.log('');
        p.log('  All activities:');
        for (const a of d.unique_activities) p.log(`    • ${a}`);
      }
    });

    return exitWithFlush(EXIT_CODES.success);
  },
});

// ── conform subcommand ────────────────────────────────────────────────────────

const conform = defineCommand({
  meta: { name: 'conform', description: 'Check observed POWL route against a declared POWL v2 model' },
  args: {
    input: { type: 'string', alias: 'i', description: 'OCEL JSON file (default: stdin)' },
    model: { type: 'string', alias: 'm', required: true, description: 'POWL v2 model JSON file' },
    out: { type: 'string', alias: 'o', description: 'Output conformance report JSON' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const modelPath = ctx.args.model as string;

    if (!existsSync(modelPath)) {
      const r = makeErrorResult('trace conform', `POWL v2 model not found: ${modelPath}`, EXIT_CODES.source_error, 'MODEL_NOT_FOUND');
      emitResult(r, { format, verbose, quiet });
      return exitWithFlush(EXIT_CODES.source_error);
    }

    let ocelLog: OcelLog;
    const inputPath = ctx.args.input as string | undefined;
    if (inputPath) {
      if (!existsSync(inputPath)) {
        const r = makeErrorResult('trace conform', `Input file not found: ${inputPath}`, EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(r, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }
      try { ocelLog = JSON.parse(readFileSync(inputPath, 'utf8')) as OcelLog; }
      catch {
        const r = makeErrorResult('trace conform', 'Invalid OCEL JSON', EXIT_CODES.source_error, 'PARSE_ERROR');
        emitResult(r, { format, verbose, quiet }); return exitWithFlush(EXIT_CODES.source_error);
      }
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      try { ocelLog = JSON.parse(Buffer.concat(chunks).toString('utf8')) as OcelLog; }
      catch {
        const r = makeErrorResult('trace conform', 'Invalid OCEL JSON from stdin', EXIT_CODES.source_error, 'PARSE_ERROR');
        emitResult(r, { format, verbose, quiet }); return exitWithFlush(EXIT_CODES.source_error);
      }
    }

    let powlModel: Powl2Model;
    try { powlModel = JSON.parse(readFileSync(modelPath, 'utf8')) as Powl2Model; }
    catch {
      const r = makeErrorResult('trace conform', `Invalid POWL v2 model JSON: ${modelPath}`, EXIT_CODES.source_error, 'MODEL_PARSE_ERROR');
      emitResult(r, { format, verbose, quiet }); return exitWithFlush(EXIT_CODES.source_error);
    }

    const observed = ocelToObservedRoute(ocelLog);
    const conformance = checkPowl2Conformance(observed, powlModel);

    const outPath = ctx.args.out as string | undefined;
    if (outPath) {
      const auditDir = resolve(outPath, '..');
      mkdirSync(auditDir, { recursive: true });
      writeFileSync(outPath, JSON.stringify(conformance, null, 2), 'utf8');
    }

    const exitCode = conformance.verdict === 'Accepted' ? EXIT_CODES.success : EXIT_CODES.execution_error;
    const result = makeResult('trace conform', {
      ...conformance,
      observed_count: observed.length,
      out: outPath ?? 'none',
    }, performance.now() - t0, exitCode);

    emitResult(result, { format, verbose, quiet }, (res, p) => {
      const d = res.payload as typeof conformance & { observed_count: number; out: string };
      p.log('');
      p.log(`wpm trace conform — POWL v2 Conformance Check`);
      p.log(`  Route:        ${d.route_id}`);
      p.log(`  Observed:     ${d.observed_count} activities`);
      p.log('─'.repeat(52));
      for (const dim of d.details) {
        const icon = dim.ok ? '✓' : '✗';
        p.log(`  ${icon} ${dim.dimension.padEnd(30)} ${dim.detail}`);
      }
      p.log('─'.repeat(52));
      p.log(`  Fitness:      ${(d.fitness * 100).toFixed(1)}%`);
      p.log(`  Stage cover:  ${(d.required_stage_coverage * 100).toFixed(1)}%`);
      p.log('');
      if (d.verdict === 'Accepted') {
        p.success(`Accepted — route conforms to ${d.route_id}`);
      } else {
        p.error(`AndonPull(${d.andon_reason}) — ${d.route_id}`);
      }
      if (d.out !== 'none') p.log(`  Report:       ${d.out}`);
    });

    return exitWithFlush(exitCode);
  },
});

// ── root trace command ────────────────────────────────────────────────────────

export const trace = defineCommand({
  meta: {
    name: 'trace',
    description: 'Stack trace → TraceGraph → OCEL → POWL v2 conformance pipeline',
  },
  subCommands: { ingest, ocel, powl: powlRoute, conform },
  args: {
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(_ctx) {
    process.stdout.write(`
wpm trace — Trace-to-POWL v2 Conformance Pipeline

Ingest stack traces from Rust or TypeScript, project to object-centric
evidence (OCEL), derive observed POWL routes, and check conformance
against declared POWL v2 models.

Subcommands:
  wpm trace ingest --from rust|typescript [-i trace.txt] [-o graph.json]
      Parse a stack trace into TraceGraph JSON-LD

  wpm trace ocel [-i graph.json] [-o ocel.json]
      Project TraceGraph to OCEL object-centric events

  wpm trace powl [-i ocel.json] [-o route.json]
      Derive observed POWL route from OCEL log

  wpm trace conform -m model.powl.json [-i ocel.json] [-o report.json]
      Check observed route against a declared POWL v2 model

Pipeline (pipe-friendly):
  cat trace.txt | wpm trace ingest --from rust \\
    | wpm trace ocel \\
    | wpm trace powl \\
    | wpm trace conform -m routes/my-route.powl.json

POWL v2 model format (routes/*.powl.json):
  {
    "route_id": "my-route",
    "type": "powl2",
    "required_stages": ["activity.a", "activity.b"],
    "model": {
      "type": "choice_graph",
      "choice_graph": {
        "nodes": ["▷", "activity.a", "activity.b", "□"],
        "edges": [["▷", "activity.a"], ["activity.a", "activity.b"], ["activity.b", "□"]]
      }
    }
  }

Accepted requires fitness=1.0 and all required_stages present.
NotMeasured dimensions cause AndonPull(TestRouteIncomplete) per MCPP doctrine.
`);
  },
});

// Re-export route directory helpers for use in wpm proof
export function writeRouteModel(routeId: string, model: Powl2Model, projectDir: string): string {
  const routesDir = join(projectDir, 'routes');
  mkdirSync(routesDir, { recursive: true });
  const outPath = join(routesDir, `${routeId}.powl.json`);
  writeFileSync(outPath, JSON.stringify(model, null, 2), 'utf8');
  return outPath;
}

export type { Powl2Model, OcelLog, OcelEvent, TraceGraph, ConformanceResult };
