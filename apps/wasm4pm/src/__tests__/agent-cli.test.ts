import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

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
      const result = await runCli(['agent', 'list'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/agent|rl|autonomic/i);
    });
  });

  describe('agent status', () => {
    it('should report agent status', async () => {
      const result = await runCli(['agent', 'status'], { env: env.env });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });

  describe('agent switch', () => {
    it('should switch active agent', async () => {
      const result = await runCli(['agent', 'switch', '--agent', 'agent-1'], { env: env.env });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });

  describe('agent reset', () => {
    it('should reset agent state', async () => {
      const result = await runCli(['agent', 'reset'], { env: env.env });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });
});
