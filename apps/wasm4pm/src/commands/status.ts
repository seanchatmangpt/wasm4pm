import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { getRegistry } from '@wasm4pm/kernel';
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
const AGENT_NAMES = ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'] as const;

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
    description: 'Show status of discovery operations and system health',
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
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
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

      // Try to get the version from the WASM module
      if (typeof wasm.get_version === 'function') {
        wasmVersion = String(wasm.get_version());
      }

      // Step 3: Query algorithm registry count
      const registry = getRegistry();
      const algorithmCount = registry.list().length;
      lateAlgorithmCount = algorithmCount;
      lateWasmVersion = wasmVersion ?? '';

      // Step 3b: Resolve config to surface provenance (best-effort — no CLI overrides here).
      // Shows which config keys came from ENV, TOML, JSON, CLI, or defaults.
      // This is the data behind "algorithm: dfg (from ENV)" diagnostics.
      let configProvenance: Record<string, { source: string; path?: string }> = {};
      let configHash: string | null = null;
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

      // Step 5: Build status report
      const statusReport = {
        engine: {
          state: 'ready',
          wasmLoaded,
          kernelReady,
          version: wasmVersion,
          algorithmCount,
        },
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          uptime: Math.round(uptime),
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
          provenance: configProvenance,
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
        p.log(`  Kernel Ready: Yes`);
        p.log(`  Algorithm Count: ${r.engine.algorithmCount}`);

        // System section
        p.log('');
        p.log('System Information:');
        p.log(`  Platform: ${r.system.platform}/${r.system.arch}`);
        p.log(`  Node Version: ${r.system.nodeVersion}`);
        p.log(
          `  Uptime: ${Math.floor(r.system.uptime / 60)}m ${r.system.uptime % 60}s`
        );

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
          p.log(`  RL Agent: ${a.active_agent_name} (LinUCB: ${a.linucb_enabled ? 'on' : 'off'})`);
          p.log(`  Cycles: ${a.cycle_count}  Last action: ${a.last_action}`);
          const lastRwd = typeof a.last_reward === 'number' ? a.last_reward : 0;
          const cumRwd = typeof a.cumulative_reward === 'number' ? a.cumulative_reward : 0;
          p.log(`  Reward: ${lastRwd >= 0 ? '+' : ''}${(lastRwd as number).toFixed(3)} last  /  ${cumRwd >= 0 ? '+' : ''}${(cumRwd as number).toFixed(3)} cumulative`);
          p.log(`  Health: ${a.health_state}  SPC alerts (last cycle): ${a.spc_alerts}`);
          const circuitIcon = a.circuit_state === 'Open' ? '! OPEN' : a.circuit_state === 'HalfOpen' ? '~ HALF-OPEN' : '+ Closed';
          p.log(`  Circuit breaker: ${circuitIcon}  (failures: ${a.circuit_failures}, successes: ${a.circuit_successes})`);
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
            p.log('  Set WASM4PM_MEMBRANE_ENABLED=true or add [membrane] enabled=true to wasm4pm.toml to activate.');
          }
        }

        // Config provenance section — always shows key sources; --verbose shows all overrides.
        // This closes the gap where a user setting WASM4PM_ALGORITHM=dfg had no feedback
        // that their ENV var was actually being picked up.
        p.log('');
        p.log('Config Provenance:');
        const cfg = r.config as { hash: string | null; provenance: Record<string, { source: string; path?: string }> };
        if (cfg.hash) {
          p.log(`  Hash: ${cfg.hash.slice(0, 16)}...`);
        }
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
              p.log(`  (+${nonDefaultCount} more overridden key(s) — use --verbose to see all)`);
            }
          }
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
      () => ({ algorithm_count: lateAlgorithmCount, wasm_version: lateWasmVersion }),
    ); // end withSpan
  },
});
