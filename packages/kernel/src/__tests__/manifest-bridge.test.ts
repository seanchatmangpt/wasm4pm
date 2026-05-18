/**
 * manifest-bridge.test.ts — K01 manifest bridge contract tests
 *
 * Validates the wasm4pm kernel registry → mcpp PartManifest translation layer
 * without requiring any live mcpp runtime.
 *
 * Section K — enterprise integration bridges:
 *   K01 — manifest-bridge.ts: kernel registry → mcpp PartManifest generation
 *
 * Oracle ranks follow Chicago TDD (Van der Aalst Constitution):
 *   Rank 1 — Mathematical invariant (holds for any correct implementation)
 *   Rank 2 — Domain contract (design-decided property)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 *
 * Reference: packages/kernel/src/manifest-bridge.ts
 *
 * Test categories:
 *   A. PartManifest structural shape invariants (Rank 1)
 *   B. @context fields — canonical mcpp JSON-LD context URIs (Rank 2)
 *   C. Capability derivation — algorithm id + pm4py class + stream tag (Rank 2)
 *   D. hostFit derivation — wasmtime minVersion + memory hints (Rank 2)
 *   E. refusalProfile — three mandatory refusal codes (Rank 1)
 *   F. WASM binding — path convention + strict mode gap enforcement (Rank 2)
 *   G. Gap analysis — skeleton mode vs strict mode (Rank 2)
 *   H. Batch generation — generateAllManifests over real registry (Rank 2)
 *   I. canonicalJson + manifest_hash shape (Rank 1)
 *   J. ManifestBridgeGaps type completeness — 6 gap fields documented (Rank 2)
 *   K. Metamorphic: input perturbation → output change (Rank 3)
 */

import { describe, it, expect } from 'vitest';
import {
  algorithmToPartManifest,
  generateAllManifests,
  computeManifestHash,
  DEFAULT_MCPP_CONTEXT,
  type PartManifest,
  type ManifestBridgeGaps,
  type ManifestBundle,
} from '../manifest-bridge.js';
import { getRegistry, type AlgorithmMetadata } from '../registry.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Minimal registry entry that satisfies AlgorithmMetadata */
function makeEntry(overrides: Partial<AlgorithmMetadata> = {}): AlgorithmMetadata {
  return {
    id: 'dfg',
    name: 'DFG (Directly Follows Graph)',
    description: 'Test algorithm',
    outputType: 'dfg',
    complexity: 'O(n)',
    speedTier: 5,
    qualityTier: 30,
    parameters: [],
    supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
    deploymentProfiles: ['mobile', 'iot', 'edge', 'fog', 'browser'],
    estimatedDurationMs: 1,
    estimatedMemoryMB: 20,
    robustToNoise: true,
    scalesWell: true,
    fitnessRange: { min: 0.5, max: 0.9 },
    ...overrides,
  };
}

const VALID_BLAKE3 = `blake3:${'a'.repeat(64)}`;

// ── A. PartManifest structural shape invariants ───────────────────────────────

describe('A — PartManifest structural shape invariants (Rank 1)', () => {
  it('manifest has @context, @type, name, version, capability, wit, world, interface, route, hostFit, refusalProfile, fixtures', () => {
    const m = algorithmToPartManifest(makeEntry());
    const requiredTopLevel = [
      '@context',
      '@type',
      'name',
      'version',
      'capability',
      'wit',
      'world',
      'interface',
      'route',
      'hostFit',
      'refusalProfile',
      'fixtures',
    ];
    for (const key of requiredTopLevel) {
      expect(m).toHaveProperty(key);
    }
  });

  it('@type is "codemeta:SoftwareApplication"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m['@type']).toBe('codemeta:SoftwareApplication');
  });

  it('name equals the algorithm id', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'heuristic_miner' }));
    expect(m.name).toBe('heuristic_miner');
  });

  it('capability is a non-empty array of strings', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(Array.isArray(m.capability)).toBe(true);
    expect(m.capability.length).toBeGreaterThan(0);
    for (const cap of m.capability) {
      expect(typeof cap).toBe('string');
      expect(cap.length).toBeGreaterThan(0);
    }
  });

  it('fixtures is always an array (empty by default)', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(Array.isArray(m.fixtures)).toBe(true);
  });

  it('route has @type, activity, and powl fields', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.route).toHaveProperty('@type');
    expect(m.route).toHaveProperty('activity');
    expect(m.route).toHaveProperty('powl');
  });

  it('manifest round-trips through JSON without loss (no undefined values)', () => {
    const m = algorithmToPartManifest(makeEntry());
    const serialised = JSON.stringify(m);
    expect(serialised).not.toContain('"undefined"');
    const parsed = JSON.parse(serialised) as PartManifest;
    expect(parsed.name).toBe(m.name);
    expect(parsed.capability).toEqual(m.capability);
  });
});

