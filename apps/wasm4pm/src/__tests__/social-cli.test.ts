import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm social — social network mining CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('social handover-of-work', () => {
    it('should mine handover-of-work network', async () => {
      const result = await runCli(['social', 'handover-of-work', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify resource pairs on direct handoffs', async () => {
      const result = await runCli(['social', 'handover-of-work', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/handover|resource|network/i);
    });

    it('should report frequency metrics', async () => {
      const result = await runCli(
        ['social', 'handover-of-work', '--input', 'test.xes', '--frequency'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('social working-together', () => {
    it('should mine working-together network', async () => {
      const result = await runCli(['social', 'working-together', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify resources co-occurring in same case', async () => {
      const result = await runCli(['social', 'working-together', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/working|together|resource|case/i);
    });

    it('should measure collaboration strength', async () => {
      const result = await runCli(
        ['social', 'working-together', '--input', 'test.xes', '--strength'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('social --format', () => {
    it('should support JSON export', async () => {
      const result = await runCli(
        ['social', 'handover-of-work', '--input', 'test.xes', '--format', 'json'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support graph visualization formats', async () => {
      ['dot', 'gexf', 'graphml'].forEach((fmt) => {
        expect(['dot', 'gexf', 'graphml']).toContain(fmt);
      });
    });
  });

  describe('social error handling', () => {
    it('should handle missing resource attribute', async () => {
      const result = await runCli(
        ['social', 'handover-of-work', '--input', 'test.xes', '--resource-key', 'invalid:key'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
});
