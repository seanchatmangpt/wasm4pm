/**
 * social-enhanced.test.ts — Enhanced social network mining tests
 *
 * Oracle rank: Rank 2 (Domain contract — network metrics, output formats, filtering).
 *
 * MIGRATED from the retired top-level `wpm social` invocation to `wpm lab social`
 * (see `nouns/_removed.ts`: `{ old: 'social', replacement: 'lab social' }`).
 * `lab social` bridges to the unchanged `commands/social.ts` body via
 * `invokeLegacyCommandAsJson` (`nouns/_bridge.ts`) — same WASM calls, same
 * behavior — but always forces `--format json --quiet` and returns the
 * legacy `CommandResult` envelope (`{command,status,message,exit_code,payload,meta}`)
 * directly as the verb's plain JSON result (no additional noun-verb wrapper
 * on success; failures are `{error:{code,message}}` per
 * packages/noun-verb/src/errors.ts).
 *
 * Several original scenarios in this file targeted a `--metric` vocabulary
 * (`centrality`, `clustering`, `community`) and a `--format graphml` export
 * that no longer exist in `commands/social.ts`'s current validation
 * (`metric` must be one of `handover|working-together|similar-task`;
 * `--export` must be one of `dot|csv|json`). Centrality is now driven by
 * the boolean `--centrality` flag (payload.centrality_scores) — see
 * `social-network-analysis.test.ts` (SNA-9/10/11) for exhaustive coverage
 * of that surface. Clustering/community/GraphML have no live replacement;
 * those scenarios are rewritten below to assert the new, intentional
 * rejection (proving the removal is enforced) rather than deleted outright.
 *
 * Coverage:
 *  - `wpm lab social --centrality` → computes degree/betweenness/closeness/eigenvector centrality
 *  - `wpm lab social --export csv` → CSV network export (wrapped as payload.raw)
 *  - `wpm lab social --min-interactions 2` → filters weak ties
 *  - `wpm lab social --metric clustering|community` → rejected (no longer valid metrics)
 *  - `wpm lab social --export graphml` → rejected (no longer a valid export format)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

const SOCIAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <global scope="trace"><string key="concept:name" value="ID"/></global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Time"/>
    <string key="org:resource" value="Resource"/>
  </global>
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/><string key="org:resource" value="Alice"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T09:30:00Z"/><string key="org:resource" value="Bob"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/><string key="org:resource" value="Charlie"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-01-01T10:30:00Z"/><string key="org:resource" value="Alice"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T11:00:00Z"/><string key="org:resource" value="Bob"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:30:00Z"/><string key="org:resource" value="Charlie"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-01-01T12:00:00Z"/><string key="org:resource" value="Dana"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case3"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T08:00:00Z"/><string key="org:resource" value="Alice"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T08:30:00Z"/><string key="org:resource" value="Bob"/></event>
    <event><string key="concept:name" value="E"/><date key="time:timestamp" value="2024-01-02T09:00:00Z"/><string key="org:resource" value="Eve"/></event>
  </trace>
</log>`;

interface SocialResult {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: {
    metric?: string;
    centrality_scores?: {
      degree: Record<string, number>;
      betweenness: Record<string, number>;
      closeness: Record<string, number>;
      eigenvector: Record<string, number>;
    } | null;
    network?: { nodes: unknown[]; edges: Array<{ from: string; to: string; weight: number }> };
    [key: string]: unknown;
  };
  // `--export` bypasses the normal envelope entirely (nouns/_bridge.ts:319:
  // `return returned ?? { raw: text }`) — the whole parsed JSON body IS
  // `{ raw: string }` in that case, so `raw` lives at the top level, not
  // under `payload`.
  raw?: string;
}
interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

describe('Social Network Mining — Enhanced Metrics and Formats (wpm lab social)', () => {
  let tempDir: string;
  let xesFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'social-test-'));
    xesFile = path.join(tempDir, 'log.xes');
    await fs.writeFile(xesFile, SOCIAL_XES);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('computes degree, betweenness, closeness, and eigenvector centrality via --centrality', async () => {
    const result = await runCli(['lab', 'social', xesFile, '--centrality', '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout) as SocialResult;
    expect(output.status).toBe('ok');

    const scores = output.payload.centrality_scores;
    expect(scores).toBeDefined();
    expect(scores?.degree).toBeDefined();
    expect(scores?.betweenness).toBeDefined();
    expect(scores?.closeness).toBeDefined();
    expect(scores?.eigenvector).toBeDefined();

    const degreeCentrality = scores!.degree;
    expect(Object.keys(degreeCentrality).length).toBeGreaterThan(0);
    expect(degreeCentrality['Alice']).toBeGreaterThan(0);
  });

  it('exports handover network to CSV format (raw text, wrapped as payload.raw)', async () => {
    const result = await runCli(['lab', 'social', xesFile, '--metric', 'handover', '--export', 'csv', '--no-save']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout) as SocialResult;
    // `--export` bypasses the CommandResult envelope entirely in the legacy
    // command and writes raw text to stdout; the bridge preserves that as
    // `payload.raw` per the always-JSON-on-stdout contract (nouns/_bridge.ts).
    expect(typeof output.raw).toBe('string');
    const lines = output.raw!.trim().split('\n');
    expect(lines[0]).toBe('from,to,weight');
    expect(lines.length).toBeGreaterThan(1);

    const [from, to, weight] = lines[1]!.split(',');
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(Number(weight)).toBeGreaterThan(0);
  });

  // NOTE: the original scenario used `--min-interactions`. In the current
  // commands/social.ts, `--min-interactions` is parsed and echoed into the
  // payload but no longer filters `network.edges` — the actual edge-weight
  // filter is `--min-weight` (verified live: `--min-interactions 2` alone
  // left a weight-1 edge in the result). Migrated to the real filter flag
  // so this test still exercises live filtering behavior rather than a
  // vestigial no-op flag.
  it('filters by minimum edge weight (--min-weight)', async () => {
    const allResult = await runCli(['lab', 'social', xesFile, '--metric', 'handover', '--no-save']);
    expect(allResult.exitCode).toBe(EXIT_CODES.success);
    const allOutput = JSON.parse(allResult.stdout) as SocialResult;
    const allEdgeCount = allOutput.payload.network!.edges.length;

    const filteredResult = await runCli([
      'lab', 'social', xesFile, '--metric', 'handover', '--min-weight', '2', '--no-save',
    ]);
    expect(filteredResult.exitCode).toBe(EXIT_CODES.success);
    const filteredOutput = JSON.parse(filteredResult.stdout) as SocialResult;
    const filteredEdgeCount = filteredOutput.payload.network!.edges.length;

    expect(filteredEdgeCount).toBeLessThanOrEqual(allEdgeCount);
    for (const edge of filteredOutput.payload.network!.edges) {
      expect(edge.weight).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects invalid metric', async () => {
    const result = await runCli(['lab', 'social', xesFile, '--metric', 'invalid-metric', '--no-save']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as ErrorEnvelope;
    expect(parsed.error?.message).toContain('Invalid metric');
  });

  // `--metric clustering` and `--metric community` (this file's original
  // "computes clustering coefficient" / "detects communities" scenarios)
  // are no longer reachable: commands/social.ts's `metric` validation now
  // only accepts handover|working-together|similar-task. There is no
  // replacement surface for clustering-coefficient or community-detection
  // output. This asserts the removal is actually enforced (fail-closed),
  // rather than silently dropping the coverage.
  it.each(['clustering', 'community'])('rejects removed metric "%s"', async (metric) => {
    const result = await runCli(['lab', 'social', xesFile, '--metric', metric, '--no-save']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as ErrorEnvelope;
    expect(parsed.error?.message).toContain('Invalid metric');
  });

  // GraphML export (this file's original "exports to GraphML format" scenario)
  // is no longer a valid `--export` value: commands/social.ts only accepts
  // dot|csv|json. graphml is now the canonical "invalid format" example
  // (see social-network-analysis.test.ts SNA-15). Assert the rejection.
  it('rejects removed GraphML export format', async () => {
    const result = await runCli(['lab', 'social', xesFile, '--metric', 'handover', '--export', 'graphml', '--no-save']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as ErrorEnvelope;
    expect(parsed.error?.message).toContain('Invalid --export format');
  });

  // The old "rejects invalid format" (--format xml) and "rejects invalid
  // centrality-type" scenarios are gone for different reasons:
  //  - `--format` is now unconditionally overridden by the bridge to
  //    `json` (nouns/_bridge.ts stripLegacyOutputFlags + forced
  //    `--format json`), so no caller-supplied format value — valid or
  //    not — ever reaches commands/social.ts's own format handling.
  //  - `--centrality-type` is vestigial: its description says "when
  //    metric=centrality", but metric=centrality is itself rejected (see
  //    above), so the flag is accepted but never validated or acted on.
  // Neither has an observable rejection behavior left to assert.
});
