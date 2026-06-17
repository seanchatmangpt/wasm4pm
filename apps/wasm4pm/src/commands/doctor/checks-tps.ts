// TPS Pipeline Integrity Checks (checks 18-24)
// These validate cross-reference integrity across the Rust > WASM > TypeScript pipeline.
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { Diagnosis } from './types.js';

// ────────────────────────────────────────────────────────────────────────────
// TPS Pipeline Integrity Checks (Equipment + Quality + Operation Kaizen)
//
// These validate cross-reference integrity across the Rust > WASM > TypeScript
// pipeline. They catch stale enums, missing mappings, broken state transitions,
// and inconsistent naming — the class of bugs that silently break the system.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Try to read a source file relative to the workspace root.
 * Returns null if the file doesn't exist (e.g., when running from installed npm package).
 */
export function readSourceFile(relativePath: string): string | null {
  // Cache the resolved root
  const rootDir = getCachedWorkspaceRoot();
  if (rootDir) {
    const fullPath = path.join(rootDir, relativePath);
    if (existsSync(fullPath)) return readFileSync(fullPath, 'utf-8');
  }
  return null;
}

let _cachedRoot: string | null | undefined;

export function getCachedWorkspaceRoot(): string | null {
  if (_cachedRoot !== undefined) return _cachedRoot;
  _cachedRoot = null;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      _cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Determine if we have access to source files for TPS checks.
 */
export function hasSourceAccess(): boolean {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) return false;
  return existsSync(path.join(rootDir, 'packages/contracts/src/templates/algorithm-registry.ts'));
}

// ── Check 18: PlanStepType enum ↔ PLAN_STEP_TYPE_VALUES sync ──

export async function checkStepTypeSync(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available (run from repo)',
    };
  }

  const plannerSrc = readSourceFile('packages/planner/src/steps.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!plannerSrc || !contractsSrc) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const enumMatch = plannerSrc.match(/enum\s+PlanStepType\s*\{([\s\S]*?)\}/);
  const arrayMatch = contractsSrc.match(
    /export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
  );

  if (!enumMatch || !arrayMatch) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse source',
    };
  }

  const enumValues = new Set<string>();
  for (const m of enumMatch[1].matchAll(/'([^']+)'/g)) enumValues.add(m[1]);

  const arrayValues = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) arrayValues.add(m[1]);

  const inEnumNotArray = [...enumValues].filter((v) => !arrayValues.has(v));
  const inArrayNotEnum = [...arrayValues].filter((v) => !enumValues.has(v));

  if (inEnumNotArray.length === 0 && inArrayNotEnum.length === 0) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: `PlanStepType and PLAN_STEP_TYPE_VALUES in sync (${enumValues.size} values)`,
    };
  }

  const details: string[] = [];
  if (inEnumNotArray.length > 0)
    details.push(
      `${inEnumNotArray.length} in enum but not array: ${inEnumNotArray.slice(0, 3).join(', ')}`
    );
  if (inArrayNotEnum.length > 0)
    details.push(
      `${inArrayNotEnum.length} in array but not enum: ${inArrayNotEnum.slice(0, 3).join(', ')}`
    );

  return {
    name: 'Step type sync (TPS)',
    pathology: 'PLAN_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: details.join('; '),
    fix: 'Sync PlanStepType enum (planner/steps.ts) with PLAN_STEP_TYPE_VALUES (contracts/steps.ts)',
  };
}

// ── Check 19: Algorithm registry key consistency ──

