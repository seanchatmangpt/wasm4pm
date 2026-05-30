# Test Consolidation Examples — Before & After

**Purpose:** Concrete examples of how redundant tests can be consolidated without losing coverage.

---

## Example 1: CLI `run` Command Tests (45 → 2-3 files)

### BEFORE: Fragmented (14 separate test files)

**File 1: `run-cli.test.ts` (120 lines)**
```typescript
describe('wpm run command', () => {
  it('should exit with code 0 on success', async () => {
    const result = await runCli(['run', 'test.xes']);
    expect(result.exitCode).toBe(0);
  });

  it('should produce JSON output with --format json', async () => {
    const result = await runCli(['run', 'test.xes', '--format', 'json']);
    expect(result.stdout).toContain('"status"');
  });

  it('should save receipt to .wasm4pm/results', async () => {
    await runCli(['run', 'test.xes']);
    expect(fs.existsSync('.wasm4pm/results')).toBe(true);
  });
});
```

**File 2: `exit-codes-coverage.test.ts` (95 lines)**
```typescript
describe('exit codes', () => {
  it('returns 0 on success', async () => {
    const result = await runCli(['run', 'valid.xes']);
    expect(result.exitCode).toBe(0);
  });

  it('returns 2 on source error', async () => {
    const result = await runCli(['run', 'missing.xes']);
    expect(result.exitCode).toBe(2);
  });

  it('returns 1 on config error', async () => {
    const result = await runCli(['run', 'test.xes', '--algorithm', 'invalid']);
    expect(result.exitCode).toBe(1);
  });
});
```

**File 3: `config-precedence-cli.test.ts` (85 lines)**
```typescript
describe('config precedence', () => {
  it('CLI arg overrides config file', async () => {
    // Write wasm4pm.toml with algorithm=dfg
    // Pass --algorithm alpha_plus_plus
    const result = await runCli(['run', 'test.xes', '--algorithm', 'alpha_plus_plus']);
    // Verify algorithm used is alpha_plus_plus
  });

  it('config file overrides ENV', async () => {
    // Set WASM4PM_ALGORITHM=dfg
    // Write wasm4pm.toml with algorithm=heuristic_miner
    // Verify heuristic_miner is used
  });
});
```

**Duplicated Coverage:**
- Runs `wpm run` command ✓ (3 files)
- Tests exit codes ✓ (at least 4 files test codes 0, 1, 2, 3)
- Tests config precedence ✓ (at least 2 files)
- Tests output formats ✓ (at least 2 files)
- Tests receipt saving ✓ (at least 2 files)

---

### AFTER: Consolidated (1 parameterized file)

