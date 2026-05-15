import { defineCommand } from 'citty';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

// ── shared types ──────────────────────────────────────────────────────────────

type TraceLanguage = 'rust' | 'typescript' | 'python' | 'java' | 'js' | 'unknown';

interface TraceFrame {
  index: number;
  function: string;
  file?: string;
  line?: number;
  col?: number;
  language: TraceLanguage;
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

interface ObjectTypeDeclaration {
  created_by: string[];       // activities that create objects of this type
  terminated_by?: string[];   // activities that terminate objects of this type
  schema?: string;            // path to JSON Schema file (relative to projectDir)
  min_count?: number;         // minimum distinct instances required
  max_count?: number;         // maximum distinct instances allowed
}

interface Powl2Model {
  route_id: string;
  type: 'powl2';
  required_stages?: string[];
  object_types?: Record<string, ObjectTypeDeclaration>;
  receipt_required?: boolean;
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

function frameToActivity(fn: string, lang: TraceLanguage): string {
  if (lang === 'rust') {
    // myapp::module::fn_name → myapp.module.fn_name
    return fn.replace(/::/g, '.').replace(/[^a-zA-Z0-9._<>]/g, '_');
  }
  if (lang === 'java') {
    // pkg.Class.method → keep dot form
    return fn.replace(/[^a-zA-Z0-9._<>$]/g, '_');
  }
  if (lang === 'python') {
    // module.submodule.fn already canonical; <module> sentinel preserved
    return fn.replace(/[^a-zA-Z0-9._<>]/g, '_');
  }
  if (lang === 'js') {
    // anonymous lambdas → anonymous; keep dot form for member access
    if (!fn || fn === '<anonymous>') return 'anonymous';
    return fn.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._<>]/g, '_');
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

function parsePythonTrace(text: string): TraceFrame[] {
  // CPython format:
  //   File "/path/to/file.py", line 42, in function_name
  //     some_source_line
  // Exception summary line: TypeError: ...
  const frames: TraceFrame[] = [];
  const lines = text.split('\n');
  let index = 0;
  for (const line of lines) {
    const m = line.match(/^\s*File "([^"]+)", line (\d+), in (\S+)/);
    if (m) {
      frames.push({
        index: index++,
        function: m[3] ?? 'unknown',
        file: m[1],
        line: parseInt(m[2] ?? '0', 10),
        language: 'python',
      });
    }
  }
  return frames;
}

function parseJavaTrace(text: string): TraceFrame[] {
  // JVM format:
  //   at package.Class.method(File.java:42)
  //   at package.Class.method(Native Method)
  // Causes follow "Caused by:" lines — we preserve those frames with rising index.
  const frames: TraceFrame[] = [];
  const lines = text.split('\n');
  let index = 0;
  for (const line of lines) {
    const m = line.match(/^\s*at\s+([\w$.<>]+)\(([^):]+)(?::(\d+))?\)/);
    if (m) {
      const lineNum = m[3] ? parseInt(m[3], 10) : undefined;
      frames.push({
        index: index++,
        function: m[1] ?? 'unknown',
        file: m[2],
        ...(lineNum !== undefined && { line: lineNum }),
        language: 'java',
      });
    }
  }
  return frames;
}

