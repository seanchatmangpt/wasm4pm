/**
 * Example — Autonomous RL-based pipeline monitoring
 *
 * Drives the WASM RlOrchestrator over N cycles, feeding synthetic telemetry,
 * and reports whether the policy is improving (mean reward of last 10 cycles
 * vs. first 10 cycles).
 *
 * This is the same shape used by `wpm autoprocess` internally — useful as
 * a template for embedding the RL loop in your own service.
 *
 * Run:
 *   tsx examples/rl-monitoring.ts 50    # 50 cycles
 *
 * Docs:
 *   docs/rl-system.md
 *   .claude/rules/ml-rl-testing.md
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Direct WASM import — bypasses CLI wrappers (see CLAUDE.md gotchas).
const wasm = require('../wasm4pm/pkg/pictl.js') as {
  RlOrchestrator: new (seed: bigint) => RlOrchestratorWasm;
};

interface RlOrchestratorWasm {
  run_cycle(telemetryJson: string): string;
  advance_clock(ticks: number): void;
  free(): void;
}

interface CycleTelemetry {
  event_count: number;
  trace_count: number;
  unique_activities: number;
  spc_alerts: number;
  drift_status: 0 | 1 | 2;
  rework_ratio: number;
  guard_pass: boolean;
  circuit_allowed: boolean;
}

const parse = <T>(r: unknown): T => (typeof r === 'string' ? JSON.parse(r) : (r as T));

function syntheticTelemetry(cycle: number): CycleTelemetry {
  // Mild non-stationarity: gradual increase in drift, occasional SPC alerts.
  const phase = Math.floor(cycle / 10);
  return {
    event_count: 1000 + cycle * 5,
    trace_count: 50 + cycle,
    unique_activities: 8,
    spc_alerts: cycle % 7 === 0 ? 1 : 0,
    drift_status: phase < 2 ? 0 : phase < 4 ? 1 : 2,
    rework_ratio: 0.05 + (cycle % 5) * 0.01,
    guard_pass: cycle % 13 !== 0,
    circuit_allowed: true,
  };
}

async function main(numCycles: number): Promise<void> {
  const seed = 42n;
  const orch = new wasm.RlOrchestrator(seed);
  const rewards: number[] = [];

  console.log(`running RL orchestrator: ${numCycles} cycles, seed=${seed}`);
  for (let i = 0; i < numCycles; i++) {
    const telemetry = syntheticTelemetry(i);
    const result = parse<{ reward: number; agent: string; health: number }>(
      orch.run_cycle(JSON.stringify(telemetry)),
    );
    rewards.push(result.reward);
    if (i % 5 === 0) {
      console.log(
        `  cycle ${String(i).padStart(3)} agent=${result.agent.padEnd(16)} health=${result.health} reward=${result.reward.toFixed(2)}`,
      );
    }
    orch.advance_clock(1);
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first10 = mean(rewards.slice(0, 10));
  const last10 = mean(rewards.slice(-10));
  const improved = last10 > first10;

  console.log('\n--- convergence summary ---');
  console.log(`mean reward (cycles 0–9)  : ${first10.toFixed(3)}`);
  console.log(`mean reward (last 10)     : ${last10.toFixed(3)}`);
  console.log(`policy improving?         : ${improved ? 'YES' : 'NO'}`);

  orch.free();
  if (!improved) process.exit(2);
}

const cycles = Number.parseInt(process.argv[2] ?? '50', 10);
main(cycles).catch((err) => {
  console.error('RL monitoring failed:', err);
  process.exit(1);
});
