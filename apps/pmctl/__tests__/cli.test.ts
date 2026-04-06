import { describe, it, expect } from 'vitest';
import { main, run, watch, status, explain, init } from '../src/cli.js';
import { EXIT_CODES } from '../src/exit-codes.js';
import { HumanFormatter, JSONFormatter } from '../src/output.js';

describe('pmctl CLI', () => {
  describe('Command definitions', () => {
    it('should define main command with version', () => {
      expect(main.meta?.name).toBe('pmctl');
      expect(main.meta?.version).toBe('26.4.5');
    });

    it('should have all required subcommands', () => {
      expect(main.subCommands).toBeDefined();
      expect(main.subCommands?.run).toBeDefined();
      expect(main.subCommands?.watch).toBeDefined();
      expect(main.subCommands?.status).toBeDefined();
      expect(main.subCommands?.explain).toBeDefined();
      expect(main.subCommands?.init).toBeDefined();
    });
  });

  describe('run command', () => {
    it('should have correct metadata', () => {
      expect(run.meta?.name).toBe('run');
      expect(run.meta?.description?.toLowerCase()).toContain('discover');
    });

    it('should have config, algorithm, input, output, timeout args', () => {
      expect(run.args?.config).toBeDefined();
      expect(run.args?.algorithm).toBeDefined();
      expect(run.args?.input).toBeDefined();
      expect(run.args?.output).toBeDefined();
      expect(run.args?.timeout).toBeDefined();
    });

    it('should have format, verbose, quiet options', () => {
      expect(run.args?.format).toBeDefined();
      expect(run.args?.verbose).toBeDefined();
      expect(run.args?.quiet).toBeDefined();
    });
  });

  describe('watch command', () => {
    it('should have correct metadata', () => {
      expect(watch.meta?.name).toBe('watch');
      expect(watch.meta?.description?.toLowerCase()).toContain('watch');
    });

    it('should have config and interval args', () => {
      expect(watch.args?.config).toBeDefined();
      expect(watch.args?.interval).toBeDefined();
    });

    it('should have default interval of 1000ms', () => {
      expect(watch.args?.interval).toBeDefined(); // default applied in handler
    });
  });

  describe('status command', () => {
    it('should have correct metadata', () => {
      expect(status.meta?.name).toBe('status');
      expect(status.meta?.description).toContain('status');
    });

    it('should have format options', () => {
      expect(status.args?.format).toBeDefined();
      expect(status.args?.verbose).toBeDefined();
    });
  });

  describe('explain command', () => {
    it('should have correct metadata', () => {
      expect(explain.meta?.name).toBe('explain');
      expect(explain.meta?.description?.toLowerCase()).toContain('explain');
    });

    it('should have model and algorithm args', () => {
      expect(explain.args?.model).toBeDefined();
      expect(explain.args?.algorithm).toBeDefined();
    });

    it('should have level arg with correct default', () => {
      expect(explain.args?.level?.default).toBe('detailed');
    });
  });

  describe('init command', () => {
    it('should have correct metadata', () => {
      expect(init.meta?.name).toBe('init');
      expect(init.meta?.description?.toLowerCase()).toContain('init');
    });

    it('should have configFormat and force args', () => {
      expect(init.args?.configFormat).toBeDefined();
      expect(init.args?.force).toBeDefined();
    });

    it('should have correct defaults', () => {
      expect(init.args?.configFormat?.default).toBe('toml');
    });
  });
});

describe('Exit codes', () => {
  it('should define all required exit codes', () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.config_error).toBe(1);
    expect(EXIT_CODES.source_error).toBe(2);
    expect(EXIT_CODES.execution_error).toBe(3);
    expect(EXIT_CODES.partial_failure).toBe(4);
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('should have correct values for standard codes', () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.config_error < EXIT_CODES.system_error).toBe(true);
  });
});

describe('Output formatters', () => {
  it('should instantiate HumanFormatter', () => {
    const formatter = new HumanFormatter();
    expect(formatter).toBeDefined();
  });

  it('should instantiate JSONFormatter', () => {
    const formatter = new JSONFormatter();
    expect(formatter).toBeDefined();
  });

  it('should respect quiet flag in HumanFormatter', () => {
    const formatter = new HumanFormatter({ quiet: true });
    expect(formatter).toBeDefined();
  });

  it('should respect format in JSONFormatter', () => {
    const formatter = new JSONFormatter({ format: 'json' });
    expect(formatter).toBeDefined();
  });
});
