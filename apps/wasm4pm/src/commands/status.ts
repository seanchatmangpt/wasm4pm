import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { getRegistry, validateDeploymentProfile } from '@wasm4pm/kernel';
import { resolveConfig } from '@wasm4pm/config';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

const AUTOPROCESS_STATE_FILE = '.wasm4pm/autoprocess-state.json';

interface AutoprocessStateSnapshot {
  rl_state?: {
    cycle_count?: number;
    last_reward?: number;
    cumulative_reward?: number;
    active_agent?: number;
    active_agent_name?: string;
    last_action_label?: string;
    last_health_state?: number;
    last_spc_alert_count?: number;
    linucb_enabled?: boolean;
  };
  circuit_breaker_state?: {
    state?: number;
    failure_count?: number;
    success_count?: number;
  };
  spc_history?: unknown;
  saved_at?: string;
}

const CIRCUIT_STATE_NAMES = ['Closed', 'HalfOpen', 'Open'] as const;
const HEALTH_STATE_NAMES = ['Normal', 'Warning', 'Degraded', 'Critical', 'Failed'] as const;
const AGENT_NAMES = [
  'QLearning',
  'SARSA',
  'DoubleQLearning',
  'ExpectedSARSA',
  'REINFORCE',
] as const;

async function loadAutonomicState(): Promise<AutoprocessStateSnapshot | null> {
  try {
    const content = await fs.readFile(AUTOPROCESS_STATE_FILE, 'utf-8');
    return JSON.parse(content) as AutoprocessStateSnapshot;
  } catch {
    return null;
  }
}

