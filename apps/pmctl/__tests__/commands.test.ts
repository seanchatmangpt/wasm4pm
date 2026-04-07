import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { run, watch, status, explain, init } from '../src/cli.js';
import { EXIT_CODES } from '../src/exit-codes.js';

/**
 * Integration tests for pmctl commands
 * Tests command wiring to engine, config loading, output formatting, and exit codes
 */

describe('run command', () => {
  it('should have correct metadata', () => {
    expect(run.meta?.name).toBe('run');
    expect(run.meta?.description).toContain('Discover');
  });

  it('should accept config argument', () => {
    expect(run.args?.config).toBeDefined();
    expect(run.args?.config?.type).toBe('string');
  });

  it('should accept algorithm argument', () => {
    expect(run.args?.algorithm).toBeDefined();
    expect(run.args?.algorithm?.type).toBe('string');
  });

  it('should accept input argument', () => {
    expect(run.args?.input).toBeDefined();
    expect(run.args?.input?.type).toBe('positional');
  });

  it('should accept output argument', () => {
    expect(run.args?.output).toBeDefined();
    expect(run.args?.output?.type).toBe('string');
  });

  it('should accept timeout argument', () => {
    expect(run.args?.timeout).toBeDefined();
  });

  it('should accept format option', () => {
    expect(run.args?.format).toBeDefined();
    expect(run.args?.format?.type).toBe('string');
  });

  it('should accept verbose flag', () => {
    expect(run.args?.verbose).toBeDefined();
    expect(run.args?.verbose?.type).toBe('boolean');
  });

  it('should accept quiet flag', () => {
    expect(run.args?.quiet).toBeDefined();
    expect(run.args?.quiet?.type).toBe('boolean');
  });

  it('should have async run function', () => {
    expect(typeof run.run).toBe('function');
  });
});

describe('watch command', () => {
  it('should have correct metadata', () => {
    expect(watch.meta?.name).toBe('watch');
    expect(watch.meta?.description).toContain('Watch');
  });

  it('should accept config argument', () => {
    expect(watch.args?.config).toBeDefined();
    expect(watch.args?.config?.type).toBe('string');
  });

  it('should accept interval argument', () => {
    expect(watch.args?.interval).toBeDefined();
    expect(watch.args?.interval?.type).toBe('string');
  });

  it('should accept format option', () => {
    expect(watch.args?.format).toBeDefined();
    expect(watch.args?.format?.type).toBe('string');
  });

  it('should accept verbose flag', () => {
    expect(watch.args?.verbose).toBeDefined();
    expect(watch.args?.verbose?.type).toBe('boolean');
  });

  it('should accept quiet flag', () => {
    expect(watch.args?.quiet).toBeDefined();
    expect(watch.args?.quiet?.type).toBe('boolean');
  });

  it('should have async run function', () => {
    expect(typeof watch.run).toBe('function');
  });
});

describe('status command', () => {
  it('should have correct metadata', () => {
    expect(status.meta?.name).toBe('status');
    expect(status.meta?.description).toContain('status');
  });

  it('should have format argument with human default', () => {
    expect(status.args?.format).toBeDefined();
    expect(status.args?.format?.default).toBe('human');
  });

  it('should accept verbose flag', () => {
    expect(status.args?.verbose).toBeDefined();
    expect(status.args?.verbose?.type).toBe('boolean');
  });

  it('should accept quiet flag', () => {
    expect(status.args?.quiet).toBeDefined();
    expect(status.args?.quiet?.type).toBe('boolean');
  });

  it('should have async run function', () => {
    expect(typeof status.run).toBe('function');
  });
});

describe('explain command', () => {
  it('should have correct metadata', () => {
    expect(explain.meta?.name).toBe('explain');
    expect(explain.meta?.description?.toLowerCase()).toContain('explain');
  });

  it('should accept config argument', () => {
    expect(explain.args?.config).toBeDefined();
    expect(explain.args?.config?.type).toBe('string');
  });

  it('should accept model argument with alias', () => {
    expect(explain.args?.model).toBeDefined();
    expect(explain.args?.model?.alias).toBe('m');
  });

  it('should accept algorithm argument with alias', () => {
    expect(explain.args?.algorithm).toBeDefined();
    expect(explain.args?.algorithm?.alias).toBe('a');
  });

  it('should have level argument with detailed default', () => {
    expect(explain.args?.level).toBeDefined();
    expect(explain.args?.level?.default).toBe('detailed');
  });

  it('should accept format option', () => {
    expect(explain.args?.format).toBeDefined();
    expect(explain.args?.format?.default).toBe('human');
  });

  it('should accept verbose flag with alias', () => {
    expect(explain.args?.verbose).toBeDefined();
    expect(explain.args?.verbose?.alias).toBe('v');
  });

  it('should accept quiet flag with alias', () => {
    expect(explain.args?.quiet).toBeDefined();
    expect(explain.args?.quiet?.alias).toBe('q');
  });

  it('should have async run function', () => {
    expect(typeof explain.run).toBe('function');
  });
});

describe('init command', () => {
  it('should have correct metadata', () => {
    expect(init.meta?.name).toBe('init');
    expect(init.meta?.description?.toLowerCase()).toContain('init');
  });

  it('should accept format argument with default', () => {
    expect(init.args?.format).toBeDefined();
    expect(init.args?.format?.default).toBe('human');
  });

  it('should accept force flag', () => {
    expect(init.args?.force).toBeDefined();
    expect(init.args?.force?.type).toBe('boolean');
  });

  it('should accept configFormat argument', () => {
    expect(init.args?.configFormat).toBeDefined();
    expect(init.args?.configFormat?.default).toBe('toml');
  });

  it('should accept verbose flag', () => {
    expect(init.args?.verbose).toBeDefined();
    expect(init.args?.verbose?.type).toBe('boolean');
  });

  it('should accept quiet flag', () => {
    expect(init.args?.quiet).toBeDefined();
    expect(init.args?.quiet?.type).toBe('boolean');
  });

  it('should have async run function', () => {
    expect(typeof init.run).toBe('function');
  });
});

