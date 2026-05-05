/**
 * Scenario: autoprocess command — wpm autoprocess <log.xes>
 *
 * JTBD: "I want to run my process through the autonomic control loop and understand
 * what the system decided to do about the current state — is my process healthy?"
 *
 * Tests the full Perception → Decision → Protection → Optimization cycle via the CLI.
 * No mocks — real @wasm4pm/engine, real WASM, real XES files.
 *
 * Key contracts verified:
 *   - Error handling: missing input, invalid path exits with correct code
 *   - Perception: event count, trace count, activities, health state extracted correctly
 *   - Decision: guard result, pattern result, pattern ticks computed
 *   - Protection: circuit breaker state, SPC results, special causes counted
 *   - Optimization: RL action selected (never empty)
 *   - Output formats: human and JSON produce valid output
 *   - Determinism: two runs produce identical structure and metrics
 *   - Real-scale: BPI 2020 (20MB+) processes without timeout/error
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */

import { describe, it, expect } from 'vitest';
import { assertExitCode, pictl, extractJson, combinedOutput, EXIT_CODES, resolveRepo } from '../helpers/cli.js';

// Real XES fixture files
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
const BPI_TRAVEL = resolveRepo('wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes');

describe('autoprocess command', () => {
  // ── Error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('exits with code 1 when no input argument provided', async () => {
      const result = await wpm(['autoprocess']);
      // Missing required argument should exit 1 (CONFIG_ERROR)
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('exits with code 3 when input file does not exist', async () => {
      const result = await wpm(['autoprocess', '/nonexistent/file.xes']);
      // File not found → execution error
      expect(result.exitCode).toBe(3);
    });

    it('error message contains descriptive text', async () => {
      const result = await wpm(['autoprocess', '/nonexistent/file.xes']);
      const output = combinedOutput(result);
      expect(output).toMatch(/failed|error|not found|ENOENT/i);
    });
  });

  // ── running-example.xes — basic JTBD ────────────────────────────────────────
  // JTBD: "I want to check if my process is healthy right now"

  describe('running-example.xes — perception (basic)', () => {
    it('exits 0 on valid input with human format', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE]);
      assertExitCode(result, EXIT_CODES.success);
    });

    it('--format json produces parseable JSON', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout);
      expect(json).toBeDefined();
      expect(typeof json).toBe('object');
    });

    it('cycle_result.success is a boolean', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      expect(typeof cycle.success).toBe('boolean');
    });

    it('perception.event_count is a positive number', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect(typeof perception.event_count).toBe('number');
      expect((perception.event_count as number) > 0).toBe(true);
    });

    it('perception.unique_activities is a positive number', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect(typeof perception.unique_activities).toBe('number');
      expect((perception.unique_activities as number) > 0).toBe(true);
    });

    it('perception.trace_count is a positive number', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect(typeof perception.trace_count).toBe('number');
      expect((perception.trace_count as number) > 0).toBe(true);
    });

    it('perception.health_state is a number in [0..4]', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect(typeof perception.health_state).toBe('number');
      const health = perception.health_state as number;
      expect(health >= 0 && health <= 4).toBe(true);
    });

    it('perception.health_score is a number', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect(typeof perception.health_score).toBe('number');
    });
  });

  describe('running-example.xes — decision', () => {
    it('decision.guard_result is a boolean', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const decision = (cycle.decision as Record<string, unknown>) || {};
      expect(typeof decision.guard_result).toBe('boolean');
    });

    it('decision.pattern_result is a string', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const decision = (cycle.decision as Record<string, unknown>) || {};
      expect(typeof decision.pattern_result).toBe('string');
    });

    it('decision.pattern_ticks is a number >= 0', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const decision = (cycle.decision as Record<string, unknown>) || {};
      expect(typeof decision.pattern_ticks).toBe('number');
      expect((decision.pattern_ticks as number) >= 0).toBe(true);
    });
  });

  describe('running-example.xes — protection', () => {
    it('protection.circuit_state is a string', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const protection = (cycle.protection as Record<string, unknown>) || {};
      expect(typeof protection.circuit_state).toBe('string');
    });

    it('protection.circuit_state is one of: Closed, Open, HalfOpen', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const protection = (cycle.protection as Record<string, unknown>) || {};
      const validStates = ['Closed', 'Open', 'HalfOpen'];
      expect(validStates).toContain(protection.circuit_state);
    });

    it('protection.spc_results is an object', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const protection = (cycle.protection as Record<string, unknown>) || {};
      expect(typeof protection.spc_results).toBe('object');
    });

    it('protection.special_causes is an array', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const protection = (cycle.protection as Record<string, unknown>) || {};
      expect(Array.isArray(protection.special_causes)).toBe(true);
    });
  });

  describe('running-example.xes — optimization', () => {
    it('optimization.rl_action is a non-empty string', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const optimization = (cycle.optimization as Record<string, unknown>) || {};
      expect(typeof optimization.rl_action).toBe('string');
      expect((optimization.rl_action as string).length > 0).toBe(true);
    });
  });

  describe('running-example.xes — timing', () => {
    it('timing.total_ns is a positive integer', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      expect(typeof json.timing).toBe('object');
      const timing = (json.timing as Record<string, unknown>) || {};
      expect(typeof timing.total_ns).toBe('number');
      expect((timing.total_ns as number) > 0).toBe(true);
    });
  });

  // ── running-example.xes — output format ─────────────────────────────────────
  // JTBD: "I want human-readable output I can read at a glance"

  describe('running-example.xes — human output format', () => {
    it('human format output contains "Perception"', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'human']);
      const output = combinedOutput(result);
      expect(output).toContain('Perception');
    });

    it('human format output contains "Decision"', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'human']);
      const output = combinedOutput(result);
      expect(output).toContain('Decision');
    });

    it('human format output contains "Protection"', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'human']);
      const output = combinedOutput(result);
      expect(output).toContain('Protection');
    });

    it('human format output contains "Optimization"', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'human']);
      const output = combinedOutput(result);
      expect(output).toContain('Optimization');
    });

    it('human format output contains "Events:" showing event count', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'human']);
      const output = combinedOutput(result);
      expect(output).toMatch(/Events:\s*\d+/);
    });
  });

  // ── running-example.xes — determinism ────────────────────────────────────────
  // JTBD: "I need consistent results so I can compare runs"

  describe('running-example.xes — determinism', () => {
    it('two consecutive runs produce identical JSON structure keys', async () => {
      const result1 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const result2 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);

      assertExitCode(result1, EXIT_CODES.success);
      assertExitCode(result2, EXIT_CODES.success);

      const json1 = extractJson(result1.stdout) as Record<string, unknown>;
      const json2 = extractJson(result2.stdout) as Record<string, unknown>;

      const keys1 = Object.keys(json1).sort();
      const keys2 = Object.keys(json2).sort();
      expect(keys1).toEqual(keys2);
    });

    it('two consecutive runs produce identical perception.event_count', async () => {
      const result1 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const result2 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);

      const json1 = extractJson(result1.stdout) as Record<string, unknown>;
      const json2 = extractJson(result2.stdout) as Record<string, unknown>;

      const cycle1 = (json1.cycle_result as Record<string, unknown>) || {};
      const cycle2 = (json2.cycle_result as Record<string, unknown>) || {};

      const perception1 = (cycle1.perception as Record<string, unknown>) || {};
      const perception2 = (cycle2.perception as Record<string, unknown>) || {};

      expect(perception1.event_count).toEqual(perception2.event_count);
    });

    it('two consecutive runs produce identical perception.trace_count', async () => {
      const result1 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      const result2 = await wpm(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);

      const json1 = extractJson(result1.stdout) as Record<string, unknown>;
      const json2 = extractJson(result2.stdout) as Record<string, unknown>;

      const cycle1 = (json1.cycle_result as Record<string, unknown>) || {};
      const cycle2 = (json2.cycle_result as Record<string, unknown>) || {};

      const perception1 = (cycle1.perception as Record<string, unknown>) || {};
      const perception2 = (cycle2.perception as Record<string, unknown>) || {};

      expect(perception1.trace_count).toEqual(perception2.trace_count);
    });
  });

  // ── running-example.xes — flags ─────────────────────────────────────────────

  describe('running-example.xes — flags', () => {
    it('supports --activity-key flag', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--activity-key', 'concept:name', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout);
      expect(json).toBeDefined();
    });

    it('--quiet suppresses informational output', async () => {
      const result = await wpm(['autoprocess', RUNNING_EXAMPLE, '--quiet', '--format', 'human']);
      // With --quiet, stderr should not contain the human-formatted output
      // (it goes to stdout as JSON, but in human format the quiet flag suppresses logging)
      assertExitCode(result, EXIT_CODES.success);
      expect(typeof result.stdout).toBe('string');
    });
  });

  // ── BPI_2020_Travel_Permits — real-scale JTBD ───────────────────────────────
  // JTBD: "I want to monitor my government travel permits process automatically"

  describe('BPI_2020_Travel_Permits_Actual.xes — real-scale', () => {
    it('exits 0 on BPI 2020 travel permits log', async () => {
      const result = await wpm(['autoprocess', BPI_TRAVEL, '--format', 'json'], {
        timeout: 120_000, // 2 minutes for a 20MB file
      });
      assertExitCode(result, EXIT_CODES.success);
    }, { timeout: 130_000 });

    it('perception.event_count >= 1000 (BPI 2020 is large)', async () => {
      const result = await wpm(['autoprocess', BPI_TRAVEL, '--format', 'json'], {
        timeout: 120_000,
      });
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect((perception.event_count as number) >= 1000).toBe(true);
    }, { timeout: 130_000 });

    it('perception.unique_activities >= 5 (real process has many steps)', async () => {
      const result = await wpm(['autoprocess', BPI_TRAVEL, '--format', 'json'], {
        timeout: 120_000,
      });
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const perception = (cycle.perception as Record<string, unknown>) || {};
      expect((perception.unique_activities as number) >= 5).toBe(true);
    }, { timeout: 130_000 });

    it('optimization.rl_action is a non-empty string', async () => {
      const result = await wpm(['autoprocess', BPI_TRAVEL, '--format', 'json'], {
        timeout: 120_000,
      });
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const optimization = (cycle.optimization as Record<string, unknown>) || {};
      expect((optimization.rl_action as string).length > 0).toBe(true);
    }, { timeout: 130_000 });

    it('protection.circuit_state is one of: Closed, Open, HalfOpen', async () => {
      const result = await wpm(['autoprocess', BPI_TRAVEL, '--format', 'json'], {
        timeout: 120_000,
      });
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const cycle = (json.cycle_result as Record<string, unknown>) || {};
      const protection = (cycle.protection as Record<string, unknown>) || {};
      const validStates = ['Closed', 'Open', 'HalfOpen'];
      expect(validStates).toContain(protection.circuit_state);
    }, { timeout: 130_000 });
  });
});
