# Development Quick Reference

Fast reference for common development tasks in process_mining_wasm.

## Project Layout

```
process_mining_wasm/
├── src/                    # Rust source code
│   └── lib.rs             # Main WASM bindings
├── pkg/                   # Built WASM (bundler)
├── pkg-nodejs/            # Built WASM (Node.js)
├── pkg-web/               # Built WASM (browser)
├── __tests__/             # Test files
│   ├── basic.test.ts      # Unit tests
│   ├── integration.test.js # Integration tests
│   └── data/              # Test data files
├── examples/              # Usage examples
│   ├── nodejs.js          # Node.js example
│   └── browser.html       # Browser example
├── Cargo.toml             # Rust config
├── package.json           # Node.js config
├── tsconfig.json          # TypeScript config
├── vitest.config.ts       # Test config
├── .prettierrc             # Code formatting
├── build.sh               # Build script
├── test.sh                # Test script
├── publish.sh             # Publish script
├── README.md              # Project overview
├── GETTING_STARTED.md     # Quick start
├── API.md                 # API reference
├── ARCHITECTURE.md        # Design guide
├── CONTRIBUTING.md        # Contribution guide
└── DEVELOPMENT.md         # This file
```

## Quick Commands

### Building

```bash
# Build default (bundler target)
npm run build

# Build all targets
npm run build:all

# Build specific targets
npm run build:nodejs
npm run build:web

# Using build script
./build.sh
```

### Testing

```bash
# All tests
npm test

# Unit tests
npm run test:unit

# Watch mode
npm run test:unit:watch

# Integration tests
npm run test:integration

# Browser tests
npm run test:browser

# Using test script
./test.sh              # All tests
./test.sh --unit-only  # Unit only
./test.sh --watch      # Watch mode
./test.sh --all        # Include browser tests
```

### Code Quality

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Type checking
npm run type:check

# All checks
npm run lint

# Generate docs
npm run docs
```

### Publishing

```bash
./publish.sh patch
./publish.sh minor
./publish.sh major
```

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

Edit Rust code in `src/lib.rs`:

```rust
#[wasm_bindgen]
pub fn my_function(param: String) -> String {
    // Implementation
}
```

### 3. Build and Test

```bash
npm run build
npm run test
npm run lint
```

### 4. Fix Issues

```bash
npm run format
npm run type:check
```

### 5. Commit Changes

```bash
git add .
git commit -m "feat: Add my function"
```

### 6. Push and Create PR

```bash
git push origin feature/my-feature
```

## Adding New Code

### New WASM Function

**File:** `src/lib.rs`

```rust
#[wasm_bindgen]
pub fn discover_new_algorithm(handle: String, threshold: f64) -> String {
    match get_object::<EventLog>(&handle) {
        Some(log) => {
            // Implement algorithm
            let result = log.discover(threshold);
            
            // Store and return
            store_object(result)
        }
        None => error!("Object not found")
    }
}
```

### New Test

**File:** `__tests__/new-feature.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('new feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

### New Documentation

Add section to relevant document:
- `API.md` - Function reference
- `GETTING_STARTED.md` - Usage examples
- `ARCHITECTURE.md` - Design details

## Environment Setup

### First Time Setup

```bash
# Install Rust target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf | sh

# Clone and setup
git clone https://github.com/aarkue/rust4pm.git
cd rust4pm/process_mining_wasm
npm install

# Verify
npm run build
npm test
```

### System Requirements

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.70+ | https://rustup.rs/ |
| Node.js | 14+ | https://nodejs.org/ |
| wasm-pack | Latest | `curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf \| sh` |

## Debugging

### Rust Debugging

```bash
# Build with debug info
RUSTFLAGS="-g" wasm-pack build --target bundler

# Use debugger in browser DevTools
```

### JavaScript Debugging

```bash
# Run tests with output
npm run test:unit -- --reporter=verbose

# Debug specific test
npm run test:unit -- __tests__/my.test.ts

# Watch mode for debugging
npm run test:unit:watch
```

### Memory Issues

```javascript
const pm = require('process_mining_wasm');

// Check object count
console.log(pm.object_count());

// Clean up
pm.delete_object(handle);
pm.clear_all_objects();

// Check again
console.log(pm.object_count());
```

## Performance Optimization

### Profiling

```javascript
// Time a function
const start = performance.now();
const result = pm.discover_dfg(handle);
const end = performance.now();
console.log(`Took ${end - start}ms`);
```

### Build Optimization

```bash
# Current (in Cargo.toml [profile.release])
# opt-level = "z"  # Size optimization
# lto = true       # Link-time optimization

# For different optimization
# opt-level = 3    # Speed optimization (larger binary)
```

## Common Issues

### Build Fails

```bash
# Clean build
rm -rf pkg target node_modules
npm install
npm run build
```

### Tests Fail

```bash
# Ensure WASM is built
npm run build

# Run specific test
npm run test:unit -- __tests__/failing.test.ts

# Check dependencies
npm install
npm audit fix
```

### Type Errors

```bash
# Check TypeScript
npm run type:check

# Generate definitions
npm run build
```

## File Modification Checklist

When modifying files:

| File | Why | Check |
|------|-----|-------|
| `src/lib.rs` | Add function | Build, test, doc |
| `__tests__/*.test.*` | Add test | npm test |
| `API.md` | Update API | Syntax, examples |
| `GETTING_STARTED.md` | Update guide | Accuracy |
| `package.json` | Update deps | `npm install` |
| `Cargo.toml` | Update deps | `cargo build` |

## Git Workflow

```bash
# Create branch
git checkout -b feature/name

# Make changes
# ... edit files ...

# Stage changes
git add .

# Commit
git commit -m "feat: description"

# Push
git push origin feature/name

# Create PR on GitHub
```

## Continuous Integration

GitHub Actions runs on every push:
- Builds on Linux, macOS, Windows
- Tests on Node 18 and 20
- Checks formatting
- Type checking
- Generates documentation

See `.github/workflows/wasm-build.yml`

## Resource Limits

- Maximum bundle size: Monitor with `wasm-opt`
- Memory per object: Varies by data
- Maximum objects: Limited by available memory
- Timeout for tests: 30 seconds

## Getting Help

1. Check existing issues
2. Review ARCHITECTURE.md
3. Look at examples/
4. Check CONTRIBUTING.md
5. Ask in GitHub Discussions

## Important Files

| File | Purpose |
|------|---------|
| `src/lib.rs` | WASM function implementations |
| `package.json` | NPM dependencies and scripts |
| `Cargo.toml` | Rust dependencies |
| `__tests__/` | Test suite |
| `API.md` | Function documentation |
| `GETTING_STARTED.md` | Usage guide |
| `ARCHITECTURE.md` | Design documentation |

## Build Artifacts

Generated during build:
- `pkg/process_mining_wasm.wasm` - Compiled WASM
- `pkg/process_mining_wasm.js` - JavaScript glue
- `pkg/process_mining_wasm.d.ts` - TypeScript definitions

## Next Steps

After changes:
1. `npm test` - Ensure tests pass
2. `npm run lint` - Check code quality
3. `npm run build:all` - Build all targets
4. `git push` - Push to GitHub
5. Create Pull Request

## Documentation Standards

All code should have:
- JSDoc/TSDoc comments
- Example usage
- Parameter descriptions
- Return type descriptions
- Error handling documented
