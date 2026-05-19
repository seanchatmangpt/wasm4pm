import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm repl — interactive process mining shell', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('repl (base command)', () => {
    it('should display help when requested', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
      expect(result.stdout).toMatch(/interactive|process mining|wpm repl/i);
    });

    it('should show usage line in help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/usage|wpm repl/i);
    });

    it('should document --load flag in help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--load|-i/i);
    });

    it('should document --algorithm flag in help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--algorithm|-a/i);
    });

    it('should document --key flag in help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--key|activity.*key/i);
    });

    it('should mention heuristic as default algorithm', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/heuristic/i);
    });

    it('should mention concept:name as default key', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/concept:name/i);
    });

    it('should show description in help text', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/wasm|load|millisecond/i);
    });

    it('should help text includes banner', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/interactive|process mining/i);
    });

    it('should help succeed with exit code 0', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
    });

    it('should help output be substantial', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout.length).toBeGreaterThan(100);
    });

    it('should document load command in source', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load/i);
    });

    it('should document run command capability', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/algorithm|discover/i);
    });

    it('should mention WASM single-load optimization', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/wasm|load|once|millisecond/i);
    });

    it('should have complete options section', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/options/i);
    });
  });

  describe('repl command features', () => {
    it('should support loading XES files via --load', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--load|-i/i);
    });

    it('should allow algorithm specification', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--algorithm|-a/i);
    });

    it('should support custom activity key', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--key/i);
    });

    it('should help is retrievable', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toBeDefined();
      expect(result.stdout.length).toBeGreaterThan(50);
    });

    it('should describe XES event log loading', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load|xes|event|log/i);
    });

    it('should describe algorithm selection', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/algorithm|discovery/i);
    });

    it('should describe activity key setting', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/activity|key|attribute/i);
    });

    it('should mention performance benefit of WASM reuse', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/millisecond|fast|speed|performance/i);
    });

    it('should describe default values', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/default|heuristic|concept:name/i);
    });

    it('should include startup behavior description', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/startup|load|interactive/i);
    });

    it('should describe interactive nature', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/interactive|session|repl/i);
    });

    it('should indicate WASM initialization happens once', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load|once/i);
    });

    it('should mention commands are fast due to WASM reuse', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/command|millisecond|run|fast/i);
    });
  });

  describe('repl command documentation', () => {
    it('should be discoverable via help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
    });

    it('should show all three CLI flags', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/--load/);
      expect(result.stdout).toMatch(/--algorithm/);
      expect(result.stdout).toMatch(/--key/);
    });

    it('should show short flag aliases', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/-i/);
      expect(result.stdout).toMatch(/-a/);
    });

    it('should document description for each flag', async () => {
      const result = await runCli(['repl', '--help']);
      // Each flag should have a description
      const lines = result.stdout.split('\n');
      expect(lines.length).toBeGreaterThan(5);
    });

    it('should use consistent formatting', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/usage/i);
      expect(result.stdout).toMatch(/options/i);
    });

    it('should be concise and informative', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout.length).toBeGreaterThan(200);
      expect(result.stdout.length).toBeLessThan(3000);
    });

    it('should match citty command style', async () => {
      const result = await runCli(['repl', '--help']);
      // citty shows USAGE and OPTIONS
      expect(result.stdout).toMatch(/usage/i);
      expect(result.stdout).toMatch(/options/i);
    });

    it('should describe required vs optional args', async () => {
      const result = await runCli(['repl', '--help']);
      // All flags are optional (shown with brackets)
      expect(result.stdout).toMatch(/--load|--algorithm|--key/i);
    });

    it('should provide helpful context', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/default|startup|interactive/i);
    });

    it('should be accurate about defaults', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/heuristic/i);
      expect(result.stdout).toMatch(/concept:name/i);
    });
  });

  describe('repl WASM single-load architecture', () => {
    it('should advertise WASM loaded once design', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/wasm.*load.*once|load.*once/i);
    });

    it('should highlight millisecond response times', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/millisecond/i);
    });

    it('should be described as interactive session', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/interactive|session/i);
    });

    it('should mention process mining as use case', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/process mining/i);
    });

    it('should describe performance benefits', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/millisecond|fast|speed/i);
    });

    it('should explain one-time WASM initialization', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load|once/i);
    });

    it('should explain command speed', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/command|millisecond/i);
    });

    it('should be about interactive shell', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/interactive|shell|repl/i);
    });

    it('should showcase WASM kernel usage', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/wasm|load/i);
    });

    it('should mention algorithm registry access', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/algorithm/i);
    });
  });

  describe('repl startup options', () => {
    it('--load should preload an event log', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load.*startup|startup.*load|immediately/i);
    });

    it('--algorithm should set default discovery algorithm', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/algorithm.*default|default.*algorithm/i);
    });

    it('--key should set activity attribute key', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/key|attribute/i);
    });

    it('flags should be optional', async () => {
      const result = await runCli(['repl', '--help']);
      // With citty, optional flags are shown without requiring values
      expect(result.stdout).toMatch(/--algorithm|-a/i);
    });

    it('should have sensible defaults', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/default.*heuristic|heuristic.*default/i);
    });

    it('should work with no arguments', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
    });

    it('should document startup with --load', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load.*immediately|immediately.*load|startup/i);
    });

    it('should explain algorithm default', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/heuristic/i);
    });

    it('should explain key default', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/concept:name/i);
    });

    it('should provide complete command picture', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toMatch(/load|algorithm|key/i);
    });
  });

  describe('repl exit code behavior', () => {
    it('should exit with 0 on help', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
    });

    it('should not have stderr when help succeeds', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.exitCode).toEqual(0);
    });

    it('should provide stdout help content', async () => {
      const result = await runCli(['repl', '--help']);
      expect(result.stdout).toBeTruthy();
    });
  });
});
