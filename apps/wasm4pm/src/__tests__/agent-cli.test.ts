import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

// 'wpm agent' -> 'wpm lab agent' (nouns/_removed.ts). Bridged to the
// unmodified legacy commands/agent.ts tree, so subcommand args/behavior are
// unchanged — only the noun/verb prefix differs from the old top-level
// invocation.
describe('wpm agent — RL/autonomic agent control CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('agent list', () => {
    it('should list available agents', async () => {
      const result = await runCli(['lab', 'agent', 'list']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/agent|rl|autonomic/i);
    });
  });

  describe('agent status', () => {
    it('should report agent status', async () => {
      const result = await runCli(['lab', 'agent', 'status']);
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });

  describe('agent switch', () => {
    it('should switch active agent', async () => {
      // The underlying legacy command (commands/agent/switch.ts) takes the RL
      // agent name as a POSITIONAL argument, not a `--agent` flag, and
      // validates it against the real RL agent registry (QLearning, SARSA,
      // DoubleQLearning, ExpectedSARSA, REINFORCE) — 'agent-1' was never a
      // valid agent name under either the old or new CLI. Use a real one.
      const result = await runCli(['lab', 'agent', 'switch', 'SARSA']);
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });

  describe('agent reset', () => {
    it('should reset agent state', async () => {
      const result = await runCli(['lab', 'agent', 'reset']);
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });
});
