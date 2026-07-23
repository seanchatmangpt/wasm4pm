/**
 * Init command — honest filesystem tests.
 *
 * Plan A demanded: NO mocking process.exit, NO spying on process.cwd.
 * We invoke the CLI as a subprocess (via runCli) with a fresh tmpdir as cwd
 * and assert against the actual files written and the actual exit code.
 *
 * If the CLI binary cannot be located in this environment, the subprocess
 * will fail with a non-zero exit code; we surface that as a real test
 * failure rather than mock it away.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

describe('Init Command (filesystem oracle)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  // 'wpm init' was retired -> 'wpm config init' (see nouns/_removed.ts).
  // 'config init' bridges to the legacy `init` command body unmodified
  // (nouns/config/init.ts), so filesystem side effects are unchanged.

  it('creates wasm4pm.toml with [execution] block in cwd', async () => {
    const result = await runCli(['config', 'init', '--config-format', 'toml', '--quiet'], { cwd: tmpDir });

    expect(result.exitCode).toBe(EXIT_CODES.success);

    const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
    await fsp.access(tomlPath);
    const tomlContent = await fsp.readFile(tomlPath, 'utf-8');
    expect(tomlContent).toContain('[execution]');
  });

  it('creates wasm4pm.json with valid execution.profile when configFormat=json', async () => {
    const result = await runCli(['config', 'init', '--config-format', 'json', '--quiet'], { cwd: tmpDir });
    expect(result.exitCode).toBe(EXIT_CODES.success);

    const jsonPath = path.join(tmpDir, 'wasm4pm.json');
    await fsp.access(jsonPath);
    const config = JSON.parse(await fsp.readFile(jsonPath, 'utf-8'));
    expect(typeof config.execution?.profile).toBe('string');
  });

  it('rejects invalid configFormat with INVALID_INPUT (source_error, 2) and writes no config file', async () => {
    const result = await runCli(['config', 'init', '--config-format', 'yaml', '--quiet'], { cwd: tmpDir });
    // Framework error code INVALID_INPUT maps to EXIT_CODES.source_error (2)
    // per apps/wasm4pm/src/cli.ts's ERROR_CODE_MAP, not config_error (1).
    expect(result.exitCode).toBe(EXIT_CODES.source_error);

    // No wasm4pm.toml or wasm4pm.json should have been written.
    expect(fs.existsSync(path.join(tmpDir, 'wasm4pm.toml'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'wasm4pm.json'))).toBe(false);
  });

  it('does not overwrite existing wasm4pm.toml without --force', async () => {
    const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
    fs.writeFileSync(tomlPath, 'sentinel-content');

    await runCli(['config', 'init', '--config-format', 'toml', '--quiet'], { cwd: tmpDir });

    const after = await fsp.readFile(tomlPath, 'utf-8');
    expect(after).toBe('sentinel-content');
  });
});
