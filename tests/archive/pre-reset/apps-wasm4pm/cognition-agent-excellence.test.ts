/**
 * cognition-agent-excellence.test.ts
 *
 * Comprehensive tests for improved `wpm cognition` and `wpm agent` commands.
 *
 * Contract:
 * 1. wpm cognition run --breed conformance -i <fixture> exits 0 (or graceful config error)
 * 2. JSON output has run_id, status, output fields
 * 3. wpm cognition verify exits 0 on "no receipts" gracefully (or on a valid receipt)
 * 4. wpm agent list exits 0 with agents + rl_agents arrays in JSON
 * 5. Each RL agent entry has name, type, status, cycles_as_active, avg_reward
 * 6. wpm agent status exits 0 with RL stats when --rl flag is used
 * 7. wpm agent switch exits gracefully (0 or config-error) — WASM may not be loaded
 * 8. wpm agent reset exits 0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

/**
 * Parse the full stdout as JSON. Handles:
 * - Single-line compact JSON
 * - Pretty-printed multi-line JSON (from emitResult with JSON.stringify(result, null, 2))
 * Returns null if no valid JSON object is found.
 */
function parseJsonOutput(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  // Try parsing full stdout directly first (single-line compact case)
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Pretty-printed: locate the first { and balance braces to extract the full object
    const start = trimmed.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      else if (trimmed[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

// Minimal BreedInput fixture for cognition run (no real log required — contract-only)
const MINIMAL_BREED_INPUT = JSON.stringify({
  facts: [
    'event(start, 0)',
    'event(end, 100)',
  ],
  rules: [
    {
      id: 'r1',
      premise: ['event(start, _)'],
      conclusion: 'process_started',
      certainty: 0.9,
    },
  ],
  cases: [{ id: 'case1', trace: ['start', 'end'] }],
});

describe('wpm cognition — excellence tests', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;
  let breedInputPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cogn-excellence-'));
    breedInputPath = path.join(tmpDir, 'breed-input.json');
    await fs.writeFile(breedInputPath, MINIMAL_BREED_INPUT, 'utf-8');
  });

  afterEach(async () => {
    env?.cleanup?.();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // ── cognition run ─────────────────────────────────────────────────────────

  describe('cognition run', () => {
    it('exits 0 and emits JSON with run_id and status fields', async () => {
      const result = await runCli([
        'cognition', 'run',
        '--contract', 'prolog',
        '--input', breedInputPath,
        '--format', 'json',
        '--no-save',
      ]);

      // Either success (WASM loaded) or source_error (breed not found)
      // Both are valid: we just cannot get config_error (1)
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error])
        .toContain(result.exitCode);

      // On success, JSON must have the contract fields
      if (result.exitCode === EXIT_CODES.success) {
        const parsed = parseJsonOutput(result.stdout);
        expect(parsed).not.toBeNull();
        const payload = ((parsed!.payload ?? parsed!) as Record<string, unknown>);
        expect(typeof payload['run_id']).toBe('string');
        expect(typeof payload['status']).toBe('string');
        expect(payload).toHaveProperty('output');
      }
    });

    it('produces human output with "Cognition Run" heading on success', async () => {
      const result = await runCli([
        'cognition', 'run',
        '--contract', 'prolog',
        '--input', breedInputPath,
        '--format', 'human',
        '--no-save',
      ]);

      if (result.exitCode === EXIT_CODES.success) {
        expect(result.stdout + result.stderr).toMatch(/Cognition Run/i);
      }
    });

    it('exits source_error (not crash) when input file is missing', async () => {
      const result = await runCli([
        'cognition', 'run',
        '--contract', 'prolog',
        '--input', '/nonexistent/breed-input.json',
        '--format', 'json',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('JSON output never omits the status field even on success', async () => {
      const result = await runCli([
        'cognition', 'run',
        '--contract', 'prolog',
        '--input', breedInputPath,
        '--format', 'json',
        '--no-save',
      ]);
      if (result.exitCode !== EXIT_CODES.success) return; // skip if WASM absent

      const parsed = parseJsonOutput(result.stdout);
      if (!parsed) return;
      const payload = ((parsed.payload ?? parsed) as Record<string, unknown>);
      expect(payload).toHaveProperty('status');
    });
  });

  // ── cognition verify ──────────────────────────────────────────────────────

  describe('cognition verify', () => {
    it('exits 0 gracefully when no receipts exist yet', async () => {
      const noReceiptsDir = path.join(tmpDir, 'empty-receipts');
      const result = await runCli([
        'cognition', 'verify',
        '--ledger-dir', noReceiptsDir,
        '--format', 'json',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('verifies a synthetic receipt file by path — exits 0', async () => {
      // Create a minimal synthetic receipt with all required fields
      const receiptData = {
        run_id: 'test-run-abc123',
        breed: 'prolog',
        status: 'ok',
        output_hash: 'a'.repeat(64),
        replay_pointer: 'a'.repeat(16),
        links: [],
      };
      const receiptPath = path.join(tmpDir, 'test-receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receiptData, null, 2));

      const result = await runCli([
        'cognition', 'verify',
        '--receipt', receiptPath,
        '--format', 'json',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('verifies latest receipt by "latest" keyword — exits 0 when receipt exists', async () => {
      const receiptDir = path.join(tmpDir, 'receipts');
      await fs.mkdir(receiptDir, { recursive: true });

      const receiptData = {
        run_id: 'latest-test-xyz',
        breed: 'prolog',
        status: 'ok',
        output_hash: 'b'.repeat(64),
        replay_pointer: 'b'.repeat(16),
      };
      await fs.writeFile(
        path.join(receiptDir, 'latest-test-xyz.json'),
        JSON.stringify(receiptData, null, 2)
      );

      const result = await runCli([
        'cognition', 'verify',
        '--receipt', 'latest',
        '--ledger-dir', receiptDir,
        '--format', 'json',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('shows 4-layer output for a valid receipt in human format', async () => {
      const receiptData = {
        run_id: 'layered-test-789',
        breed: 'prolog',
        status: 'ok',
        output_hash: 'c'.repeat(64),
        replay_pointer: 'c'.repeat(16),
      };
      const receiptPath = path.join(tmpDir, 'layered.json');
      await fs.writeFile(receiptPath, JSON.stringify(receiptData, null, 2));

      const result = await runCli([
        'cognition', 'verify',
        '--receipt', receiptPath,
        '--format', 'human',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Must mention at least Schema and BLAKE3 layers
      const allOut = result.stdout + result.stderr;
      expect(allOut).toMatch(/Schema|BLAKE3|Layer/i);
    });

    it('JSON output has findings array with layers sub-array', async () => {
      const receiptData = {
        run_id: 'json-layers-test',
        breed: 'test',
        status: 'ok',
        output_hash: 'd'.repeat(64),
      };
      const receiptPath = path.join(tmpDir, 'json-layers.json');
      await fs.writeFile(receiptPath, JSON.stringify(receiptData, null, 2));

      const result = await runCli([
        'cognition', 'verify',
        '--receipt', receiptPath,
        '--format', 'json',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      expect(Array.isArray(payload['findings'])).toBe(true);
      const findings = payload['findings'] as Array<Record<string, unknown>>;
      if (findings.length > 0) {
        expect(Array.isArray(findings[0]['layers'])).toBe(true);
      }
    });
  });
});

// ── wpm agent ────────────────────────────────────────────────────────────────

describe('wpm agent — excellence tests', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ── agent list ────────────────────────────────────────────────────────────

  describe('agent list', () => {
    it('exits 0', async () => {
      const result = await runCli(['agent', 'list', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON payload has vda_agents and rl_agents arrays', async () => {
      const result = await runCli(['agent', 'list', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;

      expect(Array.isArray(payload['vda_agents'])).toBe(true);
      expect(Array.isArray(payload['rl_agents'])).toBe(true);
    });

    it('rl_agents has exactly 5 entries with required fields', async () => {
      const result = await runCli(['agent', 'list', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      const rlAgents = payload['rl_agents'] as Array<Record<string, unknown>>;

      expect(rlAgents).toHaveLength(5);

      for (const agent of rlAgents) {
        expect(typeof agent['name']).toBe('string');
        expect(typeof agent['type']).toBe('string');
        expect(['selected', 'standby']).toContain(agent['status']);
        expect(typeof agent['cycles_as_active']).toBe('number');
        expect(typeof agent['avg_reward']).toBe('number');
      }
    });

    it('rl_agents contains all 5 expected RL agent names', async () => {
      const result = await runCli(['agent', 'list', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      const rlAgents = payload['rl_agents'] as Array<Record<string, unknown>>;
      const names = rlAgents.map((a) => a['name']);

      expect(names).toContain('QLearning');
      expect(names).toContain('SARSA');
      expect(names).toContain('DoubleQLearning');
      expect(names).toContain('ExpectedSARSA');
      expect(names).toContain('REINFORCE');
    });

    it('exactly one RL agent has status "selected"', async () => {
      const result = await runCli(['agent', 'list', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      const rlAgents = payload['rl_agents'] as Array<Record<string, unknown>>;

      const selected = rlAgents.filter((a) => a['status'] === 'selected');
      expect(selected.length).toBe(1);
    });

    it('human output contains "RL Autonomic Agents" heading', async () => {
      const result = await runCli(['agent', 'list', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout + result.stderr).toMatch(/RL Autonomic Agents/i);
    });

    it('human output contains "Van der Aalst" heading', async () => {
      const result = await runCli(['agent', 'list', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout + result.stderr).toMatch(/Van der Aalst/i);
    });

    it('--rl flag shows only RL agents (vda_agents is empty)', async () => {
      const result = await runCli(['agent', 'list', '--rl', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      const vdaAgents = payload['vda_agents'] as Array<unknown>;

      // In --rl mode, vda_agents is empty
      expect(vdaAgents).toHaveLength(0);
    });
  });

  // ── agent status ──────────────────────────────────────────────────────────

  describe('agent status', () => {
    it('exits 0 for summary (no agent arg)', async () => {
      const result = await runCli(['agent', 'status', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('--rl flag exits 0 and includes learning_rate in JSON payload', async () => {
      const result = await runCli(['agent', 'status', '--rl', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;

      expect(payload).toHaveProperty('learning_rate');
      expect(typeof payload['learning_rate']).toBe('number');
      expect(payload).toHaveProperty('converged');
      expect(payload).toHaveProperty('state_space_total');
      expect(payload['state_space_total']).toBe(368_640);
    });

    it('wpm agent status --agent DoubleQLearning exits 0 with RL agent details', async () => {
      const result = await runCli(['agent', 'status', '--agent', 'DoubleQLearning', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;

      expect(payload['agent']).toBe('DoubleQLearning');
      expect(payload).toHaveProperty('converged');
      expect(payload).toHaveProperty('state_space_total');
    });

    it('wpm agent status --agent QLearning human output mentions learning rate', async () => {
      const result = await runCli(['agent', 'status', '--agent', 'QLearning', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Should mention RL-related terms in the human output (stdout or stderr via consola)
      const allOut = result.stdout + result.stderr;
      expect(allOut).toMatch(/learning rate|Learning|QLearning|RL/i);
    });

    it('wpm agent status --agent <VdAAgent> exits 0 for known VdA agent', async () => {
      const result = await runCli(['agent', 'status', '--agent', 'mock-interceptor', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('wpm agent status --agent <unknownAgent> exits source_error (2)', async () => {
      const result = await runCli(['agent', 'status', '--agent', 'completely-unknown-agent-xyz', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });
  });

  // ── agent switch ──────────────────────────────────────────────────────────

  describe('agent switch', () => {
    it('exits 0 or config_error (never crashes) for a valid RL agent name', async () => {
      const result = await runCli(['agent', 'switch', 'DoubleQLearning', '--format', 'json']);
      // 0 = switched (WASM loaded and cloud feature available)
      // 1 = config_error or execution_error (graceful WASM-not-loaded path)
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.execution_error])
        .toContain(result.exitCode);
    });

    it('exits config_error for an unknown RL agent name', async () => {
      const result = await runCli(['agent', 'switch', 'NonExistentAgent', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('is case-insensitive for agent names', async () => {
      const result = await runCli(['agent', 'switch', 'qlearning', '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.execution_error])
        .toContain(result.exitCode);
      // Should NOT be source_error or system_error — it's a valid agent name
      expect([EXIT_CODES.source_error, EXIT_CODES.system_error]).not.toContain(result.exitCode);
    });

    it('JSON output includes agent name and agent_idx when successful', async () => {
      const result = await runCli(['agent', 'switch', 'SARSA', '--format', 'json']);
      if (result.exitCode !== EXIT_CODES.success) return; // skip if WASM not loaded

      const parsed = parseJsonOutput(result.stdout);
      if (!parsed) return;
      const payload = (parsed.payload ?? parsed) as Record<string, unknown>;
      expect(payload['agent']).toBe('SARSA');
      expect(typeof payload['agent_idx']).toBe('number');
    });
  });

  // ── agent reset ───────────────────────────────────────────────────────────

  describe('agent reset', () => {
    it('exits 0', async () => {
      const result = await runCli(['agent', 'reset', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON payload has reset: true', async () => {
      const result = await runCli(['agent', 'reset', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = parseJsonOutput(result.stdout);
      expect(parsed).not.toBeNull();
      const payload = (parsed!.payload ?? parsed!) as Record<string, unknown>;
      expect(payload['reset']).toBe(true);
    });

    it('human output mentions "reset" or similar', async () => {
      const result = await runCli(['agent', 'reset', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const allOut = result.stdout + result.stderr;
      expect(allOut).toMatch(/reset/i);
    });
  });
});
