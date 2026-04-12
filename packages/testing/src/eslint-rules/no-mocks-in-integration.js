/**
 * ESLint Rule: no-mocks-in-integration
 * Gemba Enforcement: Block mock/stub usage in integration tests
 *
 * Prevents "happy path test syndrome" where tests pass in sandbox but fail in production.
 * Integration tests must use real WASM, real APIs, real databases.
 *
 * Blocks:
 * - vi.mock(), vi.stub(), vi.spyOn().mockImplementation()
 * - jest.mock(), jest.spyOn().mockImplementation()
 * - sinon.stub(), sinon.spy().restore()
 * - td.replace() (testdouble)
 *
 * Only applies to: **\/*.integration.test.ts, **\/*.e2e.test.ts
 * Unit tests can use mocks: **\/*.unit.test.ts, **\/*.spec.ts
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block mocks/stubs in integration tests to enforce Gemba (test on real system)',
      category: 'Testing',
      recommended: 'error',
    },
    fixable: null,
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Only enforce in integration/e2e tests
    const isIntegrationTest = filename.includes('.integration.test.ts') ||
                             filename.includes('.e2e.test.ts') ||
                             filename.includes('__tests__/integration/');

    if (!isIntegrationTest) {
      return {}; // No enforcement for unit tests
    }

    return {
      // vi.mock('...')
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'vi' &&
          node.callee.property.name === 'mock'
        ) {
          context.report({
            node,
            message: `Mocks not allowed in integration tests. Integration tests must use real implementations. Move to a unit test (*.unit.test.ts or *.spec.ts) or use real APIs.`,
          });
        }

        // vi.stub(...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'vi' &&
          node.callee.property.name === 'stub'
        ) {
          context.report({
            node,
            message: `Stubs not allowed in integration tests. Use real implementations for integration testing per Gemba principle.`,
          });
        }

        // jest.mock(...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'jest' &&
          node.callee.property.name === 'mock'
        ) {
          context.report({
            node,
            message: `Jest mocks not allowed in integration tests. Integration tests must use real WASM/APIs per Gemba enforcement.`,
          });
        }

        // jest.spyOn(...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'jest' &&
          node.callee.property.name === 'spyOn'
        ) {
          context.report({
            node,
            message: `Jest spyOn not allowed in integration tests. Use real implementations for integration testing.`,
          });
        }

        // sinon.stub(...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'sinon' &&
          node.callee.property.name === 'stub'
        ) {
          context.report({
            node,
            message: `Sinon stubs not allowed in integration tests. Gemba requires testing against real systems.`,
          });
        }

        // td.replace(...) — testdouble
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'td' &&
          node.callee.property.name === 'replace'
        ) {
          context.report({
            node,
            message: `TestDouble replacements not allowed in integration tests. Use real implementations per Gemba principle.`,
          });
        }
      },

      // .mockImplementation(...), .mockReturnValue(...), .returns(...)
      MemberExpression(node) {
        if (!node.parent || node.parent.type !== 'CallExpression') return;

        const propName = node.property.name;

        // Detect mock methods: mockImplementation, mockReturnValue, mockResolvedValue
        const mockMethods = [
          'mockImplementation',
          'mockReturnValue',
          'mockResolvedValue',
          'mockRejectedValue',
          'mockClear',
          'mockReset',
          'mockRestore',
        ];

        if (mockMethods.includes(propName)) {
          context.report({
            node,
            message: `Mock chain "${propName}" not allowed in integration tests. Integration tests must use real implementations.`,
          });
        }

        // .returns(...) — sinon pattern
        if (propName === 'returns' && node.object.callee?.object?.name === 'sinon') {
          context.report({
            node,
            message: `Sinon .returns() not allowed in integration tests. Use real implementations per Gemba enforcement.`,
          });
        }
      },

      // vi.stubGlobal(...)
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'vi' &&
          node.callee.property.name === 'stubGlobal'
        ) {
          context.report({
            node,
            message: `Global stubs not allowed in integration tests. Integration tests must use real fetch/APIs per Gemba principle.`,
          });
        }
      },
    };
  },
};
