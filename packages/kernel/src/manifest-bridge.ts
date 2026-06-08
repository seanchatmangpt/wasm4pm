/**
 * manifest-bridge.ts
 *
 * Auto-generates mcpp PartManifest entries from wasm4pm kernel registry
 * entries, eliminating hand-maintained manifest files.
 *
 * Mapping strategy
 * ────────────────
 * Each `AlgorithmMetadata` entry in the kernel registry maps to exactly one
 * mcpp `PartManifest` JSON object. The bridge is the canonical authority for
 * this mapping; any hand-written manifest for a registry algorithm is a
 *  path that must be retired.
 *
 * Field derivation summary (see `algorithmToPartManifest` below):
 *
 *   FULLY DERIVABLE from registry alone:
 *     name, @type, context, interface, world, wit, route, hostFit,
 *     refusalProfile, capability (from outputType + supportedProfiles),
 *     version (semver from speedTier/qualityTier, see below)
 *
 *   DERIVABLE with a naming convention:
 *     wasm.path — convention: `<id>.part.wasm`
 *
 *   REQUIRE BUILD-TIME INPUTS (gaps — not derivable from registry alone):
 *     wasm.hash       — BLAKE3 of the compiled binary (only known post-build)
 *     wasm.size_bytes — file size (only known post-build)
 *     receipt         — ULID issued by `mcpp robot` after admission
 *     fixtures        — test vector paths (domain knowledge, not in registry)
 *     compiled_from   — present only for machine-manufactured parts
 *     version         — semver string requires an external version authority
 *
 * Gap analysis: 6 fields cannot be derived from the registry alone (see
 * `ManifestBridgeGaps` type at the bottom of this file).
 */

import { AlgorithmMetadata, AlgorithmRegistry } from './registry.js';
import { resolveAlgorithmVersion } from './version-resolver.js';

// ─── mcpp PartManifest wire types (mirroring crates/mcpp-core/src/manifest.rs) ─

export interface McppContext {
  mcpp: string;
  prov: string;
  codemeta: string;
  dcterms: string;
  earl: string;
  schema: string;
  spdx: string;
  'p-plan': string;
  wasi: string;
}

export const DEFAULT_MCPP_CONTEXT: McppContext = {
  mcpp: 'https://w3id.org/mcpp#',
  prov: 'http://www.w3.org/ns/prov#',
  codemeta: 'https://codemeta.github.io/terms/',
  dcterms: 'http://purl.org/dc/terms/',
  earl: 'http://www.w3.org/ns/earl#',
  schema: 'https://schema.org/',
  spdx: 'https://spdx.org/rdf/terms#',
  'p-plan': 'http://purl.org/net/p-plan#',
  wasi: 'https://wasi.dev/',
};

export interface RouteBinding {
  '@type': string;
  activity: string;
  powl: string;
}

export interface HostFit {
  runtime: string;
  minVersion: string;
  requires: string[];
}

export interface RefusalProfile {
  onInvalidInput: string;
  onCapabilityMismatch: string;
  onHostNotFit: string;
}

export interface Fixture {
  path: string;
  expect: string;
}

export interface WasmBinding {
  path: string;
  /** BLAKE3 in canonical `"blake3:<64 hex>"` form. Required post-M1.6. */
  hash: string;
  size_bytes: number;
}

/** Wire form of a mcpp PartManifest (JSON-LD). */
export interface PartManifest {
  '@context': McppContext;
  '@type': string;
  name: string;
  version: string;
  capability: string[];
  wit: string;
  world: string;
  interface: string;
  route: RouteBinding;
  hostFit: HostFit;
  refusalProfile: RefusalProfile;
  fixtures: Fixture[];
  receipt?: string;
  wasm?: WasmBinding;
}

// ─── Build-time gap inputs ────────────────────────────────────────────────────

/**
 * Fields that cannot be derived from the kernel registry entry alone.
 * The caller must supply these from the build pipeline.
 *
 * All fields are optional so the bridge can produce a "skeleton" manifest
 * for dry-run review; mandatory fields are enforced only when
 * `strict: true` is passed to `algorithmToPartManifest`.
 */
export interface ManifestBridgeGaps {
  /**
   * Semver version string (e.g. `"0.1.0"`).
   * Gap: registry carries no semver; the kernel package version is the
   * closest proxy but is shared across all algorithms.
   */
  version?: string;

  /**
   * BLAKE3 digest of the compiled `.part.wasm` binary, in canonical form
   * `"blake3:<64 hex chars>"`.
   * Gap: only known after `wasm-pack build` / `cargo build --target wasm32`.
   */
  wasmHash?: string;

