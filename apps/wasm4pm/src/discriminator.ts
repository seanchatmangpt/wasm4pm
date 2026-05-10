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
 */

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
  if (
    typeof obj['nodes'] === 'number' &&
    typeof obj['edges'] === 'number' &&
    typeof obj['handle'] === 'string'
  ) {
    return {
      kind: 'dfg',
      nodes: obj['nodes'] as number,
      edges: obj['edges'] as number,
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
