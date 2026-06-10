// Doctor command module — re-exports all types, check arrays, and the main command
import { defineCommand } from 'citty';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { ConsoleProjection } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runChecks } from './run.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import {
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALGO_HEALTH_CHECKS,
  DATA_QUALITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  OBSERVABILITY_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  ALL_CHECKS,
} from './checks-arrays.js';

// Re-export types
export type { DoctorOptions, Pathology, Severity, RepairMode, Diagnosis, DoctorReport } from './types.js';

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
  checkResultsDir,
  checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
  checkBinaryShadow,
} from './checks-env.js';

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
  doctorCheck,
  doctorEnv,
  doctorTps,
  doctorFix,
  doctorPerf,
  doctorWatch,
  doctorReport,
  doctorPublish,
} from './subcommands.js';

// ────────────────────────────────────────────────────────────────────────────
// Main doctor command (with subcommands + backwards-compat fallback)
// ────────────────────────────────────────────────────────────────────────────

import { doctorCheck, doctorFix, doctorPublish, doctorEnv, doctorTps, doctorPerf, doctorWatch, doctorReport } from './subcommands.js';
import { doctorHooks } from './hooks-jtbd.js';

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description:
      'Check environment health (47 checks) and pipeline integrity. Subcommands: check, fix, publish, env, tps, perf, watch, report',
  },
  subCommands: {
    check: doctorCheck,
    fix: doctorFix,
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
      description: 'Auto-fix safe issues: create missing .wasm4pm/results/ directory and scaffold wasm4pm.toml if absent',
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
      if (hasSubcommand) {
        return;
      }
    }
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const doFix = Boolean(ctx.args.fix);

    // --fix: apply safe auto-fixes before running checks
    if (doFix) {
      const rootDir = resolveWorkspaceRoot() ?? process.cwd();
      const resultsDir = path.join(rootDir, '.wasm4pm', 'results');
      const tomlPath = path.join(rootDir, 'wasm4pm.toml');

      // Fix 1: Ensure .wasm4pm/results/ exists
      try {
        mkdirSync(resultsDir, { recursive: true });
        if (format !== 'json') {
          const p = new ConsoleProjection({ verbose, quiet });
          p.log(`  [FIX] Created ${path.relative(rootDir, resultsDir) || '.wasm4pm/results'}`);
        }
      } catch { /* already exists or unwritable — check will surface it */ }

      // Fix 2: Scaffold wasm4pm.toml if absent
      if (!existsSync(tomlPath)) {
        try {
          writeFileSync(tomlPath, `# wasm4pm configuration — created by wpm doctor --fix\n[algorithm]\nname = "dfg"\n\n[execution]\nprofile = "balanced"\n`);
          if (format !== 'json') {
            const p = new ConsoleProjection({ verbose, quiet });
            p.log(`  [FIX] Scaffolded wasm4pm.toml with default settings`);
          }
        } catch { /* write failed — check will surface it */ }
      }
    }

    await runChecks(ALL_CHECKS, format, verbose, quiet, { fix_applied: doFix }, undefined, 'doctor');
  },
});

// Also export as doctorCommand for the shim
export { doctor as doctorCommand };
