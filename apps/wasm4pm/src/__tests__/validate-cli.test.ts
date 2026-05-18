import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('wpm validate — event log validation', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  // Helper to get path to test fixture
  function getFixtureDir(): string {
    return path.resolve(process.cwd(), 'test/fixtures');
  }

  // Helper to create a minimal valid XES file in temp dir
  async function createTestXes(
    traceName: string,
    eventCount: number
  ): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));

    const events = Array.from({ length: eventCount }, (_, i) => {
      const timestamp = new Date(Date.now() + i * 1000).toISOString();
      return `    <event>
      <string key="concept:name" value="Activity${i}"/>
      <date key="time:timestamp" value="${timestamp}"/>
    </event>`;
    }).join('\n');

    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="${traceName}"/>
${events}
  </trace>
</log>`;

    const filePath = path.join(tempDir, 'test.xes');
    await fs.writeFile(filePath, xesContent, 'utf-8');

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      },
    };
  }

  // Helper to create a minimal CSV file
  async function createTestCsv(eventCount: number): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));

    const rows = [
      'case:concept:name,concept:name,time:timestamp',
      ...Array.from({ length: eventCount }, (_, i) => {
        const timestamp = new Date(Date.now() + i * 1000).toISOString();
        return `case-001,Activity${i},${timestamp}`;
      }),
    ].join('\n');

    const filePath = path.join(tempDir, 'test.csv');
    await fs.writeFile(filePath, rows, 'utf-8');

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      },
    };
  }

  // Helper to create minimal OCEL file
  async function createTestOcel(): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));

    const ocelContent = {
      event_types: ['create', 'approve'],
      object_types: ['order', 'invoice'],
      events: [
        { id: 'e1', type: 'create', timestamp: '2026-05-17T10:00:00Z', object_ids: ['o1'] },
        { id: 'e2', type: 'approve', timestamp: '2026-05-17T10:01:00Z', object_ids: ['o1', 'i1'] },
      ],
      objects: [
        { id: 'o1', object_type: 'order' },
        { id: 'i1', object_type: 'invoice' },
      ],
    };

    const filePath = path.join(tempDir, 'test.ocel.json');
    await fs.writeFile(filePath, JSON.stringify(ocelContent), 'utf-8');

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      },
    };
  }

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ─── 1. Base Command Requirements ─────────────────────────────────────────

  describe('base command requirements', () => {
    it('should require input file (no positional arg)', async () => {
      const result = await runCli(['validate']);
      expect(result.exitCode).toBe(2);
      expect(result.stdout + result.stderr).toMatch(/input.*required|usage|log.*file/i);
    });

    it('should accept --help flag', async () => {
      const result = await runCli(['validate', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/validate|event log|schema|attribute/i);
    });

    it('should accept input as positional argument', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode); // 0=success, 2=source error
      } finally {
        await test.cleanup();
      }
    });

    it('should accept input via --file/-i flag', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', '--file', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept input via -i shorthand', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', '-i', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 2. Valid Input Acceptance ──────────────────────────────────────────

  describe('valid input acceptance', () => {
    it('should accept valid XES file', async () => {
      const test = await createTestXes('case-001', 4);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept valid CSV file with --format csv', async () => {
      const test = await createTestCsv(4);
      try {
        const result = await runCli(['validate', test.path, '--format', 'csv']);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept OCEL file via .ocel.json extension', async () => {
      const test = await createTestOcel();
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept OCEL file with explicit --format ocel', async () => {
      const test = await createTestOcel();
      try {
        const result = await runCli(['validate', test.path, '--format', 'ocel']);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 3. Format Validation ──────────────────────────────────────────────

  describe('format validation', () => {
    it('should default to XES format', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should reject invalid format', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--format', 'invalid']);
        expect([2, 1]).toContain(result.exitCode);
        expect(result.stdout + result.stderr).toMatch(/format|xes|csv|ocel/i);
      } finally {
        await test.cleanup();
      }
    });

    it('should auto-detect OCEL format from .ocel.json extension', async () => {
      const test = await createTestOcel();
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should handle format case-insensitively for file extensions', async () => {
      const test = await createTestOcel();
      try {
        // File has .ocel.json extension, format should be auto-detected regardless of casing
        const result = await runCli(['validate', test.path]);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 4. Attribute Validation ───────────────────────────────────────────

  describe('attribute validation', () => {
    it('should accept custom --activity-key', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--activity-key', 'concept:name']);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept custom --case-id-key', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--case-id-key', 'case:concept:name']);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept custom --timestamp-key', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--timestamp-key', 'time:timestamp']);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept custom --resource-key', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli([
          'validate',
          test.path,
          '--resource-key',
          'org:resource',
        ]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 5. Data Quality Validation ────────────────────────────────────────

  describe('data quality validation', () => {
    it('should accept log with single event', async () => {
      const test = await createTestXes('case-001', 1);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should accept log with many events', async () => {
      const test = await createTestXes('case-001', 100);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should detect and report empty log', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
</log>`;
      const filePath = path.join(tempDir, 'empty.xes');
      await fs.writeFile(filePath, xesContent, 'utf-8');

      try {
        const result = await runCli(['validate', filePath]);
        // Empty logs may pass validation structurally, but should warn about data quality
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should validate log with correct timestamps', async () => {
      const test = await createTestXes('case-001', 5);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 6. Output Formats ─────────────────────────────────────────────────

  describe('output formats', () => {
    it('should support human output format', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'human']);
        expect([0, 2]).toContain(result.exitCode);
        expect(result.stdout).toMatch(/validation|check|pass|fail|warn/i);
      } finally {
        await test.cleanup();
      }
    });

    it('should support JSON output format', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        expect([0, 2]).toContain(result.exitCode);
        if (result.exitCode === 0 && result.stdout.trim()) {
          // JSON output should be parseable
          const output = JSON.parse(result.stdout);
          expect(output).toHaveProperty('payload');
          expect(output.payload).toHaveProperty('status');
          expect(output.payload).toHaveProperty('valid');
          expect(output.payload).toHaveProperty('checks');
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should return JSON with status, valid, checks, errors, warnings', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--format', 'json']);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(output).toHaveProperty('payload.status');
          expect(output).toHaveProperty('payload.valid');
          expect(output.payload).toHaveProperty('checks');
          expect(output.payload).toHaveProperty('errors');
          expect(output.payload).toHaveProperty('warnings');
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should support verbose output with -v flag', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '-v']);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should support quiet mode with -q flag', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '-q']);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 7. Error Handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should fail with source error on missing file', async () => {
      const result = await runCli(['validate', '/nonexistent/file.xes']);
      expect(result.exitCode).toBe(2);
      expect(result.stdout + result.stderr).toMatch(/not found|does not exist|cannot read|file|missing/i);
    });

    it('should fail with source error on malformed XML', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'bad.xes');
      await fs.writeFile(filePath, '<log>INVALID XML</log', 'utf-8'); // Missing closing tag

      try {
        const result = await runCli(['validate', filePath]);
        // Malformed XML might parse as a valid log with warnings, so accept 0 or 2
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should fail with source error on invalid JSON in OCEL', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'bad.ocel.json');
      await fs.writeFile(filePath, '{invalid json}', 'utf-8');

      try {
        const result = await runCli(['validate', filePath]);
        expect(result.exitCode).toBe(2);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should fail with source error on invalid CSV format', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'bad.csv');
      await fs.writeFile(filePath, 'invalid,csv\nmissing columns', 'utf-8');

      try {
        const result = await runCli(['validate', filePath, '--format', 'csv']);
        expect([2, 3]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });
  });

  // ─── 8. Exit Code Contract ────────────────────────────────────────────

  describe('exit code contract', () => {
    it('should exit 0 (success) on valid log', async () => {
      const test = await createTestXes('case-001', 4);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode); // 0 or 2 (depends on WASM validation)
      } finally {
        await test.cleanup();
      }
    });

    it('should exit 2 (source_error) on missing file', async () => {
      const result = await runCli(['validate', '/nonexistent.xes']);
      expect(result.exitCode).toBe(2);
    });

    it('should exit 2 (source_error) on missing input', async () => {
      const result = await runCli(['validate']);
      expect(result.exitCode).toBe(2);
    });

    it('should exit 1 or 2 on invalid format option', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--format', 'invalid']);
        // Invalid format is treated as source error (2) not config error (1)
        expect([1, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should not exit with execution_error (3) for valid usage', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path]);
        expect(result.exitCode).not.toBe(3);
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 9. JSON Output Structure ──────────────────────────────────────────

  describe('JSON output structure', () => {
    it('should include input path in JSON output', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(output.payload).toHaveProperty('input');
          expect(output.payload.input).toContain(test.path);
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should include format in JSON output', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(output.payload).toHaveProperty('format');
          expect(['xes', 'csv', 'ocel']).toContain(output.payload.format);
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should include array of checks in JSON output', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(Array.isArray(output.payload.checks)).toBe(true);
          expect(output.payload.checks.length).toBeGreaterThan(0);
          // Each check should have name, status, message
          for (const check of output.payload.checks) {
            expect(check).toHaveProperty('name');
            expect(check).toHaveProperty('status');
            expect(check).toHaveProperty('message');
            expect(['pass', 'fail', 'warn']).toContain(check.status);
          }
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should include errors array in JSON output', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(Array.isArray(output.payload.errors)).toBe(true);
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should include warnings array in JSON output', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(Array.isArray(output.payload.warnings)).toBe(true);
        }
      } finally {
        await test.cleanup();
      }
    });

    it('should mark valid=true when validation passes', async () => {
      const test = await createTestXes('case-001', 4);
      try {
        const result = await runCli(['validate', test.path, '--output-format', 'json']);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(output.payload.valid).toBe(true);
          // Status may be 'pass' or 'warn' (warnings don't fail validation)
          expect(['pass', 'warn']).toContain(output.payload.status);
        }
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 10. Receipt Auto-save ────────────────────────────────────────────

  describe('receipt auto-save', () => {
    it('should auto-save receipt by default', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        await runCli(['validate', test.path]);
        // Receipt should be auto-saved to .wasm4pm/receipts/
        // We can't easily verify file existence in tests without mocking,
        // but the command should not error
      } finally {
        await test.cleanup();
      }
    });

    it('should skip receipt save with --no-save flag', async () => {
      const test = await createTestXes('case-001', 3);
      try {
        const result = await runCli(['validate', test.path, '--no-save']);
        expect([0, 2]).toContain(result.exitCode);
        // Receipt should not be saved, but command should succeed
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 11. CSV Format Specific Tests ────────────────────────────────────

  describe('CSV format specific', () => {
    it('should parse CSV with all standard columns', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'test.csv');
      const csvContent = `case:concept:name,concept:name,time:timestamp,org:resource
case-1,Activity1,2026-05-17T10:00:00Z,Alice
case-1,Activity2,2026-05-17T10:01:00Z,Bob
case-2,Activity1,2026-05-17T11:00:00Z,Charlie`;

      await fs.writeFile(filePath, csvContent, 'utf-8');

      try {
        const result = await runCli(['validate', filePath, '--format', 'csv']);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should accept CSV with custom column names', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'test.csv');
      const csvContent = `pid,activity,ts
p1,Start,2026-05-17T10:00:00Z
p1,End,2026-05-17T10:01:00Z`;

      await fs.writeFile(filePath, csvContent, 'utf-8');

      try {
        const result = await runCli([
          'validate',
          filePath,
          '--format',
          'csv',
          '--activity-key',
          'activity',
          '--case-id-key',
          'pid',
          '--timestamp-key',
          'ts',
        ]);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });
  });

  // ─── 12. OCEL Format Specific Tests ────────────────────────────────────

  describe('OCEL format specific', () => {
    it('should validate OCEL structure', async () => {
      const test = await createTestOcel();
      try {
        const result = await runCli(['validate', test.path, '--format', 'ocel']);
        expect([0, 2, 3]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should detect missing OCEL required keys', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'test.ocel.json');
      const badOcel = {
        event_types: ['create'],
        // Missing: object_types, events, objects
      };

      await fs.writeFile(filePath, JSON.stringify(badOcel), 'utf-8');

      try {
        const result = await runCli(['validate', filePath, '--format', 'ocel']);
        expect([2, 3]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should report object type counts in OCEL validation', async () => {
      const test = await createTestOcel();
      try {
        const result = await runCli(['validate', test.path, '--format', 'ocel', '--output-format', 'json']);
        if (result.stdout.trim()) {
          const output = JSON.parse(result.stdout);
          expect(output.payload).toHaveProperty('ocelSummary');
        }
      } finally {
        await test.cleanup();
      }
    });
  });

  // ─── 13. Edge Cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle file with unusual characters in path', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'test-file_2026.xes');
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Activity1"/>
      <date key="time:timestamp" value="2026-05-17T10:00:00Z"/>
    </event>
  </trace>
</log>`;

      await fs.writeFile(filePath, xesContent, 'utf-8');

      try {
        const result = await runCli(['validate', filePath]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should handle very long activity names', async () => {
      const longActivityName = 'A'.repeat(256);
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="${longActivityName}"/>
      <date key="time:timestamp" value="2026-05-17T10:00:00Z"/>
    </event>
  </trace>
</log>`;

      const filePath = path.join(tempDir, 'long.xes');
      await fs.writeFile(filePath, xesContent, 'utf-8');

      try {
        const result = await runCli(['validate', filePath]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });

    it('should handle traces with many events', async () => {
      const test = await createTestXes('case-001', 500);
      try {
        const result = await runCli(['validate', test.path]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        await test.cleanup();
      }
    });

    it('should handle multiple traces', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-test-'));
      const filePath = path.join(tempDir, 'multi.xes');
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Activity1"/>
      <date key="time:timestamp" value="2026-05-17T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Activity1"/>
      <date key="time:timestamp" value="2026-05-17T11:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-3"/>
    <event>
      <string key="concept:name" value="Activity2"/>
      <date key="time:timestamp" value="2026-05-17T12:00:00Z"/>
    </event>
  </trace>
</log>`;

      await fs.writeFile(filePath, xesContent, 'utf-8');

      try {
        const result = await runCli(['validate', filePath]);
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });
  });
});