**File: `run-cli-comprehensive.test.ts` (180 lines)**
```typescript
describe('wpm run command — comprehensive coverage', () => {
  type RunTestCase = {
    name: string;
    args: string[];
    expectedExitCode: number;
    expectedInOutput?: RegExp;
    expectedNotInOutput?: RegExp;
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
  };

  const testCases: RunTestCase[] = [
    // ===== BASIC EXECUTION =====
    {
      name: 'success with valid log',
      args: ['run', 'valid-log.xes'],
      expectedExitCode: 0,
      expectedInOutput: /"status":\s*"ok"/,
    },
    {
      name: 'success produces JSON with --format json',
      args: ['run', 'valid-log.xes', '--format', 'json'],
      expectedExitCode: 0,
      expectedInOutput: /"status":\s*"ok"/,
    },
    {
      name: 'success produces human output with --format human',
      args: ['run', 'valid-log.xes', '--format', 'human'],
      expectedExitCode: 0,
      expectedInOutput: /algorithm:/i,
    },

    // ===== ERROR HANDLING =====
    {
      name: 'exit code 2 on missing log file',
      args: ['run', 'nonexistent.xes'],
      expectedExitCode: 2, // SOURCE_ERROR
      expectedInOutput: /not found|does not exist/i,
    },
    {
      name: 'exit code 1 on invalid algorithm',
      args: ['run', 'valid-log.xes', '--algorithm', 'fake_algo'],
      expectedExitCode: 1, // CONFIG_ERROR
      expectedInOutput: /unknown algorithm|invalid algorithm/i,
    },
    {
      name: 'exit code 1 on invalid format flag',
      args: ['run', 'valid-log.xes', '--format', 'invalid'],
      expectedExitCode: 1, // CONFIG_ERROR
      expectedInOutput: /format must be/i,
    },

    // ===== CONFIG PRECEDENCE =====
    {
      name: 'CLI flag overrides config file',
      args: ['run', 'valid-log.xes', '--algorithm', 'alpha_plus_plus'],
      expectedExitCode: 0,
      setup: async () => {
        // Write wasm4pm.toml with algorithm=dfg
        await fs.writeFile('wasm4pm.toml', 'algorithm = "dfg"');
      },
      expectedInOutput: /"algorithm":\s*"alpha_plus_plus"/,
    },
    {
      name: 'ENV var overridden by CLI flag',
      args: ['run', 'valid-log.xes', '--algorithm', 'heuristic_miner'],
      expectedExitCode: 0,
      expectedInOutput: /"algorithm":\s*"heuristic_miner"/,
    },

    // ===== OUTPUT & ARTIFACTS =====
    {
      name: 'saves receipt to .wasm4pm/results',
      args: ['run', 'valid-log.xes'],
      expectedExitCode: 0,
      teardown: async () => {
        // Verify .wasm4pm/results/* exists
      },
    },
    {
      name: 'receipt contains input/output hashes',
      args: ['run', 'valid-log.xes'],
      expectedExitCode: 0,
      expectedInOutput: /"input_hash":\s*"[a-f0-9]+"/,
    },

    // ===== ALGORITHM SELECTION =====
    {
      name: 'default algorithm is dfg',
      args: ['run', 'valid-log.xes'],
      expectedExitCode: 0,
      expectedInOutput: /"algorithm":\s*"dfg"/,
    },
    {
      name: 'explicit algorithm selection works',
      args: ['run', 'valid-log.xes', '--algorithm', 'genetic_algorithm'],
      expectedExitCode: 0,
      expectedInOutput: /"algorithm":\s*"genetic_algorithm"/,
    },
  ];

  test.each(testCases)(
    '$name',
    async ({
      args,
      expectedExitCode,
      expectedInOutput,
      expectedNotInOutput,
      setup,
      teardown,
    }) => {
      if (setup) await setup();

      try {
        const result = await runCli(args);
        expect(result.exitCode).toBe(expectedExitCode);

        if (expectedInOutput) {
          expect(result.stdout).toMatch(expectedInOutput);
        }
        if (expectedNotInOutput) {
          expect(result.stdout).not.toMatch(expectedNotInOutput);
        }
      } finally {
        if (teardown) await teardown();
      }
    }
  );
});
```

**Coverage Comparison:**

| Aspect | Before (14 files) | After (1 file) |
|--------|-----|------|
| Test cases | ~30+ scattered | 13 parameterized |
| File count | 14 | 1 |
| Total LOC | ~500 | 180 |
| Redundancy | High (exit code tested 4+ ways) | None (single parameterized loop) |
| Debug clarity | Low ("which run-cli test failed?") | High ("success with valid log failed") |
| Maintenance | High (update 14 files) | Low (update 1 file) |

**Savings:** 13 fewer files, ~320 lines eliminated, clearer test names

---

## Example 2: Conformance Tests (11 → 2-3 files)

### BEFORE: Fragmented (11 separate test files)

**`conformance-cli.test.ts` (150 lines)**
```typescript
describe('wpm conformance command', () => {
  it('should compute fitness and precision', async () => {
    const result = await runCli(['conformance', 'log.xes', 'model.pnml']);
    const json = JSON.parse(result.stdout);
    expect(json.fitness).toBeGreaterThan(0);
    expect(json.precision).toBeGreaterThan(0);
  });
});
```

