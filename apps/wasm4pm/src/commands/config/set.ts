import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import * as fss from 'node:fs';
import * as path from 'node:path';
import { resolveConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/**
 * Map of dot-path field to TOML key path.
 * Only settable fields are listed — metadata and computed fields are excluded.
 */
const SETTABLE_FIELDS: Record<string, { tomlSection: string; tomlKey: string; description: string }> = {
  'algorithm.name': { tomlSection: 'algorithm', tomlKey: 'name', description: 'Algorithm to use for discovery' },
  'execution.profile': { tomlSection: 'execution', tomlKey: 'profile', description: 'Execution profile: fast | balanced | quality | stream' },
  'execution.timeout': { tomlSection: 'execution', tomlKey: 'timeout', description: 'Timeout in milliseconds' },
  'output.format': { tomlSection: 'output', tomlKey: 'format', description: 'Output format: human | json' },
  'output.pretty': { tomlSection: 'output', tomlKey: 'pretty', description: 'Pretty-print JSON output: true | false' },
  'observability.logLevel': { tomlSection: 'observability', tomlKey: 'logLevel', description: 'Log level: debug | info | warn | error' },
  'source.kind': { tomlSection: 'source', tomlKey: 'kind', description: 'Source kind: file | stream | http' },
  'source.path': { tomlSection: 'source', tomlKey: 'path', description: 'Source file path' },
  'sink.kind': { tomlSection: 'sink', tomlKey: 'kind', description: 'Sink kind: stdout | file | http' },
  'sink.path': { tomlSection: 'sink', tomlKey: 'path', description: 'Sink file path' },
  'watch.enabled': { tomlSection: 'watch', tomlKey: 'enabled', description: 'Enable file watching: true | false' },
  'watch.poll_interval': { tomlSection: 'watch', tomlKey: 'poll_interval', description: 'Poll interval in milliseconds' },
  'prediction.enabled': { tomlSection: 'prediction', tomlKey: 'enabled', description: 'Enable prediction tasks: true | false' },
  'prediction.activityKey': { tomlSection: 'prediction', tomlKey: 'activityKey', description: 'Activity key attribute name' },
  'prediction.ngramOrder': { tomlSection: 'prediction', tomlKey: 'ngramOrder', description: 'N-gram order for prediction (2-5)' },
};

/**
 * Parse a string value to its TOML-appropriate typed form.
 * Booleans and integers are coerced; everything else stays string.
 */
function parseValue(val: string): string | number | boolean {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const n = Number(val);
  if (!Number.isNaN(n) && val.trim() !== '') return n;
  return val;
}

/**
 * Set a value in wasm4pm.toml by section + key.
 * Creates the file if it doesn't exist, inserts/updates the key.
 * This is a lightweight line-based TOML editor — it handles simple
 * [section] / key = value structure. For complex configs with nested
 * tables, use wpm config export --format toml and edit manually.
 */
async function setTomlValue(
  tomlPath: string,
  section: string,
  key: string,
  value: string | number | boolean
): Promise<void> {
  let content = '';
  if (fss.existsSync(tomlPath)) {
    content = await fs.readFile(tomlPath, 'utf-8');
  }

  const lines = content.split('\n');
  const tomlValue = typeof value === 'string' ? `"${value}"` : String(value);
  const targetSection = `[${section}]`;
  const targetLine = `${key} = ${tomlValue}`;

  let inTargetSection = false;
  let sectionIdx = -1;
  let keyIdx = -1;
  let nextSectionIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === targetSection) {
      inTargetSection = true;
      sectionIdx = i;
      continue;
    }
    if (inTargetSection) {
      // Check if we hit another section
      if (trimmed.startsWith('[') && !trimmed.startsWith('[[')) {
        nextSectionIdx = i;
        inTargetSection = false;
        continue;
      }
      // Check if key exists in this section
      const keyMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
      if (keyMatch && keyMatch[1] === key) {
        keyIdx = i;
      }
    }
  }

  if (keyIdx >= 0) {
    // Update existing key
    lines[keyIdx] = targetLine;
  } else if (sectionIdx >= 0) {
    // Section exists, insert key after section header (or after last key in section)
    const insertAt = nextSectionIdx >= 0 ? nextSectionIdx : lines.length;
    // Find the last non-blank line in the section
    let lastKeyInSection = sectionIdx;
    for (let i = sectionIdx + 1; i < insertAt; i++) {
      const t = lines[i].trim();
      if (t && !t.startsWith('#')) lastKeyInSection = i;
    }
    lines.splice(lastKeyInSection + 1, 0, targetLine);
  } else {
    // Section doesn't exist — append at end
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push(targetSection);
    lines.push(targetLine);
    lines.push('');
  }

  await fs.writeFile(tomlPath, lines.join('\n'), 'utf-8');
}

export const configSet = defineCommand({
  meta: {
    name: 'set',
    description:
      'Set a config value in wasm4pm.toml (creates if needed).\n' +
      'Examples: wpm config set algorithm.name dfg  |  wpm config set execution.profile quality',
  },
  args: {
    _: {
      type: 'positional',
      description: 'Field path and value: <field.path> <value>',
      required: true,
    },
    config: {
      type: 'string',
      description: 'Path to wasm4pm.toml (default: ./wasm4pm.toml)',
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const raw = String(ctx.args._ ?? '').trim();

    return withSpanRaw('config.set', { 'config.raw': raw }, async () => {
      // Parse "field.path value" from the positional
      const spaceIdx = raw.indexOf(' ');
      if (spaceIdx < 0) {
        const settable = Object.entries(SETTABLE_FIELDS)
          .map(([k, v]) => `  ${k.padEnd(30)} ${v.description}`)
          .join('\n');
        const result = makeErrorResult(
          'config set',
          `Usage: wpm config set <field.path> <value>\n\nSettable fields:\n${settable}`,
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet: false });
        return await exitWithFlush(EXIT_CODES.config_error);
      }

      const fieldPath = raw.slice(0, spaceIdx).trim();
      const rawValue = raw.slice(spaceIdx + 1).trim();

      const meta = SETTABLE_FIELDS[fieldPath];
      if (!meta) {
        const settable = Object.keys(SETTABLE_FIELDS).join(', ');
        const result = makeErrorResult(
          'config set',
          `Unknown or non-settable field: "${fieldPath}".\nSettable fields: ${settable}`,
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet: false });
        return await exitWithFlush(EXIT_CODES.config_error);
      }

      const tomlPath = ctx.args.config
        ? path.resolve(String(ctx.args.config))
        : path.join(process.cwd(), 'wasm4pm.toml');

      const value = parseValue(rawValue);

      try {
        await setTomlValue(tomlPath, meta.tomlSection, meta.tomlKey, value);

        // Validate after write
        const config = await resolveConfig({ configSearchPaths: [path.dirname(tomlPath)] });
        const newValue = (fieldPath.split('.').reduce((cur: unknown, k: string) =>
          (cur as Record<string, unknown>)?.[k], config as unknown));

        const payload = {
          field: fieldPath,
          value: newValue,
          written_to: tomlPath,
          section: meta.tomlSection,
          key: meta.tomlKey,
        };

        const result = makeResult('config set', payload, performance.now() - t0);
        emitResult(result, { format, quiet: false }, (_res, projection) => {
          projection.success(`Set ${fieldPath} = ${String(newValue)}  → ${tomlPath}`);
        });

        return await exitWithFlush(EXIT_CODES.success);
      } catch (error) {
        const result = makeErrorResult(
          'config set',
          error,
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet: false });
        return await exitWithFlush(EXIT_CODES.config_error);
      }
    });
  },
});