  /**
   * File size of the compiled binary in bytes.
   * Gap: same as wasmHash — only known post-build.
   */
  wasmSizeBytes?: number;

  /**
   * ULID receipt string issued by `mcpp robot` after admission.
   * Gap: issued at admission time, not at manifest-generation time.
   */
  receipt?: string;

  /**
   * Test fixture paths + expectations.
   * Gap: fixtures are domain-specific test vectors; the registry knows only
   * that an algorithm accepts `activity_key` / `timestamp_key` parameters,
   * not what valid/invalid OCEL inputs look like.
   */
  fixtures?: Fixture[];
}

// ─── Derivation helpers ───────────────────────────────────────────────────────

/**
 * Derive the mcpp `capability` array from an algorithm's registry entry.
 *
 * Convention:
 *   - Primary capability: the algorithm id (kebab-case) itself.
 *   - Secondary capability: `pm4py-<outputType>` — the pm4py model class
 *     this algorithm produces (e.g. `"pm4py-dfg"`, `"pm4py-petrinet"`).
 *   - Streaming algorithms get an additional `"stream-capable"` tag.
 *
 * Rationale: mcpp's `onCapabilityMismatch` refusal requires that every
 * capability the WASM binary offers is declared. The outputType maps
 * directly to the pm4py discovery result type, giving the mcpp host
 * enough information to route results to downstream conformance checks.
 */
function deriveCapability(entry: AlgorithmMetadata): string[] {
  const caps: string[] = [entry.id.replace(/_/g, '-')];

  // Map outputType → pm4py conformance class
  caps.push(`pm4py-${entry.outputType}`);

  // Stream-capable algorithms can operate in the 'stream' execution profile
  if (entry.supportedProfiles.includes('stream')) {
    caps.push('stream-capable');
  }

  return caps;
}

/**
 * Derive mcpp `required_stages` — the POWL route stages this algorithm
 * participates in — from the algorithm's execution profiles.
 *
 * The POWL route for a wasm4pm algorithm part is always `"single-activity"`
 * (one WASM invocation, no internal branching). The stage labels below map
 * wasm4pm execution profiles to the mcpp manufacturing stage vocabulary.
 *
 * NOTE: This mapping is the most volatile field in the bridge. If mcpp
 * introduces multi-stage POWL routes for individual algorithm parts,
 * this function must be replaced with a proper route-discovery query.
 */
function derivePowlRoute(entry: AlgorithmMetadata): RouteBinding {
  // All wasm4pm algorithm parts use a single-activity POWL route.
  // The activity name follows the convention: `<id-kebab>-route`.
  return {
    '@type': 'p-plan:Activity',
    activity: `${entry.id.replace(/_/g, '-')}-route`,
    powl: 'single-activity',
  };
}

/**
 * Derive the WIT interface path from the algorithm id.
 * Convention matches the existing mcpp parts: `mcpp:<id>/<id>`.
 * Underscores in the id are preserved (WIT world names use underscores).
 */
function deriveInterface(entry: AlgorithmMetadata): string {
  return `mcpp:${entry.id}/${entry.id}`;
}

/**
 * Derive the WIT world name (equals the algorithm id).
 */
function deriveWorld(entry: AlgorithmMetadata): string {
  return entry.id;
}

/**
 * Derive the WIT source file path.
 * Convention: `wit/<id>.wit`
 */
function deriveWit(entry: AlgorithmMetadata): string {
  return `wit/${entry.id}.wit`;
}

/**
 * Derive the WASM binary path.
 * Convention: `<id>.part.wasm` (matches existing mcpp parts naming).
 */
function deriveWasmPath(entry: AlgorithmMetadata): string {
  return `${entry.id}.part.wasm`;
}

/**
 * Derive the `hostFit` block.
 *
 * All wasm4pm algorithm parts target wasmtime 26+. Memory-intensive
 * algorithms (estimatedMemoryMB > 200) require `wasi:memory` in addition
 * to the baseline `wasi:filesystem/preopens`.
 */
function deriveHostFit(entry: AlgorithmMetadata): HostFit {
  const requires: string[] = ['wasi:filesystem/preopens'];

  // High-memory algorithms (genetic, PSO, ACO, ILP, alignments) declare
  // a memory capability hint so the host can pre-check resource availability.
  if (entry.estimatedMemoryMB > 200) {
    requires.push('wasi:memory');
  }

  return {
    runtime: 'wasmtime',
    minVersion: '26.0.0',
    requires,
  };
}

