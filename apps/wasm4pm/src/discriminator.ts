/**
 * Discovery output discriminator.
 *
 * Each WASM discovery algorithm returns a different shape (DFG, Petri net, process
 * tree, declare constraints). This module classifies any discovery output into a
 * well-typed discriminated union, failing loudly via DiscoveryShapeError on inputs
 * that match no known shape.
 *
 * Detection order is specific → general so that ambiguous shapes (e.g. trees that
 * happen to expose `nodes`/`edges` arrays) are not misclassified as DFGs.
 *
 * OTEL: discriminateWithSpan() wraps discriminate() and emits a classification span.
 * Use discriminateWithSpan() at WASM call sites for observability compliance.
 * discriminate() remains a pure synchronous function for unit-testability.
 */

import { randomBytes } from 'node:crypto';
import type { OtelSpan } from '@wasm4pm/cognition';
import { getGlobalSpanSink } from './otel/sink.js';

export type DiscoveryShape =
  | { kind: 'dfg'; nodes: number; edges: number; raw: object }
  | { kind: 'petrinet'; places: number; transitions: number; arcs: number; raw: object }
  | { kind: 'tree'; nodeCount: number; root: string; raw: object }
  | { kind: 'declare'; constraints: number; raw: object };

export class DiscoveryShapeError extends Error {
  constructor(
    public algorithm: string,
    public keys: string[],
    public expected?: string
  ) {
    super(
      `Discovery shape mismatch for ${algorithm}: keys=[${keys.join(',')}]${
        expected ? `, expected ${expected}` : ''
      }`
    );
    this.name = 'DiscoveryShapeError';
  }
}

/**
 * Classify a discovery payload (raw WASM output, possibly a JSON string).
 *
 * Throws DiscoveryShapeError if the payload matches no known discovery shape.
 */
export function discriminate(raw: unknown, algorithmId?: string): DiscoveryShape {
  let obj: Record<string, unknown>;

  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      throw new DiscoveryShapeError(
        algorithmId ?? 'unknown',
        [],
        `parseable JSON (parse error: ${err instanceof Error ? err.message : String(err)})`
      );
    }
  } else if (raw !== null && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else {
    throw new DiscoveryShapeError(
      algorithmId ?? 'unknown',
      [],
      `object or JSON string, got ${typeof raw}`
    );
  }

  // 1. Petri net: places + transitions are arrays. Most specific; checked first
  //    because a Petri net JSON may also expose `nodes`/`edges` for visualisation.
  if (Array.isArray(obj['places']) && Array.isArray(obj['transitions'])) {
    const places = (obj['places'] as unknown[]).length;
    const transitions = (obj['transitions'] as unknown[]).length;
    const arcs = Array.isArray(obj['arcs']) ? (obj['arcs'] as unknown[]).length : 0;
    return { kind: 'petrinet', places, transitions, arcs, raw: obj };
  }

  // 2. Process tree (inductive miner): nested `root` object + numeric `nodes` count.
  //    Must be checked before the DFG branch because `nodes` is also a DFG field —
  //    but here `nodes` is a number, in DFG it is an array.
  if (
    obj['root'] !== null &&
    typeof obj['root'] === 'object' &&
    typeof obj['nodes'] === 'number'
  ) {
    const root = obj['root'] as Record<string, unknown>;
    const rootType = typeof root['type'] === 'string' ? (root['type'] as string) : 'unknown';
    return {
      kind: 'tree',
      nodeCount: obj['nodes'] as number,
      root: rootType,
      raw: obj,
    };
  }

  // 3. Declare model: constraints array.
  if (Array.isArray(obj['constraints'])) {
    return {
      kind: 'declare',
      constraints: (obj['constraints'] as unknown[]).length,
      raw: obj,
    };
  }

  // 4. DFG / social-network: parallel nodes + edges arrays.
  if (Array.isArray(obj['nodes']) && Array.isArray(obj['edges'])) {
    return {
      kind: 'dfg',
      nodes: (obj['nodes'] as unknown[]).length,
      edges: (obj['edges'] as unknown[]).length,
      raw: obj,
    };
  }

  // 5. Handle-based DFG (heuristic miner et al.): model lives in WASM memory;
  //    only metadata is exposed: { nodes: number, edges: number, handle: string }.
  //    The counts are authoritative even though the full graph is opaque.
  //    Guard: must NOT have numeric places/transitions — those indicate a handle-based
  //    Petri net (case 6) that happens to also report graph-level counts. Without this
  //    guard, any payload with {handle, nodes, edges, places, transitions} would be
  //    misclassified as a DFG because case 5 is evaluated before case 6.
  if (
    typeof obj['nodes'] === 'number' &&
    typeof obj['edges'] === 'number' &&
    typeof obj['handle'] === 'string' &&
    typeof obj['places'] !== 'number' &&
    typeof obj['transitions'] !== 'number'
  ) {
    return {
      kind: 'dfg',
      nodes: obj['nodes'] as number,
      edges: obj['edges'] as number,
      raw: obj,
    };
  }

  // 6. Handle-based Petri net (alpha_plus_plus, hill_climbing et al.): model lives in
  //    WASM memory; only summary counts are exposed:
  //    { handle: string, places: number, transitions: number, arcs: number }.
  //    This is the Petri net equivalent of case 5 (handle-based DFG).
  if (
    typeof obj['handle'] === 'string' &&
    typeof obj['places'] === 'number' &&
    typeof obj['transitions'] === 'number'
  ) {
    const arcs = typeof obj['arcs'] === 'number' ? (obj['arcs'] as number) : 0;
    return {
      kind: 'petrinet',
      places: obj['places'] as number,
      transitions: obj['transitions'] as number,
      arcs,
      raw: obj,
    };
  }

  // 7. Handle-only DFG (simd_streaming_dfg): the WASM kernel stores the full DFG
  //    in WASM memory and returns only the opaque handle string with no metadata
  //    counts. This occurs when discover_dfg_simd_handle() is used — the model is
  //    valid but all structural counts are unknown at the JS boundary.
  //    Classify as DFG with nodes=0/edges=0 (unknown, not empty).
  if (typeof obj['handle'] === 'string' && Object.keys(obj).length === 1) {
    return {
      kind: 'dfg',
      nodes: 0,
      edges: 0,
      raw: obj,
    };
  }

  throw new DiscoveryShapeError(algorithmId ?? 'unknown', Object.keys(obj));
}