// ── B. @context — canonical mcpp JSON-LD context URIs ────────────────────────

describe('B — @context canonical URI invariants (Rank 2)', () => {
  it('@context.mcpp starts with "https://w3id.org/mcpp#"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m['@context'].mcpp).toBe('https://w3id.org/mcpp#');
  });

  it('@context.prov is the W3C PROV namespace URI', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m['@context'].prov).toBe('http://www.w3.org/ns/prov#');
  });

  it('@context.wasi points to https://wasi.dev/', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m['@context'].wasi).toBe('https://wasi.dev/');
  });

  it('DEFAULT_MCPP_CONTEXT has all 9 required namespace prefixes', () => {
    const required = ['mcpp', 'prov', 'codemeta', 'dcterms', 'earl', 'schema', 'spdx', 'p-plan', 'wasi'];
    for (const prefix of required) {
      expect(DEFAULT_MCPP_CONTEXT).toHaveProperty(prefix);
    }
  });

  it('@context matches DEFAULT_MCPP_CONTEXT (no namespace drift)', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m['@context']).toEqual(DEFAULT_MCPP_CONTEXT);
  });
});

// ── C. Capability derivation ──────────────────────────────────────────────────

describe('C — capability derivation from algorithm metadata (Rank 2)', () => {
  it('first capability is the algorithm id in kebab-case (underscores → hyphens)', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'heuristic_miner' }));
    expect(m.capability[0]).toBe('heuristic-miner');
  });

  it('second capability is "pm4py-<outputType>"', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'dfg', outputType: 'dfg' }));
    expect(m.capability).toContain('pm4py-dfg');
  });

  it('petrinet outputType → pm4py-petrinet capability', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'alpha_plus_plus', outputType: 'petrinet' }));
    expect(m.capability).toContain('pm4py-petrinet');
  });

  it('stream-capable algorithms include "stream-capable" in capability array', () => {
    const m = algorithmToPartManifest(
      makeEntry({ id: 'dfg', supportedProfiles: ['fast', 'balanced', 'quality', 'stream'] })
    );
    expect(m.capability).toContain('stream-capable');
  });

  it('non-streaming algorithms do NOT include "stream-capable"', () => {
    const m = algorithmToPartManifest(
      makeEntry({ id: 'ilp', supportedProfiles: ['quality'] })
    );
    expect(m.capability).not.toContain('stream-capable');
  });

  it('dfg algorithm has exactly 3 capabilities (id + pm4py-dfg + stream-capable)', () => {
    const m = algorithmToPartManifest(
      makeEntry({ id: 'dfg', outputType: 'dfg', supportedProfiles: ['fast', 'stream'] })
    );
    expect(m.capability).toHaveLength(3);
  });
});

// ── D. hostFit derivation ─────────────────────────────────────────────────────

describe('D — hostFit: wasmtime minVersion + memory hints (Rank 2)', () => {
  it('runtime is always "wasmtime"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.hostFit.runtime).toBe('wasmtime');
  });

  it('minVersion is always "26.0.0"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.hostFit.minVersion).toBe('26.0.0');
  });

  it('requires always includes "wasi:filesystem/preopens"', () => {
    const m = algorithmToPartManifest(makeEntry({ estimatedMemoryMB: 10 }));
    expect(m.hostFit.requires).toContain('wasi:filesystem/preopens');
  });

  it('high-memory algorithm (>200MB) includes "wasi:memory" in requires', () => {
    // genetic_algorithm, ILP, PSO, ACO — all estimatedMemoryMB > 200
    const m = algorithmToPartManifest(makeEntry({ id: 'genetic_algorithm', estimatedMemoryMB: 500 }));
    expect(m.hostFit.requires).toContain('wasi:memory');
  });

  it('low-memory algorithm (<= 200MB) does NOT include "wasi:memory"', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'dfg', estimatedMemoryMB: 20 }));
    expect(m.hostFit.requires).not.toContain('wasi:memory');
  });

  it('memory boundary: exactly 200MB does NOT include "wasi:memory" (threshold is strictly >200)', () => {
    const m = algorithmToPartManifest(makeEntry({ estimatedMemoryMB: 200 }));
    expect(m.hostFit.requires).not.toContain('wasi:memory');
  });

  it('memory boundary: 201MB includes "wasi:memory"', () => {
    const m = algorithmToPartManifest(makeEntry({ estimatedMemoryMB: 201 }));
    expect(m.hostFit.requires).toContain('wasi:memory');
  });
});

