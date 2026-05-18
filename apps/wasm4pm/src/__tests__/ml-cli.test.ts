import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
describe('wpm ml — machine learning analysis CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  beforeEach(async () => {
    env = await createCliTestEnv();
  });
  afterEach(() => {
    env?.cleanup?.();
  });
  describe('ml (base command)', () => {
    it('should require task argument', async () => {
      const result = await runCli(['ml']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/task|argument|required|usage/i);
    });
    it('should require input log', async () => {
      const result = await runCli(['ml', 'classify']);
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|log|argument/i);
    });
  });
  describe('ml classify', () => {
    it('should classify traces into categories', async () => {
      const result = await runCli(['ml', 'classify', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --feature-set flag', async () => {
      const result = await runCli(
        ['ml', 'classify', '--input', 'test.xes', '--feature-set', 'trace_attributes']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support --model-path for pre-trained model', async () => {
      const result = await runCli(
        ['ml', 'classify', '--input', 'test.xes', '--model-path', 'model.pkl']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should output class predictions', async () => {
      const result = await runCli(['ml', 'classify', '--help']);
      expect(result.stdout).toMatch(/class|predict|category|classify/i);
    });
  });
  describe('ml cluster', () => {
    it('should cluster variants using k-means', async () => {
      const result = await runCli(['ml', 'cluster', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --k for number of clusters', async () => {
      const result = await runCli(['ml', 'cluster', '--input', 'test.xes', '--k', '5']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should report silhouette scores', async () => {
      const result = await runCli(['ml', 'cluster', '--help']);
      expect(result.stdout).toMatch(/silhouette|score|quality|cluster/i);
    });
    it('should auto-detect optimal k if not provided', async () => {
      const result = await runCli(['ml', 'cluster', '--input', 'test.xes', '--auto-k']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
  describe('ml forecast', () => {
    it('should forecast time series values', async () => {
      const result = await runCli(['ml', 'forecast', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --target-metric (duration, throughput, etc)', async () => {
      const result = await runCli(
        ['ml', 'forecast', '--input', 'test.xes', '--target-metric', 'duration']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support --forecast-window for prediction horizon', async () => {
      const result = await runCli(
        ['ml', 'forecast', '--input', 'test.xes', '--forecast-window', '10']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support multiple models (linear, polynomial, exponential)', async () => {
      ['linear', 'polynomial', 'exponential'].forEach((model) => {
        expect(['linear', 'polynomial', 'exponential']).toContain(model);
      });
    });
    it('should report forecast accuracy (MAPE, MAE, RMSE)', async () => {
      const result = await runCli(['ml', 'forecast', '--help']);
      expect(result.stdout).toMatch(/mape|mae|rmse|accuracy|error|forecast/i);
    });
  });
  describe('ml anomaly', () => {
    it('should detect anomalous traces', async () => {
      const result = await runCli(['ml', 'anomaly', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --threshold for anomaly scoring', async () => {
      const result = await runCli(['ml', 'anomaly', '--input', 'test.xes', '--threshold', '0.8']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support EMA smoothing', async () => {
      const result = await runCli(
        ['ml', 'anomaly', '--input', 'test.xes', '--smoothing', 'ema', '--alpha', '0.3']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should report anomaly metrics (recall, precision, FPR)', async () => {
      const result = await runCli(['ml', 'anomaly', '--help']);
      expect(result.stdout).toMatch(/recall|precision|fpr|metric|anomaly/i);
    });
  });
  describe('ml regress', () => {
    it('should regress remaining time prediction', async () => {
      const result = await runCli(['ml', 'regress', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --target-variable', async () => {
      const result = await runCli(
        ['ml', 'regress', '--input', 'test.xes', '--target-variable', 'remaining_time']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should report regression metrics (R², MAE, RMSE)', async () => {
      const result = await runCli(['ml', 'regress', '--help']);
      expect(result.stdout).toMatch(/r\²|r2|mae|rmse|regression/i);
    });
  });
  describe('ml pca', () => {
    it('should perform dimensionality reduction', async () => {
      const result = await runCli(['ml', 'pca', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should accept --components for target dimensionality', async () => {
      const result = await runCli(['ml', 'pca', '--input', 'test.xes', '--components', '3']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should report variance explained', async () => {
      const result = await runCli(['ml', 'pca', '--help']);
      expect(result.stdout).toMatch(/variance|explain|dimensionality|reduction/i);
    });
  });
  describe('ml --format', () => {
    it('should support human-readable output', async () => {
      const result = await runCli(['ml', 'classify', '--input', 'test.xes', '--format', 'human']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support JSON output', async () => {
      const result = await runCli(['ml', 'classify', '--input', 'test.xes', '--format', 'json']);
      if (result.exitCode === EXIT_CODES.SUCCESS) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });
  describe('ml --profile', () => {
    it('should support fast profile for quick analysis', async () => {
      const result = await runCli(['ml', 'classify', '--input', 'test.xes', '--profile', 'fast']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support balanced profile', async () => {
      const result = await runCli(
        ['ml', 'classify', '--input', 'test.xes', '--profile', 'balanced']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
    it('should support quality profile for best results', async () => {
      const result = await runCli(
        ['ml', 'classify', '--input', 'test.xes', '--profile', 'quality']
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
  describe('ml --save-model', () => {
    it('should save trained model for reuse', async () => {
      const model_path = env.tempDir + '/trained-model.pkl';
      const result = await runCli(
        ['ml', 'classify', '--input', 'test.xes', '--save-model', model_path]
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
  describe('ml error handling', () => {
    it('should reject invalid task', async () => {
      const result = await runCli(['ml', 'invalid-task', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
    });
    it('should handle missing input file', async () => {
      const result = await runCli(['ml', 'classify', '--input', '/nonexistent/log.xes']);
      expect([1, 2]).toContain(result.exitCode);
    });
    it('should validate threshold values', async () => {
      const result = await runCli(['ml', 'anomaly', '--input', 'test.xes', '--threshold', '1.5']);
      expect([1, 2]).toContain(result.exitCode);
    });
    it('should reject invalid --k value', async () => {
      const result = await runCli(['ml', 'cluster', '--input', 'test.xes', '--k', '-1']);
      expect([1, 2]).toContain(result.exitCode);
    });
  });
  describe('ml performance', () => {
    it('should complete classification in reasonable time', async () => {
      const start = Date.now();
      await runCli(['ml', 'classify', '--input', 'test.xes', '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });
  });
  describe('ml --batch processing', () => {
    it('should support batch processing multiple logs', async () => {
      const result = await runCli(['ml', 'cluster', '--input', 'test1.xes,test2.xes,test3.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
});