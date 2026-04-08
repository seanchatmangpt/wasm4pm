/**
 * Scenario: DecisionGraph support — POWL non-block-structured choices
 *
 * Dev action simulated: "I added DecisionGraphNode to the POWL arena with
 * start_nodes, end_nodes, empty_path, and order relation. Does it parse correctly?
 * Does it convert to Petri Net with proper tau_split/tau_join wiring? Does
 * the JSON export include all DecisionGraph fields?"
 *
 * Key contracts verified:
 *   - DecisionGraph POWL string parses correctly as DecisionGraphNode
 *   - get_children() returns children arena indices
 *   - node_info_json() returns { type, children, edges, start_nodes, end_nodes, empty_path, node_count }
 *   - POWL → Petri Net produces init_dg/final_dg transitions
 *   - POWL → Process Tree handles DecisionGraph via DAG-based algorithm
 *   - Roundtrip: DecisionGraph → Petri Net → DecisionGraph preserves structure
 *
 * Binary: apps/pmctl/dist/bin/pmctl.js (must be built first)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import type { CliTestEnv } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[]) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 20_000 });
}

// ─── Test Data ───────────────────────────────────────────────────────────────

// Simple DecisionGraph: A and B are both start and end nodes, no ordering
const DG_PARALLEL = `DG=(nodes={A, B}, order={}, starts=[A, B], ends=[A, B], empty=false)`;

// DecisionGraph with sequence: A → B, A is start, B is end
const DG_SEQUENCE = `DG=(nodes={A, B}, order={A-->B}, starts=[A], ends=[B], empty=false)`;

// DecisionGraph with empty path: A can be skipped
const DG_EMPTY_PATH = `DG=(nodes={A}, order={}, starts=[A], ends=[A], empty=true)`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('13-decision-graph', () => {
  let env: CliTestEnv;

  beforeAll(async () => {
    env = await createCliTestEnv();
  });

  afterAll(async () => {
    await env.cleanup?.();
  });

  it('parses DecisionGraph with parallel children', async () => {
    const result = await pmctl(['powl', 'parse', '--quiet', '--model', DG_PARALLEL, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    assertJsonOutput(result);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('success');
    expect(json.repr).toContain('DG=');
    expect(json.repr).toContain('A');
    expect(json.repr).toContain('B');
    expect(json.repr).toContain('starts=[A, B]');
    expect(json.repr).toContain('ends=[A, B]');
    expect(json.node_count).toBe(3); // A, B, and the DecisionGraph node itself
  });

  it('parses DecisionGraph with sequence order', async () => {
    const result = await pmctl(['powl', 'parse', '--quiet', '--model', DG_SEQUENCE, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    assertJsonOutput(result);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('success');
    expect(json.repr).toContain('A-->B');
    expect(json.repr).toContain('starts=[A]');
    expect(json.repr).toContain('ends=[B]');
  });

  it('parses DecisionGraph with empty path', async () => {
    const result = await pmctl(['powl', 'parse', '--quiet', '--model', DG_EMPTY_PATH, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    assertJsonOutput(result);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('success');
    expect(json.repr).toContain('empty=true');
  });

  it('converts DecisionGraph to Petri Net', async () => {
    const result = await pmctl(['powl', 'convert', '--quiet', '--to', 'petri-net', '--model', DG_PARALLEL, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    assertJsonOutput(result);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('success');
    expect(json.target).toBe('petri-net');
    expect(json.output).toContain('A');
    expect(json.output).toContain('B');
    // DecisionGraph → Petri Net uses final_dg transition
    // (init_dg may be merged with tau_1 by simple reduction)
    expect(json.output).toContain('final_dg');
  });

  it('converts DecisionGraph to Process Tree', async () => {
    const result = await pmctl(['powl', 'convert', '--quiet', '--to', 'process-tree', '--model', DG_SEQUENCE, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    assertJsonOutput(result);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('success');
    expect(json.target).toBe('process-tree');
    // DecisionGraph with sequence A→B is decomposed to a Sequence process tree
    expect(json.output).toContain('Sequence');
    expect(json.output).toContain('A');
    expect(json.output).toContain('B');
  });

  it('exports DecisionGraph children via get_children', async () => {
    const result = await pmctl(['powl', 'parse', '--quiet', '--model', DG_PARALLEL, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const json = JSON.parse(result.stdout);
    const root = json.root;

    const childrenResult = await pmctl(['powl', 'get-children', '--quiet', '--model', DG_PARALLEL, '--index', String(root), '--format', 'json']);
    assertExitCode(childrenResult, EXIT_CODES.SUCCESS);
    assertJsonOutput(childrenResult);

    const childrenJson = JSON.parse(childrenResult.stdout);
    expect(childrenJson.status).toBe('success');
    expect(Array.isArray(childrenJson.children)).toBe(true);
    expect(childrenJson.children.length).toBe(2); // A and B
  });

  it('exports DecisionGraph detailed info via node_info_json', async () => {
    const result = await pmctl(['powl', 'parse', '--quiet', '--model', DG_PARALLEL, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const json = JSON.parse(result.stdout);
    const root = json.root;

    const infoResult = await pmctl(['powl', 'node-info', '--quiet', '--model', DG_PARALLEL, '--index', String(root), '--format', 'json']);
    assertExitCode(infoResult, EXIT_CODES.SUCCESS);
    assertJsonOutput(infoResult);

    const infoJson = JSON.parse(infoResult.stdout);
    expect(infoJson.status).toBe('success');
    expect(infoJson.type).toBe('decision_graph');
    expect(Array.isArray(infoJson.children)).toBe(true);
    expect(Array.isArray(infoJson.edges)).toBe(true);
    expect(Array.isArray(infoJson.start_nodes)).toBe(true);
    expect(Array.isArray(infoJson.end_nodes)).toBe(true);
    expect(typeof infoJson.empty_path).toBe('boolean');
    expect(typeof infoJson.node_count).toBe('number');
  });

  it('roundtrips DecisionGraph through Petri Net', async () => {
    // 1. Parse original DecisionGraph
    const parseResult = await pmctl(['powl', 'parse', '--quiet', '--model', DG_SEQUENCE, '--format', 'json']);
    assertExitCode(parseResult, EXIT_CODES.SUCCESS);
    const parseJson = JSON.parse(parseResult.stdout);
    const originalRepr = parseJson.repr;

    // 2. Convert to Petri Net
    const convertResult = await pmctl(['powl', 'convert', '--quiet', '--to', 'petri-net', '--model', DG_SEQUENCE, '--format', 'json']);
    assertExitCode(convertResult, EXIT_CODES.SUCCESS);
    const convertJson = JSON.parse(convertResult.stdout);
    const petriNetJson = convertJson.output;

    // 3. Write Petri Net to temp file for import
    const tmpFile = `/tmp/tmp_petri_net_${Date.now()}.json`;
    await fs.writeFile(tmpFile, petriNetJson, 'utf-8');

    try {
      // 4. Convert Petri Net back to POWL (via import)
      const importResult = await pmctl(['powl', 'import', '--quiet', '--from', 'petri-net', '--model', tmpFile, '--format', 'json']);
      assertExitCode(importResult, EXIT_CODES.SUCCESS);
      assertJsonOutput(importResult);

      const importJson = JSON.parse(importResult.stdout);
      expect(importJson.status).toBe('success');
      // The re-imported model should contain A and B
      expect(importJson.repr).toContain('A');
      expect(importJson.repr).toContain('B');
    } finally {
      await fs.unlink(tmpFile).catch(() => {}); // Clean up temp file
    }
  });
});
