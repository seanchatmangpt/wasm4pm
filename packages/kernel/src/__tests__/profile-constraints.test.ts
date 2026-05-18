/**
 * profile-constraints.test.ts
 *
 * Test feature gate enforcement for deployment profiles.
 * Validates that algorithms are correctly available/unavailable in each profile.
 *
 * Oracle ranks (Van der Aalst / process mining Chicago TDD):
 *   Rank 1 — Mathematical theorem: canRun() correctly reflects deploymentProfiles[]
 *   Rank 2 — Domain contract: specific algorithms have expected profile availability
 *   Rank 3 — Metamorphic relation: profile subset chain (mobile ⊆ iot ⊆ edge ⊆ fog ⊆ browser)
 */

import { describe, it, expect } from 'vitest';
import {
  canRun,
  validateAlgorithmInProfile,
  getAvailableAlgorithms,
  getAvailableAlgorithmIds,
  suggestAlternatives,
  getProfileInfo,
  buildAlgorithmUnavailableMessage,
  getProfileComparisonTable,
} from '../profile-constraints.js';
import { getRegistry } from '../registry.js';
import type { DeploymentProfile } from '../registry.js';

// ─── RANK 1: Mathematical theorem ───────────────────────────────────────────

describe('Feature Gate Enforcement (Rank 1 — Mathematical)', () => {
  const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
  const registry = getRegistry();

  it('canRun() returns true iff algorithm is in deploymentProfiles[]', () => {
    for (const algo of registry.list()) {
      for (const profile of profiles) {
        const result = canRun(algo.id, profile);
        const expected = algo.deploymentProfiles.includes(profile);
        expect(result).toBe(expected, `${algo.id} in ${profile}: expected ${expected}, got ${result}`);
      }
    }
  });

  it('canRun() returns false for non-existent algorithms', () => {
    expect(canRun('nonexistent_algorithm', 'browser')).toBe(false);
    expect(canRun('fake_algo', 'mobile')).toBe(false);
  });

  it('validateAlgorithmInProfile() returns valid=true iff canRun() returns true', () => {
    const algos = registry.list().slice(0, 10); // Sample for performance
    for (const algo of algos) {
      for (const profile of profiles) {
        const canRunResult = canRun(algo.id, profile);
        const validateResult = validateAlgorithmInProfile(algo.id, profile);
        expect(validateResult.valid).toBe(canRunResult);
      }
    }
  });
});

// ─── RANK 2: Domain contracts ──────────────────────────────────────────────

describe('Algorithm Availability in Profiles (Rank 2 — Domain Contract)', () => {
  it('dfg is available in all 5 profiles', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    for (const profile of profiles) {
      expect(canRun('dfg', profile), `dfg must be in ${profile}`).toBe(true);
    }
  });

  it('process_skeleton is available in all 5 profiles', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    for (const profile of profiles) {
      expect(canRun('process_skeleton', profile), `process_skeleton must be in ${profile}`).toBe(true);
    }
  });

  it('simd_streaming_dfg is available in all 5 profiles', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    for (const profile of profiles) {
      expect(canRun('simd_streaming_dfg', profile), `simd_streaming_dfg must be in ${profile}`).toBe(
        true
      );
    }
  });

  it('genetic_algorithm not available in mobile, iot, or edge', () => {
    expect(canRun('genetic_algorithm', 'mobile')).toBe(false);
    expect(canRun('genetic_algorithm', 'iot')).toBe(false);
    expect(canRun('genetic_algorithm', 'edge')).toBe(false);
  });

  it('genetic_algorithm available in fog and browser', () => {
    expect(canRun('genetic_algorithm', 'fog')).toBe(true);
    expect(canRun('genetic_algorithm', 'browser')).toBe(true);
  });

  it('ilp not available in mobile, iot, or edge', () => {
    expect(canRun('ilp', 'mobile')).toBe(false);
    expect(canRun('ilp', 'iot')).toBe(false);
    expect(canRun('ilp', 'edge')).toBe(false);
  });

  it('ilp available in fog and browser', () => {
    expect(canRun('ilp', 'fog')).toBe(true);
    expect(canRun('ilp', 'browser')).toBe(true);
  });
});

