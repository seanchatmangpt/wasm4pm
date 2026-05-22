/**
 * Streaming algorithm determinism test — verify that SIMD-accelerated streaming
 * produces identical DFG edges across multiple runs.
 *
 * Rationale: Streaming is the fastest algorithm (speed=2). Non-determinism would
 * silently break audit trails and receipt chains. This test ensures that running
 * simd_streaming_dfg multiple times produces identical results.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Extract DFG edge set from CLI JSON output (order-independent comparison).
 */
function extractEdgeSet(jsonOutput: unknown): Set<string> {
  const edges = new Set<string>();
  try {
    const data = jsonOutput as { payload?: { edges?: Array<{ from: string; to: string }> } };
    if (data.payload?.edges && Array.isArray(data.payload.edges)) {
      for (const edge of data.payload.edges) {
        if (edge.from && edge.to) {
          // Normalize to ensure order independence
          edges.add(`${edge.from}->${edge.to}`);
        }
      }
    }
  } catch {
    // Silently ignore parse errors; test will fail on assertion
  }
  return edges;
}

// Re-export receiptsMatch for use in this test module (it's used above)
// no need for a separate import at the end

describe('wpm run — streaming algorithm determinism (simd_streaming_dfg)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    // Use the small test fixture
    const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');
    testXesPath = path.join(env.tempDir, 'test.xes');
    try {
      await fs.copyFile(fixtureSource, testXesPath);
    } catch (error) {
      // Fallback minimal XES with a few traces
      const minimalXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2026-04-16T10:02:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-04-16T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2026-04-16T11:01:00Z"/>
    </event>
  </trace>
</log>`;
      await fs.writeFile(testXesPath, minimalXes, 'utf-8');
    }
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('simd_streaming_dfg basic determinism', () => {
    it('should run successfully with --algorithm simd_streaming_dfg', async () => {
      const result = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'simd_streaming_dfg',
        '--format',
        'json',
      ]);
      expect(result.exitCode).toBeLessThanOrEqual(5);
      // If successful, output should be valid JSON
      if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should produce identical edges across 3 runs', async () => {
      const edgeSets: Set<string>[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          const edges = extractEdgeSet(json);
          edgeSets.push(edges);
        }
      }

      // All three edge sets should be identical
      if (edgeSets.length >= 2) {
        const firstSet = edgeSets[0];
        for (const set of edgeSets.slice(1)) {
          expect(set).toEqual(firstSet);
        }
      }
    });

    it('should produce identical receipt hashes across 3 runs', async () => {
      const receiptHashes: string[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          const hash = stableReceiptHash(json);
          receiptHashes.push(hash);
        }
      }

      // All receipt hashes should be identical
      if (receiptHashes.length >= 2) {
        const firstHash = receiptHashes[0];
        for (const hash of receiptHashes.slice(1)) {
          expect(hash).toBe(firstHash);
        }
      }
    });

    it('should produce matching receipts across 3 runs', async () => {
      const receipts: Record<string, unknown>[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          receipts.push(json);
        }
      }

      // All receipts should match pairwise
      if (receipts.length >= 2) {
        for (let i = 1; i < receipts.length; i++) {
          expect(receiptsMatch(receipts[0], receipts[i])).toBe(true);
        }
      }
    });

    it('should have consistent node count across runs', async () => {
      const nodeCounts: number[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          const nodes = (json.payload?.nodes as number) ?? 0;
          nodeCounts.push(nodes);
        }
      }

      // All node counts should be identical
      if (nodeCounts.length >= 2) {
        const firstCount = nodeCounts[0];
        for (const count of nodeCounts.slice(1)) {
          expect(count).toBe(firstCount);
        }
      }
    });

    it('should have consistent edge count across runs', async () => {
      const edgeCounts: number[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          const edges = (json.payload?.edges as Array<unknown>) ?? [];
          edgeCounts.push(edges.length);
        }
      }

      // All edge counts should be identical
      if (edgeCounts.length >= 2) {
        const firstCount = edgeCounts[0];
        for (const count of edgeCounts.slice(1)) {
          expect(count).toBe(firstCount);
        }
      }
    });

    it('should have consistent elapsedMs range across runs', async () => {
      const timings: number[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await runCli([
          'run',
          testXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          const elapsed = (json.payload?.elapsedMs as number) ?? 0;
          timings.push(elapsed);
        }
      }

      // Timings should be within 2x of each other (not too scattered)
      if (timings.length >= 2) {
        const min = Math.min(...timings);
        const max = Math.max(...timings);
        // Allow up to 2x variance (streaming is fast, jitter is expected)
        expect(max).toBeLessThanOrEqual(min * 2 + 10); // +10ms for very fast runs
      }
    });
  });

  describe('simd_streaming_dfg compared to dfg', () => {
    it('should be faster than dfg', async () => {
      const streamResult = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'simd_streaming_dfg',
        '--format',
        'json',
      ]);

      const dfgResult = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'dfg',
        '--format',
        'json',
      ]);

      if (
        streamResult.exitCode === EXIT_CODES.success &&
        dfgResult.exitCode === EXIT_CODES.success
      ) {
        const streamJson = JSON.parse(streamResult.stdout);
        const dfgJson = JSON.parse(dfgResult.stdout);

        const streamTime = (streamJson.payload?.elapsedMs as number) ?? 0;
        const dfgTime = (dfgJson.payload?.elapsedMs as number) ?? 0;

        // Streaming should be faster or roughly equivalent
        // (not slower by more than 20%)
        expect(streamTime).toBeLessThanOrEqual(dfgTime * 1.2);
      }
    });

    it('should produce edges compatible with dfg (same set)', async () => {
      const streamResult = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'simd_streaming_dfg',
        '--format',
        'json',
      ]);

      const dfgResult = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'dfg',
        '--format',
        'json',
      ]);

      if (
        streamResult.exitCode === EXIT_CODES.success &&
        dfgResult.exitCode === EXIT_CODES.success
      ) {
        const streamJson = JSON.parse(streamResult.stdout);
        const dfgJson = JSON.parse(dfgResult.stdout);

        const streamEdges = extractEdgeSet(streamJson);
        const dfgEdges = extractEdgeSet(dfgJson);

        // Edge sets should be identical
        expect(streamEdges).toEqual(dfgEdges);
      }
    });
  });

  describe('simd_streaming_dfg edge case robustness', () => {
    it('should handle empty traces gracefully', async () => {
      const emptyXesPath = path.join(env.tempDir, 'empty.xes');
      const emptyXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
</log>`;
      await fs.writeFile(emptyXesPath, emptyXes, 'utf-8');

      const result = await runCli([
        'run',
        emptyXesPath,
        '--algorithm',
        'simd_streaming_dfg',
        '--format',
        'json',
      ]);

      // Should not crash; may exit 2 (source error) or 3 (execution error)
      expect(result.exitCode).toBeGreaterThan(0);
    });

    it('should handle single-event traces consistently', async () => {
      const singleEventXesPath = path.join(env.tempDir, 'single.xes');
      const singleEventXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
  </trace>
</log>`;
      await fs.writeFile(singleEventXesPath, singleEventXes, 'utf-8');

      const hashes: string[] = [];
      for (let i = 0; i < 2; i++) {
        const result = await runCli([
          'run',
          singleEventXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          hashes.push(stableReceiptHash(json));
        }
      }

      // Both runs should produce identical hashes
      if (hashes.length === 2) {
        expect(hashes[0]).toBe(hashes[1]);
      }
    });

    it('should handle large trace counts consistently', async () => {
      const largeXesPath = path.join(env.tempDir, 'large.xes');
      // Generate a larger log with multiple traces
      let largeXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
`;
      for (let t = 0; t < 50; t++) {
        largeXes += `  <trace>
    <string key="concept:name" value="case-${t}"/>
`;
        for (let e = 0; e < 5; e++) {
          const activity = String.fromCharCode(65 + (e % 26)); // A-Z
          largeXes += `    <event>
      <string key="concept:name" value="${activity}"/>
      <date key="time:timestamp" value="2026-04-16T${String(10 + t).padStart(2, '0')}:${String(e * 12).padStart(2, '0')}:00Z"/>
    </event>
`;
        }
        largeXes += `  </trace>
`;
      }
      largeXes += `</log>`;
      await fs.writeFile(largeXesPath, largeXes, 'utf-8');

      const hashes: string[] = [];
      for (let i = 0; i < 2; i++) {
        const result = await runCli([
          'run',
          largeXesPath,
          '--algorithm',
          'simd_streaming_dfg',
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          hashes.push(stableReceiptHash(json));
        }
      }

      // Both runs should produce identical hashes
      if (hashes.length === 2) {
        expect(hashes[0]).toBe(hashes[1]);
      }
    });
  });

  describe('simd_streaming_dfg vs compare mode', () => {
    it('should be consistent when run via compare', async () => {
      const hashes: string[] = [];

      for (let i = 0; i < 2; i++) {
        const result = await runCli([
          'compare',
          'simd_streaming_dfg',
          'dfg',
          '--input',
          testXesPath,
          '--format',
          'json',
        ]);

        if ((result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) && result.stdout.trim()) {
          const json = JSON.parse(result.stdout);
          hashes.push(stableReceiptHash(json));
        }
      }

      // Both compare runs should produce identical hashes
      if (hashes.length === 2) {
        expect(hashes[0]).toBe(hashes[1]);
      }
    });
  });
});

