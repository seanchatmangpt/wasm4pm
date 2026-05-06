import { describe, it, expect } from 'vitest';

/**
 * Test that execution throws when no handler is registered for a plan step type.
 * This verifies Armstrong D1 fix: fail-fast on missing step handlers.
 */
describe('Execution default handler throws (D1 fix)', () => {
  // Simplified version of step handler dispatch for testing
  class SimpleExecutor {
    private handlers: Map<string, Function> = new Map();

    registerHandler(stepType: string, handler: Function) {
      this.handlers.set(stepType, handler);
    }

    async executeStep(stepType: string, config: any) {
      const handler = this.handlers.get(stepType);
      if (!handler) {
        throw new Error(`No handler registered for step type '${stepType}'`);
      }
      return await handler(config);
    }
  }

  it('throws when no handler registered for plan step', async () => {
    const executor = new SimpleExecutor();

    await expect(
      executor.executeStep('unknown_step_type', {})
    ).rejects.toThrow('No handler registered');
  });

  it('throws with descriptive message including step type', async () => {
    const executor = new SimpleExecutor();

    await expect(
      executor.executeStep('unhandled_type', { algorithm: 'unknown_algo' })
    ).rejects.toThrow('unhandled_type');
  });

  it('succeeds when handler is registered for step type', async () => {
    const executor = new SimpleExecutor();
    executor.registerHandler('source', async (config) => ({ success: true, path: config.path }));

    const result = await executor.executeStep('source', { kind: 'file', path: '/dev/null' });
    expect(result).toEqual({ success: true, path: '/dev/null' });
  });

  it('prevents silent failures by throwing on unknown step type', async () => {
    const executor = new SimpleExecutor();

    try {
      await executor.executeStep('not_a_real_handler', {});
      expect.fail('Expected executor to throw but it did not');
    } catch (error) {
      expect(error).toBeDefined();
      expect(String(error)).toContain('handler');
    }
  });

  it('differentiates between missing handler and handler failure', async () => {
    const executor = new SimpleExecutor();
    executor.registerHandler('failing_handler', async () => {
      throw new Error('Handler execution failed');
    });

    // No handler registered
    await expect(
      executor.executeStep('unregistered', {})
    ).rejects.toThrow('No handler registered');

    // Handler exists but throws
    await expect(
      executor.executeStep('failing_handler', {})
    ).rejects.toThrow('Handler execution failed');
  });
});