export async function checkRegistryConsistency(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — registry not found',
    };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const displayMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_DISPLAY_NAMES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const outputMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_OUTPUT_TYPES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );

  if (!idsMatch || !stepTypeMatch || !displayMatch || !outputMatch) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse registry',
    };
  }

  const ids = new Set<string>();
  for (const m of idsMatch[1].matchAll(/'([^']+)'/g)) ids.add(m[1]);

  const stepTypeKeys = new Set<string>();
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:/g)) stepTypeKeys.add(m[1]);

  const displayKeys = new Set<string>();
  for (const m of displayMatch[1].matchAll(/(\w+)\s*:/g)) displayKeys.add(m[1]);

  const outputKeys = new Set<string>();
  for (const m of outputMatch[1].matchAll(/(\w+)\s*:/g)) outputKeys.add(m[1]);

  const issues: string[] = [];

  // IDs in ALGORITHM_IDS but not in ALGORITHM_ID_TO_STEP_TYPE
  for (const id of ids) {
    if (!stepTypeKeys.has(id))
      issues.push(`'${id}' in ALGORITHM_IDS but not ALGORITHM_ID_TO_STEP_TYPE`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_DISPLAY_NAMES
  for (const key of stepTypeKeys) {
    if (!displayKeys.has(key))
      issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_DISPLAY_NAMES`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_OUTPUT_TYPES
  for (const key of stepTypeKeys) {
    if (!outputKeys.has(key))
      issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_OUTPUT_TYPES`);
  }

  if (issues.length === 0) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: `ALGORITHM_IDS, STEP_TYPE, DISPLAY_NAMES, OUTPUT_TYPES aligned (${ids.size} algorithms)`,
    };
  }

  return {
    name: 'Registry consistency (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} inconsistency(ies): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Add missing entries to algorithm-registry.ts or remove orphaned keys',
  };
}

// ── Check 20: State machine integrity ──

export async function checkStateMachineIntegrity(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  const engineSrc = readSourceFile('packages/engine/src/engine.ts');
  const typesSrc = readSourceFile('packages/contracts/src/types.ts');
  if (!transitionsSrc || !engineSrc || !typesSrc) {
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  // Extract EngineState type values
  const stateTypeMatch = typesSrc.match(/EngineState\s*=\s*([^;]+)/);
  const stateValues = new Set<string>();
  if (stateTypeMatch) {
    for (const m of stateTypeMatch[1].matchAll(/'([^']+)'/g)) stateValues.add(m[1]);
  }

  // Extract VALID_TRANSITIONS (handle nested generics Record<K, Set<V>>)
  const transitionsMatch = transitionsSrc.match(
    /VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/
  );
  const transitionKeys = new Set<string>();
  const allTargets = new Set<string>();
  if (transitionsMatch) {
    for (const m of transitionsMatch[1].matchAll(/(\w+)\s*:\s*new\s+Set\(\[([^\]]*)\]\)/g)) {
      transitionKeys.add(m[1]);
      for (const t of m[2].matchAll(/'([^']+)'/g)) allTargets.add(t[1]);
    }
  }

  const issues: string[] = [];

  // EngineState values not in VALID_TRANSITIONS keys
  for (const s of stateValues) {
    if (!transitionKeys.has(s)) issues.push(`EngineState '${s}' missing from VALID_TRANSITIONS`);
  }

  // VALID_TRANSITIONS keys not in EngineState
  for (const k of transitionKeys) {
    if (!stateValues.has(k)) issues.push(`VALID_TRANSITIONS key '${k}' not in EngineState`);
  }

  // Transition targets not in EngineState
  for (const t of allTargets) {
    if (!stateValues.has(t)) issues.push(`Transition target '${t}' not a valid EngineState`);
  }

  // Extract hardcoded transitions from engine.ts and verify they exist as targets
  for (const m of engineSrc.matchAll(/this\.stateMachine\.transition\(\s*'([^']+)'/g)) {
    if (!stateValues.has(m[1])) {
      issues.push(`engine.ts transitions to '${m[1]}' which is not a valid EngineState`);
    }
  }

  if (issues.length === 0) {
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: `${stateValues.size} states, ${transitionKeys.size} transitions, all valid`,
    };
  }

  return {
    name: 'State machine (TPS)',
    pathology: 'ANTI_LIE_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Update VALID_TRANSITIONS in transitions.ts or fix invalid transitions in engine.ts',
  };
}

// ── Check 21: Profile → registry coverage ──

export async function checkProfileCoverage(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — registry not found',
    };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const profileMatch = registrySrc.match(
    /const\s+map\s*:\s*Record<string,\s*string\[\]>\s*=\s*\{([\s\S]*?)\}\s*;/
  );

  if (!idsMatch || !stepTypeMatch || !profileMatch) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse registry',
    };
  }

  const validIds = new Set<string>();
  for (const m of idsMatch[1].matchAll(/'([^']+)'/g)) validIds.add(m[1]);
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:/g)) validIds.add(m[1]);

  const issues: string[] = [];
  for (const profileGroup of profileMatch[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    const profileName = profileGroup[1];
    for (const idMatch of profileGroup[2].matchAll(/'([^']+)'/g)) {
      const algoId = idMatch[1];
      if (!validIds.has(algoId)) {
        issues.push(`Profile '${profileName}' references unknown '${algoId}'`);
      }
    }
  }

  if (issues.length === 0) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'All profile algorithm IDs exist in registry',
    };
  }

  return {
    name: 'Profile coverage (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} invalid reference(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Update getProfileAlgorithms() or add missing algorithm to registry',
  };
}

