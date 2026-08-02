import * as fs from 'node:fs/promises';
import { constants, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { Diagnosis } from './types.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import { REPAIR_INTENTS, validateRepairRegistry } from './repair-broker.js';

/**
 * Inspection-only replacement for the legacy results-directory check.
 * A diagnostic command may observe missing state; it may not manufacture it.
 */
export async function checkResultsDirNoActuation(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: 'Workspace root not found; results-directory writability is UNKNOWN',
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Run the command from an admitted wasm4pm workspace.',
    };
  }

  const resultsDir = path.join(rootDir, '.wasm4pm', 'results');
  if (!existsSync(resultsDir)) {
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: '.wasm4pm/results/ is absent; inspection did not create it',
      repairMode: 'AUTO_REPAIR',
      repairCommand: 'wpm system doctor fix --only ensure-results-directory --yes',
      fix: 'wpm system doctor fix --only ensure-results-directory --yes',
    };
  }

  if (!statSync(resultsDir).isDirectory()) {
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: '.wasm4pm/results exists but is not a directory',
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Move the conflicting path, then replay doctor.',
    };
  }

  try {
    await fs.access(resultsDir, constants.W_OK);
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: '.wasm4pm/results/ exists and is writable',
    };
  } catch (error) {
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `.wasm4pm/results/ is not writable: ${error instanceof Error ? error.message : String(error)}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Repair directory ownership or permissions, then replay doctor.',
    };
  }
}

/** Executable source-level admission check for the structured repair registry. */
export async function checkDoctorRepairBroker(): Promise<Diagnosis> {
  const violations = validateRepairRegistry();
  if (violations.length > 0) {
    return {
      name: 'Doctor repair broker',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Structured repair registry rejected: ${violations.join('; ')}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Repair the registry before enabling doctor actuation.',
    };
  }

  const shellActions = REPAIR_INTENTS.filter(
    (intent) => intent.action.kind === 'spawn' && intent.action.program.includes(' ')
  );
  if (shellActions.length > 0) {
    return {
      name: 'Doctor repair broker',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Shell-string repair actions refused: ${shellActions.map((intent) => intent.id).join(', ')}`,
    };
  }

  return {
    name: 'Doctor repair broker',
    pathology: 'ANTI_LIE_TRUTH_FAULT',
    severity: 'INFO',
    message: `${REPAIR_INTENTS.length} structured repair intents admitted; shell execution disabled; pre-actuation receipts required`,
  };
}
