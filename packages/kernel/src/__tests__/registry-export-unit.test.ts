/**
 * registry-export-unit.test.ts — Registry JSON Schema export + marketplace field contracts
 *
 * Tests the wasm4pm kernel registry APIs that external marketplace/catalog consumers use:
 *
 *   R1a — algorithmToJsonSchema: per-algorithm JSON Schema shape
 *         Validates that the JSON Schema output is standards-compliant and carries
 *         the parameter contract each algorithm exposes.
 *
 *   R1b — registryToJsonSchema: full-registry JSON Schema export
 *         Validates the registry-wide export suitable for external tool introspection.
 *
 *   R1c — AlgorithmMetadata: 3 marketplace-critical fields on every entry
 *         outputType, deploymentProfiles, speedTier+qualityTier — the fields
 *         an external system needs to route, price, and admit an algorithm.
 *
 * Oracle ranks (Chicago TDD — Van der Aalst Constitution):
 *   Rank 1 — Mathematical invariant (any correct implementation must satisfy)
 *   Rank 2 — Domain contract (design-decided, documented in CLAUDE.md/registry.ts)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 *
 * No WASM binary required — all tests are pure TypeScript registry module tests.
 *
 * Reference: packages/kernel/src/registry.ts, manifest-bridge.ts
 */

import { describe, it, expect } from 'vitest';
import { getRegistry, algorithmToJsonSchema, registryToJsonSchema } from '../registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// R1a — algorithmToJsonSchema: per-algorithm JSON Schema shape
// ═══════════════════════════════════════════════════════════════════════════════

