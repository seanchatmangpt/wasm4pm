#!/usr/bin/env node

/**
 * TPS Pipeline Quality Gate — Equipment + Quality + Operation Kaizen
 *
 * Validates cross-reference integrity across the Rust > WASM > TypeScript pipeline.
 * Catches the class of bugs that caused 73 test failures:
 *   - Stale enums (PlanStepType missing Wave 1 values)
 *   - Missing mappings (ALGORITHM_ID_TO_STEP_TYPE gaps)
 *   - Broken state transitions (VALID_TRANSITIONS too restrictive)
 *   - Inconsistent naming (short aliases vs canonical IDs)
 *
 * TPS Modules Implemented:
 *   1. Equipment Kaizen — Tools in good working order (enum/mapping sync)
 *   2. Quality Kaizen   — Quality built into process (state machine integrity)
 *   3. Operation Kaizen — Standardized work (naming conventions)
 *   4. Logistics Kaizen — Flow reliability (profile → registry coverage)
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = violations found (printed to stdout)
 *
 * Usage:
 *   node scripts/tps-pipeline-check.mjs          # run all checks
 *   node scripts/tps-pipeline-check.mjs --json   # machine-readable output
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findings = [];
let checkCount = 0;

function find(severity, module, rule, message, context = {}) {
  checkCount++;
  findings.push({ severity, module, rule, message, ...context });
}

function ok(module, rule) {
  checkCount++;
  // pass — not recorded
}

/**
 * Extract all string values from a TypeScript enum declaration.
 * Matches: ENUM_VALUE = 'string_value',
 */
function extractEnumValues(source, enumName) {
  const regex = new RegExp(
    `enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`,
  );
  const match = source.match(regex);
  if (!match) return [];
  const body = match[1];
  const values = [];
  for (const m of body.matchAll(/(\w+)\s*=\s*'([^']+)'/g)) {
    values.push({ member: m[1], value: m[2] });
  }
  return values;
}

/**
 * Extract all values from a `as const` array.
 * Matches: 'value',
 */
function extractConstArrayValues(source, varName) {
  const regex = new RegExp(
    `export\\s+const\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  );
  const match = source.match(regex);
  if (!match) return [];
  const body = match[1];
  const values = [];
  for (const m of body.matchAll(/'([^']+)'/g)) {
    values.push(m[1]);
  }
  return values;
}

/**
 * Extract key-value pairs from a Record<string, string>.
 * Matches: key: 'value',
 */
function extractRecordEntries(source, varName) {
  const regex = new RegExp(
    `export\\s+const\\s+${varName}\\s*:\\s*Record[^=]*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
  );
  const match = source.match(regex);
  if (!match) return {};
  const body = match[1];
  const entries = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) {
    entries[m[1]] = m[2];
  }
  return entries;
}

/**
 * Extract array values from getProfileAlgorithms.
 * Matches profile: ['id1', 'id2', ...],
 */
function extractProfileMap(source) {
  const regex = /const\s+map\s*:\s*Record<string,\s*string\[\]>\s*=\s*\{([\s\S]*?)\}\s*;/;
  const match = source.match(regex);
  if (!match) return {};
  const body = match[1];
  const profiles = {};
  for (const profileMatch of body.matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    const profileName = profileMatch[1];
    const ids = [];
    for (const idMatch of profileMatch[2].matchAll(/'([^']+)'/g)) {
      ids.push(idMatch[1]);
    }
    profiles[profileName] = ids;
  }
  return profiles;
}

/**
 * Extract state transition table from VALID_TRANSITIONS.
 * Matches: stateName: new Set(['to1', 'to2', ...]),
 */
function extractTransitionTable(source) {
  const regex = /VALID_TRANSITIONS\s*:\s*Record<EngineState,\s*Set<EngineState>>\s*=\s*\{([\s\S]*?)\}\s*;/;
  const match = source.match(regex);
  if (!match) return {};
  const body = match[1];
  const table = {};
  for (const stateMatch of body.matchAll(/(\w+)\s*:\s*new\s+Set\(\[([^\]]*)\]\)/g)) {
    const fromState = stateMatch[1];
    const toStates = [];
    for (const toMatch of stateMatch[2].matchAll(/'([^']+)'/g)) {
      toStates.push(toMatch[1]);
    }
    table[fromState] = new Set(toStates);
  }
  return table;
}

/**
 * Extract state transition calls from engine source.
 * Matches: this.stateMachine.transition('targetState',
 *           this.stateMachine.transition(recoveryState,  (dynamic)
 */