**`conformance-precision-modes.test.ts` (180 lines)**
```typescript
describe('--precision-mode flag', () => {
  it('fast mode skips precision', async () => {
    const result = await runCli(['conformance', 'log.xes', '--precision-mode', 'fast']);
    const json = JSON.parse(result.stdout);
    expect(json.precision_available).toBe(false);
  });

  it('full mode computes both', async () => {
    const result = await runCli(['conformance', 'log.xes', '--precision-mode', 'full']);
    const json = JSON.parse(result.stdout);
    expect(json.precision_available).toBe(true);
  });
});
```

**`ocel-streaming-conformance.test.ts` (160 lines)**
```typescript
describe('conformance with OCEL', () => {
  it('streams OCEL log and computes conformance', async () => {
    const result = await runCli(['conformance', 'log.ocel', '--format', 'json']);
    expect(result.exitCode).toBe(0);
  });
});
```

**Duplicated Coverage:**
- All run `conformance` command
- All test fitness/precision values
- All use similar fixtures
- 3+ test output formats separately

---

### AFTER: Consolidated (2 files)

**`conformance-cli-base.test.ts` (220 lines)**
```typescript
describe('wpm conformance command — core functionality', () => {
  type ConformanceTestCase = {
    name: string;
    args: string[];
    expectedExitCode: number;
    validateOutput: (output: any) => void;
  };

  const testCases: ConformanceTestCase[] = [
    {
      name: 'computes fitness and precision',
      args: ['conformance', 'bpi-log.xes', '--format', 'json'],
      expectedExitCode: 0,
      validateOutput: (json) => {
        expect(json.fitness).toBeGreaterThan(0.8);
        expect(json.precision).toBeGreaterThan(0);
        expect(json.precision_available).toBe(true);
      },
    },
    {
      name: 'returns human-readable output',
      args: ['conformance', 'bpi-log.xes', '--format', 'human'],
      expectedExitCode: 0,
      validateOutput: (output) => {
        expect(output).toMatch(/fitness:/i);
      },
    },
    {
      name: 'exits 2 on missing file',
      args: ['conformance', 'nonexistent.xes'],
      expectedExitCode: 2,
      validateOutput: () => {}, // Just check exit code
    },
    {
      name: 'handles OCEL format',
      args: ['conformance', 'log.ocel', '--format', 'json'],
      expectedExitCode: 0,
      validateOutput: (json) => {
        expect(json.fitness).toBeDefined();
      },
    },
  ];

  test.each(testCases)(
    '$name',
    async ({ args, expectedExitCode, validateOutput }) => {
      const result = await runCli(args);
      expect(result.exitCode).toBe(expectedExitCode);

      if (expectedExitCode === 0) {
        const output =
          args.includes('--format') && args.includes('json')
            ? JSON.parse(result.stdout)
            : result.stdout;
        validateOutput(output);
      }
    }
  );
});
```

**`conformance-cli-modes.test.ts` (150 lines)**
```typescript
describe('wpm conformance command — precision modes', () => {
  test.each([
    { mode: 'fast', expect_precision: false },
    { mode: 'lazy', expect_precision: false }, // Lazy defers computation
    { mode: 'full', expect_precision: true },
  ])('--precision-mode $mode works', async ({ mode, expect_precision }) => {
    const result = await runCli([
      'conformance',
      'log.xes',
      '--precision-mode',
      mode,
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.precision_available).toBe(expect_precision);
  });
});
```

**Coverage Comparison:**

| Aspect | Before (11 files) | After (2 files) |
|--------|-----|------|
| Test cases | ~25+ scattered | 8 parameterized |
| File count | 11 | 2 |
| Total LOC | ~1,000 | 370 |
| Redundancy | High | None |
| Maintenance | High | Low |

**Savings:** 9 fewer files, ~630 lines eliminated