// ─── RANK 3: Metamorphic relations ─────────────────────────────────────────

describe('Profile Subset Chain (Rank 3 — Metamorphic)', () => {
  it('mobile ⊆ iot ⊆ edge ⊆ fog ⊆ browser', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];

    for (let i = 0; i < profiles.length - 1; i++) {
      const smaller = new Set(getAvailableAlgorithmIds(profiles[i]));
      const larger = new Set(getAvailableAlgorithmIds(profiles[i + 1]));

      for (const algo of smaller) {
        expect(larger.has(algo), `${algo} in ${profiles[i]} must also be in ${profiles[i + 1]}`).toBe(
          true
        );
      }
    }
  });

  it('if algorithm available in mobile, it is available in all larger profiles', () => {
    const mobileAlgos = getAvailableAlgorithmIds('mobile');
    const profiles: DeploymentProfile[] = ['iot', 'edge', 'fog', 'browser'];

    for (const algo of mobileAlgos) {
      for (const profile of profiles) {
        expect(canRun(algo, profile), `${algo} from mobile must be in ${profile}`).toBe(true);
      }
    }
  });
});

// ─── API Functions ─────────────────────────────────────────────────────────

describe('getAvailableAlgorithms()', () => {
  it('returns all algorithms for browser profile', () => {
    const browser = getAvailableAlgorithms('browser');
    const all = getRegistry().list();
    expect(browser.length).toBe(all.length);
  });

  it('returns subset for mobile profile', () => {
    const mobile = getAvailableAlgorithms('mobile');
    const all = getRegistry().list();
    expect(mobile.length).toBeLessThan(all.length);
  });

  it('each returned algorithm has correct metadata', () => {
    const algos = getAvailableAlgorithms('browser').slice(0, 5);
    for (const algo of algos) {
      expect(algo.id).toBeTruthy();
      expect(algo.name).toBeTruthy();
      expect(algo.deploymentProfiles).toContain('browser');
    }
  });
});

describe('getAvailableAlgorithmIds()', () => {
  it('returns string IDs only', () => {
    const ids = getAvailableAlgorithmIds('browser');
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });

  it('is equivalent to getAvailableAlgorithms().map(a => a.id)', () => {
    const byId = getAvailableAlgorithmIds('fog');
    const byAlgo = getAvailableAlgorithms('fog').map((a) => a.id);
    expect(byId).toEqual(byAlgo);
  });
});

describe('suggestAlternatives()', () => {
  it('suggests algorithms with same output type when algorithm unavailable', () => {
    const alts = suggestAlternatives('genetic_algorithm', 'mobile');
    expect(alts.length).toBeGreaterThan(0);
    // genetic_algorithm outputs 'dfg', so should suggest dfg or other dfg algorithms
    for (const alt of alts) {
      const meta = getRegistry().get(alt);
      expect(meta?.outputType).toBe('dfg');
    }
  });

  it('returns empty array for non-existent algorithm', () => {
    const alts = suggestAlternatives('nonexistent', 'browser');
    expect(alts).toEqual([]);
  });

  it('returns max 5 alternatives', () => {
    const alts = suggestAlternatives('genetic_algorithm', 'browser');
    expect(alts.length).toBeLessThanOrEqual(5);
  });
});

