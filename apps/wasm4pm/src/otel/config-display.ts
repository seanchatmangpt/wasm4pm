/**
 * Config Display Helper
 * Formats configuration objects for human and JSON output
 */

import type { Config } from '@wasm4pm/config';

/**
 * Format a config object for display
 * @param config The configuration to display
 * @param format Output format: 'human' (TOML-like), 'json', or 'minimal'
 * @returns Formatted string
 */
export function displayConfig(
  config: Config,
  format: 'human' | 'json' | 'minimal'
): string {
  if (format === 'json') {
    return JSON.stringify(config, null, 2);
  }

  if (format === 'minimal') {
    return [
      `Algorithm: ${config.algorithm.name}`,
      `Profile: ${config.execution.profile}`,
      `Output: ${config.output.format}`,
    ].join(' | ');
  }

  // Human format: TOML-like indented display
  const lines: string[] = [];

  // [source]
  lines.push('[source]');
  lines.push(`  kind = "${config.source.kind}"`);
  if (config.source.path) {
    lines.push(`  path = "${config.source.path}"`);
  }
  if (config.source.url) {
    lines.push(`  url = "${config.source.url}"`);
  }
  lines.push('');

  // [sink]
  lines.push('[sink]');
  lines.push(`  kind = "${config.sink.kind}"`);
  if (config.sink.path) {
    lines.push(`  path = "${config.sink.path}"`);
  }
  if (config.sink.url) {
    lines.push(`  url = "${config.sink.url}"`);
  }
  lines.push('');

  // [algorithm]
  lines.push('[algorithm]');
  lines.push(`  name = "${config.algorithm.name}"`);
  if (config.algorithm.parameters && Object.keys(config.algorithm.parameters).length > 0) {
    lines.push('  parameters = {');
    for (const [key, value] of Object.entries(config.algorithm.parameters)) {
      if (typeof value === 'string') {
        lines.push(`    ${key} = "${value}"`);
      } else {
        lines.push(`    ${key} = ${value}`);
      }
    }
    lines.push('  }');
  }
  lines.push('');

  // [execution]
  lines.push('[execution]');
  lines.push(`  profile = "${config.execution.profile}"`);
  if (config.execution.timeout) {
    lines.push(`  timeout = ${config.execution.timeout}`);
  }
  if (config.execution.maxMemory) {
    lines.push(`  max_memory = ${config.execution.maxMemory}`);
  }
  lines.push('');

  // [output]
  lines.push('[output]');
  lines.push(`  format = "${config.output.format}"`);
  lines.push(`  destination = "${config.output.destination}"`);
  if (config.output.colorize !== undefined) {
    lines.push(`  colorize = ${config.output.colorize}`);
  }
  lines.push('');

  // [observability]
  lines.push('[observability]');
  lines.push(`  log_level = "${config.observability.logLevel}"`);
  if (config.observability.otel?.enabled) {
    lines.push('  [observability.otel]');
    lines.push(`    enabled = true`);
    if (config.observability.otel.exporter) {
      lines.push(`    exporter = "${config.observability.otel.exporter}"`);
    }
    if (config.observability.otel.endpoint) {
      lines.push(`    endpoint = "${config.observability.otel.endpoint}"`);
    }
  }
  lines.push('');

  // [metadata]
  if (config.metadata) {
    lines.push('[metadata]');
    lines.push(`  hash = "${config.metadata.hash ?? 'unknown'}"`);
    if (config.metadata.loadTime) {
      lines.push(`  load_time_ms = ${config.metadata.loadTime}`);
    }
    if (Object.keys(config.metadata.provenance).length > 0) {
      lines.push('  provenance = {');
      for (const [key, prov] of Object.entries(config.metadata.provenance)) {
        lines.push(`    ${key} = {`);
        lines.push(`      source = "${prov.source}"`);
        if (prov.path) {
          lines.push(`      path = "${prov.path}"`);
        }
        if (prov.timestamp) {
          lines.push(`      timestamp = "${prov.timestamp}"`);
        }
        lines.push('    }');
      }
      lines.push('  }');
    }
    lines.push('');
  }

  return lines.join('\n');
}
