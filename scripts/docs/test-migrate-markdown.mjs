#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migration = path.join(directory, 'migrate-markdown.mjs');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-doc-migration-'));

function write(relative, content) {
  const target = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function run(...args) {
  const result = spawnSync(process.execPath, [migration, `--root=${fixture}`, ...args], {
    encoding: 'utf8',
  });
  const stream = result.status === 0 ? result.stdout : result.stderr;
  let payload;
  try {
    payload = JSON.parse(stream);
  } catch {
    throw new Error(`Migration returned non-JSON output:\n${stream}`);
  }
  return { ...result, payload };
}

try {
  write('README.md', '# Root\n');
  write('packages/example/README.md', '# Package\n');
  write('docs/tutorials/start.md', '# Tutorial\n');
  write('docs/audits/old-report.md', '# Historical report\n');
  write('docs/reference/cli_commands.md', '# Generated reference\n');
  write('docs/archive/2025-01-01/prior.md', '# Prior archive\n');

  const plan = run();
  assert.equal(plan.status, 0);
  assert.equal(plan.payload.status, 'PLANNED');
  assert.equal(plan.payload.inspected, 6);
  assert.equal(plan.payload.changed, 5);
  assert.equal(plan.payload.counts.generated, 1);

  const apply = run('--apply');
  assert.equal(apply.status, 0);
  assert.equal(apply.payload.status, 'APPLIED');
  assert.equal(apply.payload.changed, 5);

  assert.match(
    fs.readFileSync(path.join(fixture, 'README.md'), 'utf8'),
    /wasm4pm-doc-status: active/,
  );
  assert.match(
    fs.readFileSync(path.join(fixture, 'docs/audits/old-report.md'), 'utf8'),
    /wasm4pm-doc-status: archive-pointer/,
  );
  assert.match(
    fs.readFileSync(
      path.join(
        fixture,
        'docs/archive/2026-08-02/docs/audits/old-report.md',
      ),
      'utf8',
    ),
    /wasm4pm-doc-status: archived/,
  );
  assert.equal(
    fs.readFileSync(
      path.join(fixture, 'docs/reference/cli_commands.md'),
      'utf8',
    ),
    '# Generated reference\n',
  );

  const check = run('--check');
  assert.equal(check.status, 0);
  assert.equal(check.payload.changed, 0);
  assert.equal(check.payload.counts.generated, 1);

  process.stdout.write(
    `${JSON.stringify({ status: 'PASS', assertions: 14, fixture: 'synthetic' })}\n`,
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
