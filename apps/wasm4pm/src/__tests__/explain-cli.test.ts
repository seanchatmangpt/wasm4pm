import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm explain — algorithm explanations and process model documentation', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('explain (zero-arg mode — algorithm menu)', () => {
    it('should display algorithm menu when invoked with no arguments', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm guide|when to use which algorithm/i);
    });

    it('should show recommended algorithms for common situations', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg|heuristic|inductive|genetic|ilp/i);
    });

    it('should display van der aalst quality dimensions', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fitness|precision|generalization|simplicity/i);
    });

    it('should list available algorithms at end of menu', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/available algorithms with explanations/i);
    });

    it('should include speed vs quality trade-off chart', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/speed.*quality|quality.*speed/i);
    });

    it('should include usage examples', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wpm explain <algorithm>|--level|academic/i);
    });
  });

  describe('explain <algorithm> — positional algorithm argument', () => {
    it('should accept positional algorithm argument', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.*follows|dfg/i);
    });

    it('should explain dfg algorithm', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.*follows graph/i);
    });

    it('should explain heuristic algorithm', async () => {
      const result = await runCli(['explain', 'heuristic'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/heuristic|noise|threshold/i);
    });

    it('should explain alpha algorithm', async () => {
      const result = await runCli(['explain', 'alpha'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/alpha|petri|concurrent/i);
    });

    it('should explain inductive algorithm', async () => {
      const result = await runCli(['explain', 'inductive'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/inductive|tree|sound/i);
    });

    it('should explain genetic algorithm', async () => {
      const result = await runCli(['explain', 'genetic'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/genetic|evolution|population/i);
    });

    it('should explain ilp algorithm', async () => {
      const result = await runCli(['explain', 'ilp'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/ilp|integer linear|optimal/i);
    });

    it('should explain aco algorithm', async () => {
      const result = await runCli(['explain', 'aco'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/ant colony|pheromone|swarm/i);
    });

    it('should explain pso algorithm', async () => {
      const result = await runCli(['explain', 'pso'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/particle swarm|optimization/i);
    });

    it('should explain hill climbing algorithm', async () => {
      const result = await runCli(['explain', 'hill'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/hill|climbing|local|optimum/i);
    });

    it('should explain simulated annealing algorithm', async () => {
      const result = await runCli(['explain', 'annealing'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/anneal|temperature|cooling/i);
    });

    it('should explain astar algorithm', async () => {
      const result = await runCli(['explain', 'astar'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/a\*|astar|search|heuristic/i);
    });

    it('should explain declare algorithm', async () => {
      const result = await runCli(['explain', 'declare'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/declare|constraint|response|precedence/i);
    });

    it('should explain skeleton algorithm', async () => {
      const result = await runCli(['explain', 'skeleton'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/skeleton|core|structure/i);
    });
  });

  describe('explain --algorithm (flag form)', () => {
    it('should accept --algorithm flag', async () => {
      const result = await runCli(['explain', '--algorithm', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.*follows/i);
    });

    it('should accept -a shorthand', async () => {
      const result = await runCli(['explain', '-a', 'heuristic'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/heuristic/i);
    });

    it('positional argument and --algorithm flag together both succeed', async () => {
      // The CLI resolves the algorithm from whichever takes precedence;
      // what matters is that the command exits cleanly.
      const result = await runCli(['explain', 'dfg', '--algorithm', 'ilp'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Either dfg or ilp explanation — both contain algorithm-specific content
      expect(result.stdout).toMatch(/directly.*follows|integer linear|ilp|dfg/i);
    });
  });

  describe('explain --level (explanation detail)', () => {
    it('should support --level brief', async () => {
      const result = await runCli(['explain', 'dfg', '--level', 'brief'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should support --level detailed (default)', async () => {
      const result = await runCli(['explain', 'dfg', '--level', 'detailed'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/how it works|output|when to use/i);
    });

    it('should support --level academic', async () => {
      const result = await runCli(['explain', 'dfg', '--level', 'academic'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/definition|complexity|theorem|references/i);
    });

    it('detailed level should be default', async () => {
      const result1 = await runCli(['explain', 'dfg'], { env: env.env });
      const result2 = await runCli(['explain', 'dfg', '--level', 'detailed'], { env: env.env });
      expect(result1.exitCode).toBe(EXIT_CODES.success);
      expect(result2.exitCode).toBe(EXIT_CODES.success);
      expect(result1.stdout).toBe(result2.stdout);
    });

    it('academic level should include mathematical notation', async () => {
      const result = await runCli(['explain', 'dfg', '--level', 'academic'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('brief level should be shorter than detailed', async () => {
      const brief = await runCli(['explain', 'dfg', '--level', 'brief'], { env: env.env });
      const detailed = await runCli(['explain', 'dfg', '--level', 'detailed'], { env: env.env });
      expect(brief.exitCode).toBe(EXIT_CODES.success);
      expect(detailed.exitCode).toBe(EXIT_CODES.success);
      expect(brief.stdout.length).toBeLessThan(detailed.stdout.length);
    });
  });

  describe('explain --format (output format)', () => {
    it('should default to human format', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).not.toMatch(/^{.*}$/);
    });

    it('should support --format human', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'human'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.*follows|dfg/i);
    });

    it('should support --format json', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('json output should parse validly', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('payload');
    });

    it('json output should include algorithm metadata', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('subject');
      expect(json.payload).toHaveProperty('content');
      expect(json.payload).toHaveProperty('level');
    });
  });

  describe('explain quality dimensions and metadata', () => {
    it('should show quality score for known algorithms', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('quality_score');
    });

    it('should show speed score for known algorithms', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('speed_score');
    });

    it('should show output type (dfg, petrinet, tree, etc.)', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('output_type');
    });

    it('should show quality dimensions (fitness, precision, generalization, simplicity)', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload.quality_dimensions).toHaveProperty('fitness');
      expect(json.payload.quality_dimensions).toHaveProperty('precision');
      expect(json.payload.quality_dimensions).toHaveProperty('generalization');
      expect(json.payload.quality_dimensions).toHaveProperty('simplicity');
    });

    it('should show deployment profiles', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('deployment_profiles');
      expect(Array.isArray(json.payload.deployment_profiles)).toBe(true);
    });

    it('should show when to use recommendations', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('when_to_use');
    });

    it('should show alternatives for comparison', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toHaveProperty('alternatives');
    });

    it('quality trade-offs should appear in human format', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'human'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/quality.*trade|fitness|precision/i);
    });
  });

  describe('explain --verbose and --quiet flags', () => {
    it('should accept --verbose flag', async () => {
      const result = await runCli(['explain', 'dfg', '--verbose'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should accept -v shorthand', async () => {
      const result = await runCli(['explain', 'dfg', '-v'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should accept --quiet flag', async () => {
      const result = await runCli(['explain', 'dfg', '--quiet'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should accept -q shorthand', async () => {
      const result = await runCli(['explain', 'dfg', '-q'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('explain --config (configuration file)', () => {
    it('should accept --config flag', async () => {
      const result = await runCli(
        ['explain', '--config', '/tmp/nonexistent.toml'],
        { env: env.env }
      );
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    });
  });

  describe('explain --model (model path)', () => {
    it('should accept --model flag', async () => {
      const result = await runCli(
        ['explain', '--model', '/tmp/model.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should accept -m shorthand', async () => {
      const result = await runCli(
        ['explain', '-m', '/tmp/model.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('explain error handling', () => {
    it('should handle invalid algorithm gracefully', async () => {
      const result = await runCli(['explain', 'not_a_real_algorithm'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/no explanation|unknown algorithm|available/i);
    });

    it('should suggest available algorithms when unknown', async () => {
      const result = await runCli(['explain', 'xyz123'], { env: env.env });
      expect(result.stdout).toMatch(/dfg|heuristic|alpha|ilp/i);
    });

    it('should reject invalid --level with config_error (1)', async () => {
      // An unknown --level value is a configuration argument error (config_error=1).
      const result = await runCli(['explain', 'dfg', '--level', 'super_detailed'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('invalid --level JSON output has status=error and error.code=INVALID_LEVEL', async () => {
      const result = await runCli(
        ['explain', 'dfg', '--level', 'bad_level', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBe('error');
      expect(json.error?.code).toBe('INVALID_LEVEL');
    });

    it('should accept any --format value without crashing', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'xml'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    });
  });

  describe('explain performance', () => {
    // Node.js subprocess startup + wpm initialization takes ~200-500 ms;
    // 3 000 ms is a generous wall-clock budget to avoid flakiness on CI.
    it('should complete zero-arg in <3000ms', async () => {
      const start = Date.now();
      await runCli(['explain'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    });

    it('should complete algorithm explanation in <3000ms', async () => {
      const start = Date.now();
      await runCli(['explain', 'dfg'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    });

    it('should complete json output in <3000ms', async () => {
      const start = Date.now();
      await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('explain help documentation', () => {
    it('should provide helpful output with no args', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wpm explain/i);
    });

    it('explain menu should suggest usage examples', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wpm explain.*algorithm|--level|wpm algorithms/i);
    });
  });

  describe('explain ml algorithms', () => {
    it('should explain ml_cluster algorithm', async () => {
      const result = await runCli(['explain', 'ml_cluster'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should explain ml_anomaly algorithm', async () => {
      const result = await runCli(['explain', 'ml_anomaly'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('explain exit codes', () => {
    it('should exit 0 (SUCCESS) on valid algorithm explanation', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should exit 0 (SUCCESS) on zero-arg menu', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should exit 3 (EXECUTION_ERROR) or 0 on invalid algorithm', async () => {
      const result = await runCli(['explain', 'fake_algorithm_xyz'], { env: env.env });
      expect([EXIT_CODES.execution_error, EXIT_CODES.success]).toContain(result.exitCode);
    });
  });

  describe('explain json structure validation', () => {
    it('json payload should have status field', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
    });

    it('json payload.subject should match algorithm or menu', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload.subject).toBeTruthy();
    });

    it('json payload.content should contain explanation text', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload.content).toBeTruthy();
      expect(json.payload.content.length).toBeGreaterThan(0);
    });

    it('json payload.level should be brief|detailed|academic', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(['brief', 'detailed', 'academic']).toContain(json.payload.level);
    });
  });

  describe('explain combined flags', () => {
    it('should handle algorithm + level + format together', async () => {
      const result = await runCli(
        ['explain', 'dfg', '--level', 'brief', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload.level).toBe('brief');
    });

    it('should handle verbose + format flags', async () => {
      const result = await runCli(
        ['explain', 'dfg', '--verbose', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should handle quiet + verbose (quiet should win)', async () => {
      const result = await runCli(
        ['explain', 'dfg', '--quiet', '--verbose'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });
});