export const status = defineCommand({
  meta: {
    name: 'status',
    description:
      'Show WASM engine health, algorithm registry, memory, and config provenance. ' +
      'Ex: wpm status  |  wpm status --show-config  |  wpm status --format json',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'show-config': {
      type: 'boolean',
      description:
        'Show resolved config values with per-key provenance (ENV / TOML / CLI / default)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const showConfig = Boolean(ctx.args['show-config']);
    const start = Date.now();

    let lateAlgorithmCount = 0;
    let lateWasmVersion = '';

    return withSpan(
      'status',
      { format },
      async () => {
        try {
          // Step 1: Gather system information
          const memoryUsage = process.memoryUsage();
          const uptime = process.uptime();

          // Step 2: Check WASM module status — fail fast if WASM unavailable
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get();
          const wasmLoaded = true;
          let wasmVersion: string | null = null;
          const kernelReady = true;
          let featureValidationResult:
            | {
                valid: boolean;
                profile: string;
                confidence: number;
                missingRequired: string[];
              }
            | null = null;

          // Try to get the version from the WASM module
          if (typeof wasm.get_version === 'function') {
            wasmVersion = String(wasm.get_version());
          }

          // Derive WASM deployment profile from feature flags returned by get_capabilities().
          // Feature presence is a monotonically increasing set: mobile ⊂ iot ⊂ edge ⊂ fog ⊂ browser.
          // We walk from broadest to narrowest to name the loaded profile.
          let wasmDeploymentProfile = 'browser';
          if (typeof wasm.get_capabilities === 'function') {
            try {
              const rawCaps = wasm.get_capabilities();
              const caps: {
                features?: {
                  powl?: boolean;
                  ocel?: boolean;
                  ml?: boolean;
                  streaming?: boolean;
                  conformance?: boolean;
                };
              } = typeof rawCaps === 'string' ? JSON.parse(rawCaps) : rawCaps;
              const f = caps.features ?? {};
              // Heuristic: browser = powl+ocel+ml; fog = ml+ocel (no powl); edge = streaming (no ml);
              // iot = conformance (no streaming); mobile = neither
              if (f.powl && f.ocel && f.ml) {
                wasmDeploymentProfile = 'browser';
              } else if (f.ml && f.ocel) {
                wasmDeploymentProfile = 'fog';
              } else if (f.streaming) {
                wasmDeploymentProfile = 'edge';
              } else if (f.conformance) {
                wasmDeploymentProfile = 'iot';
              } else {
                wasmDeploymentProfile = 'mobile';
              }
            } catch {
              // Non-fatal — leave as 'browser' (the default/full build)
            }
          }

          // Validate features against the claimed deployment profile
          try {
            const validation = validateDeploymentProfile(
              wasm as unknown as import('@wasm4pm/kernel').WasmModule,
              wasmDeploymentProfile as
                | 'mobile'
                | 'iot'
                | 'edge'
                | 'fog'
                | 'browser'
            );
            featureValidationResult = {
              valid: validation.valid,
              profile: validation.profile,
              confidence: validation.confidence,
              missingRequired: validation.missingRequired,
            };
          } catch {
            // Feature validation failure is non-fatal — continue with status report
            featureValidationResult = null;
          }

          // Step 3: Query algorithm registry count
          const registry = getRegistry();
          const allAlgorithms = registry.list();
          const algorithmCount = allAlgorithms.length;
          // Break down by output type for the registry summary
          const discoveryCount = allAlgorithms.filter(
            (a) =>
              a.outputType === 'dfg' ||
              a.outputType === 'petrinet' ||
              a.outputType === 'tree' ||
              a.outputType === 'declare'
          ).length;
          const mlCount = allAlgorithms.filter((a) => a.outputType === 'ml_result').length;
          const analyticsCount = allAlgorithms.filter((a) => a.outputType === 'analytics').length;
          lateAlgorithmCount = algorithmCount;
          lateWasmVersion = wasmVersion ?? '';

          // Step 3b: Resolve config to surface provenance (best-effort — no CLI overrides here).
          // Shows which config keys came from ENV, TOML, JSON, CLI, or defaults.
          // This is the data behind "algorithm: dfg (from ENV)" diagnostics.
          let configProvenance: Record<string, { source: string; path?: string }> = {};
          let configHash: string | null = null;
          let configFilePath: string | null = null;
          let configFileSource: 'toml' | 'json' | null = null;
          let configFileFound = false;
          let fullConfig: Record<string, unknown> | null = null;
          let membraneStatus: {
            enabled: boolean;
            custody_actions: string[];
            envelopes_path: string;
            source: string;
          } | null = null;
          try {
            const cfg = await resolveConfig();
            configHash = cfg.metadata.hash;
            // Flatten provenance for display: keep only non-default keys and the
            // "interesting keys" that operators most often override.
            const prov = cfg.metadata.provenance;
            const interestingKeys = new Set([
              'algorithm.name',
              'execution.profile',
              'output.format',
              'observability.logLevel',
              'prediction.enabled',
              'source.kind',
              'sink.kind',
            ]);
            for (const [key, entry] of Object.entries(prov)) {
              if (interestingKeys.has(key) || entry.source !== 'default') {
                configProvenance[key] = { source: entry.source, path: entry.path };
              }
            }

            // Derive config file path from provenance: any key sourced from toml/json has the path
            for (const entry of Object.values(prov)) {
              if ((entry.source === 'toml' || entry.source === 'json') && entry.path) {
                configFilePath = entry.path;
                configFileSource = entry.source;
                configFileFound = true;
                break;
              }
            }

            // Capture full config for --show-config rendering
            if (showConfig) {
              fullConfig = {
                source: cfg.source,
                sink: cfg.sink,
                algorithm: cfg.algorithm,
                execution: cfg.execution,
                observability: cfg.observability,
                watch: cfg.watch,
                output: cfg.output,
                prediction: (cfg as unknown as Record<string, unknown>).prediction,
                ml: (cfg as unknown as Record<string, unknown>).ml,
                rl: (cfg as unknown as Record<string, unknown>).rl,
              };
            }

            // Extract membrane section — present when enabled or explicitly configured
            type CfgWithMembrane = typeof cfg & {
              membrane?: {
                enabled?: boolean;
                custody_actions?: string[];
                envelopes?: { path?: string };
              };
            };
            const memCfg = (cfg as CfgWithMembrane).membrane;
            if (memCfg !== undefined) {
              membraneStatus = {
                enabled: memCfg.enabled === true,
                custody_actions: memCfg.custody_actions ?? [],
                envelopes_path: memCfg.envelopes?.path ?? '.wasm4pm/envelopes',
                source: prov['membrane.enabled']?.source ?? 'default',
              };
            }
          } catch {
            // Config load failures are non-fatal for the status command
          }

          // Step 4: Load autonomic state (best-effort — may not exist yet)
          const autonomicState = await loadAutonomicState();
          const rl = autonomicState?.rl_state ?? null;
          const cb = autonomicState?.circuit_breaker_state ?? null;
          const autonomic = autonomicState
            ? {
                active: true,
                saved_at: autonomicState.saved_at ?? null,
                cycle_count: rl?.cycle_count ?? 0,
                last_action: rl?.last_action_label ?? 'none',
                last_reward: rl?.last_reward ?? 0,
                cumulative_reward: rl?.cumulative_reward ?? 0,
                active_agent: AGENT_NAMES[rl?.active_agent ?? 0] ?? 'QLearning',
                active_agent_name: rl?.active_agent_name ?? 'QLearning',
                linucb_enabled: rl?.linucb_enabled ?? false,
                health_state: HEALTH_STATE_NAMES[rl?.last_health_state ?? 0] ?? 'Normal',
                spc_alerts: rl?.last_spc_alert_count ?? 0,
                circuit_state: CIRCUIT_STATE_NAMES[cb?.state ?? 0] ?? 'Closed',
                circuit_failures: cb?.failure_count ?? 0,
                circuit_successes: cb?.success_count ?? 0,
              }
            : { active: false };

          // Step 4b: Measure WASM binary size on disk (best-effort — non-fatal if not found).
          // The .wasm file lives at <workspace>/wasm4pm/pkg/wasm4pm_bg.wasm relative to
          // process.cwd() when run from the monorepo, or two directories up from the CLI dist dir.
          let wasmBinarySize: number | null = null;
          try {
            // Use import.meta.url to locate this module and walk up to the workspace root.
            // This module compiles to dist/commands/status.js (not dist/bin/wpm.js), so
            // strip everything from /apps/wasm4pm/dist/ onward to reach the workspace root.
            const cliFileUrl = new URL(import.meta.url);
            const cliFilePath = cliFileUrl.pathname;
            // Pattern covers both dist/bin/ and dist/commands/ (and any other dist sub-path)
            const workspaceRoot = cliFilePath.replace(/\/apps\/wasm4pm\/dist\/.*$/, '');
            const wasmBinaryPath = `${workspaceRoot}/wasm4pm/pkg/wasm4pm_bg.wasm`;
            const wasmStat = await fs.stat(wasmBinaryPath).catch(() => null);
            if (wasmStat) {
              wasmBinarySize = wasmStat.size;
            }
          } catch {
            // Non-fatal — wasmBinarySize stays null
          }

          // Step 5: Build status report
          const statusReport = {
            engine: {
              // State reflects actual lifecycle: loader.init() + loader.get() above succeeded,
              // so 'ready' is always accurate here (failures hit the catch block first).
              state: 'ready',
              wasmLoaded,
              kernelReady,
              version: wasmVersion,
              deploymentProfile: wasmDeploymentProfile,
              wasmBinarySize,
              features_validated: featureValidationResult?.valid ?? false,
              feature_validation_confidence: featureValidationResult?.confidence ?? 0,
              algorithmCount,
              algorithmBreakdown: {
                discovery: discoveryCount,
                ml: mlCount,
                analytics: analyticsCount,
              },
              // verbose=true: include full algorithm ID list for machine-readable consumers.
              // Closes the gap where --verbose with --format json returned identical payload
              // to non-verbose mode. The IDs are the canonical names from @wasm4pm/kernel.
              algorithms: verbose ? allAlgorithms.map((a) => a.id) : undefined,
              health: {
                // Summarises WASM + autonomic health in a single machine-readable field.
                // ok: all subsystems nominal; degraded: autonomic circuit open or health >= Warning;
                // error: WASM not loaded (never reached here — loader throws first).
                overall: (() => {
                  const a = autonomicState;
                  if (!a) return 'ok';
                  const cbState = a.circuit_breaker_state?.state ?? 0;
                  const healthLevel = a.rl_state?.last_health_state ?? 0;
                  if (cbState === 2 /* Open */ || healthLevel >= 2 /* Degraded */)
                    return 'degraded';
                  if (healthLevel >= 4 /* Failed */) return 'error';
                  return 'ok';
                })(),
                autonomicActive: autonomicState !== null,
                circuitState: autonomicState
                  ? (CIRCUIT_STATE_NAMES[autonomicState.circuit_breaker_state?.state ?? 0] ??
                    'Closed')
                  : 'Closed',
              },
            },
            system: {
              platform: process.platform,
              arch: process.arch,
              nodeVersion: process.version,
              uptime: Math.round(uptime),
              timestamp: new Date().toISOString(),
            },
            memory: {
              heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
              heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
              external: Math.round(memoryUsage.external / 1024 / 1024),
              rss: Math.round(memoryUsage.rss / 1024 / 1024),
            },
            autonomic,
            membrane: membraneStatus,
            config: {
              hash: configHash,
              file: configFileFound ? { path: configFilePath, source: configFileSource } : null,
              provenance: configProvenance,
              full: fullConfig,
            },
          };

          const result = makeResult('status', statusReport, Date.now() - start);
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const r = res.payload;
            p.info('System Status Report');
            p.log('');

            // Engine status section
            p.log('Engine Status:');
            p.log(`  State: ${r.engine.state}`);
            p.log(`  WASM Loaded: Yes`);
            if (r.engine.version) {
              p.log(`  WASM Version: ${r.engine.version}`);
            }
            p.log(`  WASM Deployment Profile: ${r.engine.deploymentProfile}`);
            const bsz = r.engine.wasmBinarySize as number | null | undefined;
            if (bsz !== null && bsz !== undefined) {
              const bszMb = (bsz / 1024 / 1024).toFixed(2);
              p.log(`  WASM Binary Size: ${bszMb} MB (${bsz.toLocaleString()} bytes)`);
            }
            p.log(
              `  Features Validated: ${r.engine.features_validated ? 'Yes' : 'No'} (confidence: ${(r.engine.feature_validation_confidence * 100).toFixed(0)}%)`
            );
            p.log(`  Kernel Ready: Yes`);
            p.log(
              `  Algorithm Count: ${r.engine.algorithmCount}` +
                ` (discovery: ${r.engine.algorithmBreakdown.discovery}, ` +
                `ml: ${r.engine.algorithmBreakdown.ml}, ` +
                `analytics: ${r.engine.algorithmBreakdown.analytics})`
            );

            // System section
            p.log('');
            p.log('System Information:');
            p.log(`  Platform: ${r.system.platform}/${r.system.arch}`);
            p.log(`  Node Version: ${r.system.nodeVersion}`);
            p.log(`  Uptime: ${Math.floor(r.system.uptime / 60)}m ${r.system.uptime % 60}s`);

            // Memory section
            p.log('');
            p.log('Memory Usage:');
            p.log(`  Heap Used: ${r.memory.heapUsed} MB`);
            p.log(`  Heap Total: ${r.memory.heapTotal} MB`);
            p.log(`  RSS: ${r.memory.rss} MB`);
            p.log(`  External: ${r.memory.external} MB`);

            // Autonomic subsystem section
            p.log('');
            p.log('Autonomic Subsystem:');
            const a = r.autonomic as Record<string, unknown>;
            if (!a.active) {
              p.log('  State: not yet active (run `wpm autoprocess <log>` to initialize)');
            } else {
              p.log(`  State: active (last saved: ${a.saved_at ?? 'unknown'})`);
              p.log(
                `  RL Agent: ${a.active_agent_name} (LinUCB: ${a.linucb_enabled ? 'on' : 'off'})`
              );
              p.log(`  Cycles: ${a.cycle_count}  Last action: ${a.last_action}`);
              const lastRwd = typeof a.last_reward === 'number' ? a.last_reward : 0;
              const cumRwd = typeof a.cumulative_reward === 'number' ? a.cumulative_reward : 0;
              p.log(
                `  Reward: ${lastRwd >= 0 ? '+' : ''}${(lastRwd as number).toFixed(3)} last  /  ${cumRwd >= 0 ? '+' : ''}${(cumRwd as number).toFixed(3)} cumulative`
              );
              p.log(`  Health: ${a.health_state}  SPC alerts (last cycle): ${a.spc_alerts}`);
              const circuitIcon =
                a.circuit_state === 'Open'
                  ? '! OPEN'
                  : a.circuit_state === 'HalfOpen'
                    ? '~ HALF-OPEN'
                    : '+ Closed';
              p.log(
                `  Circuit breaker: ${circuitIcon}  (failures: ${a.circuit_failures}, successes: ${a.circuit_successes})`
              );
            }

            // AutoMembrane section — shown whenever membrane is configured (enabled or disabled).
            // Closes the gap where WASM4PM_MEMBRANE_ENABLED=true had zero visibility in status.
            const mem = r.membrane as {
              enabled: boolean;
              custody_actions: string[];
              envelopes_path: string;
              source: string;
            } | null;
            if (mem !== null) {
              p.log('');
              p.log('AutoMembrane:');
              const memState = mem.enabled ? 'enabled' : 'disabled';
              p.log(`  State: ${memState} (config source: ${mem.source})`);
              if (mem.enabled) {
                p.log(`  Custody actions: ${mem.custody_actions.join(', ') || '(none)'}`);
                p.log(`  Envelopes path: ${mem.envelopes_path}`);
                p.log('  Run `wpm membrane check` to verify envelope readiness.');
              } else {
                p.log(
                  '  Set WASM4PM_MEMBRANE_ENABLED=true or add [membrane] enabled=true to wasm4pm.toml to activate.'
                );
              }
            }

            // Config provenance section — always shows key sources; --verbose shows all overrides.
            // This closes the gap where a user setting WASM4PM_ALGORITHM=dfg had no feedback
            // that their ENV var was actually being picked up.
            p.log('');
            p.log('Config:');
            const cfg = r.config as {
              hash: string | null;
              file: { path: string | null; source: string | null } | null;
              provenance: Record<string, { source: string; path?: string }>;
              full: Record<string, unknown> | null;
            };

            // Config file discovery status
            if (cfg.file) {
              p.log(`  File: ${cfg.file.path}  [${String(cfg.file.source).toUpperCase()}]`);
            } else {
              p.log('  File: not found — using defaults');
              p.log('  Tip: run "wpm init" to scaffold wasm4pm.toml in the current directory');
            }

            if (cfg.hash) {
              p.log(`  Hash: ${cfg.hash.slice(0, 16)}...`);
            }

            p.log('');
            p.log('Config Provenance:');
            const provEntries = Object.entries(cfg.provenance);
            if (provEntries.length === 0) {
              p.log('  All values from defaults (no config file or ENV overrides detected)');
            } else {
              // Always show the two most operator-visible keys
              const priorityKeys = ['algorithm.name', 'execution.profile'];
              for (const key of priorityKeys) {
                if (cfg.provenance[key]) {
                  const entry = cfg.provenance[key];
                  const loc = entry.path ? ` (${entry.path})` : '';
                  p.log(`  ${key}: ${entry.source}${loc}`);
                }
              }
              if (verbose) {
                // In verbose mode, show all non-default provenance keys beyond the priority ones
                const nonDefault = provEntries.filter(
                  ([k, v]) => v.source !== 'default' && !priorityKeys.includes(k)
                );
                if (nonDefault.length > 0) {
                  p.log('  Additional overrides:');
                  for (const [key, entry] of nonDefault) {
                    const loc = entry.path ? ` (${entry.path})` : '';
                    p.log(`    ${key}: ${entry.source}${loc}`);
                  }
                }
              } else {
                const nonDefaultCount = provEntries.filter(
                  ([k, v]) => v.source !== 'default' && !priorityKeys.includes(k)
                ).length;
                if (nonDefaultCount > 0) {
                  p.log(
                    `  (+${nonDefaultCount} more overridden key(s) — use --verbose to see all)`
                  );
                }
              }
            }

            // --show-config: render the full resolved config with per-key provenance.
            // Answers "why is my algorithm set to dfg when I set genetic_algorithm in my toml?"
            if (showConfig && cfg.full) {
              p.log('');
              p.log('Resolved Config (with provenance):');
              p.log('  ' + '─'.repeat(76));

              // Flatten the full config into dot-notation key-value pairs
              function flattenObj(
                obj: Record<string, unknown>,
                prefix = ''
              ): Array<[string, unknown]> {
                const entries: Array<[string, unknown]> = [];
                for (const [k, v] of Object.entries(obj)) {
                  if (v === undefined || v === null) continue;
                  const fullKey = prefix ? `${prefix}.${k}` : k;
                  if (
                    typeof v === 'object' &&
                    !Array.isArray(v) &&
                    Object.keys(v as object).length > 0
                  ) {
                    entries.push(...flattenObj(v as Record<string, unknown>, fullKey));
                  } else {
                    entries.push([fullKey, v]);
                  }
                }
                return entries;
              }

              const flatEntries = flattenObj(cfg.full);
              const maxKeyLen = Math.min(40, Math.max(...flatEntries.map(([k]) => k.length)));

              for (const [key, value] of flatEntries) {
                const prov = cfg.provenance[key];
                const sourceTag = prov
                  ? `[${prov.source.toUpperCase()}${prov.path ? ` ${prov.path}` : ''}]`
                  : '[DEFAULT]';
                const valStr = Array.isArray(value) ? JSON.stringify(value) : String(value);
                p.log(`  ${key.padEnd(maxKeyLen)}  ${valStr.padEnd(20)}  ${sourceTag}`);
              }

              p.log('');
              p.log('  Run "wpm config show --detailed" for ENV variable reference.');
            } else if (showConfig) {
              p.log('');
              p.log('  Config could not be resolved — run "wpm config check" for errors.');
            }

            if (!showConfig) {
              p.log('');
              p.log('  Tip: use --show-config to see all resolved values with per-key provenance.');
              p.log('  Tip: use "wpm config show" for a focused config view.');
            }

            p.log('');
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult('status', error, EXIT_CODES.system_error, 'STATUS_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      () => ({ algorithm_count: lateAlgorithmCount, wasm_version: lateWasmVersion })
    ); // end withSpan
  },
});
