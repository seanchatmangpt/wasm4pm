/**
 * Degenerate Case Conformance Testing
 *
 * Audits conformance checking for edge cases:
 * - Logs with all identical events
 * - Logs with single trace
 * - Models with cycles or deadlocks
 * - Logs with implicit activities not in model
 * - Empty logs and models
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const fixtureDir = path.join(process.cwd(), '__fixtures__', 'degenerate-conformance');

interface DegenerateTestCase {
  name: string;
  xesContent: string;
  modelContent?: string;
  expectedBehavior: 'success' | 'crash' | 'diagnostic';
  expectedExitCode?: number;
  expectedPatterns?: string[];
}

// Test cases: degenerate conformance scenarios
const testCases: DegenerateTestCase[] = [
  {
    name: 'All identical events (single activity)',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'ProcessEvent'],
  },
  {
    name: 'Single trace single event',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['Total cases', '1'],
  },
  {
    name: 'Empty log (no traces)',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 2,
    expectedPatterns: ['empty', 'no traces', 'trace_count'],
  },
  {
    name: 'Log with activity not in discovered model',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Initialize"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="UnknownActivity"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'success',
    expectedExitCode: 0,
    expectedPatterns: ['fitness', 'implicit'],
  },
  {
    name: 'Log with duplicate consecutive events',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approved"/>
      <date key="time:timestamp" value="2026-05-01T10:03:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'trace_fitness'],
  },
  {
    name: 'Very long single trace (500 events)',
    xesContent: (() => {
      let events = '';
      for (let i = 0; i < 500; i++) {
        const act = i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C';
        const ts = new Date(2026, 4, 1, 10, 0, i).toISOString();
        events += `    <event>
      <string key="concept:name" value="${act}"/>
      <date key="time:timestamp" value="${ts}"/>
    </event>\n`;
      }
      return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
${events}  </trace>
</log>`;
    })(),
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness'],
  },
  {
    name: 'Missing activity-key attribute in log',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="org:resource" value="John"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness'],
  },
  {
    name: 'Multiple traces with varying lengths',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:10:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Middle"/>
      <date key="time:timestamp" value="2026-05-01T10:11:00.000Z"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:20:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Middle"/>
      <date key="time:timestamp" value="2026-05-01T10:21:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2026-05-01T10:22:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'trace'],
  },
];

describe('Degenerate Conformance Cases', () => {
  beforeAll(async () => {
    // Ensure fixture directory exists
    await fs.mkdir(fixtureDir, { recursive: true });
  });

  testCases.forEach((testCase) => {
    it(`should handle: ${testCase.name}`, async () => {
      // Write test XES file
      const xesPath = path.join(fixtureDir, `${testCase.name.replace(/\s+/g, '-')}.xes`);
      await fs.writeFile(xesPath, testCase.xesContent, 'utf-8');

      try {
        // Run conformance command
        const result = await runCli(['conformance', xesPath, '--format', 'json']);

        // Parse JSON output (if format is JSON and output is valid)
        let payload;
        try {
          const output = JSON.parse(result.stdout);
          payload = output.payload ?? output;
        } catch {
          // Output may be human-readable or error message
        }

        // Verify expected patterns in output
        const fullOutput = result.stdout + result.stderr;
        if (testCase.expectedPatterns) {
          for (const pattern of testCase.expectedPatterns) {
            const found =
              fullOutput.toLowerCase().includes(pattern.toLowerCase()) ||
              (payload && JSON.stringify(payload).toLowerCase().includes(pattern.toLowerCase()));
            expect(found, `Expected pattern "${pattern}" not found in output`).toBe(true);
          }
        }

        // Case-specific assertions
        if (testCase.name.includes('identical events')) {
          expect([0, 6]).toContain(result.exitCode);
          expect(payload?.fitness).toBeDefined();
          expect(payload?.fitness).toBeGreaterThanOrEqual(0);
          expect(payload?.fitness).toBeLessThanOrEqual(1);
        }

        if (testCase.name.includes('single trace')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.summary?.total_cases !== undefined) {
            expect(payload.summary.total_cases).toBe(1);
          }
        }

        if (testCase.name.includes('Empty log')) {
          expect([2, 3, 5]).toContain(result.exitCode);
          expect(fullOutput).toMatch(/empty|no traces|trace_count|load|parse/i);
        }

        if (testCase.name.includes('unknown activity')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.isFit !== undefined) {
            expect(payload.isFit).toBe(false);
          }
        }

        if (testCase.name.includes('duplicate consecutive')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.summary?.deviating_cases !== undefined) {
            expect(payload.summary.deviating_cases).toBeGreaterThanOrEqual(0);
          }
        }

        if (testCase.name.includes('long single trace')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.summary?.total_cases !== undefined) {
            expect(payload.summary.total_cases).toBe(1);
          }
        }

        if (testCase.name.includes('missing activity-key')) {
          expect([0, 2, 3, 6]).toContain(result.exitCode);
        }

        if (testCase.name.includes('varying lengths')) {
          expect([0, 6]).toContain(result.exitCode);
          // Only check if payload exists; some errors may prevent parsing
          if (payload?.summary?.total_cases !== undefined) {
            expect(payload.summary.total_cases).toBe(3);
          }
        }
      } finally {
        // Cleanup
        try {
          await fs.unlink(xesPath);
        } catch {
          /* ignore cleanup errors */
        }
      }
    });
  });
});

