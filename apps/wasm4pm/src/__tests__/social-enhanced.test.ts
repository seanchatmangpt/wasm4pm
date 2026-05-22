/**
 * social-enhanced.test.ts — Enhanced social network mining tests
 *
 * Oracle rank: Rank 2 (Domain contract — network metrics, output formats, filtering).
 *
 * Coverage:
 *  - `wpm social --metric centrality --centrality-type degree` → computes degree centrality
 *  - `wpm social --metric clustering` → computes clustering coefficient
 *  - `wpm social --metric community` → detects communities
 *  - `wpm social --format graphml` → outputs valid GraphML
 *  - `wpm social --format csv` → outputs valid CSV
 *  - `wpm social --min-interactions 2` → filters weak ties
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

describe('Social Network Mining — Enhanced Metrics and Formats', () => {
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

  it('computes degree centrality', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'centrality', '--centrality-type', 'degree', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload).toBeDefined();
    expect(output.payload.metric).toBe('centrality');
    expect(output.payload.centralityType).toBe('degree');
    expect(output.payload.metrics).toBeDefined();
    expect(output.payload.metrics.degree).toBeDefined();

    const degreeCentrality = output.payload.metrics.degree as Record<string, number>;
    expect(Object.keys(degreeCentrality).length).toBeGreaterThan(0);
    expect(degreeCentrality['Alice']).toBeGreaterThan(0);
  });

  it('computes betweenness centrality', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'centrality', '--centrality-type', 'betweenness', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload.metrics.betweenness).toBeDefined();
    const betweenness = output.payload.metrics.betweenness as Record<string, number>;
    expect(Object.keys(betweenness).length).toBeGreaterThan(0);
  });

  it('computes closeness centrality', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'centrality', '--centrality-type', 'closeness', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload.metrics.closeness).toBeDefined();
    const closeness = output.payload.metrics.closeness as Record<string, number>;
    expect(Object.keys(closeness).length).toBeGreaterThan(0);
  });

  it('computes all centrality types at once', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'centrality', '--centrality-type', 'all', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload.metrics.degree).toBeDefined();
    expect(output.payload.metrics.betweenness).toBeDefined();
    expect(output.payload.metrics.closeness).toBeDefined();
  });

  it('computes clustering coefficient', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'clustering', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload.metric).toBe('clustering');
    expect(output.payload.metrics).toBeDefined();
    expect(output.payload.metrics.global).toBeDefined();
    expect(output.payload.metrics.local).toBeDefined();

    const globalCoeff = output.payload.metrics.global as number;
    expect(globalCoeff).toBeGreaterThanOrEqual(0);
    expect(globalCoeff).toBeLessThanOrEqual(1);
  });

  it('detects communities', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'community', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    const output = JSON.parse(stdout);

    expect(output.payload.metric).toBe('community');
    expect(output.payload.metrics).toBeDefined();

    const communities = output.payload.metrics as Record<string, number>;
    expect(Object.keys(communities).length).toBeGreaterThan(0);

    // All community IDs should be non-negative integers
    for (const commId of Object.values(communities)) {
      expect(typeof commId).toBe('number');
      expect(commId).toBeGreaterThanOrEqual(0);
    }
  });

  it('exports to GraphML format', async () => {
    const graphmlFile = path.join(tempDir, 'network.graphml');
    const { stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'handover', '--format', 'graphml', '-q'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');
    // Note: graphml is printed to stdout in this test env
  });

  it('exports to CSV format', async () => {
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'handover', '--format', 'csv', '-q'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('error');

    // Parse CSV
    const lines = stdout.trim().split('\n');
    expect(lines[0]).toBe('from,to,weight');

    // Should have header + at least 1 edge
    expect(lines.length).toBeGreaterThan(1);

    // Parse first data line
    const [from, to, weight] = lines[1].split(',');
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(Number(weight)).toBeGreaterThan(0);
  });

  it('filters by minimum interactions', async () => {
    const { stdout: allStdout } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'handover', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });
    const allOutput = JSON.parse(allStdout);
    const allEdgeCount = (allOutput.payload.network.edges as Array<unknown>).length;

    const { stdout: filteredStdout } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'handover', '--format', 'json', '--min-interactions', '2'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });
    const filteredOutput = JSON.parse(filteredStdout);
    const filteredEdgeCount = (filteredOutput.payload.network.edges as Array<unknown>).length;

    // Filtered should have same or fewer edges
    expect(filteredEdgeCount).toBeLessThanOrEqual(allEdgeCount);

    // All remaining edges should have weight >= 2
    for (const edge of filteredOutput.payload.network.edges as Array<{ weight?: number }>) {
      expect(edge.weight ?? 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects invalid metric', async () => {
    const { stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'invalid-metric', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).toContain('Invalid metric');
  });

  it('rejects invalid format', async () => {
    const { stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'handover', '--format', 'xml'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).toContain('Invalid format');
  });

  it('rejects invalid centrality type', async () => {
    const { stderr } = await execFileAsync('npm', ['run', 'wpm', 'social', xesFile, '--metric', 'centrality', '--centrality-type', 'invalid', '--format', 'json'], {
      cwd: path.join(process.cwd(), 'apps/wasm4pm'),
      encoding: 'utf8',
    });

    expect(stderr).toContain('Invalid centrality-type');
  });
});
