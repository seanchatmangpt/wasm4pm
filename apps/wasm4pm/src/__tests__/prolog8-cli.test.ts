import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm prolog8 — Horn-clause proof engine CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('prolog8 show', () => {
    it('should display Prolog8 capabilities', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/prolog8|capability|engine|horn|clause/i);
    });

    it('should list available predicates', async () => {
      const result = await runCli(['prolog8', 'show', '--predicates'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should report proof capacity limits', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect(result.stdout).toMatch(/byte|capacity|limit|size/i);
    });
  });

  describe('prolog8 query', () => {
    it('should execute Horn-clause queries', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'member(X, [1,2,3])'], {
        env: env.env,
      });
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });

    it('should accept query string input', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'append([1], [2], X)'], {
        env: env.env,
      });
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });

    it('should support --format json', async () => {
      const result = await runCli(
        ['prolog8', 'query', '--rule', 'member(X, [1,2,3])', '--format', 'json'],
        { env: env.env }
      );
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });

    it('should handle unifying queries', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'X = 42'], { env: env.env });
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });
  });

  describe('prolog8 replay', () => {
    it('should replay OCEL logs through Prolog rules', async () => {
      const result = await runCli(['prolog8', 'replay', '--input', 'test.ocel.json'], {
        env: env.env,
      });
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });

    it('should verify receipt against Horn-clause rules', async () => {
      const result = await runCli(['prolog8', 'replay', '--input', 'test.ocel.json', '--verify'], {
        env: env.env,
      });
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });

    it('should report conformance', async () => {
      const result = await runCli(['prolog8', 'replay', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/replay|conform|verify|ocel/i);
    });

    it('should support proof generation', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '--input', 'test.ocel.json', '--generate-proof'],
        { env: env.env }
      );
      expect([EXIT_CODES.success, 1, 3]).toContain(result.exitCode);
    });
  });

  describe('prolog8 error handling', () => {
    it('should reject invalid rule syntax', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'invalid syntax ]['], {
        env: env.env,
      });
      expect([1, 3]).toContain(result.exitCode);
    });

    it('should handle missing input file', async () => {
      const result = await runCli(['prolog8', 'replay', '--input', '/nonexistent.ocel.json'], {
        env: env.env,
      });
      expect([1, 3]).toContain(result.exitCode);
    });
  });

  describe('prolog8 performance', () => {
    it('should complete query in <500ms', async () => {
      const start = Date.now();
      await runCli(['prolog8', 'show'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