describe('R1a — algorithmToJsonSchema: per-algorithm JSON Schema shape (Rank 1)', () => {
  it('produces a valid JSON Schema object for dfg (the canonical fast algorithm)', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    const schema = algorithmToJsonSchema(dfg!);

    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.type).toBe('object');
    expect(typeof schema.title).toBe('string');
    expect(schema.title.length).toBeGreaterThan(0);
    expect(typeof schema.description).toBe('string');
    expect(schema.description.length).toBeGreaterThan(0);
    expect(typeof schema.properties).toBe('object');
    expect(Array.isArray(schema.required)).toBe(true);
    expect(schema.additionalProperties).toBe(false);
  });

  it('dfg schema includes activity_key as a required string property', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    const schema = algorithmToJsonSchema(dfg!);

    expect(schema.properties).toHaveProperty('activity_key');
    expect(schema.properties['activity_key'].type).toBe('string');
    expect(schema.required).toContain('activity_key');
  });

  it('optional parameters are NOT in the required array (Rank 1 invariant)', () => {
    // heuristic_miner has optional dependency_threshold (required: false)
    const registry = getRegistry();
    const hm = registry.get('heuristic_miner');
    expect(hm).toBeDefined();
    const schema = algorithmToJsonSchema(hm!);

    expect(schema.properties).toHaveProperty('dependency_threshold');
    expect(schema.required).not.toContain('dependency_threshold');
  });

  it('numeric parameters include minimum/maximum when specified (Rank 2 domain contract)', () => {
    const registry = getRegistry();
    const hm = registry.get('heuristic_miner');
    expect(hm).toBeDefined();
    const schema = algorithmToJsonSchema(hm!);

    const dt = schema.properties['dependency_threshold'];
    expect(dt).toBeDefined();
    expect(typeof dt.minimum).toBe('number');
    expect(typeof dt.maximum).toBe('number');
    expect(dt.minimum!).toBeLessThan(dt.maximum!);
  });

  it('default values are preserved in the schema property (Rank 2)', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    const schema = algorithmToJsonSchema(dfg!);
    // activity_key has default: 'concept:name'
    expect(schema.properties['activity_key'].default).toBe('concept:name');
  });

  it('schema title matches the algorithm display name (not the raw id)', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    const schema = algorithmToJsonSchema(dfg!);
    expect(schema.title).toBe(dfg!.name);
    expect(schema.title).not.toBe('dfg');
  });

  it('schema is losslessly round-trippable through JSON (no undefined values)', () => {
    const registry = getRegistry();
    const hm = registry.get('heuristic_miner');
    expect(hm).toBeDefined();
    const schema = algorithmToJsonSchema(hm!);
    const serialised = JSON.stringify(schema);
    expect(serialised).not.toContain('undefined');
    const parsed = JSON.parse(serialised) as typeof schema;
    expect(parsed.$schema).toBe(schema.$schema);
    expect(parsed.title).toBe(schema.title);
  });

  it('select parameters map to string type with enum (Rank 2)', () => {
    const registry = getRegistry();
    const allAlgos = registry.list();
    const withSelect = allAlgos.find((a) => a.parameters.some((p) => p.type === 'select'));
    if (!withSelect) return; // No select params currently — skip gracefully
    const schema = algorithmToJsonSchema(withSelect);
    const selectParam = withSelect.parameters.find((p) => p.type === 'select')!;
    const prop = schema.properties[selectParam.name];
    expect(prop.type).toBe('string');
    expect(Array.isArray(prop.enum)).toBe(true);
    expect(prop.enum!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R1b — registryToJsonSchema: full-registry JSON Schema export
// ═══════════════════════════════════════════════════════════════════════════════

describe('R1b — registryToJsonSchema: full-registry JSON Schema export (Rank 1)', () => {
  it('returns an object with one key per registered algorithm', () => {
    const registry = getRegistry();
    const allAlgos = registry.list();
    const schemas = registryToJsonSchema();
    expect(Object.keys(schemas)).toHaveLength(allAlgos.length);
  });

  it('every key in the schema map matches a registered algorithm id (Rank 1)', () => {
    const registry = getRegistry();
    const registeredIds = new Set(registry.list().map((a) => a.id));
    const schemas = registryToJsonSchema();
    for (const key of Object.keys(schemas)) {
      expect(registeredIds.has(key)).toBe(true);
    }
  });

  it('every schema entry has $schema = "http://json-schema.org/draft-07/schema#"', () => {
    const schemas = registryToJsonSchema();
    for (const schema of Object.values(schemas)) {
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    }
  });

  it('every schema entry has type="object" (all algorithms take an object input)', () => {
    const schemas = registryToJsonSchema();
    for (const schema of Object.values(schemas)) {
      expect(schema.type).toBe('object');
    }
  });

  it('every schema entry has additionalProperties=false (strict input validation for external callers)', () => {
    const schemas = registryToJsonSchema();
    for (const [id, schema] of Object.entries(schemas)) {
      expect(
        schema.additionalProperties,
        `algorithm "${id}" schema.additionalProperties is not false`,
      ).toBe(false);
    }
  });

  it('registryToJsonSchema is deterministic — two calls return identical output (Rank 1)', () => {
    const s1 = registryToJsonSchema();
    const s2 = registryToJsonSchema();
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it('schema map is serialisable to JSON without loss (marketplace wire-format requirement)', () => {
    const schemas = registryToJsonSchema();
    expect(() => JSON.stringify(schemas)).not.toThrow();
    const serialised = JSON.stringify(schemas);
    expect(serialised).not.toContain('undefined');
    expect(serialised.length).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R1c — AlgorithmMetadata: 3 marketplace-critical fields on every entry
// ═══════════════════════════════════════════════════════════════════════════════

describe('R1c — AlgorithmMetadata: 3 marketplace-critical fields on every entry (Rank 2)', () => {
  /**
   * External consumers need these 3 fields to make routing/pricing decisions:
   *
   *   outputType          — determines downstream processing pipeline
   *   deploymentProfiles  — determines where the algorithm can run
   *   speedTier + qualityTier — determines which SLA tier to charge
   *
   * If any are missing or malformed, the external system cannot admit the
   * algorithm into its catalog. The manifest-bridge.ts derives all PartManifest
   * fields from these three categories.
   */

  const VALID_OUTPUT_TYPES = new Set([
    'dfg',
    'petrinet',
    'declare',
    'tree',
    'ml_result',
    'analytics',
  ]);
  const VALID_DEPLOYMENT_PROFILES = new Set(['mobile', 'iot', 'edge', 'fog', 'browser']);

  it('every registered algorithm has a non-empty outputType from the canonical 6-value set', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(
        VALID_OUTPUT_TYPES.has(algo.outputType),
        `algorithm "${algo.id}" has invalid outputType "${algo.outputType}"`,
      ).toBe(true);
    }
  });

  it('every registered algorithm has a non-empty deploymentProfiles array', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(
        Array.isArray(algo.deploymentProfiles) && algo.deploymentProfiles.length > 0,
        `algorithm "${algo.id}" has empty or missing deploymentProfiles`,
      ).toBe(true);
    }
  });

  it('every deploymentProfile value is drawn from the canonical 5-tier set', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      for (const profile of algo.deploymentProfiles) {
        expect(
          VALID_DEPLOYMENT_PROFILES.has(profile),
          `algorithm "${algo.id}" has invalid deploymentProfile "${profile}"`,
        ).toBe(true);
      }
    }
  });

  it('every algorithm has a non-negative integer speedTier in [1, 80]', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(Number.isInteger(algo.speedTier), `"${algo.id}" speedTier is not integer`).toBe(true);
      expect(algo.speedTier).toBeGreaterThanOrEqual(1);
      expect(algo.speedTier).toBeLessThanOrEqual(80);
    }
  });

  it('every algorithm has a non-negative integer qualityTier in [0, 100]', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(Number.isInteger(algo.qualityTier), `"${algo.id}" qualityTier is not integer`).toBe(
        true,
      );
      expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
      expect(algo.qualityTier).toBeLessThanOrEqual(100);
    }
  });

  it('"browser" profile includes every algorithm in any smaller profile (Rank 1 monotonicity)', () => {
    /**
     * Deployment profile hierarchy (from CLAUDE.md):
     *   mobile ⊆ iot ⊆ edge ⊆ fog ⊆ browser
     *
     * Any algorithm available in a smaller profile must also appear in browser.
     * Violations indicate a registry corruption where a subset-profile algorithm
     * is not available in the full-feature profile.
     */
    const registry = getRegistry();
    const browserIds = new Set(
      registry
        .list()
        .filter((a) => a.deploymentProfiles.includes('browser'))
        .map((a) => a.id),
    );
    const smallerProfiles = ['mobile', 'iot', 'edge', 'fog'] as const;
    for (const profile of smallerProfiles) {
      const profileIds = registry
        .list()
        .filter((a) => a.deploymentProfiles.includes(profile))
        .map((a) => a.id);
      for (const id of profileIds) {
        expect(browserIds.has(id), `algorithm "${id}" in "${profile}" not in "browser"`).toBe(
          true,
        );
      }
    }
  });

  it('dfg speedTier < heuristic_miner speedTier < ilp speedTier (domain-order invariant, Rank 2)', () => {
    /**
     * The three archetypal algorithms must maintain their relative speed ordering.
     * DFG (O(n)) → Heuristic Miner (O(n²)) → ILP (NP-Hard).
     * This is documented in CLAUDE.md and the registry.
     */
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    const hm = registry.get('heuristic_miner');
    const ilp = registry.get('ilp');
    expect(dfg).toBeDefined();
    expect(hm).toBeDefined();
    expect(ilp).toBeDefined();
    expect(dfg!.speedTier).toBeLessThan(hm!.speedTier);
    expect(hm!.speedTier).toBeLessThan(ilp!.speedTier);
  });

  it('dfg qualityTier < heuristic_miner qualityTier < ilp qualityTier (domain-order invariant, Rank 2)', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    const hm = registry.get('heuristic_miner');
    const ilp = registry.get('ilp');
    expect(dfg).toBeDefined();
    expect(hm).toBeDefined();
    expect(ilp).toBeDefined();
    expect(dfg!.qualityTier).toBeLessThan(hm!.qualityTier);
    expect(hm!.qualityTier).toBeLessThan(ilp!.qualityTier);
  });

  it('fastest 10% of discovery algorithms have lower mean quality than slowest 10% (Rank 3 metamorphic)', () => {
    /**
     * Metamorphic relation: if we take the fastest 10% of discovery algorithms
     * (lowest speedTier), their mean qualityTier must be lower than the mean
     * qualityTier of the slowest 10%.
     *
     * This would detect registry corruption where fast algorithms accidentally
     * receive high quality scores. It requires at least 10 discovery algorithms.
     */
    const registry = getRegistry();
    const discoveryAlgos = registry
      .list()
      .filter(
        (a) =>
          a.outputType !== 'ml_result' &&
          a.outputType !== 'analytics',
      )
      .sort((a, b) => a.speedTier - b.speedTier);

    const tenPct = Math.max(1, Math.floor(discoveryAlgos.length * 0.1));
    const fastest = discoveryAlgos.slice(0, tenPct);
    const slowest = discoveryAlgos.slice(-tenPct);

    const meanQuality = (arr: typeof discoveryAlgos) =>
      arr.reduce((s, a) => s + a.qualityTier, 0) / arr.length;

    expect(meanQuality(fastest)).toBeLessThan(meanQuality(slowest));
  });

  it('every algorithm id is unique across the registry (no duplicate registrations)', () => {
    const registry = getRegistry();
    const ids = registry.list().map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every algorithm name is a non-empty string', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(typeof algo.name).toBe('string');
      expect(algo.name.length, `algorithm "${algo.id}" has empty name`).toBeGreaterThan(0);
    }
  });

  it('every algorithm description is a non-empty string (required for marketplace display)', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(typeof algo.description).toBe('string');
      expect(
        algo.description.length,
        `algorithm "${algo.id}" has empty description`,
      ).toBeGreaterThan(0);
    }
  });

  it('every algorithm has non-negative estimatedDurationMs and estimatedMemoryMB', () => {
    const registry = getRegistry();
    for (const algo of registry.list()) {
      expect(algo.estimatedDurationMs >= 0, `"${algo.id}" estimatedDurationMs negative`).toBe(
        true,
      );
      expect(algo.estimatedMemoryMB >= 0, `"${algo.id}" estimatedMemoryMB negative`).toBe(true);
    }
  });
});
