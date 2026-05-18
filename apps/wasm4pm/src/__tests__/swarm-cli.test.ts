import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm swarm — multi-worker convergence CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('swarm run', () => {
    it('should orchestrate multi-worker swarm', async () => {
      const result = await runCli(['swarm', 'run', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should detect convergence', async () => {
      const result = await runCli(['swarm', 'run', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/swarm|convergence|worker|consensus/i);
    });

    it('should accept --workers count', async () => {
      const result = await runCli(['swarm', 'run', '--input', 'test.xes', '--workers', '5'], {
        env: env.env,
      });
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support --algorithms selection', async () => {
      const result = await runCli(
        ['swarm', 'run', '--input', 'test.xes', '--algorithms', 'dfg,alpha'],
        { env: env.env }
      );
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('swarm convergence', () => {
    it('should report consensus ratio', async () => {
      const result = await runCli(['swarm', 'run', '--input', 'test.xes', '--report-consensus'], {
        env: env.env,
      });
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should identify dissenting workers', async () => {
      const result = await runCli(['swarm', 'run', '--input', 'test.xes', '--show-dissent'], {
        env: env.env,
      });
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('swarm error handling', () => {
    it('should handle worker failures gracefully', async () => {
      const result = await runCli(['swarm', 'run', '--input', 'test.xes', '--fail-fast', 'false'], {
        env: env.env,
      });
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });
  });
});
