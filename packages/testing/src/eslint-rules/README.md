# ESLint Custom Rules for pictl

Rules in this directory provide Gemba enforcement for the pictl test suite.

## Rules

### `no-mocks-in-integration`

**Purpose:** Block mocks/stubs in integration tests (Gemba enforcement)

**ID:** `pictl-testing/no-mocks-in-integration`

**Type:** Problem (no auto-fix)

**Applies to:**
- Files matching `*.integration.test.ts`
- Files matching `*.e2e.test.ts`
- Files in `__tests__/integration/` directories

**Blocks:**
```typescript
vi.mock()                    // Module mocking
vi.stub()                    // Method stubbing
vi.stubGlobal()              // Global stubbing
vi.spyOn()                   // Spy functions
jest.mock()                  // Jest module mocking
jest.spyOn()                 // Jest spying
sinon.stub()                 // Sinon stubs
td.replace()                 // testdouble replacements

.mockImplementation()        // Mock implementation chains
.mockReturnValue()           // Mock return value chains
.mockResolvedValue()         // Mock resolved value chains
.mockRejectedValue()         // Mock rejected value chains
.returns()                   // Sinon return chains
```

**Exemptions:**
- Unit tests (`*.unit.test.ts`, `*.spec.ts`)
- Fixture/mock helper directories
- Files in `.eslintignore`

**Example Error:**
```
packages/observability/__tests__/fields.test.ts
  10:5  error  Mocks not allowed in integration tests. 
               Integration tests must use real implementations. 
               Move to a unit test (*.unit.test.ts or *.spec.ts) or use real APIs.
               pictl-testing/no-mocks-in-integration
```

## Adding New Rules

To add a new rule:

1. Create rule file in this directory
   ```
   no-my-rule.js
   ```

2. Implement following ESLint rule format
   ```javascript
   module.exports = {
     meta: {
       type: 'problem|suggestion|layout',
       docs: { description: '...', category: '...', recommended: 'error' },
       fixable: 'code|whitespace|null',
       schema: [],
     },
     create(context) {
       return { /* visitor patterns */ };
     },
   };
   ```

3. Export from `index.js`
   ```javascript
   module.exports = {
     'no-mocks-in-integration': require('./no-mocks-in-integration.js'),
     'my-new-rule': require('./no-my-rule.js'),
   };
   ```

4. Register in `.eslintrc.cjs`
   ```javascript
   plugins: ['pictl-testing'],
   rules: {
     'pictl-testing/no-mocks-in-integration': 'error',
     'pictl-testing/my-new-rule': 'error',
   }
   ```

5. Document in this file and `packages/testing/GEMBA.md`

## Testing Rules

To test a rule, use `eslint` directly:

```bash
# Test rule on a file
npx eslint --no-eslintrc --config .eslintrc.cjs \
  packages/observability/__tests__/fields.test.ts

# Should report violations if mocks found
```

## References

- [ESLint Rule Format](https://eslint.org/docs/developers/rule-structure)
- [ESLint Visitor Pattern](https://eslint.org/docs/developers/working-with-rules)
- [pictl GEMBA.md](../GEMBA.md)