describe('validateAlgorithmInProfile()', () => {
  it('returns valid=true for dfg in mobile', () => {
    const result = validateAlgorithmInProfile('dfg', 'mobile');
    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('dfg');
    expect(result.profile).toBe('mobile');
  });

  it('returns valid=false for genetic_algorithm in mobile', () => {
    const result = validateAlgorithmInProfile('genetic_algorithm', 'mobile');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('provides alternatives when algorithm unavailable', () => {
    const result = validateAlgorithmInProfile('genetic_algorithm', 'mobile');
    expect(result.valid).toBe(false);
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives?.length).toBeGreaterThan(0);
  });

  it('indicates availableIn profiles', () => {
    const result = validateAlgorithmInProfile('genetic_algorithm', 'mobile');
    expect(result.availableIn).toBeDefined();
    expect(result.availableIn).toContain('fog');
    expect(result.availableIn).toContain('browser');
  });

  it('handles non-existent algorithm', () => {
    const result = validateAlgorithmInProfile('nonexistent_algo', 'browser');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not registered');
  });
});

describe('getProfileInfo()', () => {
  it('returns correct info for each profile', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    for (const profile of profiles) {
      const info = getProfileInfo(profile);
      expect(info.name).toBe(profile);
      expect(info.displayName).toBeTruthy();
      expect(info.description).toBeTruthy();
      expect(info.binarySize).toBeTruthy();
      expect(info.algorithmCount).toBeGreaterThan(0);
      expect(info.supportedOutputTypes.length).toBeGreaterThan(0);
    }
  });

  it('mobile has fewer algorithms than browser', () => {
    const mobile = getProfileInfo('mobile');
    const browser = getProfileInfo('browser');
    expect(mobile.algorithmCount).toBeLessThan(browser.algorithmCount);
  });

  it('returns not-available algorithms list', () => {
    const mobile = getProfileInfo('mobile');
    expect(mobile.notAvailable.length).toBeGreaterThan(0);
    // alpha_plus_plus should be in the not-available list (balanced profile only)
    expect(mobile.notAvailable).toContain('alpha_plus_plus');
  });
});

describe('buildAlgorithmUnavailableMessage()', () => {
  it('returns empty string for available algorithm', () => {
    const msg = buildAlgorithmUnavailableMessage('dfg', 'mobile');
    expect(msg).toBe('');
  });

  it('returns helpful message for unavailable algorithm', () => {
    const msg = buildAlgorithmUnavailableMessage('genetic_algorithm', 'mobile');
    expect(msg).toContain('genetic_algorithm');
    expect(msg).toContain('mobile');
    expect(msg).toContain('not available');
  });

  it('includes alternative suggestions', () => {
    const msg = buildAlgorithmUnavailableMessage('genetic_algorithm', 'mobile');
    expect(msg).toContain('Suggested alternatives');
    expect(msg).toContain('dfg'); // dfg should be suggested
  });

  it('includes available profiles', () => {
    const msg = buildAlgorithmUnavailableMessage('genetic_algorithm', 'mobile');
    expect(msg).toContain('Available in profiles');
    expect(msg).toContain('fog');
    expect(msg).toContain('browser');
  });

  it('multiline formatting', () => {
    const msg = buildAlgorithmUnavailableMessage('genetic_algorithm', 'mobile');
    const lines = msg.split('\n');
    expect(lines.length).toBeGreaterThan(2);
  });
});

describe('getProfileComparisonTable()', () => {
  it('returns a formatted ASCII table', () => {
    const table = getProfileComparisonTable();
    expect(table).toContain('Profile');
    expect(table).toContain('Size');
    expect(table).toContain('Algorithms');
  });

  it('includes all 5 profiles', () => {
    const table = getProfileComparisonTable();
    expect(table).toContain('Mobile');
    expect(table).toContain('IoT');
    expect(table).toContain('Edge');
    expect(table).toContain('Fog');
    expect(table).toContain('Browser');
  });

  it('includes size estimates', () => {
    const table = getProfileComparisonTable();
    expect(table).toContain('500KB');
    expect(table).toContain('2.7MB');
  });

  it('table has consistent formatting', () => {
    const table = getProfileComparisonTable();
    const lines = table.split('\n');
    // Should have header, separator, and 5 profile rows
    expect(lines.length).toBeGreaterThanOrEqual(7);
  });
});

// ─── Integration: Error Messages ───────────────────────────────────────────

describe('Feature Gate Error Messages (Integration)', () => {
  it('clear message when user tries unavailable algorithm', () => {
    const msg = buildAlgorithmUnavailableMessage('ilp_petri_net', 'iot');
    // Message should guide user to upgrade
    expect(msg.toLowerCase()).toMatch(/not available|profile|upgrade/i);
  });

  it('suggests same-type algorithms when possible', () => {
    // ilp outputs 'petrinet', so should suggest other petrinet algos
    const msg = buildAlgorithmUnavailableMessage('ilp', 'mobile');
    // Should suggest alternatives that ARE available in mobile
    expect(msg).toContain('Suggested alternatives');
  });
});
