// Doctor command module — executable diagnostics, Vision 2030 capability audit,
// and receipt-gated structured repair.
import { defineCommand } from 'citty';
import { runChecks } from './run.js';
import {
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALGO_HEALTH_CHECKS,
  DATA_QUALITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  OBSERVABILITY_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  BRCE_CHECKS,
  ALL_CHECKS,
} from './checks-arrays.js';
import {
  doctorCheck as legacyDoctorCheck,
  doctorPublish,
  doctorEnv as legacyDoctorEnv,
  doctorTps as legacyDoctorTps,
  doctorPerf,
  doctorWatch,
  doctorReport,
} from './subcommands.js';
import { doctorHooks } from './hooks-jtbd.js';
import { doctorCapabilities } from './capabilities-command.js';
import { doctorRepairCommand, runDoctorRepair } from './repair-command.js';
import { exitWithFlush } from '../../otel/exit.js';

export const doctorCheck = defineCommand({
  ...legacyDoctorCheck,
  meta: {
    ...legacyDoctorCheck.meta,
    name: 'check',
    description: `Run all ${ALL_CHECKS.length} registered health checks or an admitted filtered subset`,
  },
});

export const doctorEnv = defineCommand({
  ...legacyDoctorEnv,
  meta: {
    ...legacyDoctorEnv.meta,
    name: 'env',
    description: `Run the ${ENV_CHECKS.length} registered environment checks`,
  },
});

export const doctorTps = defineCommand({
  ...legacyDoctorTps,
  meta: {
    ...legacyDoctorTps.meta,
    name: 'tps',
    description: `Run the ${TPS_CHECKS.length} registered process-route integrity checks`,
  },
});

// Re-export types
export type { DoctorOptions, Pathology, Severity, RepairMode, Diagnosis, DoctorReport } from './types.js';
export type {
  CapabilityDefinition,
  CapabilityEvidence,
  CapabilityStanding,
  Vision2030Report,
} from './vision2030.js';
export type {
  PlannedRepair,
  RepairExecutionReport,
  RepairIntent,
  RepairIntentId,
  RepairOutcome,
} from './repair-broker.js';

// Re-export check arrays
export {
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALGO_HEALTH_CHECKS,
  DATA_QUALITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  OBSERVABILITY_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  BRCE_CHECKS,
  ALL_CHECKS,
} from './checks-arrays.js';

// Re-export check functions
export {
  resolveWorkspaceRoot,
  resolveWasmPkgDir,
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
  checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
  checkBinaryShadow,
} from './checks-env.js';
export {
  checkDoctorRepairBroker,
  checkResultsDirNoActuation,
  checkResultsDirNoActuation as checkResultsDir,
} from './safe-checks.js';

export {
  getCachedWorkspaceRoot,
  readSourceFile,
  hasSourceAccess,
  checkStepTypeSync,
  checkRegistryConsistency,
  checkStateMachineIntegrity,
  checkProfileCoverage,
  checkCanonicalNaming,
  checkStepTypeCoverage,
  checkStateMachineCompleteness,
} from './checks-tps.js';

export {
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

export type { JtbdProbe } from './hooks-jtbd.js';
export { runHook, probeHooks, doctorHooks } from './hooks-jtbd.js';

export {
  doctorPerf,
  doctorWatch,
  doctorReport,
  doctorPublish,
} from './subcommands.js';
export { doctorCapabilities } from './capabilities-command.js';
export { runVision2030Audit, VISION_2030_CAPABILITIES } from './capabilities.js';
export {
  executeRepairPlan,
  planRepairs,
  REPAIR_INTENTS,
  validateRepairRegistry,
} from './repair-broker.js';
export { doctorRepairCommand, doctorRepairCommand as doctorFix, runDoctorRepair } from './repair-command.js';

// ────────────────────────────────────────────────────────────────────────────
// Main doctor command (with subcommands + backwards-compatible fallback)
// ────────────────────────────────────────────────────────────────────────────

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: `Check environment and pipeline integrity (${ALL_CHECKS.length} checks), audit Vision 2030 capabilities, or execute receipt-gated repairs.`,
  },
  subCommands: {
    check: doctorCheck,
    fix: doctorRepairCommand,
    capabilities: doctorCapabilities,
    publish: doctorPublish,
    env: doctorEnv,
    tps: doctorTps,
    perf: doctorPerf,
    watch: doctorWatch,
    report: doctorReport,
    hooks: doctorHooks,
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    fix: {
      type: 'boolean',
      description:
        'Backwards-compatible safe repair: receipt-gated results-directory/config scaffolding only',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
  },
  async run(ctx) {
    if (ctx && ctx.rawArgs && ctx.cmd && ctx.cmd.subCommands) {
      const subCommands = Object.keys(ctx.cmd.subCommands);
      const hasSubcommand = ctx.rawArgs.some((arg) => subCommands.includes(arg));
      if (hasSubcommand) return;
    }

    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    if (Boolean(ctx.args.fix)) {
      const exitCode = await runDoctorRepair({
        format,
        verbose,
        quiet,
        dryRun: false,
        authorized: true,
        only: ['ensure-results-directory', 'scaffold-config'],
        commandName: 'doctor --fix',
      });
      return await exitWithFlush(exitCode);
    }

    await runChecks(
      ALL_CHECKS,
      format,
      verbose,
      quiet,
      { registered_check_count: ALL_CHECKS.length },
      undefined,
      'doctor'
    );
  },
});

// Also export as doctorCommand for index exports
export { doctor as doctorCommand };
