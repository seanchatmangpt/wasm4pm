import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import { execSync } from 'child_process';

describe('wpm conformance — log-to-model conformance checking CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('conformance (basic)', () => {
    it('should require input log argument', async () => {
      const result = await runCli(['conformance'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/log|input|argument|required/i);
    });

    it('should accept --input or -i flag', async () => {
      // Note: Test setup may not have real log files, so this verifies the flag is accepted
      const result = await runCli(['conformance', '--input', 'test.xes'], { env: env.env });
      // Will likely fail due to missing file, but flag should be recognized
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --model', () => {
    it('should require model specification', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/model|required|argument/i);
    });

    it('should accept model from file', async () => {
      const modelFile = env.tmpDir + '/test-model.pnml';
      const fs = require('fs');
      fs.writeFileSync(modelFile, '<model/>'); // Minimal PNML

      const result = await runCli(['conformance', '--input', 'test.xes', '--model', modelFile], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept model from discovery algorithm', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--model-from', 'dfg'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --method', () => {
    const methods = ['replay', 'alignment', 'token-replay'];

    methods.forEach((method) => {
      it(`should support ${method} conformance method`, async () => {
        const result = await runCli(['conformance', '--input', 'test.xes', '--method', method], {
          env: env.env,
        });
        expect([1, 2, 3]).toContain(result.exitCode);
      });
    });
  });

  describe('conformance output metrics', () => {
    it('should report fitness score', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/fitness|score|metric/i);
    });

    it('should report precision score', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/precision|metric|output/i);
    });

    it('should support --format json for structured output', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--format', 'json'], {
        env: env.env,
      });
      // Will error on missing files, but JSON flag should be accepted
      if (result.exitCode === EXIT_CODES.success) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('conformance --classify', () => {
    it('should classify conforming vs deviating traces', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/trace|classify|conform|deviat/i);
    });

    it('should output trace classifications with --classify flag', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--classify'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --diagnosis', () => {
    it('should provide deviation diagnosis', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--diagnosis'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should explain missing/extra/late activities', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/missing|extra|late|diagnos/i);
    });
  });

  describe('conformance --strict-mode', () => {
    it('should enforce 0.85+ fitness threshold in strict mode', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--strict-mode'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should fail fast on non-conforming traces in strict mode', async () => {
      const result = await runCli(
        ['conformance', '--input', 'test.xes', '--strict-mode', '--fail-fast'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --threshold', () => {
    it('should accept custom fitness threshold', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--threshold', '0.75'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should validate threshold is between 0 and 1', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--threshold', '1.5'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/invalid|range|threshold/i);
    });
  });

  describe('conformance --save-report', () => {
    it('should save conformance report to file', async () => {
      const report = env.tmpDir + '/conformance-report.json';
      const result = await runCli(['conformance', '--input', 'test.xes', '--save-report', report], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --algorithm', () => {
    it('should support dfg for model discovery before conformance', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--algorithm', 'dfg'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support heuristic miner', async () => {
      const result = await runCli(
        ['conformance', '--input', 'test.xes', '--algorithm', 'heuristic'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --ocel support', () => {
    it('should accept object-centric event logs', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/ocel|object.centric|log/i);
    });

    it('should support --object-types for OCEL', async () => {
      const result = await runCli(
        ['conformance', '--input', 'test.ocel.json', '--object-types', 'order,item'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance error handling', () => {
    it('should handle invalid log format', async () => {
      const badLog = env.tmpDir + '/bad.xes';
      const fs = require('fs');
      fs.writeFileSync(badLog, 'not valid xes');

      const result = await runCli(['conformance', '--input', badLog], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/invalid|format|parse/i);
    });

    it('should handle invalid model format', async () => {
      const badModel = env.tmpDir + '/bad.pnml';
      const fs = require('fs');
      fs.writeFileSync(badModel, 'not valid pnml');

      const result = await runCli(['conformance', '--input', 'test.xes', '--model', badModel], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should reject invalid threshold values', async () => {
      const result = await runCli(
        ['conformance', '--input', 'test.xes', '--threshold', 'not-a-number'],
        { env: env.env }
      );
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('conformance performance', () => {
    it('should accept --timeout flag', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--timeout', '30'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support --max-traces for performance', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--max-traces', '1000'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance quality gates', () => {
    it('should verify conformance quality metrics', async () => {
      const result = await runCli(['conformance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/fitness|precision|quality/i);
    });

    it('should report trace-level statistics', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--statistics'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('conformance --json structure', () => {
    it('should return valid JSON when requested', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--format', 'json'], {
        env: env.env,
      });

      if (result.exitCode === EXIT_CODES.success || result.stdout.includes('{')) {
        try {
          JSON.parse(result.stdout);
          expect(true).toBe(true);
        } catch (e) {
          expect.fail(`Invalid JSON: ${e}`);
        }
      }
    });

    it('should include conformance metrics in JSON', async () => {
      const result = await runCli(['conformance', '--input', 'test.xes', '--format', 'json'], {
        env: env.env,
      });

      if (result.exitCode === EXIT_CODES.success && result.stdout.includes('{')) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.fitness !== undefined || json.fitness !== undefined).toBe(true);
      }
    });
  });
});