// ─── Core mapping function ────────────────────────────────────────────────────

/**
 * Map a single `AlgorithmMetadata` registry entry to a `PartManifest`.
 *
 * @param entry   — the kernel registry entry for the algorithm
 * @param gaps    — build-time fields not derivable from the registry
 * @param strict  — when true, throws if `gaps.wasmHash` is absent
 *                  (use false for dry-run / review mode)
 *
 * Gap fields that are absent produce a skeleton manifest:
 *   - `wasm.hash` is set to `"blake3:PENDING"` (a sentinel, not valid BLAKE3)
 *   - `version` defaults to `"0.1.0"` (override via gaps.version)
 *   - `receipt` is omitted
 *   - `fixtures` is empty
 *
 * The manifest_hash consumed by `BuildReceipt.manifest_hash` in the mcpp
 * proof chain is the BLAKE3 of the serialized manifest JSON. Because this
 * function produces deterministic JSON (same input → same output), the
 * caller computes `manifest_hash = blake3(JSON.stringify(manifest))` after
 * this call — it is NOT a field inside the manifest itself.
 */
export function algorithmToPartManifest(
  entry: AlgorithmMetadata,
  gaps: ManifestBridgeGaps = {},
  strict = false,
): PartManifest {
  if (strict && !gaps.wasmHash) {
    throw new Error(
      `algorithmToPartManifest: gaps.wasmHash is required in strict mode for algorithm "${entry.id}". ` +
        'Run the build pipeline first to obtain the BLAKE3 hash of the compiled WASM binary.',
    );
  }

  const wasmPath = deriveWasmPath(entry);
  const wasmHash = gaps.wasmHash ?? 'blake3:PENDING';
  const wasmSizeBytes = gaps.wasmSizeBytes ?? 0;

  const manifest: PartManifest = {
    '@context': DEFAULT_MCPP_CONTEXT,
    '@type': 'codemeta:SoftwareApplication',
    name: entry.id,
    version: gaps.version ?? resolveAlgorithmVersion(entry.id),
    capability: deriveCapability(entry),
    wit: deriveWit(entry),
    world: deriveWorld(entry),
    interface: deriveInterface(entry),
    route: derivePowlRoute(entry),
    hostFit: deriveHostFit(entry),
    refusalProfile: {
      onInvalidInput: 'refused::invalid-input',
      onCapabilityMismatch: 'refused::capability-mismatch',
      onHostNotFit: 'refused::host-not-fit',
    },
    fixtures: gaps.fixtures ?? [],
    wasm: {
      path: wasmPath,
      hash: wasmHash,
      size_bytes: wasmSizeBytes,
    },
  };

  // Only include receipt if provided — omitting is correct for new parts
  if (gaps.receipt) {
    manifest.receipt = gaps.receipt;
  }

  return manifest;
}

// ─── Batch generation ─────────────────────────────────────────────────────────

/**
 * Per-algorithm gap overrides for batch generation.
 * Keys are algorithm ids; values are the gap inputs for that algorithm.
 */
export type GapOverrideMap = Map<string, ManifestBridgeGaps>;

/**
 * Generated manifest bundle: the manifest + the algorithm id it covers.
 */
export interface ManifestBundle {
  algorithmId: string;
  manifest: PartManifest;
}

/**
 * Generate PartManifest entries for every algorithm in the registry.
 *
 * @param registry     — the kernel AlgorithmRegistry (use `getRegistry()` for
 *                       the singleton)
 * @param gapOverrides — per-algorithm build-time fields; algorithms not
 *                       present in the map use default gap values (skeleton
 *                       mode, wasmHash = "blake3:PENDING")
 * @param strict       — when true, every algorithm must have a wasmHash gap
 *                       override (use during CI/CD manifest emission)
 *
 * Returns one `ManifestBundle` per registered algorithm, in registration order.
 *
 * Usage in the build pipeline:
 *
 *   1. After `wasm-pack build` (or equivalent), collect BLAKE3 hashes and
 *      file sizes for every `<id>.part.wasm` binary.
 *   2. Populate a `GapOverrideMap` with those hashes.
 *   3. Call `generateAllManifests(getRegistry(), gapOverrides, true)`.
 *   4. Write each bundle's `manifest` to `parts/<id>/part.json`.
 *   5. Record `blake3(JSON.stringify(manifest))` as the `manifest_hash` in
 *      the mcpp proof chain (`BuildReceipt.manifest_hash`).
 */