// ── Check 22: Canonical algorithm naming in config/tests ──

export async function checkCanonicalNaming(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const configTestSrc = readSourceFile('packages/config/src/__tests__/resolution.test.ts');
  if (!configTestSrc) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — config tests not found',
    };
  }

  // Known short aliases that should NOT appear in config/test files
  const bannedShortNames = [
    'alpha',
    'heuristic',
    'genetic',
    'inductive',
    'astar',
    'powl',
    'skeleton',
    'correlation',
    'alignment',
  ];

  const issues: string[] = [];
  for (const shortName of bannedShortNames) {
    const regex = new RegExp(`['"]${shortName}['"]`, 'g');
    const matches = configTestSrc.match(regex);
    if (matches) {
      issues.push(`'${shortName}' found ${matches.length}x — use canonical ID`);
    }
  }

  if (issues.length === 0) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Config tests use canonical algorithm IDs',
    };
  }

  return {
    name: 'Canonical naming (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'WARNING',
    message: `${issues.length} banned short name(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Replace short aliases with canonical IDs (e.g., heuristic → heuristic_miner)',
  };
}

// ── Check 23: Step type coverage (registry → PLAN_STEP_TYPE_VALUES) ──

export async function checkStepTypeCoverage(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!registrySrc || !contractsSrc) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const arrayMatch = contractsSrc.match(
    /export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
  );

  if (!stepTypeMatch || !arrayMatch) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse source',
    };
  }

  const validStepTypes = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) validStepTypes.add(m[1]);

  const missing: string[] = [];

  // Parse key: 'value' pairs
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) {
    if (!validStepTypes.has(m[2])) {
      missing.push(`${m[1]} → '${m[2]}'`);
    }
  }

  if (missing.length === 0) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'All registry step types exist in PLAN_STEP_TYPE_VALUES',
    };
  }

  return {
    name: 'Step type coverage (TPS)',
    pathology: 'PLAN_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${missing.length} missing step type(s): ${missing.slice(0, 3).join('; ')}`,
    fix: 'Add missing values to PLAN_STEP_TYPE_VALUES in packages/contracts/src/steps.ts',
  };
}

// ── Check 24: State machine completeness (no orphans or dead-ends) ──

export async function checkStateMachineCompleteness(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  if (!transitionsSrc) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const transitionsMatch = transitionsSrc.match(
    /VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/
  );
  if (!transitionsMatch) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse transitions',
    };
  }

  const issues: string[] = [];
  const allTargets = new Set<string>();
  const stateEntries: Array<{ from: string; targets: Set<string> }> = [];

  for (const m of transitionsMatch[1].matchAll(/(\w+)\s*:\s*new\s+Set\(\[([^\]]*)\]\)/g)) {
    const targets = new Set<string>();
    for (const t of m[2].matchAll(/'([^']+)'/g)) {
      targets.add(t[1]);
      allTargets.add(t[1]);
    }
    stateEntries.push({ from: m[1], targets });
  }

  // Check for unreachable states (never a target of any transition)
  for (const entry of stateEntries) {
    if (entry.from !== 'uninitialized' && !allTargets.has(entry.from)) {
      issues.push(`State '${entry.from}' is never a transition target (unreachable)`);
    }
  }

  // Check for dead-end states (no outgoing transitions)
  for (const entry of stateEntries) {
    if (entry.targets.size === 0) {
      issues.push(`State '${entry.from}' has no outgoing transitions (dead-end)`);
    }
  }

  if (issues.length === 0) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: `${stateEntries.length} states — all reachable, no dead-ends`,
    };
  }

  return {
    name: 'State machine completeness (TPS)',
    pathology: 'ANTI_LIE_TRUTH_FAULT',
    severity: 'WARNING',
    message: `${issues.length} issue(s): ${issues.join('; ')}`,
    fix: 'Add missing transitions in packages/engine/src/transitions.ts',
  };
}
