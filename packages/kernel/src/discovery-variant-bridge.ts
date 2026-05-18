/**
 * discovery-variant-bridge.ts
 *
 * TypeScript bridge mapping wasm4pm POWL DiscoveryVariant metadata to
 * mcpp-compatible algorithm selection requests.
 *
 * Source of truth for variant names:
 *   wasm4pm/wasm4pm/src/powl/discovery/mod.rs — DiscoveryVariant enum + CutFilter::for_variant
 *
 * The 8 variants correspond 1-to-1 with the Rust enum (snake_case string values
 * match DiscoveryVariant::as_str() output and are used as mcpp part_name identifiers).
 *
 * NOTE: The W4-8 research notes listed different names (DecisionGraphCyclic →
 * Maximal → BruteForce → EpsilonStar → BestOfK → Adaptive → WeightedBest →
 * Ensemble). Those names do NOT exist in the codebase. The real enum variants
 * are documented below.
 */

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

/**
 * POWL discovery algorithm variants, mirroring the Rust enum at
 * `wasm4pm/wasm4pm/src/powl/discovery/mod.rs`.
 *
 * String values match `DiscoveryVariant::as_str()` exactly and are used as
 * mcpp `part_name` identifiers.
 */
export enum DiscoveryVariant {
  /** Default. XOR → Sequence → Concurrency → Loop + decision-graph fall-through. */
  DecisionGraphCyclic = 'decision_graph_cyclic',

  /** Same as DecisionGraphCyclic but with strict validation enabled. */
  DecisionGraphCyclicStrict = 'decision_graph_cyclic_strict',

  /** XOR → Sequence → Concurrency → Loop → MaximalPO + decision-graph fall-through. */
  DecisionGraphMax = 'decision_graph_max',

  /** Sequence → XOR → Loop → DynamicClusteringPO + decision-graph fall-through. */
  DecisionGraphClustering = 'decision_graph_clustering',

  /** XOR → Loop → DynamicClusteringPO (no standard concurrency, no decision-graph fall-through). */
  DynamicClustering = 'dynamic_clustering',

  /** XOR → Sequence → Concurrency → Loop → MaximalPO (no decision-graph fall-through). */
  Maximal = 'maximal',

  /** XOR → Sequence only (no concurrency, no loop, no partial order). Fastest, lowest quality. */
  Tree = 'tree',

  /** XOR → Sequence → Concurrency → Loop → BruteForcePO. Highest quality, most expensive. */
  BruteForce = 'brute_force',
}

// ---------------------------------------------------------------------------
// Cost ordering (cheapest → most expensive)
// Derived from CutFilter::for_variant cut_order length + partial-order search cost.
//
// Rationale:
//   Tree:                     2 cuts, no DG, no PO search          → cheapest
//   DecisionGraphCyclic:      4 cuts, DG fall-through, no PO       → fast default
//   DecisionGraphCyclicStrict: same as Cyclic + strict overhead     → slightly slower
//   DynamicClustering:        3 cuts, DynamicClusteringPO, no DG   → moderate
//   DecisionGraphClustering:  4 cuts, DynamicClusteringPO + DG     → moderate+
//   Maximal:                  5 cuts, MaximalPO, no DG             → slower
//   DecisionGraphMax:         5 cuts, MaximalPO + DG               → slower+
//   BruteForce:               5 cuts, BruteForcePO (exponential PO)→ most expensive
// ---------------------------------------------------------------------------

/**
 * All 8 variants ordered from cheapest (least compute) to most expensive.
 * Use this for progressive escalation strategies.
 */
export const VARIANT_COST_ORDER: DiscoveryVariant[] = [
  DiscoveryVariant.Tree,
  DiscoveryVariant.DecisionGraphCyclic,
  DiscoveryVariant.DecisionGraphCyclicStrict,
  DiscoveryVariant.DynamicClustering,
  DiscoveryVariant.DecisionGraphClustering,
  DiscoveryVariant.Maximal,
  DiscoveryVariant.DecisionGraphMax,
  DiscoveryVariant.BruteForce,
];

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Per-variant metadata for algorithm selection decisions.
 */
export interface VariantMetadata {
  /** Stable string identifier — matches Rust DiscoveryVariant::as_str() and mcpp part_name. */
  id: string;

