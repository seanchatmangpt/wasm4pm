import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCliTestEnv, EXIT_CODES, runCli, type CliTestEnv } from '@wasm4pm/testing';

const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_STAGES = [
  'admission',
  'cognition-run',
  'sandbox-execution',
  'test-result',
  'accessibility-projection',
] as const;

function repositoryRoot(): string {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.cwd(), resolve(process.cwd(), '../..'), resolve(testDirectory, '../../../..')];
  const root = candidates.find((candidate) => existsSync(join(candidate, 'examples', 'interview-assist', 'package.json')));
  if (!root) throw new Error(`unable to locate repository root from ${process.cwd()}`);
  return root;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} was not an object`);
  }
  return value as Record<string, unknown>;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(path, 'utf8')) as unknown, path);
}

describe('wpm lab interview-assist', () => {
  let env: CliTestEnv;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('runs the live five-stage session and persists independently readable evidence', async () => {
    const evidencePath = join(env.tempDir, 'session-evidence.json');
    const spansPath = join(env.tempDir, '.wasm4pm', 'spans.jsonl');
    const result = await runCli(
      [
        'lab',
        'interview-assist',
        '--workspace',
        repositoryRoot(),
        '--output',
        evidencePath,
        '--timeout-ms',
        '150000',
      ],
      {
        cwd: env.tempDir,
        timeout: 180_000,
        env: {
          ...env.env,
          WASM4PM_OTEL_ENABLED: 'true',
          WASM4PM_OTEL_ENDPOINT: 'http://127.0.0.1:9',
          WASM4PM_SPANS_FILE: spansPath,
        },
      },
    );

    expect(result.exitCode, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(EXIT_CODES.success);
    const commandOutput = asRecord(JSON.parse(result.stdout) as unknown, 'command stdout');
    expect(commandOutput.status).toBe('verified');
    expect(commandOutput.receipt_count).toBe(5);
    expect(commandOutput.evidence_path).toBe(evidencePath);

    const evidence = await readJson(evidencePath);
    expect(evidence.status).toBe('verified');
    expect(evidence.command).toBe('wpm lab interview-assist');
    const stages = evidence.stages as unknown[];
    expect(stages).toHaveLength(5);
    expect(stages.map((entry) => asRecord(entry, 'stage').stage)).toEqual(EXPECTED_STAGES);

    const checksums = new Set<string>();
    for (let index = 0; index < stages.length; index += 1) {
      const stage = asRecord(stages[index], `stage ${index}`);
      const receipt = asRecord(stage.receipt, `stage ${index}.receipt`);
      const checksum = asRecord(receipt.checksum, `stage ${index}.receipt.checksum`);
      expect(checksum.algorithm).toBe('BLAKE3');
      expect(checksum.checksumValue).toMatch(CHECKSUM_PATTERN);
      const checksumValue = checksum.checksumValue as string;
      expect(checksums.has(checksumValue)).toBe(false);
      checksums.add(checksumValue);
      if (index === 0) {
        expect(receipt.derivedFrom).toBeUndefined();
        expect(receipt.relation).toBeUndefined();
      } else {
        const previousStage = asRecord(stages[index - 1], `stage ${index - 1}`);
        const previousReceipt = asRecord(previousStage.receipt, `stage ${index - 1}.receipt`);
        const previousChecksum = asRecord(previousReceipt.checksum, `stage ${index - 1}.receipt.checksum`)
          .checksumValue;
        expect(receipt.derivedFrom).toBe(previousChecksum);
        expect(receipt.relation).toBe(previousChecksum);
      }
    }

    expect(asRecord(evidence.execution, 'execution').exit_code).toBe(0);
    expect(asRecord(evidence.visible_test, 'visible_test').exit_code).toBe(0);

    const commandReceipt = await readJson(join(env.tempDir, '.wasm4pm', 'receipts', 'latest.json'));
    expect(commandReceipt.command).toBe('lab interview-assist');
    expect(commandReceipt.status).toBe('success');
    expect(commandReceipt.input_hash).toMatch(CHECKSUM_PATTERN);
    expect(commandReceipt.output_hash).toMatch(CHECKSUM_PATTERN);

    const spans = (await readFile(spansPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => asRecord(JSON.parse(line) as unknown, 'span'));
    const commandSpan = spans.find((span) => span.name === 'wpm.lab.interview-assist');
    expect(commandSpan).toBeDefined();
    expect(asRecord(commandSpan!.status, 'command span status').code).toBe('OK');
  }, 180_000);

  it('refuses a workspace without InterviewAssist and records the failed invocation', async () => {
    const result = await runCli(
      ['lab', 'interview-assist', '--workspace', env.tempDir],
      { cwd: env.tempDir, timeout: 30_000, env: env.env },
    );

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const output = asRecord(JSON.parse(result.stdout) as unknown, 'error stdout');
    const error = asRecord(output.error, 'error envelope');
    expect(error.code).toBe('INVALID_INPUT');
    expect(String(error.message)).toContain('InterviewAssist package not found');

    const commandReceipt = await readJson(join(env.tempDir, '.wasm4pm', 'receipts', 'latest.json'));
    expect(commandReceipt.command).toBe('lab interview-assist');
    expect(commandReceipt.status).toBe('failed');
    expect(commandReceipt.input_hash).toMatch(CHECKSUM_PATTERN);
    expect(commandReceipt.output_hash).toMatch(CHECKSUM_PATTERN);
  });
});
