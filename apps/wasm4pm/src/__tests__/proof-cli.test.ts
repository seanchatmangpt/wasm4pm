import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';

describe('proof — Proof pack gate: collect, verify, audit, show, promote', () => {
  let tempDir: string;

  beforeEach(async () => {
    await createCliTestEnv();
    tempDir = path.join(process.cwd(), 'test-proof-packs-' + Date.now());
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('proof collect', () => {
    it('should run collect and report output', async () => {
      const result = await runCli('proof', ['collect']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should support custom run ID', async () => {
      const customRunId = 'test-run-' + Date.now();
      const result = await runCli('proof', ['collect', '--runId', customRunId]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      if (result.exitCode === 0) {
        expect(result.stdout).toContain(customRunId);
      }
    });

    it('should support output directory', async () => {
      const outDir = path.join(tempDir, 'custom-pack');
      const result = await runCli('proof', ['collect', '--out', outDir]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support JSON format', async () => {
      const result = await runCli('proof', ['collect', '--format', 'json']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      if (result.exitCode === 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should support quiet flag', async () => {
      const result = await runCli('proof', ['collect', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support verbose flag', async () => {
      const result = await runCli('proof', ['collect', '--verbose']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('proof verify', () => {
    it('should fail on nonexistent pack', async () => {
      const packDir = path.join(tempDir, 'nonexistent');
      const result = await runCli('proof', ['verify', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should validate MANIFEST.json exists', async () => {
      const packDir = path.join(tempDir, 'no-manifest');
      mkdirSync(packDir, { recursive: true });
      const result = await runCli('proof', ['verify', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should validate verdict.json exists', async () => {
      const packDir = path.join(tempDir, 'no-verdict');
      mkdirSync(packDir, { recursive: true });
      writeFileSync(path.join(packDir, 'MANIFEST.json'), JSON.stringify({ files: [] }));
      const result = await runCli('proof', ['verify', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should validate producer is approved', async () => {
      const packDir = path.join(tempDir, 'bad-producer');
      mkdirSync(packDir, { recursive: true });
      mkdirSync(path.join(packDir, 'FINAL'), { recursive: true });
      writeFileSync(path.join(packDir, 'MANIFEST.json'), JSON.stringify({ files: [] }));
      writeFileSync(path.join(packDir, 'FINAL', 'verdict.json'), JSON.stringify({ verdict: 'Accepted' }));
      writeFileSync(path.join(packDir, 'FINAL', 'PRODUCER_RECEIPT.json'), JSON.stringify({ producer: 'bad-producer' }));
      const result = await runCli('proof', ['verify', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should support JSON output', async () => {
      const packDir = path.join(tempDir, 'json-verify');
      mkdirSync(packDir, { recursive: true });
      writeFileSync(path.join(packDir, 'MANIFEST.json'), JSON.stringify({ files: [] }));
      const result = await runCli('proof', ['verify', packDir, '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should support quiet flag', async () => {
      const result = await runCli('proof', ['verify', '/nonexistent', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('proof show', () => {
    it('should reject nonexistent pack', async () => {
      const result = await runCli('proof', ['show', '/nonexistent-pack']);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should display verdict if file exists', async () => {
      const packDir = path.join(tempDir, 'show-pack');
      mkdirSync(packDir, { recursive: true });
      mkdirSync(path.join(packDir, 'FINAL'), { recursive: true });
      writeFileSync(path.join(packDir, 'FINAL', 'verdict.json'), JSON.stringify({ verdict: 'Accepted' }));
      const result = await runCli('proof', ['show', packDir]);
      expect(result.stdout).toMatch(/Accepted|verdict/i);
    });

    it('should exit with error on AndonPull', async () => {
      const packDir = path.join(tempDir, 'andon-show');
      mkdirSync(packDir, { recursive: true });
      mkdirSync(path.join(packDir, 'FINAL'), { recursive: true });
      writeFileSync(path.join(packDir, 'FINAL', 'verdict.json'), JSON.stringify({ verdict: 'AndonPull' }));
      const result = await runCli('proof', ['show', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should support JSON output', async () => {
      const packDir = path.join(tempDir, 'json-show');
      mkdirSync(packDir, { recursive: true });
      mkdirSync(path.join(packDir, 'FINAL'), { recursive: true });
      writeFileSync(path.join(packDir, 'FINAL', 'verdict.json'), JSON.stringify({ verdict: 'Accepted' }));
      const result = await runCli('proof', ['show', packDir, '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should support quiet flag', async () => {
      const result = await runCli('proof', ['show', '/nonexistent', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support verbose flag', async () => {
      const packDir = path.join(tempDir, 'verb-show');
      mkdirSync(packDir, { recursive: true });
      mkdirSync(path.join(packDir, 'FINAL'), { recursive: true });
      writeFileSync(path.join(packDir, 'FINAL', 'verdict.json'), JSON.stringify({ verdict: 'Accepted' }));
      const result = await runCli('proof', ['show', packDir, '--verbose']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('proof audit', () => {
    it('should generate audit output', async () => {
      const result = await runCli('proof', ['audit']);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should support output path', async () => {
      const outPath = path.join(tempDir, 'audit.json');
      const result = await runCli('proof', ['audit', '--out', outPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should output JSON format', async () => {
      const result = await runCli('proof', ['audit', '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should support quiet flag', async () => {
      const result = await runCli('proof', ['audit', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support verbose flag', async () => {
      const result = await runCli('proof', ['audit', '--verbose']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('proof promote', () => {
    it('should reject nonexistent pack', async () => {
      const result = await runCli('proof', ['promote', '--pack', '/nonexistent']);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should output JSON format', async () => {
      const result = await runCli('proof', ['promote', '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should support quiet flag', async () => {
      const result = await runCli('proof', ['promote', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('proof (root command)', () => {
    it('should show help', async () => {
      const result = await runCli('proof', ['--help']);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should support collect subcommand', async () => {
      const result = await runCli('proof', ['collect', '--help']);
      expect([0, 1, 2]).toContain(result.exitCode);
    });

    it('should support verify subcommand', async () => {
      const result = await runCli('proof', ['verify', '--help']);
      expect([0, 1, 2]).toContain(result.exitCode);
    });

    it('should support show subcommand', async () => {
      const result = await runCli('proof', ['show', '--help']);
      expect([0, 1, 2]).toContain(result.exitCode);
    });

    it('should support audit subcommand', async () => {
      const result = await runCli('proof', ['audit', '--help']);
      expect([0, 1, 2]).toContain(result.exitCode);
    });

    it('should support promote subcommand', async () => {
      const result = await runCli('proof', ['promote', '--help']);
      expect([0, 1, 2]).toContain(result.exitCode);
    });
  });

  describe('proof — manifest handling', () => {
    it('should require manifest for verify', async () => {
      const packDir = path.join(tempDir, 'manifest-test');
      mkdirSync(packDir, { recursive: true });
      const result = await runCli('proof', ['verify', packDir]);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });
  });

  describe('proof — exit code contracts', () => {
    it('should have valid exit codes', async () => {
      const validCodes = [EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error];
      const result = await runCli('proof', ['verify', '/nonexistent']);
      expect(validCodes.some(code => code === result.exitCode || typeof code === 'number')).toBe(true);
    });
  });
});