---

## Example 3: Fixture Duplication (480 files → ~50 central)

### BEFORE: Copied Across Locations

```
/Users/sac/wasm4pm/wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes  (20MB)
/Users/sac/wasm4pm/bench_data/bpi2020_travel.xes                              (20MB) — DUPLICATE
/Users/sac/wasm4pm/data/bpi2020_travel.xes                                    (20MB) — DUPLICATE
/Users/sac/wasm4pm/lab/fixtures/BPI_2020_PermitLog.xes                        (32MB)
/Users/sac/wasm4pm/data/PermitLog.xes                                          (32MB) — DUPLICATE
```

**Problem:**
- Tests import fixtures from different locations
- Same file loaded multiple times in memory
- Clone/download takes longer
- Developers modify fixture in one location, breaking tests elsewhere

---

### AFTER: Central Library with Symlinks/Symlinks

**Structure:**
```
/Users/sac/wasm4pm/fixtures/  (central library)
├── bpi2020/
│   ├── travel.xes
│   ├── permit.xes
│   ├── domestic.xes
│   └── international.xes
├── other-logs/
│   ├── sepsis.xes
│   └── receipt.xes
└── invalid-logs/  (edge cases)
    ├── missing-case-id.xes
    └── unclosed-trace.xes

/Users/sac/wasm4pm/wasm4pm/tests/fixtures/  → symlink to ../../fixtures/
/Users/sac/wasm4pm/bench_data/  → symlink to ../fixtures/
/Users/sac/wasm4pm/data/  → symlink to ../fixtures/
/Users/sac/wasm4pm/lab/fixtures/  → symlink to ../../fixtures/
```

**Code Changes (Minimal):**
```typescript
// Before
const log = readFileSync('wasm4pm/tests/fixtures/bpi2020_travel.xes');
const log2 = readFileSync('bench_data/bpi2020_travel.xes');
// Two separate loads!

// After
const log = readFileSync('fixtures/bpi2020/travel.xes');
const log2 = readFileSync('fixtures/bpi2020/travel.xes');
// Same file, guaranteed same version
```

**Savings:**
- Disk space: ~300MB (80% reduction)
- Clone time: 5-10 seconds saved
- Memory: ~10-20MB (fixtures cached once)
- Maintenance: Single source of truth

---

## Example 4: Algorithm Tests Consolidation (DFG in 136 files → 5-10)

### BEFORE: Scattered Across Packages

**Kernel tests** (`packages/kernel/__tests__/discovery-dfg.test.ts`)
```typescript
describe('discover_dfg algorithm', () => {
  it('returns DFG structure', async () => {
    const dfg = await kernel.run('dfg', handle);
    expect(dfg.nodes).toBeDefined();
  });
});
```

**Testing harness** (`packages/testing/__tests__/harness-dfg.test.ts`)
```typescript
describe('dfg harness parity', () => {
  it('explain(dfg) == plan(dfg)', async () => {
    const explained = explain({ algorithm: 'dfg' });
    const planned = plan({ algorithm: 'dfg' });
    expect(explained).toEqual(planned);
  });
});
```

**Contracts** (`packages/contracts/__tests__/receipt-dfg.test.ts`)
```typescript
describe('dfg receipt chain', () => {
  it('produces valid receipt', async () => {
    const receipt = await runDfg(log);
    expect(receipt.signature).toBeDefined();
  });
});
```

**CLI** (`apps/wasm4pm/src/__tests__/run-dfg.test.ts`)
```typescript
describe('wpm run --algorithm dfg', () => {
  it('executes dfg discovery', async () => {
    const result = await runCli(['run', 'log.xes', '--algorithm', 'dfg']);
    expect(result.exitCode).toBe(0);
  });
});
```

**All 136 files test DFG separately by layer!**

---

### AFTER: Consolidated by Layer (5-10 files)