/**
 * Project a typed shape into a uniform { nodes, edges } summary suitable for
 * comparison tables and ASCII charts.
 */
export function toUniformStats(shape: DiscoveryShape): { nodes: number; edges: number } {
  switch (shape.kind) {
    case 'dfg':
      return { nodes: shape.nodes, edges: shape.edges };
    case 'petrinet':
      return { nodes: shape.places + shape.transitions, edges: shape.arcs };
    case 'tree':
      return { nodes: shape.nodeCount, edges: 0 };
    case 'declare':
      return { nodes: 0, edges: shape.constraints };
  }
}

/**
 * Classify a discovery payload and emit an OTEL classification span.
 *
 * Wraps discriminate() with a non-blocking span that records:
 * - service.name = 'wasm4pm'
 * - status = 'ok' (classified) or 'error' (DiscoveryShapeError)
 * - discriminator.algorithm, discriminator.kind, discriminator.keys_on_error
 *
 * Use this at WASM call sites for 100% observability compliance per chicago-tdd.md.
 * The returned DiscoveryShape is identical to discriminate(raw, algorithmId).
 */
export function discriminateWithSpan(raw: unknown, algorithmId?: string): DiscoveryShape {
  const sinkFn = getGlobalSpanSink();

  const startNs = Date.now() * 1_000_000;
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;
  let shape: DiscoveryShape | undefined;

  try {
    shape = discriminate(raw, algorithmId);
    return shape;
  } catch (e) {
    status = 'ERROR';
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    try {
      const span: OtelSpan = {
        trace_id: randomBytes(16).toString('hex'),
        span_id: randomBytes(8).toString('hex'),
        name: 'wasm4pm.discriminator.classify',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status:
          errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
        attributes: {
          'service.name': 'wasm4pm',
          'discriminator.algorithm': algorithmId ?? 'unknown',
          'discriminator.kind': shape?.kind ?? 'error',
          ...(errMsg !== undefined
            ? {
                'discriminator.keys_on_error':
                  raw !== null && typeof raw === 'object'
                    ? Object.keys(raw as object).join(',')
                    : '',
              }
            : {}),
        },
      };
      sinkFn(span);
    } catch {
      /* never block on OTEL */
    }
  }
}
