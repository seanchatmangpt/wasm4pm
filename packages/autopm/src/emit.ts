/**
 * @wasm4pm/autopm - Genome → wasm4pm.toml emitter (and reader).
 *
 * Converts an evolved {@link PipelineGenome} into a concrete wasm4pm.toml
 * configuration object that validates against the canonical @wasm4pm/config
 * Zod schema, serializes it to deterministic TOML, and parses it back.
 */
import * as toml from 'toml';
import { configSchema, ALGORITHM_IDS } from '@wasm4pm/config';
import type { PipelineGenome, PipelineStage, LogCharacteristics, Objectives } from './types.js';

/**
 * Algorithm ids that operate on unbounded event streams. AutoML "instinct":
 * when the discover stage names one of these, the emitted [source] defaults to
 * kind = "stream" and the execution profile to "stream".
 */
const STREAMING_ALGORITHMS = new Set<string>(['simd_streaming_dfg']);

function isStreamingAlgorithm(id: string): boolean {
  return STREAMING_ALGORITHMS.has(id) || id.includes('stream');
}

function isValidAlgorithmId(id: string): boolean {
  return (ALGORITHM_IDS as readonly string[]).includes(id);
}

/** Find the (first) discover stage in a genome. */
function findDiscoverStage(g: PipelineGenome): PipelineStage | undefined {
  return g.stages.find((s) => s.kind === 'discover');
}

/**
 * Convert a genome into a config object matching the wasm4pm.toml schema.
 *
 * The returned object is validated against {@link configSchema} by callers /
 * tests via `configSchema.parse()`. At minimum it carries [source], [algorithm],
 * [execution] and [output] sections.
 *
 * @throws if the discover stage names an algorithm that is not a valid ALGORITHM_ID.
 */
export function genomeToConfig(g: PipelineGenome, _log?: LogCharacteristics): unknown {
  const discover = findDiscoverStage(g);
  const algorithmName = discover?.algorithm ?? 'dfg';

  if (!isValidAlgorithmId(algorithmName)) {
    throw new Error(
      `genomeToConfig: discover stage algorithm "${algorithmName}" is not a valid ALGORITHM_ID ` +
        `(${(ALGORITHM_IDS as readonly string[]).length} registered algorithms).`,
    );
  }

  const streaming = isStreamingAlgorithm(algorithmName);

  // Pull through numeric/string/boolean params from the discover stage.
  const parameters: Record<string, number | string | boolean> = {};
  if (discover) {
    for (const key of Object.keys(discover.params).sort()) {
      parameters[key] = discover.params[key];
    }
  }

  const config = {
    schemaVersion: 1,
    version: '1.0.0',
    source: {
      kind: streaming ? ('stream' as const) : ('file' as const),
    },
    algorithm: {
      name: algorithmName,
      parameters,
    },
    execution: {
      profile: streaming ? ('stream' as const) : ('balanced' as const),
    },
    output: {
      format: 'json' as const,
      destination: 'stdout',
      pretty: true,
      colorize: false,
    },
  };

  return config;
}

/** Quote a TOML string value, escaping backslashes and double quotes. */
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Serialize a scalar to a TOML value literal. */
function tomlScalar(value: number | string | boolean): string {
  if (typeof value === 'string') return tomlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // number — preserve integer/float form deterministically.
  return Number.isFinite(value) ? String(value) : '0';
}

/** Render a flat table (record of scalars) into `key = value` lines, sorted by key. */
function renderTable(table: Record<string, number | string | boolean>): string[] {
  return Object.keys(table)
    .sort()
    .map((key) => `${key} = ${tomlScalar(table[key])}`);
}

/**
 * Serialize a genome to a deterministic wasm4pm.toml string.
 *
 * Emits a header comment naming AutoPM as the emitter and (optionally) the
 * winner's objectives. Key order within every section is stable (sorted), so
 * the same genome always produces byte-identical TOML.
 *
 * @param objectives optional winner objectives, recorded in the header comment.
 */
export function genomeToToml(
  g: PipelineGenome,
  log?: LogCharacteristics,
  objectives?: Objectives,
): string {
  const config = genomeToConfig(g, log) as {
    schemaVersion: number;
    version: string;
    source: { kind: string };
    algorithm: { name: string; parameters: Record<string, number | string | boolean> };
    execution: { profile: string };
    output: { format: string; destination: string; pretty: boolean; colorize: boolean };
  };

  const lines: string[] = [];
  lines.push('# wasm4pm.toml — emitted by AutoPM (@wasm4pm/autopm)');
  lines.push('# Deterministic genome → config projection. Do not assume hand-edits survive re-emission.');
  if (objectives) {
    lines.push(
      `# winner objectives: quality=${objectives.quality}, cost=${objectives.cost}`,
    );
  }
  lines.push('');

  // [meta]-ish top-level scalars first (schemaVersion, version).
  lines.push(`schemaVersion = ${config.schemaVersion}`);
  lines.push(`version = ${tomlString(config.version)}`);
  lines.push('');

  lines.push('[source]');
  lines.push(`kind = ${tomlString(config.source.kind)}`);
  lines.push('');

  lines.push('[algorithm]');
  lines.push(`name = ${tomlString(config.algorithm.name)}`);
  lines.push('');

  const paramLines = renderTable(config.algorithm.parameters);
  if (paramLines.length > 0) {
    lines.push('[algorithm.parameters]');
    lines.push(...paramLines);
    lines.push('');
  }

  lines.push('[execution]');
  lines.push(`profile = ${tomlString(config.execution.profile)}`);
  lines.push('');

  lines.push('[output]');
  lines.push(`colorize = ${config.output.colorize ? 'true' : 'false'}`);
  lines.push(`destination = ${tomlString(config.output.destination)}`);
  lines.push(`format = ${tomlString(config.output.format)}`);
  lines.push(`pretty = ${config.output.pretty ? 'true' : 'false'}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Best-effort round-trip: parse a wasm4pm.toml string back into a genome,
 * reconstructing the discover stage from [algorithm].name (and parameters).
 */
export function tomlToGenome(tomlText: string): PipelineGenome {
  const parsed = toml.parse(tomlText) as {
    algorithm?: { name?: string; parameters?: Record<string, unknown> };
  };

  const algorithm = parsed.algorithm?.name ?? 'dfg';
  const rawParams = parsed.algorithm?.parameters ?? {};
  const params: Record<string, number | string | boolean> = {};
  for (const key of Object.keys(rawParams).sort()) {
    const v = rawParams[key];
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      params[key] = v;
    }
  }

  const discover: PipelineStage = {
    kind: 'discover',
    algorithm,
    params,
  };

  return { stages: [discover] };
}

/** Validate an emitted config object against the canonical schema. */
export function validateEmittedConfig(config: unknown): void {
  configSchema.parse(config);
}