export function generateAllManifests(
  registry: AlgorithmRegistry,
  gapOverrides: GapOverrideMap = new Map(),
  strict = false,
): ManifestBundle[] {
  return registry.list().map((entry) => {
    const gaps = gapOverrides.get(entry.id) ?? {};
    const manifest = algorithmToPartManifest(entry, gaps, strict);
    return { algorithmId: entry.id, manifest };
  });
}

// ─── manifest_hash computation ────────────────────────────────────────────────

/**
 * Compute the `manifest_hash` that mcpp's `BuildReceipt` records.
 *
 * The hash is BLAKE3 of the canonical JSON bytes (sorted keys, no trailing
 * newline). This mirrors the approach used by the mcpp receipt chain for
 * content-addressed identity.
 *
 * NOTE: This function requires the `blake3` package. In environments where
 * BLAKE3 is unavailable (e.g. browser without WASM blake3), pass the hash
 * in from a server-side step and store it in `ManifestBridgeGaps`.
 *
 * @param manifest — a PartManifest produced by `algorithmToPartManifest`
 * @returns `"blake3:<64 hex chars>"` — the manifest's content address
 */
export async function computeManifestHash(manifest: PartManifest): Promise<string> {
  // Canonical JSON: sorted keys, no whitespace. Matches mcpp's
  // `wasm4pm::data_types::hash::canonical_json` behaviour.
  const canonical = canonicalJson(manifest);
  const bytes = new TextEncoder().encode(canonical);

  // Prefer the WASM blake3 package if available; fall back to SHA-256 only
  // in environments that cannot load BLAKE3 (flag clearly in the hash prefix
  // so consumers detect the mismatch before admitting the manifest).
  try {
    const { createHash } = await import('blake3');
    const hash = createHash();
    hash.update(bytes);
    return `blake3:${hash.digest('hex')}`;
  } catch {
    // Fallback: SHA-256 with a distinct prefix so the manifest is never
    // accidentally treated as a valid BLAKE3 manifest hash.
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256-fallback:${hex}`;
  }
}

/**
 * Deterministic canonical JSON serialization (sorted keys, no whitespace).
 * Mirrors `serde_json` with BTreeMap ordering used in the mcpp receipt chain.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

// ─── Gap analysis summary (documentation) ────────────────────────────────────

/**
 * Complete gap analysis: fields in PartManifest that cannot be derived from
 * the kernel registry entry alone.
 *
 * | Field            | Gap reason                                          | Suggested source                          |
 * |------------------|-----------------------------------------------------|-------------------------------------------|
 * | version          | Registry has no semver. SpeedTier/qualityTier are   | kernel package.json version, or a         |
 * |                  | performance metadata, not release identifiers.      | dedicated algorithm-version manifest.     |
 * | wasm.hash        | BLAKE3 of compiled binary — only known post-build.  | `compute_wasm_hash()` in manifest_verify  |
 * |                  |                                                     | after `cargo build --target wasm32-wasi`. |
 * | wasm.size_bytes  | File size — only known post-build.                  | `fs.statSync(wasmPath).size`.             |
 * | receipt          | ULID issued by `mcpp robot` at admission time.      | mcpp proof pipeline after deployment.     |
 * | fixtures         | Domain-specific test vectors. The registry knows    | Authored per-algorithm in                 |
 * |                  | parameter names but not what valid OCEL logs look   | `packages/kernel/fixtures/<id>/`.         |
 * |                  | like for each algorithm.                            |                                           |
 * | compiled_from    | Lineage block (source_sessions, discovery, compiler)| mcpp Compiled MCP+ pipeline; omit for    |
 * |                  | — only present for machine-manufactured parts.      | hand-authored wasm4pm algorithms.         |
 *
 * Fields NOT listed here are fully derivable from `AlgorithmMetadata`:
 *   @context, @type, name, capability, wit, world, interface, route,
 *   hostFit, refusalProfile, wasm.path
 */
export type ManifestBridgeGapAnalysis = typeof _GAP_ANALYSIS_PLACEHOLDER;
const _GAP_ANALYSIS_PLACEHOLDER = {
  version: 'external version authority',
  'wasm.hash': 'post-build BLAKE3 hash',
  'wasm.size_bytes': 'post-build file size',
  receipt: 'mcpp admission pipeline',
  fixtures: 'per-algorithm test vectors',
  compiled_from: 'mcpp Compiled MCP+ pipeline (omit for hand-authored)',
} as const;
