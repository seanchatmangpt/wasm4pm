import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  createCliTestEnv,
  writeTestConfig,
  EXIT_CODES,
  assertExitCode,
  assertJsonOutput,
  assertErrorCode,
} from '../../src/harness/cli.js';
import type { CliResult, CliTestEnv } from '../../src/harness/cli.js';

describe('CLI Test Helpers', () => {
  let env: CliTestEnv | null = null;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
      env = null;
    }
  });

  describe('EXIT_CODES', () => {
    it('defines all expected exit codes', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.CONFIG_ERROR).toBe(1);
      expect(EXIT_CODES.SOURCE_ERROR).toBe(2);
      expect(EXIT_CODES.EXECUTION_ERROR).toBe(3);
      expect(EXIT_CODES.PARTIAL_FAILURE).toBe(4);
      expect(EXIT_CODES.SYSTEM_ERROR).toBe(5);
    });
  });

  describe('createCliTestEnv', () => {
    it('creates temp directory', async () => {
      env = await createCliTestEnv();
      const stat = await fs.stat(env.tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates output directory', async () => {
      env = await createCliTestEnv();
      const stat = await fs.stat(env.outputDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('writes config file when content provided', async () => {
      const config = JSON.stringify({ version: '1.0' });
      env = await createCliTestEnv(config);
      const content = await fs.readFile(env.configPath, 'utf-8');
      expect(JSON.parse(content)).toEqual({ version: '1.0' });
    });

    it('does not write config when no content', async () => {
      env = await createCliTestEnv();
      const exists = await fs.access(env.configPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('cleanup removes temp directory', async () => {
      env = await createCliTestEnv();
      const dir = env.tempDir;
      await env.cleanup();
      const exists = await fs.access(dir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
      env = null;
    });
  });

  describe('writeTestConfig', () => {
    it('writes config to specified directory', async () => {
      env = await createCliTestEnv();
      const configPath = await writeTestConfig(env.tempDir, { version: '1.0', test: true });
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe('1.0');
      expect(parsed.test).toBe(true);
    });

    it('uses custom filename', async () => {
      env = await createCliTestEnv();
      const configPath = await writeTestConfig(env.tempDir, { v: 1 }, 'custom.json');
      expect(configPath).toContain('custom.json');
    });
  });

  describe('assertExitCode', () => {
    it('passes when exit code matches', () => {
      const result: CliResult = { exitCode: 0, stdout: '', stderr: '', durationMs: 10 };
      expect(() => assertExitCode(result, 0)).not.toThrow();
    });

    it('throws when exit code does not match', () => {
      const result: CliResult = { exitCode: 1, stdout: 'out', stderr: 'err', durationMs: 10 };
      expect(() => assertExitCode(result, 0)).toThrow('Exit code mismatch');
    });
  });

  describe('assertJsonOutput', () => {
    it('parses valid JSON stdout', () => {
      const result: CliResult = { exitCode: 0, stdout: '{"key":"value"}', stderr: '', durationMs: 10 };
      const parsed = assertJsonOutput(result);
      expect(parsed).toEqual({ key: 'value' });
    });

    it('throws for non-JSON stdout', () => {
      const result: CliResult = { exitCode: 0, stdout: 'not json', stderr: '', durationMs: 10 };
      expect(() => assertJsonOutput(result)).toThrow('Expected JSON stdout');
    });
  });

  describe('assertErrorCode', () => {
    it('passes when error code in stderr', () => {
      const result: CliResult = { exitCode: 1, stdout: '', stderr: 'Error: CONFIG_INVALID', durationMs: 10 };
      expect(() => assertErrorCode(result, 'CONFIG_INVALID')).not.toThrow();
    });

    it('passes when error code in stdout', () => {
      const result: CliResult = { exitCode: 1, stdout: 'Error: CONFIG_INVALID', stderr: '', durationMs: 10 };
      expect(() => assertErrorCode(result, 'CONFIG_INVALID')).not.toThrow();
    });

    it('throws when error code not found', () => {
      const result: CliResult = { exitCode: 1, stdout: '', stderr: 'some error', durationMs: 10 };
      expect(() => assertErrorCode(result, 'CONFIG_INVALID')).toThrow('Expected error code');
    });
  });
});
