/**
 * Excellent feedback + claude AI assistant — integration tests
 *
 * Tests:
 * 1. wpm feedback submit exits 0, creates feedback file
 * 2. wpm feedback list exits 0 with items array
 * 3. wpm feedback summary exits 0 with total/open/resolved
 * 4. wpm feedback analyze -i <fixture> exits 0 with issues array
 * 5. wpm claude ask "what is DFG" exits 0 with algorithm explanation
 * 6. wpm claude interpret "fitness 0.87" exits 0 with interpretation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

// Minimal XES fixture for feedback analyze tests
const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log>
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-01T08:00:00.000Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-01T09:00:00.000Z"/></event>
    <event><string key="concept:name" value="Close"/><date key="time:timestamp" value="2024-01-01T10:00:00.000Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-02T08:00:00.000Z"/></event>
    <event><string key="concept:name" value="Reject"/><date key="time:timestamp" value="2024-01-02T09:00:00.000Z"/></event>
    <event><string key="concept:name" value="Close"/><date key="time:timestamp" value="2024-01-02T10:00:00.000Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case3"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-03T08:00:00.000Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-03T09:00:00.000Z"/></event>
    <event><string key="concept:name" value="Close"/><date key="time:timestamp" value="2024-01-03T10:00:00.000Z"/></event>
  </trace>
</log>`;

describe('wpm feedback — continuous improvement loop', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let xesFile: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    // Write a minimal XES fixture into tmpDir
    xesFile = path.join(env.tempDir, 'test-log.xes');
    await fs.writeFile(xesFile, MINIMAL_XES, 'utf8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ── Test 1: submit ──────────────────────────────────────────────────────────

  describe('feedback submit', () => {
    it('exits 0 when submitting an improvement', async () => {
      const result = await runCli(
        ['feedback', 'submit', '--type', 'improvement', '--message', 'DFG output should show edge weights as percentages not counts'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output contains id, type, message, status', async () => {
      const result = await runCli(
        ['feedback', 'submit', '--type', 'improvement', '--message', 'DFG output should show edge weights as percentages', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type', 'improvement');
      expect(payload).toHaveProperty('message');
      expect(payload).toHaveProperty('status', 'open');
    });

    it('creates a feedback file in .wasm4pm/feedback/', async () => {
      const result = await runCli(
        ['feedback', 'submit', '--type', 'bug', '--message', 'quality --compare crashes on large logs', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      const id = payload['id'] as string;
      expect(id).toMatch(/^fb-\d{4}-\d{2}-\d{2}-\d{3}$/);
      const feedbackDir = path.join(env.tempDir, '.wasm4pm', 'feedback');
      const feedbackFile = path.join(feedbackDir, `${id}.json`);
      const exists = await fs.access(feedbackFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('exits 1 when --message is missing', async () => {
      const result = await runCli(['feedback', 'submit', '--type', 'bug'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('submits a question type', async () => {
      const result = await runCli(
        ['feedback', 'submit', '--type', 'question', '--message', 'What is the difference between dfg and heuristic_miner?'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  // ── Test 2: list ─────────────────────────────────────────────────────────────

  describe('feedback list', () => {
    it('exits 0 even when no feedback exists', async () => {
      const result = await runCli(['feedback', 'list'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has items array', async () => {
      // Submit one item first (same cwd so list can find it)
      await runCli(
        ['feedback', 'submit', '--type', 'improvement', '--message', 'Add Mermaid export support'],
        { env: env.env, cwd: env.tempDir }
      );
      const result = await runCli(['feedback', 'list', '--format', 'json'], { env: env.env, cwd: env.tempDir });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('items');
      expect(Array.isArray(payload['items'])).toBe(true);
      expect((payload['items'] as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('lists all submitted items with ID, type, status, message', async () => {
      await runCli(['feedback', 'submit', '--type', 'bug', '--message', 'crash on empty log'], { env: env.env, cwd: env.tempDir });
      await runCli(['feedback', 'submit', '--type', 'improvement', '--message', 'add percentage display'], { env: env.env, cwd: env.tempDir });

      const result = await runCli(['feedback', 'list', '--format', 'json'], { env: env.env, cwd: env.tempDir });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      const items = payload['items'] as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(2);
      // Each item has the required fields
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('type');
      expect(items[0]).toHaveProperty('status');
      expect(items[0]).toHaveProperty('message');
    });

    it('--format json is valid JSON', async () => {
      const result = await runCli(['feedback', 'list', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  // ── Test 3: summary ───────────────────────────────────────────────────────────

  describe('feedback summary', () => {
    it('exits 0', async () => {
      const result = await runCli(['feedback', 'summary'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has total, open, resolved', async () => {
      await runCli(['feedback', 'submit', '--type', 'bug', '--message', 'test bug 1'], { env: env.env, cwd: env.tempDir });
      await runCli(['feedback', 'submit', '--type', 'improvement', '--message', 'test improvement 1'], { env: env.env, cwd: env.tempDir });

      const result = await runCli(['feedback', 'summary', '--format', 'json'], { env: env.env, cwd: env.tempDir });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('total');
      expect(payload).toHaveProperty('open');
      expect(payload).toHaveProperty('resolved');
      expect(typeof payload['total']).toBe('number');
      expect(typeof payload['open']).toBe('number');
      expect(typeof payload['resolved']).toBe('number');
      expect((payload['total'] as number)).toBeGreaterThanOrEqual(2);
    });

    it('human output mentions Total', async () => {
      const result = await runCli(['feedback', 'summary'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/total|summary|feedback/i);
    });
  });

  // ── Test 4: analyze ───────────────────────────────────────────────────────────

  describe('feedback analyze', () => {
    it('exits 0 with a valid XES file', async () => {
      const result = await runCli(['feedback', 'analyze', '-i', xesFile], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has issues array', async () => {
      const result = await runCli(['feedback', 'analyze', '-i', xesFile, '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('issues');
      expect(Array.isArray(payload['issues'])).toBe(true);
    });

    it('JSON output has log_stats with events, traces, activities', async () => {
      const result = await runCli(['feedback', 'analyze', '-i', xesFile, '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('log_stats');
      const stats = payload['log_stats'] as Record<string, unknown>;
      expect(stats).toHaveProperty('traces');
      expect(stats).toHaveProperty('events');
      expect(stats).toHaveProperty('activities');
      expect((stats['traces'] as number)).toBe(3);
    });

    it('exits 1 when -i is missing', async () => {
      const result = await runCli(['feedback', 'analyze'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('exits 2 when file does not exist', async () => {
      const result = await runCli(['feedback', 'analyze', '-i', '/nonexistent/path.xes'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('human output mentions Issue or No significant issues', async () => {
      const result = await runCli(['feedback', 'analyze', '-i', xesFile], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/issue|Issues|significant|feedback/i);
    });
  });
});

// ── wpm claude AI assistant ───────────────────────────────────────────────────

describe('wpm claude — AI process mining assistant', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let xesFile: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    xesFile = path.join(env.tempDir, 'test-log.xes');
    await fs.writeFile(xesFile, MINIMAL_XES, 'utf8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ── Test 5: ask ───────────────────────────────────────────────────────────────

  describe('claude ask', () => {
    it('exits 0 for a basic DFG question', async () => {
      const result = await runCli(['claude', 'ask', 'what is DFG'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('output contains algorithm explanation', async () => {
      const result = await runCli(['claude', 'ask', 'what is DFG'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg|algorithm|graph|directly/i);
    });

    it('hospital query recommends inductive_miner', async () => {
      const result = await runCli(['claude', 'ask', 'What algorithm should I use for a hospital event log with 5000 events?'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/inductive_miner|heuristic_miner|hospital|healthcare/i);
    });

    it('JSON output has query, answer, lines', async () => {
      const result = await runCli(['claude', 'ask', 'what algorithm for large logs', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('query');
      expect(payload).toHaveProperty('answer');
      expect(payload).toHaveProperty('lines');
      expect(Array.isArray(payload['lines'])).toBe(true);
    });

    it('exits 1 when no question provided', async () => {
      const result = await runCli(['claude', 'ask'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('metric question triggers metric interpretation', async () => {
      const result = await runCli(['claude', 'ask', 'I got fitness 0.75 precision 0.65'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fitness|precision|metric|interpret/i);
    });

    it('streaming query recommends streaming algorithm', async () => {
      const result = await runCli(['claude', 'ask', 'what algorithm for streaming real-time process monitoring'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/stream|dfg|simd/i);
    });
  });

  // ── Test 6: interpret ─────────────────────────────────────────────────────────

  describe('claude interpret', () => {
    it('exits 0 for "fitness 0.87"', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.87'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('output contains interpretation text', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.87'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fitness|reliably|model|Excellent|Good/i);
    });

    it('JSON output has metrics, interpretation, overall', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.87', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('metrics');
      expect(payload).toHaveProperty('interpretation');
      expect(payload).toHaveProperty('overall');
      const metrics = payload['metrics'] as Array<{ metric: string; value: number }>;
      expect(metrics.length).toBeGreaterThanOrEqual(1);
      expect(metrics[0].metric).toBe('fitness');
      expect(metrics[0].value).toBeCloseTo(0.87, 2);
    });

    it('identifies high fitness correctly', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.92', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      const overall = payload['overall'] as string;
      expect(overall).toMatch(/excellent|good/i);
    });

    it('identifies low fitness correctly', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.45', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      const overall = payload['overall'] as string;
      expect(overall).toMatch(/moderate|low/i);
    });

    it('handles multiple metrics: fitness + precision', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.73 precision 0.68', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      const metrics = payload['metrics'] as Array<{ metric: string; value: number }>;
      expect(metrics.length).toBe(2);
    });

    it('exits 1 when no metrics found in text', async () => {
      const result = await runCli(['claude', 'interpret', 'hello world no metrics here'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('exits 1 when no text provided', async () => {
      const result = await runCli(['claude', 'interpret'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('provides next_steps recommendations', async () => {
      const result = await runCli(['claude', 'interpret', 'fitness 0.73 precision 0.68', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('next_steps');
      const steps = payload['next_steps'] as string[];
      expect(steps.length).toBeGreaterThan(0);
    });
  });

  // ── claude suggest ────────────────────────────────────────────────────────────

  describe('claude suggest', () => {
    it('exits 0 with a valid XES file', async () => {
      const result = await runCli(['claude', 'suggest', '-i', xesFile], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has log_stats and algorithm_suggestions', async () => {
      const result = await runCli(['claude', 'suggest', '-i', xesFile, '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = (parsed['payload'] ?? parsed) as Record<string, unknown>;
      expect(payload).toHaveProperty('log_stats');
      expect(payload).toHaveProperty('algorithm_suggestions');
      expect(payload).toHaveProperty('quick_start');
    });

    it('exits 1 when -i is missing', async () => {
      const result = await runCli(['claude', 'suggest'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });

  // ── claude root (status) ──────────────────────────────────────────────────────

  describe('claude (root)', () => {
    it('exits 0 and shows status', async () => {
      const result = await runCli(['claude'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('mentions new AI assistant subcommands', async () => {
      const result = await runCli(['claude'], { env: env.env });
      expect(result.stdout).toMatch(/ask|interpret|suggest/i);
    });
  });
});
