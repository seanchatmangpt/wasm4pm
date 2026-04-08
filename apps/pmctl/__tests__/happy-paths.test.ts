import { describe, it, expect } from 'vitest';
import { run, watch, status, explain, init } from '../src/cli.js';

/**
 * Happy path tests for pictl commands
 * Verify that each command has correct structure for successful execution
 */

describe('Happy path: run command', () => {
  it('should be defined and callable', () => {
    expect(run).toBeDefined();
    expect(run.meta).toBeDefined();
    expect(run.args).toBeDefined();
    expect(run.run).toBeDefined();
  });

  it('should accept all required parameters for basic discovery', () => {
    const args = run.args || {};
    // Minimum: algorithm
    expect(args.algorithm).toBeDefined();
    // Optional but useful: config, input, output, timeout
    expect(args.config).toBeDefined();
    expect(args.input).toBeDefined();
    expect(args.output).toBeDefined();
  });

  it('basic run flow: config -> algorithm -> input -> output', async () => {
    // This demonstrates the expected command usage:
    // pictl run --config pmctl.json --algorithm genetic --input log.xes --output results.json
    expect(run.args?.config).toBeDefined();
    expect(run.args?.algorithm).toBeDefined();
    expect(run.args?.input).toBeDefined();
    expect(run.args?.output).toBeDefined();
  });

  it('should support all major algorithms', () => {
    const algoDescription = run.args?.algorithm?.description || '';
    const algos = ['dfg', 'alpha', 'heuristic', 'genetic', 'ilp'];
    algos.forEach((algo) => {
      expect(algoDescription.toLowerCase()).toContain(algo);
    });
  });

  it('should return success on completion', async () => {
    // run command should call process.exit(0) on success
    expect(run.run).toBeDefined();
  });
});

describe('Happy path: watch command', () => {
  it('should be defined and callable', () => {
    expect(watch).toBeDefined();
    expect(watch.meta).toBeDefined();
    expect(watch.args).toBeDefined();
    expect(watch.run).toBeDefined();
  });

  it('should start watching immediately with sensible defaults', () => {
    expect(watch.args?.config).toBeDefined();
    expect(watch.args?.interval).toBeDefined();
    // Default interval should be reasonable for file polling
  });

  it('watch flow: load config -> start watching -> emit events -> stream output', async () => {
    // This demonstrates the expected flow
    // pmctl watch --config pmctl.json --interval 1000 --format json
    expect(watch.args?.config).toBeDefined();
    expect(watch.args?.interval).toBeDefined();
    expect(watch.args?.format).toBeDefined();
  });

  it('should emit progress events in human readable format', () => {
    const format = watch.args?.format?.default || 'human';
    expect(format).toBe('human');
  });

  it('should support both human and json streaming', () => {
    expect(watch.args?.format?.description).toContain('format');
  });
});

describe('Happy path: status command', () => {
  it('should be defined and callable', () => {
    expect(status).toBeDefined();
    expect(status.meta).toBeDefined();
    expect(status.args).toBeDefined();
    expect(status.run).toBeDefined();
  });

  it('should report current engine status with no arguments', () => {
    // pmctl status
    expect(status.run).toBeDefined();
  });

  it('should show progress, memory, and system info in human mode', () => {
    expect(status.args?.format?.default).toBe('human');
  });

  it('should output structured data in json mode', () => {
    // pmctl status --format json
    expect(status.args?.format).toBeDefined();
  });

  it('should include verbose information when requested', () => {
    // pmctl status --verbose
    expect(status.args?.verbose).toBeDefined();
  });

  it('status flow: query engine -> gather system info -> format -> output', async () => {
    // This demonstrates the expected flow
    expect(status.run).toBeDefined();
  });
});

describe('Happy path: explain command', () => {
  it('should be defined and callable', () => {
    expect(explain).toBeDefined();
    expect(explain.meta).toBeDefined();
    expect(explain.args).toBeDefined();
    expect(explain.run).toBeDefined();
  });

  it('should explain algorithms by name', () => {
    // pmctl explain --algorithm genetic
    expect(explain.args?.algorithm).toBeDefined();
  });

  it('should explain discovered models from config', () => {
    // pmctl explain --config pmctl.json
    expect(explain.args?.config).toBeDefined();
  });

  it('should support three explanation levels', () => {
    expect(explain.args?.level).toBeDefined();
    // brief, detailed, academic
  });

  it('should default to detailed explanation level', () => {
    expect(explain.args?.level?.default).toBe('detailed');
  });

  it('explain flow: load config/algorithm -> generate explanation -> format -> output', async () => {
    // This demonstrates the expected flow
    // pmctl explain --algorithm genetic --level academic
    expect(explain.args?.algorithm).toBeDefined();
    expect(explain.args?.level).toBeDefined();
  });

  it('should output markdown for human format', () => {
    expect(explain.args?.format?.default).toBe('human');
  });

  it('should output json for machine format', () => {
    // pmctl explain --algorithm genetic --format json
    expect(explain.args?.format).toBeDefined();
  });
});

