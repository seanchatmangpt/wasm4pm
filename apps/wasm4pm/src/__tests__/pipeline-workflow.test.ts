/**
 * Tests for `wpm pipeline` command — workflow chaining.
 *
 * Tests cover:
 *   1. wpm pipeline list — exits 0, built-in pipelines listed
 *   2. wpm pipeline run quick -i <fixture> — exits 0 with step results
 *   3. JSON output has required fields: pipeline_name, steps_completed, steps_failed, duration_ms
 *   4. wpm pipeline validate <valid-json> — exits 0
 *   5. wpm pipeline validate <invalid-json> — exits non-zero with error
 *   6. wpm pipeline create — creates a pipeline file
 *   7. wpm pipeline run with unknown preset — exits non-zero
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Fixture setup ────────────────────────────────────────────────────────────

const FIXTURE_XES = '/Users/sac/wasm4pm/data/small-example.xes';
const FIXTURE_XES_ALT = '/Users/sac/wasm4pm/test/fixtures/small.xes';
const FIXTURE_XES_TESTING = '/Users/sac/wasm4pm/packages/testing/__tests__/fixtures/sample.xes';

function findFixtureXes(): string | undefined {
  for (const candidate of [FIXTURE_XES, FIXTURE_XES_ALT, FIXTURE_XES_TESTING]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-pipeline-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

function writePipelineJson(name: string, content: object): string {
  const filePath = path.join(tmpDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('wpm pipeline list', () => {
  it('exits 0', async () => {
    const result = await runCli(['pipeline', 'list']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('lists built-in pipelines in human output', async () => {
    const result = await runCli(['pipeline', 'list']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const out = result.stdout + result.stderr;
    // All four built-in presets should appear
    expect(out).toMatch(/quick/i);
    expect(out).toMatch(/full/i);
    expect(out).toMatch(/compliance/i);
    expect(out).toMatch(/discovery/i);
  });

  it('emits JSON with builtin array when --format json', async () => {
    const result = await runCli(['pipeline', 'list', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as { payload?: { builtin?: unknown[] } };
    expect(parsed.payload).toBeDefined();
    expect(parsed.payload?.builtin).toBeInstanceOf(Array);
    expect((parsed.payload?.builtin as unknown[]).length).toBeGreaterThanOrEqual(4);
  });

  it('lists pipeline step counts', async () => {
    const result = await runCli(['pipeline', 'list', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as {
      payload?: { builtin?: Array<{ id: string; steps: number }> };
    };
    const builtins = parsed.payload?.builtin ?? [];
    const full = builtins.find((b) => b.id === 'full');
    expect(full).toBeDefined();
    expect(full?.steps).toBe(6); // full has 6 steps
    const quick = builtins.find((b) => b.id === 'quick');
    expect(quick?.steps).toBe(2); // quick has 2 steps
  });
});

describe('wpm pipeline validate', () => {
  it('exits 0 for a valid pipeline JSON', async () => {
    const pipelineFile = writePipelineJson('valid-pipeline', {
      name: 'test-pipeline',
      description: 'A valid test pipeline',
      steps: [
        { step: 'validate', args: {} },
        { step: 'run', args: { algorithm: 'dfg' } },
        { step: 'quality', args: {} },
      ],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile]);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/VALID/i);
  });

  it('exits non-zero for invalid JSON', async () => {
    const badFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badFile, '{ not valid json ]');

    const result = await runCli(['pipeline', 'validate', badFile]);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/INVALID|error|json/i);
  });

  it('exits non-zero for missing file', async () => {
    const result = await runCli(['pipeline', 'validate', '/nonexistent/pipeline.json']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/not found|INVALID|error/i);
  });

  it('exits non-zero for pipeline with no steps', async () => {
    const pipelineFile = writePipelineJson('empty-steps', {
      name: 'empty',
      steps: [],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile]);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/INVALID|no steps|error/i);
  });

  it('exits non-zero for pipeline missing name field', async () => {
    const pipelineFile = writePipelineJson('no-name', {
      steps: [{ step: 'validate' }],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile]);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
  });

  it('emits JSON payload with valid/errors fields when --format json', async () => {
    const pipelineFile = writePipelineJson('valid-for-json', {
      name: 'json-test',
      steps: [{ step: 'validate' }, { step: 'run', args: { algorithm: 'dfg' } }],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile, '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as {
      payload?: { valid?: boolean; errors?: number; steps_count?: number };
    };
    expect(parsed.payload?.valid).toBe(true);
    expect(parsed.payload?.errors).toBe(0);
    expect(parsed.payload?.steps_count).toBe(2);
  });

  it('warns about slow steps but still exits 0', async () => {
    const pipelineFile = writePipelineJson('slow-steps', {
      name: 'slow-test',
      steps: [
        { step: 'validate' },
        { step: 'simulate' }, // simulate is known to be slow
      ],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile]);
    // Should still be valid (warnings don't fail validation)
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/warning|VALID/i);
  });
});

describe('wpm pipeline run', () => {
  it('exits non-zero for unknown preset name', async () => {
    const result = await runCli(['pipeline', 'run', 'nonexistent-preset-12345']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/not found|pipeline|error/i);
  });

  it('exits non-zero for missing pipeline file', async () => {
    const result = await runCli(['pipeline', 'run', '/nonexistent/pipeline.json']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
  });

  it('runs quick preset and exits 0 with fixture log', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const result = await runCli(['pipeline', 'run', 'quick', '-i', fixture, '--no-save'], {
      timeout: 60_000,
    });
    // quick runs validate + run dfg — both should succeed with a valid log
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/Pipeline|pipeline/i);
  });

  it('emits JSON with required fields when --format json', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const result = await runCli(
      ['pipeline', 'run', 'quick', '-i', fixture, '--format', 'json', '--no-save'],
      { timeout: 60_000 }
    );

    // Even partial failure (4) or success (0) should produce JSON
    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    let parsed: {
      payload?: {
        pipeline_name?: string;
        steps_completed?: number;
        steps_failed?: number;
        duration_ms?: number;
        step_results?: unknown[];
      };
    };
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      // stdout may have mixed content; try to extract JSON
      const jsonMatch = result.stdout.match(/\{[\s\S]*"pipeline_name"[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON output found in stdout');
      parsed = JSON.parse(jsonMatch[0]);
    }

    expect(parsed.payload).toBeDefined();
    expect(parsed.payload?.pipeline_name).toBe('quick');
    expect(typeof parsed.payload?.steps_completed).toBe('number');
    expect(typeof parsed.payload?.steps_failed).toBe('number');
    expect(typeof parsed.payload?.duration_ms).toBe('number');
    expect(parsed.payload?.duration_ms).toBeGreaterThan(0);
    expect(parsed.payload?.step_results).toBeInstanceOf(Array);
  });

  it('runs a custom pipeline JSON file', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const pipelineFile = writePipelineJson('custom-test', {
      name: 'custom-test',
      description: 'Custom test pipeline',
      steps: [
        { step: 'validate', args: {} },
        { step: 'run', args: { algorithm: 'dfg' } },
      ],
    });

    const result = await runCli(
      ['pipeline', 'run', pipelineFile, '-i', fixture, '--no-save'],
      { timeout: 60_000 }
    );

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout + result.stderr).toMatch(/custom-test|pipeline/i);
  });

  it('continues past optional step failures', async () => {
    const pipelineFile = writePipelineJson('optional-fail', {
      name: 'optional-fail-test',
      steps: [
        { step: 'validate', args: {} },
        // This step will fail (no valid model to compare), but is optional
        { step: 'prolog8', optional: true, args: { subcommand: 'show' } },
        { step: 'validate', args: {} }, // This succeeds
      ],
    });

    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const result = await runCli(
      ['pipeline', 'run', pipelineFile, '-i', fixture, '--format', 'json', '--no-save'],
      { timeout: 60_000 }
    );

    // Should not be a total failure — optional steps don't cause failure
    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
  });
});

describe('wpm pipeline create', () => {
  it('creates a pipeline file', async () => {
    const result = await runCli([
      'pipeline',
      'create',
      '--name',
      'test-created',
      '--steps',
      'validate,run,quality',
      '--output',
      tmpDir,
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const expectedFile = path.join(tmpDir, 'test-created.pipeline.json');
    expect(fs.existsSync(expectedFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(expectedFile, 'utf-8')) as {
      name: string;
      steps: Array<{ step: string }>;
    };
    expect(content.name).toBe('test-created');
    expect(content.steps.length).toBe(3);
    expect(content.steps.map((s) => s.step)).toEqual(['validate', 'run', 'quality']);
  });

  it('emits JSON with output_file field when --format json', async () => {
    const result = await runCli([
      'pipeline',
      'create',
      '--name',
      'json-created',
      '--steps',
      'validate,run',
      '--output',
      tmpDir,
      '--format',
      'json',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as {
      payload?: { name?: string; steps_count?: number; output_file?: string };
    };
    expect(parsed.payload?.name).toBe('json-created');
    expect(parsed.payload?.steps_count).toBe(2);
    expect(parsed.payload?.output_file).toContain('json-created.pipeline.json');
  });

  it('can run the created pipeline file', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    // Create pipeline
    await runCli([
      'pipeline',
      'create',
      '--name',
      'runnable-created',
      '--steps',
      'validate,run',
      '--output',
      tmpDir,
    ]);

    const pipelineFile = path.join(tmpDir, 'runnable-created.pipeline.json');
    expect(fs.existsSync(pipelineFile)).toBe(true);

    // Run it
    const result = await runCli(
      ['pipeline', 'run', pipelineFile, '-i', fixture, '--no-save'],
      { timeout: 60_000 }
    );

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
  });
});

describe('wpm pipeline — output format contract', () => {
  it('pipeline list --format json has status:ok', async () => {
    const result = await runCli(['pipeline', 'list', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as { status?: string };
    expect(parsed.status).toBe('ok');
  });

  it('pipeline validate --format json has payload.valid for valid pipeline', async () => {
    const pipelineFile = writePipelineJson('check-valid-field', {
      name: 'check-valid',
      steps: [{ step: 'validate' }],
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile, '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as { payload?: { valid?: boolean } };
    expect(parsed.payload?.valid).toBe(true);
  });

  it('pipeline validate --format json has payload.valid=false for invalid', async () => {
    const pipelineFile = writePipelineJson('check-invalid-field', {
      steps: [], // no name, no steps
    });

    const result = await runCli(['pipeline', 'validate', pipelineFile, '--format', 'json']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as { payload?: { valid?: boolean } };
    expect(parsed.payload?.valid).toBe(false);
  });
});