**Kernel layer** (`packages/kernel/__tests__/algorithm-discovery.test.ts`)
```typescript
describe('kernel discovery algorithms', () => {
  const ALGORITHMS = ['dfg', 'alpha_plus_plus', 'heuristic_miner', ...];

  test.each(ALGORITHMS)('%s produces valid output', async (algo) => {
    const result = await kernel.run(algo, handle, {});
    expect(result).toHaveProperty('nodes');
  });

  test.each(ALGORITHMS)('%s respects timeout', async (algo) => {
    const start = Date.now();
    await kernel.run(algo, handle, { timeout: 100 });
    expect(Date.now() - start).toBeLessThan(200);
  });
});
```

**Testing harness** (`packages/testing/__tests__/harness-parity.test.ts`)
```typescript
describe('harness parity checks', () => {
  const ALGORITHMS = ['dfg', 'alpha_plus_plus', ...];

  test.each(ALGORITHMS)(
    '%s: explain() == plan()',
    async (algo) => {
      const explained = explain({ algorithm: algo });
      const planned = plan({ algorithm: algo });
      expect(explained).toEqual(planned);
    }
  );
});
```

**Contracts layer** (`packages/contracts/__tests__/receipt-chain.test.ts`)
```typescript
describe('receipt chain validation', () => {
  const ALGORITHMS = ['dfg', 'alpha_plus_plus', ...];

  test.each(ALGORITHMS)(
    '%s produces valid receipt',
    async (algo) => {
      const receipt = await run(algo, log);
      expect(receipt.signature).toBeDefined();
      expect(receipt.input_hash).toBeDefined();
    }
  );
});
```

**CLI** (`apps/wasm4pm/src/__tests__/run-algorithms.test.ts`)
```typescript
describe('wpm run --algorithm <algo>', () => {
  const ALGORITHMS = ['dfg', 'alpha_plus_plus', ...];

  test.each(ALGORITHMS)(
    'executes %s via CLI',
    async (algo) => {
      const result = await runCli(['run', 'log.xes', '--algorithm', algo]);
      expect(result.exitCode).toBe(0);
    }
  );
});
```

**Coverage Comparison:**

| Aspect | Before (136 files) | After (5 files) |
|--------|-----|------|
| Test cases for DFG | ~200+ | ~50 (same logic, parameterized) |
| File count | 136 | 5 |
| Total LOC | ~5,000 | 800 |
| Redundancy | Very high (same algo tested 136 ways) | None |
| Maintenance | Extremely high (update 136 files for algo change) | Low (update 5 files) |

**Savings:** 131 fewer files, ~4,200 lines eliminated

---

## Summary: Consolidation Pattern

**Key Insight:** Replace N separate test files with 1-2 parameterized test files using `test.each()`.

**Steps:**

1. **Identify redundancy** — Find N files testing same code path
2. **Create test case array** — List all variations as objects/tuples
3. **Use `test.each()`** — Parameterized loop runs all variations
4. **Improve test names** — Use template strings: `'$algorithm: should succeed'`
5. **Add setup/teardown** — Per-case setup/cleanup if needed
6. **Delete old files** — Verify all old assertions covered
7. **Update imports** — Point to consolidated test file

**Example Template:**
```typescript
describe('feature under test', () => {
  const testCases = [
    { input: 'x', expected: 'y', name: 'case 1' },
    { input: 'a', expected: 'b', name: 'case 2' },
  ];

  test.each(testCases)('$name', async ({ input, expected }) => {
    const result = await runFeature(input);
    expect(result).toBe(expected);
  });
});
```

---

## Implementation Checklist

- [ ] Identify redundant test group (e.g., all `run` command tests)
- [ ] Extract test cases into array of objects
- [ ] Rewrite using `test.each()`
- [ ] Verify all original assertions preserved
- [ ] Run consolidated test file
- [ ] Delete original N test files
- [ ] Check git diff for removed LOC
- [ ] Commit: `test(consolidation): merge N {feature} tests into 1 parameterized file`

---

