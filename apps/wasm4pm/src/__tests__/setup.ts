import { expect } from 'vitest';

expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of [${expected.join(', ')}]`
          : `expected ${received} to be one of [${expected.join(', ')}]`,
    };
  },
});