// ── E. refusalProfile — three mandatory refusal codes ────────────────────────

describe('E — refusalProfile mandatory codes (Rank 1)', () => {
  it('onInvalidInput is "refused::invalid-input"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.refusalProfile.onInvalidInput).toBe('refused::invalid-input');
  });

  it('onCapabilityMismatch is "refused::capability-mismatch"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.refusalProfile.onCapabilityMismatch).toBe('refused::capability-mismatch');
  });

  it('onHostNotFit is "refused::host-not-fit"', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.refusalProfile.onHostNotFit).toBe('refused::host-not-fit');
  });

  it('refusalProfile has exactly 3 keys', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(Object.keys(m.refusalProfile)).toHaveLength(3);
  });
});

// ── F. WASM binding — path convention + strict mode ──────────────────────────

describe('F — WASM binding path convention and strict mode gap enforcement (Rank 2)', () => {
  it('wasm.path follows "<algorithm_id>.part.wasm" convention', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'heuristic_miner' }));
    expect(m.wasm?.path).toBe('heuristic_miner.part.wasm');
  });

  it('wasm.hash defaults to "blake3:PENDING" when no gap hash provided (skeleton mode)', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.wasm?.hash).toBe('blake3:PENDING');
  });

  it('wasm.hash uses the provided gap hash when strict=false', () => {
    const m = algorithmToPartManifest(makeEntry(), { wasmHash: VALID_BLAKE3 });
    expect(m.wasm?.hash).toBe(VALID_BLAKE3);
  });

  it('strict=true + gap.wasmHash provided does NOT throw', () => {
    expect(() => algorithmToPartManifest(makeEntry(), { wasmHash: VALID_BLAKE3 }, true)).not.toThrow();
  });

  it('strict=true + no gap.wasmHash throws with algorithm id in message', () => {
    expect(() => algorithmToPartManifest(makeEntry({ id: 'ilp' }), {}, true)).toThrow(/ilp/);
  });

  it('wasm.size_bytes defaults to 0 when no gap size provided', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.wasm?.size_bytes).toBe(0);
  });

  it('wasm.size_bytes uses the provided gap size', () => {
    const m = algorithmToPartManifest(makeEntry(), { wasmSizeBytes: 2_752_160 });
    expect(m.wasm?.size_bytes).toBe(2_752_160);
  });

  it('receipt field is absent when not provided in gaps', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.receipt).toBeUndefined();
  });

  it('receipt field is present when provided in gaps', () => {
    const m = algorithmToPartManifest(makeEntry(), { receipt: '01JEXAMPLEULID' });
    expect(m.receipt).toBe('01JEXAMPLEULID');
  });
});

// ── G. Gap analysis — skeleton vs strict ────────────────────────────────────

describe('G — gap analysis: skeleton mode vs strict mode (Rank 2)', () => {
  it('skeleton manifest (no gaps) is valid JSON-LD — all top-level fields present', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(typeof JSON.stringify(m)).toBe('string');
    expect(m.name).toBeDefined();
    expect(m.version).toBeDefined();
    expect(m['@context']).toBeDefined();
  });

  it('version defaults to a non-empty semver-like string when gap.version is absent', () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'dfg' }));
    expect(typeof m.version).toBe('string');
    expect(m.version.length).toBeGreaterThan(0);
    // Version should be semver-like or CalVer-like (e.g. "26.5.15" or "0.1.0")
    expect(m.version).toMatch(/^\d+\.\d+/);
  });

  it('version uses gap override when provided', () => {
    const m = algorithmToPartManifest(makeEntry(), { version: '3.1.4' });
    expect(m.version).toBe('3.1.4');
  });

  it('fixtures defaults to empty array when gap.fixtures is absent', () => {
    const m = algorithmToPartManifest(makeEntry());
    expect(m.fixtures).toEqual([]);
  });

  it('fixtures uses gap override when provided', () => {
    const fixtures = [{ path: 'fixtures/dfg/valid.ocel.json', expect: 'admitted' }];
    const m = algorithmToPartManifest(makeEntry(), { fixtures });
    expect(m.fixtures).toEqual(fixtures);
  });
});