  /**
   * Cost multiplier relative to DecisionGraphCyclic (= 1.0).
   * Used for budget-aware variant selection.
   */
  estimatedCostMultiplier: number;

  /**
   * Whether this variant can produce incremental/streaming partial results.
   * Only Tree and DecisionGraphCyclic are safe for streaming pipelines
   * (no expensive partial-order search that would block result emission).
   */
  supportsStreaming: boolean;
}

const VARIANT_METADATA_MAP: Record<DiscoveryVariant, VariantMetadata> = {
  [DiscoveryVariant.Tree]: {
    id: 'tree',
    estimatedCostMultiplier: 0.3,
    supportsStreaming: true,
  },
  [DiscoveryVariant.DecisionGraphCyclic]: {
    id: 'decision_graph_cyclic',
    estimatedCostMultiplier: 1.0,
    supportsStreaming: true,
  },
  [DiscoveryVariant.DecisionGraphCyclicStrict]: {
    id: 'decision_graph_cyclic_strict',
    estimatedCostMultiplier: 1.2,
    supportsStreaming: false,
  },
  [DiscoveryVariant.DynamicClustering]: {
    id: 'dynamic_clustering',
    estimatedCostMultiplier: 1.5,
    supportsStreaming: false,
  },
  [DiscoveryVariant.DecisionGraphClustering]: {
    id: 'decision_graph_clustering',
    estimatedCostMultiplier: 1.8,
    supportsStreaming: false,
  },
  [DiscoveryVariant.Maximal]: {
    id: 'maximal',
    estimatedCostMultiplier: 2.5,
    supportsStreaming: false,
  },
  [DiscoveryVariant.DecisionGraphMax]: {
    id: 'decision_graph_max',
    estimatedCostMultiplier: 3.0,
    supportsStreaming: false,
  },
  [DiscoveryVariant.BruteForce]: {
    id: 'brute_force',
    estimatedCostMultiplier: 8.0,
    supportsStreaming: false,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a DiscoveryVariant to its mcpp part_name identifier.
 *
 * The returned string is the value used by mcpp-server as `part_name` in
 * OCEL event logs and by mcpp-automl route discovery as the algorithm
 * selection key. Mirrors Rust `DiscoveryVariant::as_str()`.
 *
 * @example
 * variantToMcppAlgorithmId(DiscoveryVariant.BruteForce)
 * // => 'brute_force'
 */
export function variantToMcppAlgorithmId(variant: DiscoveryVariant): string {
  return variant; // enum value IS the snake_case id
}

/**
 * Returns the next variant in cost order, or null if `current` is already
 * the most expensive variant (BruteForce).
 *
 * Use for progressive escalation: start cheap, escalate only when quality
 * is insufficient.
 *
 * @example
 * nextVariant(DiscoveryVariant.DecisionGraphCyclic)
 * // => DiscoveryVariant.DecisionGraphCyclicStrict
 *
 * nextVariant(DiscoveryVariant.BruteForce)
 * // => null
 */
export function nextVariant(current: DiscoveryVariant): DiscoveryVariant | null {
  const idx = VARIANT_COST_ORDER.indexOf(current);
  if (idx === -1 || idx === VARIANT_COST_ORDER.length - 1) {
    return null;
  }
  return VARIANT_COST_ORDER[idx + 1];
}

/**
 * Returns the VariantMetadata for a given DiscoveryVariant.
 *
 * @example
 * variantMetadata(DiscoveryVariant.Maximal)
 * // => { id: 'maximal', estimatedCostMultiplier: 2.5, supportsStreaming: false }
 */
export function variantMetadata(variant: DiscoveryVariant): VariantMetadata {
  return VARIANT_METADATA_MAP[variant];
}

/**
 * Parses a raw string (e.g. from the Rust WASM boundary or JSON) into a
 * DiscoveryVariant. Returns undefined when the string is not a known variant.
 *
 * Mirrors Rust `DiscoveryVariant::from_variant_str`.
 *
 * @example
 * parseDiscoveryVariant('brute_force')
 * // => DiscoveryVariant.BruteForce
 *
 * parseDiscoveryVariant('unknown')
 * // => undefined
 */
export function parseDiscoveryVariant(raw: string): DiscoveryVariant | undefined {
  return Object.values(DiscoveryVariant).includes(raw as DiscoveryVariant)
    ? (raw as DiscoveryVariant)
    : undefined;
}