function extractTransitionCalls(source) {
  const calls = [];
  // Static transitions: transition('targetState',
  for (const m of source.matchAll(/this\.stateMachine\.transition\(\s*'([^']+)'/g)) {
    calls.push({ target: m[1], dynamic: false });
  }
  // Dynamic transitions: transition(recoveryState,
  for (const m of source.matchAll(/this\.stateMachine\.transition\(\s*(\w+)\s*,/g)) {
    if (m[1] !== "'") {
      calls.push({ target: m[1], dynamic: true });
    }
  }
  return calls;
}

/**
 * Read file relative to repo root.
 */
function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf-8');
}

// ---------------------------------------------------------------------------
// Check 1: Equipment Kaizen — PlanStepType ↔ PLAN_STEP_TYPE_VALUES sync
// ---------------------------------------------------------------------------

function checkStepTypeSync() {
  const module = 'Equipment Kaizen';
  const rule = 'step-type-sync';

  const plannerSteps = read('packages/planner/src/steps.ts');
  const contractsSteps = read('packages/contracts/src/steps.ts');

  const enumValues = extractEnumValues(plannerSteps, 'PlanStepType');
  const constValues = extractConstArrayValues(contractsSteps, 'PLAN_STEP_TYPE_VALUES');

  const enumSet = new Set(enumValues.map(v => v.value));
  const constSet = new Set(constValues);

  // Forward: enum values in contracts?
  for (const v of enumValues) {
    if (!constSet.has(v.value)) {
      find('error', module, rule,
        `PlanStepType.${v.member} = '${v.value}' is missing from PLAN_STEP_TYPE_VALUES in contracts`,
        { file: 'packages/planner/src/steps.ts', member: v.member });
    }
  }

  // Reverse: contracts values in enum?
  for (const v of constValues) {
    if (!enumSet.has(v)) {
      find('error', module, rule,
        `PLAN_STEP_TYPE_VALUES contains '${v}' which has no PlanStepType enum member`,
        { file: 'packages/contracts/src/steps.ts', value: v });
    }
  }

  if (enumSet.size === constSet.size && findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 2: Equipment Kaizen — ALGORITHM_ID_TO_STEP_TYPE targets valid
// ---------------------------------------------------------------------------

function checkAlgorithmStepTypeTargets() {
  const module = 'Equipment Kaizen';
  const rule = 'algorithm-step-type-targets';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');
  const contractsSteps = read('packages/contracts/src/steps.ts');

  const stepTypeMap = extractRecordEntries(registry, 'ALGORITHM_ID_TO_STEP_TYPE');
  const validStepTypes = new Set(extractConstArrayValues(contractsSteps, 'PLAN_STEP_TYPE_VALUES'));

  for (const [algoId, stepType] of Object.entries(stepTypeMap)) {
    if (!validStepTypes.has(stepType)) {
      find('error', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE['${algoId}'] = '${stepType}' is not in PLAN_STEP_TYPE_VALUES`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', algoId, stepType });
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 3: Equipment Kaizen — Registry key consistency
// ---------------------------------------------------------------------------

function checkRegistryKeyConsistency() {
  const module = 'Equipment Kaizen';
  const rule = 'registry-key-consistency';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');

  const ids = new Set(extractConstArrayValues(registry, 'ALGORITHM_IDS'));
  const stepTypeMap = extractRecordEntries(registry, 'ALGORITHM_ID_TO_STEP_TYPE');
  const displayNames = extractRecordEntries(registry, 'ALGORITHM_DISPLAY_NAMES');
  const outputTypes = extractRecordEntries(registry, 'ALGORITHM_OUTPUT_TYPES');
  const cliAliases = extractRecordEntries(registry, 'ALGORITHM_CLI_ALIASES');

  const stepTypeKeys = new Set(Object.keys(stepTypeMap));
  const displayKeys = new Set(Object.keys(displayNames));
  const outputKeys = new Set(Object.keys(outputTypes));
  const cliKeys = new Set(Object.keys(cliAliases));

  // ALGORITHM_IDS ⊂ ALGORITHM_ID_TO_STEP_TYPE keys
  for (const id of ids) {
    if (!stepTypeKeys.has(id)) {
      find('error', module, rule,
        `ALGORITHM_IDS contains '${id}' but ALGORITHM_ID_TO_STEP_TYPE has no entry for it`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', id });
    }
  }

  // ALGORITHM_ID_TO_STEP_TYPE keys ⊂ ALGORITHM_IDS (except known aliases)
  const knownAliases = new Set(); // extra keys in TO_STEP_TYPE that are aliases
  for (const key of stepTypeKeys) {
    if (!ids.has(key) && !knownAliases.has(key)) {
      find('warning', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE has '${key}' which is not in ALGORITHM_IDS (possible alias?)`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', key });
    }
  }

  // ALGORITHM_ID_TO_STEP_TYPE keys == ALGORITHM_DISPLAY_NAMES keys
  for (const key of stepTypeKeys) {
    if (!displayKeys.has(key)) {
      find('error', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE has '${key}' but ALGORITHM_DISPLAY_NAMES has no entry for it`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', key });
    }
  }
  for (const key of displayKeys) {
    if (!stepTypeKeys.has(key)) {
      find('error', module, rule,
        `ALGORITHM_DISPLAY_NAMES has '${key}' but ALGORITHM_ID_TO_STEP_TYPE has no entry for it`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', key });
    }
  }

  // ALGORITHM_ID_TO_STEP_TYPE keys == ALGORITHM_OUTPUT_TYPES keys
  for (const key of stepTypeKeys) {
    if (!outputKeys.has(key)) {
      find('warning', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE has '${key}' but ALGORITHM_OUTPUT_TYPES has no entry for it`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', key });
    }
  }

  // ALGORITHM_ID_TO_STEP_TYPE keys == ALGORITHM_CLI_ALIASES keys
  for (const key of stepTypeKeys) {
    if (!cliKeys.has(key)) {
      find('warning', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE has '${key}' but ALGORITHM_CLI_ALIASES has no entry for it`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', key });
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 4: Logistics Kaizen — Profile algorithms reference valid registry IDs
// ---------------------------------------------------------------------------

function checkProfileRegistryCoverage() {
  const module = 'Logistics Kaizen';
  const rule = 'profile-registry-coverage';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');

  const ids = new Set(extractConstArrayValues(registry, 'ALGORITHM_IDS'));
  const stepTypeKeys = new Set(Object.keys(extractRecordEntries(registry, 'ALGORITHM_ID_TO_STEP_TYPE')));
  const allValidIds = new Set([...ids, ...stepTypeKeys]); // include aliases
  const profiles = extractProfileMap(registry);

  for (const [profile, algoIds] of Object.entries(profiles)) {
    for (const algoId of algoIds) {
      if (!allValidIds.has(algoId)) {
        find('error', module, rule,
          `Profile '${profile}' references '${algoId}' which is not in ALGORITHM_IDS or ALGORITHM_ID_TO_STEP_TYPE`,
          { file: 'packages/contracts/src/templates/algorithm-registry.ts', profile, algoId });
      }
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 5: Quality Kaizen — Engine state transitions vs VALID_TRANSITIONS
// ---------------------------------------------------------------------------

function checkStateMachineIntegrity() {
  const module = 'Quality Kaizen';
  const rule = 'state-machine-integrity';

  const transitions = read('packages/engine/src/transitions.ts');
  const engine = read('packages/engine/src/engine.ts');
  const contracts = read('packages/contracts/src/types.ts');

  // Extract EngineState type values
  const stateTypeMatch = contracts.match(
    /EngineState\s*=\s*([^;]+)/
  );
  const stateValues = [];
  if (stateTypeMatch) {
    for (const m of stateTypeMatch[1].matchAll(/'([^']+)'/g)) {
      stateValues.push(m[1]);
    }
  }
  const stateSet = new Set(stateValues);

  // Check 5a: EngineState type values all appear as keys in VALID_TRANSITIONS
  const transitionTable = extractTransitionTable(transitions);
  const transitionKeys = new Set(Object.keys(transitionTable));

  for (const state of stateValues) {
    if (!transitionKeys.has(state)) {
      find('error', module, rule,
        `EngineState '${state}' is missing from VALID_TRANSITIONS keys`,
        { file: 'packages/engine/src/transitions.ts', state });
    }
  }
  for (const key of transitionKeys) {
    if (!stateSet.has(key)) {
      find('error', module, rule,
        `VALID_TRANSITIONS has key '${key}' which is not in EngineState type`,
        { file: 'packages/engine/src/transitions.ts', key });
    }
  }

  // Check 5b: All target states in VALID_TRANSITIONS are valid EngineState values
  for (const [from, targets] of Object.entries(transitionTable)) {
    for (const to of targets) {
      if (!stateSet.has(to)) {
        find('error', module, rule,
          `VALID_TRANSITIONS['${from}'] contains '${to}' which is not a valid EngineState`,
          { file: 'packages/engine/src/transitions.ts', from, to });
      }
    }
  }

  // Check 5c: All hardcoded transition calls in engine.ts are valid
  const calls = extractTransitionCalls(engine);
  for (const call of calls) {
    if (!call.dynamic && !stateSet.has(call.target)) {
      find('error', module, rule,
        `engine.ts calls transition('${call.target}') which is not a valid EngineState`,
        { file: 'packages/engine/src/engine.ts', target: call.target });
    }
    if (!call.dynamic && transitionTable[call.target] === undefined) {
      // Check that 'call.target' is a valid TO state from some FROM state
      let foundInTargets = false;
      for (const targets of Object.values(transitionTable)) {
        if (targets.has(call.target)) {
          foundInTargets = true;
          break;
        }
      }
      if (!foundInTargets) {
        find('warning', module, rule,
          `engine.ts calls transition('${call.target}') but no VALID_TRANSITIONS entry has it as a target`,
          { file: 'packages/engine/src/engine.ts', target: call.target });
      }
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 6: Quality Kaizen — State machine completeness (no orphaned states)
// ---------------------------------------------------------------------------

function checkStateMachineCompleteness() {
  const module = 'Quality Kaizen';
  const rule = 'state-machine-completeness';

  const transitions = read('packages/engine/src/transitions.ts');
  const transitionTable = extractTransitionTable(transitions);

  // Every state should be reachable (appears as a target in at least one transition)
  const allTargets = new Set();
  for (const targets of Object.values(transitionTable)) {
    for (const t of targets) {
      allTargets.add(t);
    }
  }

  for (const from of Object.keys(transitionTable)) {
    if (from !== 'uninitialized' && !allTargets.has(from)) {
      find('warning', module, rule,
        `State '${from}' is never a transition target (unreachable from other states)`,
        { file: 'packages/engine/src/transitions.ts', state: from });
    }
  }

  // Every state should have at least one outgoing transition
  for (const [from, targets] of Object.entries(transitionTable)) {
    if (targets.size === 0) {
      find('error', module, rule,
        `State '${from}' has no outgoing transitions (dead-end state)`,
        { file: 'packages/engine/src/transitions.ts', state: from });
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 7: Operation Kaizen — Canonical algorithm ID naming
// ---------------------------------------------------------------------------

function checkCanonicalNaming() {
  const module = 'Operation Kaizen';
  const rule = 'canonical-naming';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');

  // Known short aliases that should NOT be used as algorithm IDs in config or tests
  const bannedShortNames = new Set([
    'alpha', 'heuristic', 'genetic', 'inductive', 'astar',
    'powl', 'skeleton', 'correlation', 'alignment',
  ]);

  const ids = extractConstArrayValues(registry, 'ALGORITHM_IDS');

  for (const id of ids) {
    if (bannedShortNames.has(id)) {
      find('warning', module, rule,
        `ALGORITHM_IDS contains short alias '${id}' — use canonical name instead`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', id });
    }
  }

  // Check config tests for banned short names
  const configTestFiles = [
    'packages/config/src/__tests__/resolution.test.ts',
  ];

  for (const testFile of configTestFiles) {
    try {
      const content = read(testFile);
      for (const shortName of bannedShortNames) {
        // Match as a string value: 'shortName' or "shortName"
        const regex = new RegExp(`['"]${shortName}['"]`, 'g');
        const matches = content.match(regex);
        if (matches) {
          find('error', module, rule,
            `${testFile} uses banned short name '${shortName}' (${matches.length} occurrence(s)) — use canonical ID`,
            { file: testFile, shortName, count: matches.length });
        }
      }
    } catch {
      // file doesn't exist — skip
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 8: Operation Kaizen — No duplicate CLI aliases
// ---------------------------------------------------------------------------

function checkCliAliasUniqueness() {
  const module = 'Operation Kaizen';
  const rule = 'cli-alias-uniqueness';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');
  const aliases = extractRecordEntries(registry, 'ALGORITHM_CLI_ALIASES');

  const aliasToIds = {};
  for (const [id, alias] of Object.entries(aliases)) {
    if (!aliasToIds[alias]) {
      aliasToIds[alias] = [];
    }
    aliasToIds[alias].push(id);
  }

  for (const [alias, ids] of Object.entries(aliasToIds)) {
    if (ids.length > 1) {
      find('warning', module, rule,
        `CLI alias '${alias}' is used by multiple algorithms: ${ids.join(', ')}`,
        { file: 'packages/contracts/src/templates/algorithm-registry.ts', alias, ids });
    }
  }

  if (findings.filter(f => f.rule === rule).length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Check 9: Equipment Kaizen — PlanStepType covers all discover/import/convert/export/simulate from registry
// ---------------------------------------------------------------------------

function checkStepTypeCoverage() {
  const module = 'Equipment Kaizen';
  const rule = 'step-type-coverage';

  const registry = read('packages/contracts/src/templates/algorithm-registry.ts');
  const contractsSteps = read('packages/contracts/src/steps.ts');

  const stepTypeMap = extractRecordEntries(registry, 'ALGORITHM_ID_TO_STEP_TYPE');
  const validStepTypes = new Set(extractConstArrayValues(contractsSteps, 'PLAN_STEP_TYPE_VALUES'));

  const usedStepTypes = new Set(Object.values(stepTypeMap));

  // Check: are all step types from the registry used somewhere in PLAN_STEP_TYPE_VALUES?
  for (const stepType of usedStepTypes) {
    if (!validStepTypes.has(stepType)) {
      find('error', module, rule,
        `ALGORITHM_ID_TO_STEP_TYPE maps to '${stepType}' which is not in PLAN_STEP_TYPE_VALUES`,
        { file: 'packages/contracts/src/steps.ts', stepType });
    }
  }

  // Check for orphaned step types (in PLAN_STEP_TYPE_VALUES but never referenced by any registry entry)
  // This is informational — some step types are structural (bootstrap, cleanup, etc.)
  const referencedStepTypes = new Set(Object.values(stepTypeMap));
  const orphaned = [];
  for (const stepType of validStepTypes) {
    if (!referencedStepTypes.has(stepType)) {
      // Skip structural/lifecycle step types
      const structuralPrefixes = [
        'bootstrap', 'init_wasm', 'load_source', 'validate_source',
        'analyze_', 'ml_', 'filter_log', 'transform_log',
        'generate_reports', 'write_sink', 'cleanup',
        'discover_powl', // POWL steps managed separately
      ];
      const isStructural = structuralPrefixes.some(p => stepType.startsWith(p));
      if (!isStructural) {
        orphaned.push(stepType);
      }
    }
  }

  if (orphaned.length > 0) {
    find('info', module, rule,
      `PLAN_STEP_TYPE_VALUES has ${orphaned.length} unreferenced algorithm step types: ${orphaned.join(', ')}`,
      { stepTypes: orphaned });
  }

  if (findings.filter(f => f.rule === rule && f.severity === 'error').length === 0) {
    ok(module, rule);
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

function runAllChecks() {
  checkStepTypeSync();
  checkAlgorithmStepTypeTargets();
  checkRegistryKeyConsistency();
  checkProfileRegistryCoverage();
  checkStateMachineIntegrity();
  checkStateMachineCompleteness();
  checkCanonicalNaming();
  checkCliAliasUniqueness();
  checkStepTypeCoverage();
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const jsonMode = process.argv.includes('--json');

runAllChecks();

const errors = findings.filter(f => f.severity === 'error');
const warnings = findings.filter(f => f.severity === 'warning');
const infos = findings.filter(f => f.severity === 'info');

if (jsonMode) {
  console.log(JSON.stringify({
    status: errors.length > 0 ? 'fail' : 'pass',
    checks: checkCount,
    errors: errors.length,
    warnings: warnings.length,
    info: infos.length,
    findings,
  }, null, 2));
} else {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     TPS Pipeline Quality Gate                      ║');
  console.log('║     Equipment + Quality + Operation + Logistics     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  if (findings.length === 0) {
    console.log(`  All ${checkCount} checks passed.`);
  } else {
    for (const f of findings) {
      const icon = f.severity === 'error' ? '✗' : f.severity === 'warning' ? '⚠' : 'ℹ';
      const color = f.severity === 'error' ? '\x1b[31m' : f.severity === 'warning' ? '\x1b[33m' : '\x1b[36m';
      console.log(`  ${color}${icon}\x1b[0m [${f.module}] ${f.rule}: ${f.message}`);
      if (f.file) console.log(`    └─ ${f.file}`);
    }
  }

  console.log();
  console.log(`  Checks: ${checkCount}  |  Errors: ${errors.length}  |  Warnings: ${warnings.length}  |  Info: ${infos.length}`);
  console.log();

  if (errors.length > 0) {
    console.log('  \x1b[31mPIPELINE GATE FAILED\x1b[0m — fix errors before merging');
  } else if (warnings.length > 0) {
    console.log('  \x1b[33mPIPELINE GATE PASSED WITH WARNINGS\x1b[0m — review warnings');
  } else {
    console.log('  \x1b[32mPIPELINE GATE PASSED\x1b[0m');
  }
}

process.exit(errors.length > 0 ? 1 : 0);
