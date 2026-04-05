# How-To: Test Process Mining Workflows

**Time required**: 20 minutes  
**Difficulty**: Intermediate  

## Unit Tests

```javascript
// test/mining.test.js
const Wasm4pm = require('@wasm4pm/wasm4pm');
const assert = require('assert');

describe('Wasm4pm', () => {
  let pm;

  before(() => {
    pm = new Wasm4pm();
  });

  it('should discover DFG', async () => {
    const result = await pm.run({
      config: {
        discovery: { algorithm: 'dfg' },
        source: { type: 'file', path: 'test/data/sample.xes' }
      }
    });

    assert(result.status === 'success');
    assert(result.model.nodes.length > 0);
  });

  it('should be deterministic', async () => {
    const config = { /* ... */ };

    const result1 = await pm.run({ config });
    const result2 = await pm.run({ config });

    assert.equal(
      result1.hashes.combined_hash,
      result2.hashes.combined_hash
    );
  });

  it('should timeout gracefully', async () => {
    const result = await pm.run({
      config: {
        discovery: { algorithm: 'genetic', timeout_ms: 100 }
      }
    });

    assert(result.status === 'failed' || result.execution_time_ms <= 100);
  });
});
```

Run:

```bash
npm test
```

## Integration Tests

```javascript
// test/integration.test.js
describe('Full Pipeline', () => {
  it('should process file to output', async () => {
    const fs = require('fs');
    const result = await pm.run({
      config: {
        discovery: { algorithm: 'dfg' },
        source: { type: 'file', path: 'test/data/sample.xes' },
        sink: { type: 'file', directory: './test-output' }
      }
    });

    assert(fs.existsSync('./test-output/model.json'));
    assert(fs.existsSync('./test-output/receipt.json'));
  });
});
```

## End-to-End Tests

```bash
#!/bin/bash
# test/e2e.sh

set -e

echo "1. Validate config"
pmctl init --validate config.toml

echo "2. Run analysis"
pmctl run --config config.toml

echo "3. Check outputs"
test -f output/receipt.json
test -f output/model.json

echo "4. Verify determinism"
run1=$(jq -r '.hashes.combined_hash' output/receipt.json)
pmctl run --config config.toml
run2=$(jq -r '.hashes.combined_hash' output/receipt.json)
test "$run1" = "$run2"

echo "✓ All E2E tests passed"
```

Run:

```bash
chmod +x test/e2e.sh
./test/e2e.sh
```

## Compliance Tests

```bash
#!/bin/bash
# test/compliance.sh

echo "Testing compliance requirements..."

# 1. Receipt generation
pmctl run --config config.toml
test -f output/receipt.json || exit 1

# 2. Determinism
HASH1=$(jq -r '.hashes.combined_hash' output/receipt.json)
pmctl run --config config.toml
HASH2=$(jq -r '.hashes.combined_hash' output/receipt.json)
test "$HASH1" = "$HASH2" || exit 1

# 3. Error codes
pmctl run --config bad-config.toml
test $? -eq 1  # CONFIG_ERROR

# 4. Timeout handling
timeout 1 pmctl run --config timeout-config.toml
test $? -eq 124 || exit 1  # Timeout exit code

echo "✓ All compliance tests passed"
```

## Performance Tests

```bash
// test/perf.test.js
describe('Performance', () => {
  it('should complete DFG in <100ms for 100 events', async () => {
    const start = Date.now();
    await pm.run({
      config: {
        discovery: { algorithm: 'dfg' },
        source: { type: 'file', path: 'test/data/100-events.xes' }
      }
    });
    const duration = Date.now() - start;
    
    assert(duration < 100, `Took ${duration}ms`);
  });
});
```

## CI/CD Integration

Add to GitHub Actions:

```yaml
- run: npm test                    # Unit tests
- run: ./test/e2e.sh             # E2E tests
- run: ./test/compliance.sh       # Compliance
```

## Test Data

Create minimal test file:

```xml
<!-- test/data/minimal.xes -->
<?xml version="1.0"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T08:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T09:00:00Z"/>
    </event>
  </trace>
</log>
```

## See Also

- [Reference: Error Codes](../reference/error-codes.md)
- [Tutorial: Compliance Audit](../tutorials/compliance-audit.md)
