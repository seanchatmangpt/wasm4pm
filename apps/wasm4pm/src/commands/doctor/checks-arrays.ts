// Check arrays — used by subcommands and re-exported from index.ts
// Kept in a separate file to break the circular dependency between subcommands.ts and index.ts
import type { Diagnosis } from './types.js';
import {
  checkNodeVersion,
  checkPnpmVersion,
  checkWasmBinary,
  checkWasmLoads,
  checkSimdSupport,
  checkConfigFound,
  checkConfigValidation,
  checkXesFiles,
  checkSystemMemory,
  checkDiskSpace,
  checkGitHooks,
  checkTypeScriptCompilation,
  checkMicroMl,
  checkRustToolchain,
  checkResultsDir,
  checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
  checkBinaryShadow,
} from './checks-env.js';

import {
  checkStepTypeSync,
  checkRegistryConsistency,
  checkStateMachineIntegrity,
  checkProfileCoverage,
  checkCanonicalNaming,
  checkStepTypeCoverage,
  checkStateMachineCompleteness,
} from './checks-tps.js';

import {
  checkClaudeCodeSettings,
  checkHookFiles,
  checkClaudeMd,
  checkMemoryIndex,
  checkAlgoRegistryCount,
  checkAlgoDfgSmoke,
  checkAlgoHeuristicSmoke,
  checkAlgoMlSmoke,
  checkAlgoStreamingSmoke,
  checkDataXesParser,
  checkDataOcelParser,
  checkDataInvalidXes,
  checkDataEmptyLog,
  checkOutputExitCodes,
  checkOutputJsonFormat,
  checkOutputHumanFormat,
  checkOutputReceiptSchema,
  checkOtelSpanSinkExists,
  checkOtelSpanNameFormat,
  checkOtelServiceName,
  checkConfigEnvPrefix,
  checkConfigTomlParse,
  checkConfigPrecedence,
} from './checks-extended.js';

export const ENV_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkNodeVersion,
  checkPnpmVersion,
  checkWasmBinary,
  checkWasmLoads,
  checkSimdSupport,
  checkConfigFound,
  checkConfigValidation,
  checkXesFiles,
  checkSystemMemory,
  checkDiskSpace,
  checkGitHooks,
  checkTypeScriptCompilation,
  checkMicroMl,
  checkRustToolchain,
  checkResultsDir,
  checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
  checkBinaryShadow,
];

export const TPS_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkStepTypeSync,
  checkRegistryConsistency,
  checkStateMachineIntegrity,
  checkProfileCoverage,
  checkCanonicalNaming,
  checkStepTypeCoverage,
  checkStateMachineCompleteness,
];

export const CLAUDE_CODE_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkClaudeCodeSettings,
  checkHookFiles,
  checkClaudeMd,
  checkMemoryIndex,
];

export const ALGO_HEALTH_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkAlgoRegistryCount,
  checkAlgoDfgSmoke,
  checkAlgoHeuristicSmoke,
  checkAlgoMlSmoke,
  checkAlgoStreamingSmoke,
];

export const DATA_QUALITY_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkDataXesParser,
  checkDataOcelParser,
  checkDataInvalidXes,
  checkDataEmptyLog,
];

export const OUTPUT_CONTRACT_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkOutputExitCodes,
  checkOutputJsonFormat,
  checkOutputHumanFormat,
  checkOutputReceiptSchema,
];

export const OBSERVABILITY_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkOtelSpanSinkExists,
  checkOtelSpanNameFormat,
  checkOtelServiceName,
];

export const CONFIG_SYSTEM_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkConfigEnvPrefix,
  checkConfigTomlParse,
  checkConfigPrecedence,
];

export const ALL_CHECKS = [
  ...ENV_CHECKS,
  ...TPS_CHECKS,
  ...CLAUDE_CODE_CHECKS,
  ...ALGO_HEALTH_CHECKS,
  ...DATA_QUALITY_CHECKS,
  ...OUTPUT_CONTRACT_CHECKS,
  ...OBSERVABILITY_CHECKS,
  ...CONFIG_SYSTEM_CHECKS,
];