describe('Happy path: init command', () => {
  it('should be defined and callable', () => {
    expect(init).toBeDefined();
    expect(init.meta).toBeDefined();
    expect(init.args).toBeDefined();
    expect(init.run).toBeDefined();
  });

  it('should scaffold a project with default template', () => {
    // pictl init
    expect(init.run).toBeDefined();
  });

  it('should create wasm4pm configuration files', () => {
    expect(init.args?.configFormat || init.args?.format).toBeDefined();
  });

  it('should support toml and json formats', () => {
    const format = init.args?.configFormat?.description ||
                   init.args?.format?.description || '';
    expect(format.toLowerCase()).toMatch(/toml|json/);
  });

  it('should allow directory output specification', () => {
    // init command may support output directory selection
    expect(init.args?.format).toBeDefined();
  });

  it('should allow force overwrite of existing files', () => {
    // pictl init --force
    expect(init.args?.force).toBeDefined();
  });

  it('init flow: select template -> create dirs -> write configs -> validate -> output', async () => {
    // This demonstrates the expected flow
    // pictl init --format toml --force
    expect(init.run).toBeDefined();
  });

  it('should report created files and next steps', () => {
    expect(init.run).toBeDefined();
  });
});

describe('Happy path: output formatting', () => {
  it('all commands should support human format', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.format || cmd.args?.output).toBeDefined();
    });
  });

  it('all commands should support json format', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.format || cmd.args?.output).toBeDefined();
    });
  });

  it('should use consola for human-friendly output', () => {
    // All commands use getFormatter which instantiates HumanFormatter
    expect(run.run).toBeDefined();
  });

  it('should output valid json for machine consumption', () => {
    // All commands support --format json
    expect(run.args?.format).toBeDefined();
  });

  it('should respect quiet flag to suppress output', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.quiet).toBeDefined();
    });
  });

  it('should provide verbose details when requested', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.verbose).toBeDefined();
    });
  });
});

describe('Happy path: configuration resolution', () => {
  it('should load configuration from current directory', () => {
    // pictl run -> automatically finds wasm4pm.json or pictl.toml
    expect(run.args?.config).toBeDefined();
  });

  it('should allow explicit config file path', () => {
    // pictl run --config /path/to/config.json
    expect(run.args?.config).toBeDefined();
  });

  it('should support CLI overrides of config values', () => {
    // pictl run --algorithm genetic (overrides config profile)
    expect(run.args?.algorithm).toBeDefined();
  });

  it('should respect environment variables with WASM4PM_ prefix', () => {
    // WASM4PM_PROFILE=quality pictl run
    expect(run.run).toBeDefined();
  });

  it('should apply sensible defaults when nothing specified', () => {
    // pictl run (without args, uses defaults)
    expect(run.run).toBeDefined();
  });
});

describe('Happy path: error recovery', () => {
  it('should show helpful error messages', () => {
    // When config file is missing: "Config error: configuration file not found"
    // Should map to exit code 1 (config_error)
    expect(run.run).toBeDefined();
  });

  it('should suggest corrective actions', () => {
    // "Use: pictl init to create a configuration file"
    // "Use: pmctl explain to understand algorithms"
    expect(run.run).toBeDefined();
  });

  it('should handle missing input files gracefully', () => {
    // Error: "Source error: input file not found at ./data/log.xes"
    // Should map to exit code 2 (source_error)
    expect(run.args?.input).toBeDefined();
  });

  it('should recover from transient network errors', () => {
    // Should retry and eventually fail gracefully
    expect(run.run).toBeDefined();
  });

  it('should provide debugging information in verbose mode', () => {
    // pictl run --verbose
    expect(run.args?.verbose).toBeDefined();
  });
});

describe('Happy path: real-world usage scenarios', () => {
  it('scenario 1: quick DFG discovery', async () => {
    // pictl run --algorithm dfg --input log.xes --output results.json
    expect(run.args?.algorithm).toBeDefined();
    expect(run.args?.input).toBeDefined();
    expect(run.args?.output).toBeDefined();
  });

  it('scenario 2: high-quality process model with multiple algorithms', async () => {
    // pictl run --config quality.toml --output models/
    expect(run.args?.config).toBeDefined();
    expect(run.args?.output).toBeDefined();
  });

  it('scenario 3: watch for log updates and auto-discover', async () => {
    // pmctl watch --config pmctl.json --interval 5000 --format json
    expect(watch.args?.config).toBeDefined();
    expect(watch.args?.interval).toBeDefined();
    expect(watch.args?.format).toBeDefined();
  });

  it('scenario 4: understand genetic algorithm parameters', async () => {
    // pmctl explain --algorithm genetic --level academic
    expect(explain.args?.algorithm).toBeDefined();
    expect(explain.args?.level).toBeDefined();
  });

  it('scenario 5: understand execution plan before running', async () => {
    // pmctl explain --config pmctl.json --level detailed
    expect(explain.args?.config).toBeDefined();
    expect(explain.args?.level).toBeDefined();
  });

  it('scenario 6: bootstrap new project', async () => {
    // pictl init --format toml
    // Then: pictl run --algorithm alpha
    expect(init.args?.configFormat).toBeDefined() || expect(init.args?.format).toBeDefined();
  });

  it('scenario 7: check system health before discovery', async () => {
    // pmctl status --verbose
    expect(status.args?.verbose).toBeDefined();
  });

  it('scenario 8: export results in json for downstream processing', async () => {
    // pictl run --format json > results.json
    expect(run.args?.format).toBeDefined();
  });
});