// ── H. Batch generation — generateAllManifests over real registry ─────────────

describe('H — generateAllManifests over real kernel registry (Rank 2)', () => {
  it('generates one ManifestBundle per registered algorithm', () => {
    const registry = getRegistry();
    const allAlgorithms = registry.list();
    const bundles = generateAllManifests(registry);
    expect(bundles).toHaveLength(allAlgorithms.length);
  });

  it('every bundle has algorithmId and manifest fields', () => {
    const bundles = generateAllManifests(getRegistry());
    for (const bundle of bundles) {
      expect(typeof bundle.algorithmId).toBe('string');
      expect(bundle.algorithmId.length).toBeGreaterThan(0);
      expect(typeof bundle.manifest).toBe('object');
      expect(bundle.manifest).not.toBeNull();
    }
  });

  it('bundle.algorithmId equals manifest.name for every bundle', () => {
    const bundles = generateAllManifests(getRegistry());
    for (const bundle of bundles) {
      expect(bundle.manifest.name).toBe(bundle.algorithmId);
    }
  });

  it('every manifest has the correct @type', () => {
    const bundles = generateAllManifests(getRegistry());
    for (const bundle of bundles) {
      expect(bundle.manifest['@type']).toBe('codemeta:SoftwareApplication');
    }
  });

  it('every manifest capability array is non-empty', () => {
    const bundles = generateAllManifests(getRegistry());
    for (const bundle of bundles) {
      expect(bundle.manifest.capability.length).toBeGreaterThan(0);
    }
  });

  it('gap overrides apply to the target algorithm and leave others unchanged', () => {
    const registry = getRegistry();
    const overrides = new Map<string, ManifestBridgeGaps>([
      ['dfg', { wasmHash: VALID_BLAKE3, wasmSizeBytes: 12345, version: '1.2.3' }],
    ]);
    const bundles = generateAllManifests(registry, overrides);
    const dfgBundle = bundles.find((b) => b.algorithmId === 'dfg');
    const otherBundle = bundles.find((b) => b.algorithmId !== 'dfg');

    expect(dfgBundle?.manifest.wasm?.hash).toBe(VALID_BLAKE3);
    expect(dfgBundle?.manifest.version).toBe('1.2.3');

    // Other bundles should still use skeleton hash
    expect(otherBundle?.manifest.wasm?.hash).toBe('blake3:PENDING');
  });

  it('strict=true with all gap hashes provided does not throw', () => {
    const registry = getRegistry();
    const allIds = registry.list().map((a) => a.id);
    const overrides = new Map<string, ManifestBridgeGaps>(
      allIds.map((id) => [id, { wasmHash: VALID_BLAKE3 }])
    );
    expect(() => generateAllManifests(registry, overrides, true)).not.toThrow();
  });

  it('strict=true with one missing hash throws', () => {
    const registry = getRegistry();
    const allIds = registry.list().map((a) => a.id);
    // Provide overrides for all EXCEPT the first one
    const overrides = new Map<string, ManifestBridgeGaps>(
      allIds.slice(1).map((id) => [id, { wasmHash: VALID_BLAKE3 }])
    );
    // First id has no wasmHash — strict mode must throw
    expect(() => generateAllManifests(registry, overrides, true)).toThrow();
  });
});

// ── I. canonicalJson + manifest_hash shape ────────────────────────────────────

describe('I — manifest_hash format invariants (Rank 1)', () => {
  it('computeManifestHash returns a string starting with "blake3:" or "sha256-fallback:"', async () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'dfg' }));
    const hash = await computeManifestHash(m);
    expect(hash).toMatch(/^(blake3:|sha256-fallback:)/);
  });

  it('computeManifestHash is deterministic — same manifest produces same hash', async () => {
    const m = algorithmToPartManifest(makeEntry({ id: 'dfg' }), { version: '1.0.0' });
    const h1 = await computeManifestHash(m);
    const h2 = await computeManifestHash(m);
    expect(h1).toBe(h2);
  });

  it('different algorithm ids produce different manifest hashes', async () => {
    const m1 = algorithmToPartManifest(makeEntry({ id: 'dfg' }));
    const m2 = algorithmToPartManifest(makeEntry({ id: 'ilp', outputType: 'petrinet' }));
    const h1 = await computeManifestHash(m1);
    const h2 = await computeManifestHash(m2);
    expect(h1).not.toBe(h2);
  });

  it('adding a gap hash changes the manifest hash (skeleton → non-skeleton)', async () => {
    const skeleton = algorithmToPartManifest(makeEntry({ id: 'dfg' }));
    const filled = algorithmToPartManifest(makeEntry({ id: 'dfg' }), { wasmHash: VALID_BLAKE3 });
    const h1 = await computeManifestHash(skeleton);
    const h2 = await computeManifestHash(filled);
    expect(h1).not.toBe(h2);
  });
});