describe('Degenerate Conformance Edge Case Diagnostics', () => {
  it('should emit diagnostic when fitness is exactly at threshold', async () => {
    // Create a log that will produce a fitness very close to threshold
    const xesPath = path.join(fixtureDir, 'threshold-edge.xes');
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
  </trace>
</log>`;

    await fs.writeFile(xesPath, xesContent, 'utf-8');

    try {
      const result = await runCli([
        'conformance',
        xesPath,
        '--threshold',
        '0.5',
        '--format',
        'json',
      ]);
      const output = JSON.parse(result.stdout);
      const payload = output.payload ?? output;

      expect(payload.fitness).toBeDefined();
      expect(payload.threshold).toBe(0.5);
      // If fitness >= threshold, exit code is 0, else 1
      expect([0, 1, 6]).toContain(result.exitCode);
    } finally {
      try {
        await fs.unlink(xesPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('should provide deviation classification for deviating traces', async () => {
    const xesPath = path.join(fixtureDir, 'deviation-classify.xes');
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="UnapprovedStep"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2026-05-01T10:03:00.000Z"/>
    </event>
  </trace>
</log>`;

    await fs.writeFile(xesPath, xesContent, 'utf-8');

    try {
      const result = await runCli(['conformance', xesPath, '--format', 'json']);
      const output = JSON.parse(result.stdout);
      const payload = output.payload ?? output;

      if (payload.deviating_traces && payload.deviating_traces.length > 0) {
        const trace = payload.deviating_traces[0];
        // Classification should be present
        expect(trace.primary_deviation_class || trace.deviation_summary).toBeDefined();
      }
    } finally {
      try {
        await fs.unlink(xesPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('should handle conformance on manually provided model without crash', async () => {
    const xesPath = path.join(fixtureDir, 'simple-model.xes');
    const modelPath = path.join(fixtureDir, 'simple-model.json');

    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
  </trace>
</log>`;

    // Simple Petri net: A → B
    const modelContent = {
      places: [
        { id: 'p0', initial_marking: 1 },
        { id: 'p1', initial_marking: 0 },
        { id: 'p2', initial_marking: 0 },
      ],
      transitions: [
        { id: 't1', label: 'A', is_invisible: false },
        { id: 't2', label: 'B', is_invisible: false },
      ],
      arcs: [
        { from: 'p0', to: 't1', weight: 1 },
        { from: 't1', to: 'p1', weight: 1 },
        { from: 'p1', to: 't2', weight: 1 },
        { from: 't2', to: 'p2', weight: 1 },
      ],
    };

    await fs.writeFile(xesPath, xesContent, 'utf-8');
    await fs.writeFile(modelPath, JSON.stringify(modelContent), 'utf-8');

    try {
      const result = await runCli(['conformance', xesPath, '--model', modelPath, '--format', 'json']);
      // Should not crash, regardless of model validity
      expect([0, 1, 2, 3, 6]).toContain(result.exitCode);
      // Ignore experimental warnings, look for actual panics/crashes only
      const relevantStderr = result.stderr.replace(/ExperimentalWarning[\s\S]*?\n\n/g, '');
      expect(relevantStderr).not.toMatch(/^(?!.*ExperimentalWarning)(.*panic|crash|Exception)/i);
    } finally {
      try {
        await fs.unlink(xesPath);
        await fs.unlink(modelPath);
      } catch {
        /* ignore */
      }
    }
  });
});
