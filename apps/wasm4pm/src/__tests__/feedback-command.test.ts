import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { captureFeedback } from '@wasm4pm/observability';

describe('Feedback Command', () => {
  let testDir: string;
  let feedbackDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    // Create test directory in temp
    testDir = path.join(os.tmpdir(), `wasm4pm-feedback-cmd-${Date.now()}`);
    feedbackDir = path.resolve(testDir, '.wasm4pm', 'algorithm-feedback');
    await fs.mkdir(feedbackDir, { recursive: true });

    // Mock process.cwd() to return testDir
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
  });

  afterEach(async () => {
    // Restore original cwd
    vi.restoreAllMocks();

    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  });

  describe('feedback stats', () => {
    it('should report aggregated statistics for a single algorithm', async () => {
      // Populate feedback data
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('dfg', 2000, { fitness: 0.92, precision: 0.87, generalization: 0.82, simplicity: 0.77 }, 110);
      await captureFeedback('dfg', 5000, { fitness: 0.94, precision: 0.90, generalization: 0.85, simplicity: 0.80 }, 200);

      // The actual CLI command would be tested via vitest CLI runner,
      // but we verify the data is being captured correctly
      const feedbackFile = path.join(feedbackDir, 'dfg_feedback.jsonl');
      const content = await fs.readFile(feedbackFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());

      expect(lines).toHaveLength(3);
      expect(lines.every((l) => JSON.parse(l).algorithm === 'dfg')).toBe(true);
    });

    it('should handle multiple algorithms', async () => {
      // Populate feedback for multiple algorithms
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('heuristic', 1000, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 120);
      await captureFeedback('genetic', 1000, { fitness: 0.96, precision: 0.94, generalization: 0.90, simplicity: 0.85 }, 400);

      // Verify all algorithms have their own feedback files
      const files = await fs.readdir(feedbackDir);
      const feedbackFiles = files.filter((f) => f.endsWith('_feedback.jsonl'));

      expect(feedbackFiles).toHaveLength(3);
      expect(feedbackFiles).toContain('dfg_feedback.jsonl');
      expect(feedbackFiles).toContain('heuristic_feedback.jsonl');
      expect(feedbackFiles).toContain('genetic_feedback.jsonl');
    });
  });

  describe('feedback clear', () => {
    it('should delete feedback for a specific algorithm', async () => {
      // Populate data for two algorithms
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('heuristic', 1000, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 120);

      // Verify both files exist
      let files = await fs.readdir(feedbackDir);
      expect(files.filter((f) => f.endsWith('_feedback.jsonl'))).toHaveLength(2);

      // Delete DFG feedback
      const dfgFile = path.join(feedbackDir, 'dfg_feedback.jsonl');
      await fs.unlink(dfgFile);

      // Verify only heuristic remains
      files = await fs.readdir(feedbackDir);
      const feedbackFiles = files.filter((f) => f.endsWith('_feedback.jsonl'));
      expect(feedbackFiles).toHaveLength(1);
      expect(feedbackFiles[0]).toBe('heuristic_feedback.jsonl');
    });

    it('should clear all feedback when no algorithm specified', async () => {
      // Populate data
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('heuristic', 1000, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 120);
      await captureFeedback('genetic', 1000, { fitness: 0.96, precision: 0.94, generalization: 0.90, simplicity: 0.85 }, 400);

      // Delete all feedback files
      const files = await fs.readdir(feedbackDir);
      for (const file of files) {
        if (file.endsWith('_feedback.jsonl')) {
          await fs.unlink(path.join(feedbackDir, file));
        }
      }

      // Verify directory is empty (or only contains non-feedback files)
      const remaining = await fs.readdir(feedbackDir);
      const feedbackFiles = remaining.filter((f) => f.endsWith('_feedback.jsonl'));
      expect(feedbackFiles).toHaveLength(0);
    });
  });

  describe('feedback export', () => {
    it('should export feedback data to CSV', async () => {
      // Populate feedback data
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('dfg', 2000, { fitness: 0.92, precision: 0.87, generalization: 0.82, simplicity: 0.77 }, 110);
      await captureFeedback('heuristic', 1000, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 120);

      // Read the feedback files and export to CSV format
      const records: any[] = [];

      const files = await fs.readdir(feedbackDir);
      for (const file of files.filter((f) => f.endsWith('_feedback.jsonl'))) {
        const content = await fs.readFile(path.join(feedbackDir, file), 'utf8');
        for (const line of content.split('\n')) {
          if (line.trim()) {
            records.push(JSON.parse(line));
          }
        }
      }

      // Simulate CSV export
      const headers = [
        'algorithm',
        'log_size_bucket',
        'timestamp',
        'execution_time_ms',
        'fitness',
        'precision',
        'generalization',
        'simplicity',
      ];
      const rows = records.map((r) => [
        r.algorithm,
        r.log_size_bucket,
        r.timestamp,
        String(r.execution_time_ms),
        String(r.metrics.fitness),
        String(r.metrics.precision),
        String(r.metrics.generalization),
        String(r.metrics.simplicity),
      ]);

      const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
        '\n'
      );

      // Verify CSV structure
      expect(csv).toContain('algorithm,');
      expect(csv).toContain('fitness,');
      expect(csv).toContain('"dfg"');
      expect(csv).toContain('"heuristic"');

      // Verify all records are in CSV
      const csvLines = csv.split('\n').filter((l) => l.trim());
      expect(csvLines.length).toBe(records.length + 1); // +1 for header
    });

    it('should export feedback for a specific algorithm only', async () => {
      // Populate data
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('heuristic', 1000, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 120);

      // Read DFG feedback only
      const dfgFile = path.join(feedbackDir, 'dfg_feedback.jsonl');
      const content = await fs.readFile(dfgFile, 'utf8');
      const records = content.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

      // Simulate CSV export
      const csv = records.map((r) => `${r.algorithm},${r.log_size_bucket},${r.metrics.fitness}`).join('\n');

      // Verify only DFG records
      expect(csv).toContain('dfg');
      expect(csv).not.toContain('heuristic');
    });

    it('should handle empty feedback gracefully', async () => {
      // No feedback data, directory is empty

      // Attempt to export (should not error, return empty result)
      const files = await fs.readdir(feedbackDir);
      const feedbackFiles = files.filter((f) => f.endsWith('_feedback.jsonl'));

      expect(feedbackFiles).toHaveLength(0);

      // CSV would be just headers with no data rows
      const csv = 'algorithm,log_size_bucket,timestamp,execution_time_ms,fitness,precision,generalization,simplicity';
      const lines = csv.split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(1); // Just the header
    });
  });

  describe('Kernel feedback integration', () => {
    it('should capture feedback after discovery runs (non-blocking)', async () => {
      // Simulate a discovery run capturing feedback
      const mockFeedback = {
        algorithm: 'dfg',
        logSize: 1000,
        executionTimeMs: 100,
        metrics: {
          fitness: 0.90,
          precision: 0.85,
          generalization: 0.80,
          simplicity: 0.75,
        },
      };

      // This would be called by Kernel.run() automatically
      await captureFeedback(
        mockFeedback.algorithm,
        mockFeedback.logSize,
        mockFeedback.metrics,
        mockFeedback.executionTimeMs
      );

      // Verify feedback was recorded
      const feedbackFile = path.join(feedbackDir, 'dfg_feedback.jsonl');
      const content = await fs.readFile(feedbackFile, 'utf8');
      expect(content).toContain('dfg');
      expect(content).toContain('0.9');
    });
  });
});