// ── J. ManifestBridgeGaps type completeness ───────────────────────────────────

describe('J — ManifestBridgeGaps: 6 documented gap fields (Rank 2)', () => {
  it('ManifestBridgeGaps supports version, wasmHash, wasmSizeBytes, receipt, fixtures', () => {
    // Type-level check encoded as runtime. If any field is removed or renamed,
    // this will fail to compile (TS strict check) or produce type errors.
    const gaps: ManifestBridgeGaps = {
      version: '1.0.0',
      wasmHash: VALID_BLAKE3,
      wasmSizeBytes: 1024,
      receipt: '01JEXAMPLEULID',
      fixtures: [{ path: 'test.ocel.json', expect: 'admitted' }],
    };
    // All 5 optional gap fields are accepted (the 6th, compiled_from, is
    // structural only — not a runtime-settable field in the current API)
    expect(gaps.version).toBe('1.0.0');
    expect(gaps.wasmHash).toBe(VALID_BLAKE3);
    expect(gaps.wasmSizeBytes).toBe(1024);
    expect(gaps.receipt).toBe('01JEXAMPLEULID');
    expect(gaps.fixtures).toHaveLength(1);
  });

  it('empty gaps object is valid (all fields are optional — skeleton mode)', () => {
    const gaps: ManifestBridgeGaps = {};
    const m = algorithmToPartManifest(makeEntry(), gaps);
    expect(m.wasm?.hash).toBe('blake3:PENDING');
    expect(m.receipt).toBeUndefined();
  });
});

// ── K. Metamorphic invariants ─────────────────────────────────────────────────

describe('K — metamorphic: input perturbation → correct output change (Rank 3)', () => {
  it('adding stream profile to an algorithm adds "stream-capable" capability', () => {
    const noStream = algorithmToPartManifest(makeEntry({ supportedProfiles: ['quality'] }));
    const withStream = algorithmToPartManifest(
      makeEntry({ supportedProfiles: ['quality', 'stream'] })
    );
    expect(noStream.capability).not.toContain('stream-capable');
    expect(withStream.capability).toContain('stream-capable');
  });

  it('increasing estimatedMemoryMB from 200 to 201 adds "wasi:memory" requirement', () => {
    const under = algorithmToPartManifest(makeEntry({ estimatedMemoryMB: 200 }));
    const over = algorithmToPartManifest(makeEntry({ estimatedMemoryMB: 201 }));
    expect(under.hostFit.requires).not.toContain('wasi:memory');
    expect(over.hostFit.requires).toContain('wasi:memory');
  });

  it('changing outputType from dfg to petrinet changes second capability', () => {
    const dfg = algorithmToPartManifest(makeEntry({ outputType: 'dfg' }));
    const pnet = algorithmToPartManifest(makeEntry({ outputType: 'petrinet' }));
    expect(dfg.capability).toContain('pm4py-dfg');
    expect(dfg.capability).not.toContain('pm4py-petrinet');
    expect(pnet.capability).toContain('pm4py-petrinet');
    expect(pnet.capability).not.toContain('pm4py-dfg');
  });

  it('algorithm id with underscores → kebab-case in first capability', () => {
    const ids = ['heuristic_miner', 'alpha_plus_plus', 'simd_streaming_dfg'];
    for (const id of ids) {
      const m = algorithmToPartManifest(makeEntry({ id }));
      const expectedKebab = id.replace(/_/g, '-');
      expect(m.capability[0]).toBe(expectedKebab);
    }
  });

  it('two calls with identical inputs produce identical manifests (deterministic)', () => {
    const entry = makeEntry({ id: 'dfg', estimatedMemoryMB: 50 });
    const gaps: ManifestBridgeGaps = { version: '1.0.0', wasmHash: VALID_BLAKE3 };
    const m1 = algorithmToPartManifest(entry, gaps);
    const m2 = algorithmToPartManifest(entry, gaps);
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });
});