function parseJsTrace(text: string): TraceFrame[] {
  // Three flavors:
  //   V8:           "    at func (file.js:1:2)"  or  "    at file.js:1:2"
  //   SpiderMonkey: "func@file.js:1:2"
  //   JSC:          "func@file.js:1:2"  or  "global code@file.js:1:2"
  const frames: TraceFrame[] = [];
  const lines = text.split('\n');
  let index = 0;
  for (const line of lines) {
    // V8 with function name
    const v8WithFn = line.match(/^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    // V8 without function name
    const v8Bare = line.match(/^\s*at\s+(.+):(\d+):(\d+)$/);
    // SpiderMonkey / JSC: func@file:line:col
    const smJsc = line.match(/^(.*?)@(.+):(\d+)(?::(\d+))?$/);
    if (v8WithFn) {
      frames.push({
        index: index++,
        function: v8WithFn[1]?.trim() ?? 'anonymous',
        file: v8WithFn[2],
        line: parseInt(v8WithFn[3] ?? '0', 10),
        col: parseInt(v8WithFn[4] ?? '0', 10),
        language: 'js',
      });
    } else if (v8Bare) {
      frames.push({
        index: index++,
        function: 'anonymous',
        file: v8Bare[1],
        line: parseInt(v8Bare[2] ?? '0', 10),
        col: parseInt(v8Bare[3] ?? '0', 10),
        language: 'js',
      });
    } else if (smJsc && !line.trim().startsWith('at ')) {
      // Only match SpiderMonkey/JSC if not a V8 line we already missed
      frames.push({
        index: index++,
        function: smJsc[1]?.trim() || 'anonymous',
        file: smJsc[2],
        line: parseInt(smJsc[3] ?? '0', 10),
        ...(smJsc[4] && { col: parseInt(smJsc[4], 10) }),
        language: 'js',
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

// ── POWL v2 conformance helpers ───────────────────────────────────────────────

function measureObjectLifecycle(
  ocel: OcelLog,
  objectTypes: Record<string, ObjectTypeDeclaration>,
): { valid: boolean; coverage: number; violations: string[] } {
  const violations: string[] = [];
  const eventsByActivity = ocel.ocel_events;

  for (const [typeName, typeDecl] of Object.entries(objectTypes)) {
    const objectsOfType = ocel.ocel_objects.filter((o) => o.type === typeName).map((o) => o.id);
    for (const objId of objectsOfType) {
      // Find events involving this object, in order
      const objEvents = eventsByActivity.filter((e) => e.objects.some((o) => o.id === objId));
      if (objEvents.length === 0) continue;
      const firstActivity = objEvents[0]!.activity;
      if (!typeDecl.created_by.includes(firstActivity)) {
        violations.push(`${typeName}:${objId} first seen in "${firstActivity}" (not a create activity: [${typeDecl.created_by.join(', ')}])`);
      }
    }
  }

  const valid = violations.length === 0;
  return { valid, coverage: valid ? 1.0 : 0.0, violations };
}

function measureReceiptCoverage(ocel: OcelLog): { coverage: number; activities_with_receipts: number; total_activities: number } {
  const activitiesWithReceipts = new Set<string>();
  for (const ev of ocel.ocel_events) {
    if (ev.objects.some((o) => o.type === 'Receipt' || o.type.toLowerCase().includes('receipt'))) {
      activitiesWithReceipts.add(ev.activity);
    }
  }
  const uniqueActivities = new Set(ocel.ocel_events.map((e) => e.activity));
  const coverage = uniqueActivities.size > 0 ? activitiesWithReceipts.size / uniqueActivities.size : 0;
  return { coverage, activities_with_receipts: activitiesWithReceipts.size, total_activities: uniqueActivities.size };
}

function checkPartialOrderConstraints(
  observed: string[],
  constraints: [string, string][],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const positions = new Map<string, number[]>();
  observed.forEach((a, i) => { if (!positions.has(a)) positions.set(a, []); positions.get(a)!.push(i); });

  for (const [before, after] of constraints) {
    const bPos = positions.get(before);
    const aPos = positions.get(after);
    if (bPos && aPos) {
      const minBefore = Math.min(...bPos);
      const minAfter = Math.min(...aPos);
      if (minBefore >= minAfter) {
        violations.push(`"${after}" (pos ${minAfter}) precedes "${before}" (pos ${minBefore}) — order constraint violated`);
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

function checkChoiceGraphEdges(
  observed: string[],
  edges: [string, string][],
): { valid: boolean; invalid_transitions: string[] } {
  const edgeSet = new Set(edges.map(([a, b]) => `${a}→${b}`));
  const invalid: string[] = [];
  // Build adjacency for checking — start node is implicitly '▷' → first activity
  if (observed.length > 0) {
    const firstEdge = `▷→${observed[0]}`;
    if (!edgeSet.has(firstEdge)) invalid.push(`▷→${observed[0]} (no edge from start)`);
  }
  for (let i = 0; i < observed.length - 1; i++) {
    const transition = `${observed[i]}→${observed[i + 1]}`;
    if (!edgeSet.has(transition)) {
      invalid.push(`${transition} (not a declared edge)`);
    }
  }
  return { valid: invalid.length === 0, invalid_transitions: invalid };
}

// ── POWL v2 conformance ───────────────────────────────────────────────────────

export function checkPowl2Conformance(ocel: OcelLog, model: Powl2Model): ConformanceResult {
  const details: ConformanceResult['details'] = [];
  const m = model.model;
  const observed = ocelToObservedRoute(ocel);

  // ── Object evidence check: activity-only fake route ─────────────────────────
  const eventsWithObjects = ocel.ocel_events.filter((e) => e.objects.length > 0);
  const objectEvidencePresent = eventsWithObjects.length > 0;
  details.push({
    dimension: 'object_evidence_present',
    ok: objectEvidencePresent,
    detail: objectEvidencePresent
      ? `${eventsWithObjects.length}/${ocel.ocel_events.length} events have object evidence`
      : 'all events have zero objects — activity-only fake route detected',
  });

  // ── Build admissible activities + valid paths ────────────────────────────────
  let admissibleActivities: Set<string>;
  let validPaths: string[][] = [];
  let choiceEdges: [string, string][] = [];

  if (m.choice_graph) {
    const { nodes, edges } = m.choice_graph;
    choiceEdges = edges;
    admissibleActivities = new Set(nodes.filter((n) => n !== '▷' && n !== '□'));
    const adj = new Map<string, string[]>();
    for (const [from, to] of edges) { if (!adj.has(from)) adj.set(from, []); adj.get(from)!.push(to); }
    const findPaths = (current: string, path: string[], depth: number): void => {
      if (depth > nodes.length + 2) return;
      if (current === '□') { validPaths.push([...path]); return; }
      for (const next of (adj.get(current) ?? [])) findPaths(next, next !== '□' ? [...path, next] : path, depth + 1);
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

  // ── Fitness ──────────────────────────────────────────────────────────────────
  const observedSet = new Set(observed);
  const inModel = observed.filter((a) => admissibleActivities.has(a)).length;
  const fitness = observed.length > 0 ? inModel / observed.length : 0;
  details.push({
    dimension: 'fitness',
    ok: fitness >= 1.0,
    detail: `${inModel}/${observed.length} observed activities in model (${(fitness * 100).toFixed(1)}%)`,
  });

  // ── Precision ────────────────────────────────────────────────────────────────
  const modelActivitiesInObserved = [...admissibleActivities].filter((a) => observedSet.has(a)).length;
  const precision = admissibleActivities.size > 0 ? modelActivitiesInObserved / admissibleActivities.size : 1.0;
  details.push({
    dimension: 'precision',
    ok: precision <= 1.0,
    detail: `${modelActivitiesInObserved}/${admissibleActivities.size} model activities observed (${(precision * 100).toFixed(1)}%)`,
  });

  // ── Required stage coverage ──────────────────────────────────────────────────
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

  // ── Route sequence + choice graph edge validity ───────────────────────────
  let routeValid = false;
  if (validPaths.length === 0) {
    routeValid = fitness === 1.0;
  } else {
    for (const path of validPaths) {
      let pi = 0;
      for (const act of observed) { if (pi < path.length && path[pi] === act) pi++; }
      if (pi === path.length) { routeValid = true; break; }
    }
  }
  details.push({
    dimension: 'route_sequence_valid',
    ok: routeValid || validPaths.length === 0,
    detail: routeValid
      ? 'observed sequence matches a valid route path'
      : validPaths.length === 0
        ? 'no complete route paths in model (use required_stages)'
        : `sequence does not match any of ${validPaths.length} valid path(s)`,
  });

  // Edge-level choice graph validation
  if (choiceEdges.length > 0) {
    const edgeCheck = checkChoiceGraphEdges(observed, choiceEdges);
    details.push({
      dimension: 'choice_graph_edges_valid',
      ok: edgeCheck.valid,
      detail: edgeCheck.valid
        ? 'all observed transitions follow declared edges'
        : `invalid transitions: ${edgeCheck.invalid_transitions.slice(0, 3).join('; ')}`,
    });
  }

  // Partial-order constraint check
  if (m.partial_order?.order) {
    const poCheck = checkPartialOrderConstraints(observed, m.partial_order.order);
    details.push({
      dimension: 'partial_order_constraints',
      ok: poCheck.valid,
      detail: poCheck.valid
        ? 'all ordering constraints satisfied'
        : `violations: ${poCheck.violations.slice(0, 3).join('; ')}`,
    });
  }

  // ── Object lifecycle validity ────────────────────────────────────────────────
  let objectLifecycleValidity: number;
  let objectLifecycleOk: boolean;
  if (model.object_types && Object.keys(model.object_types).length > 0) {
    const lcResult = measureObjectLifecycle(ocel, model.object_types);
    objectLifecycleValidity = lcResult.coverage;
    objectLifecycleOk = lcResult.valid;
    details.push({
      dimension: 'object_lifecycle_validity',
      ok: lcResult.valid,
      detail: lcResult.valid
        ? `all declared object types follow lifecycle constraints`
        : `violations: ${lcResult.violations.slice(0, 3).join('; ')}`,
    });
  } else {
    objectLifecycleValidity = -1; // sentinel: NotMeasured
    objectLifecycleOk = false;
    details.push({
      dimension: 'object_lifecycle_validity',
      ok: false,
      detail: 'NotMeasured — add object_types to POWL model to enable',
    });
  }

  // ── Receipt coverage ─────────────────────────────────────────────────────────
  let receiptCoverage: number;
  let receiptOk: boolean;
  if (model.receipt_required === true) {
    const rcResult = measureReceiptCoverage(ocel);
    receiptCoverage = rcResult.coverage;
    receiptOk = rcResult.coverage >= 1.0;
    details.push({
      dimension: 'receipt_coverage',
      ok: receiptOk,
      detail: receiptOk
        ? `all ${rcResult.total_activities} activities have receipts`
        : `${rcResult.activities_with_receipts}/${rcResult.total_activities} activities have receipts`,
    });
  } else {
    receiptCoverage = -1; // sentinel: NotMeasured
    receiptOk = false;
    details.push({
      dimension: 'receipt_coverage',
      ok: false,
      detail: 'NotMeasured — add receipt_required: true to POWL model to enable',
    });
  }

  // ── Verdict ───────────────────────────────────────────────────────────────────
  const fitnessOk = fitness >= 1.0;
  const stagesOk = missingStages.length === 0;
  const seqOk = routeValid || validPaths.length === 0;
  const edgesOk = choiceEdges.length === 0 ||
    details.find((d) => d.dimension === 'choice_graph_edges_valid')?.ok !== false;
  const poOk = !m.partial_order?.order ||
    details.find((d) => d.dimension === 'partial_order_constraints')?.ok !== false;
  const objEvOk = objectEvidencePresent;

  const notMeasured = objectLifecycleValidity === -1 || receiptCoverage === -1;

  let verdict: 'Accepted' | 'AndonPull' = 'AndonPull';
  let andonReason: string | undefined;

  if (!objEvOk) {
    andonReason = 'ActivityOnlyFakeRoute';
  } else if (!fitnessOk) {
    andonReason = 'RouteConformanceGap';
  } else if (!stagesOk) {
    andonReason = 'MissingRequiredStages';
  } else if (!seqOk || !edgesOk) {
    andonReason = 'RouteSequenceMismatch';
  } else if (!poOk) {
    andonReason = 'PartialOrderViolation';
  } else if (objectLifecycleValidity !== -1 && !objectLifecycleOk) {
    andonReason = 'ObjectLifecycleViolation';
  } else if (receiptCoverage !== -1 && !receiptOk) {
    andonReason = 'InsufficientReceiptCoverage';
  } else if (notMeasured) {
    andonReason = 'TestRouteIncomplete';
  } else {
    verdict = 'Accepted';
  }

  return {
    route_id: model.route_id,
    fitness,
    precision,
    required_stage_coverage: stageCoverage,
    receipt_coverage: receiptCoverage === -1 ? 0 : receiptCoverage,
    object_lifecycle_validity: objectLifecycleValidity === -1 ? 0 : objectLifecycleValidity,
    verdict,
    andon_reason: andonReason,
    details,
  };
}

// ── ingest subcommand ─────────────────────────────────────────────────────────

const ingest = defineCommand({
  meta: { name: 'ingest', description: 'Parse a stack trace into TraceGraph JSON-LD' },
  args: {
    from: { type: 'string', default: 'typescript', description: 'Language: rust | typescript | python | java | js' },
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

    let frames: TraceFrame[];
    switch (lang) {
      case 'rust':       frames = parseRustTrace(text); break;
      case 'typescript': frames = parseTypeScriptTrace(text); break;
      case 'python':     frames = parsePythonTrace(text); break;
      case 'java':       frames = parseJavaTrace(text); break;
      case 'js':         frames = parseJsTrace(text); break;
      default: {
        const r = makeErrorResult(
          'trace ingest',
          `Unknown language '${lang}'. Accepted: rust, typescript, python, java, js`,
          EXIT_CODES.config_error,
          'INVALID_LANGUAGE',
        );
        emitResult(r, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.config_error);
      }
    }
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

    const conformance = checkPowl2Conformance(ocelLog, powlModel);

    const outPath = ctx.args.out as string | undefined;
    if (outPath) {
      const auditDir = resolve(outPath, '..');
      mkdirSync(auditDir, { recursive: true });
      writeFileSync(outPath, JSON.stringify(conformance, null, 2), 'utf8');
    }

    const exitCode = conformance.verdict === 'Accepted' ? EXIT_CODES.success : EXIT_CODES.execution_error;
    const result = makeResult('trace conform', {
      ...conformance,
      observed_count: ocelLog.ocel_events.length,
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