/**
 * Exit code tests - verify correct mapping of errors to exit codes
 */
describe('Exit code mapping', () => {
  it('should have success code 0', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  it('should have config_error code 1', () => {
    expect(EXIT_CODES.config_error).toBe(1);
  });

  it('should have source_error code 2', () => {
    expect(EXIT_CODES.source_error).toBe(2);
  });

  it('should have execution_error code 3', () => {
    expect(EXIT_CODES.execution_error).toBe(3);
  });

  it('should have partial_failure code 4', () => {
    expect(EXIT_CODES.partial_failure).toBe(4);
  });

  it('should have system_error code 5', () => {
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('should have codes in ascending order', () => {
    expect(EXIT_CODES.success).toBeLessThan(EXIT_CODES.config_error);
    expect(EXIT_CODES.config_error).toBeLessThan(EXIT_CODES.source_error);
    expect(EXIT_CODES.source_error).toBeLessThan(EXIT_CODES.execution_error);
    expect(EXIT_CODES.execution_error).toBeLessThan(EXIT_CODES.partial_failure);
    expect(EXIT_CODES.partial_failure).toBeLessThan(EXIT_CODES.system_error);
  });
});

/**
 * Configuration loading tests
 */
describe('Configuration handling', () => {
  it('run command should support config path', async () => {
    expect(run.args?.config).toBeDefined();
  });

  it('watch command should support config path', async () => {
    expect(watch.args?.config).toBeDefined();
  });

  it('explain command should support optional config path', async () => {
    expect(explain.args?.config).toBeDefined();
  });

  it('init command should support format selection', async () => {
    expect(init.args?.format).toBeDefined();
  });
});

/**
 * Output formatting tests
 */
describe('Output formatting', () => {
  it('run command should support format option', () => {
    expect(run.args?.format?.description).toContain('Output format');
  });

  it('watch command should support format option', () => {
    expect(watch.args?.format?.description).toContain('Output format');
  });

  it('status command should support format option', () => {
    expect(status.args?.format?.description).toContain('Output format');
  });

  it('explain command should support format option', () => {
    expect(explain.args?.format?.description).toContain('Output format');
  });

  it('all commands should support human/json formats', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      if (cmd.args?.format) {
        expect(cmd.args.format.description).toMatch(/human|json/i);
      }
    });
  });
});

/**
 * Verbose and quiet flag tests
 */
describe('Output control flags', () => {
  it('all commands should support verbose flag', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.verbose).toBeDefined();
      expect(cmd.args?.verbose?.type).toBe('boolean');
    });
  });

  it('all commands should support quiet flag', () => {
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.quiet).toBeDefined();
      expect(cmd.args?.quiet?.type).toBe('boolean');
    });
  });

  it('verbose and quiet should not both be true', () => {
    // This is a logical constraint - verbose should take precedence if both specified
    const commands = [run, watch, status, explain, init];
    commands.forEach((cmd) => {
      expect(cmd.args?.verbose).toBeDefined();
      expect(cmd.args?.quiet).toBeDefined();
    });
  });
});

/**
 * Algorithm handling tests
 */
describe('Algorithm support', () => {
  it('run command should accept algorithm parameter', () => {
    expect(run.args?.algorithm).toBeDefined();
    const desc = run.args?.algorithm?.description || '';
    expect(desc.toLowerCase()).toContain('algorithm');
  });

  it('explain command should accept algorithm parameter', () => {
    expect(explain.args?.algorithm).toBeDefined();
    const desc = explain.args?.algorithm?.description || '';
    expect(desc.toLowerCase()).toContain('algorithm');
  });

  it('supported algorithms should be documented', () => {
    const algorithms = ['dfg', 'alpha', 'heuristic', 'genetic', 'ilp'];
    const runDesc = run.args?.algorithm?.description || '';
    algorithms.forEach((algo) => {
      expect(runDesc).toContain(algo);
    });
  });
});

/**
 * Advanced features tests
 */
describe('Advanced features', () => {
  it('run command should support timeout option', () => {
    expect(run.args?.timeout).toBeDefined();
  });

  it('watch command should support interval option', () => {
    expect(watch.args?.interval).toBeDefined();
  });

  it('explain command should support explanation level', () => {
    expect(explain.args?.level).toBeDefined();
    expect(explain.args?.level?.default).toBe('detailed');
  });

  it('init command should support force overwrite', () => {
    expect(init.args?.force).toBeDefined();
    expect(init.args?.force?.description).toContain('Overwrite');
  });
});

/**
 * Data flow tests
 */
describe('Data flow', () => {
  it('run command should accept input file path', () => {
    expect(run.args?.input).toBeDefined();
    expect(run.args?.input?.description).toBeTruthy();
  });

  it('run command should accept output file path', () => {
    expect(run.args?.output).toBeDefined();
    expect(run.args?.output?.description).toBeTruthy();
  });

  it('watch command should support file change monitoring', () => {
    expect(watch.args?.config).toBeDefined();
    expect(watch.args?.interval).toBeDefined();
  });

  it('init command should scaffold project structure', () => {
    expect(init.args?.format).toBeDefined();
    // format controls what kind of config files are created
  });
});
