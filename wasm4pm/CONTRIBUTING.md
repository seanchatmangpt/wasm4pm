# Contributing to process_mining_wasm

Thank you for your interest in contributing! This document provides guidelines for contributing to the WASM bindings of wasm4pm.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Making Changes](#making-changes)
5. [Testing](#testing)
6. [Documentation](#documentation)
7. [Submitting Changes](#submitting-changes)

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## Getting Started

### Prerequisites

- Rust 1.70+ with wasm32 target
- Node.js 14+
- npm or yarn
- git

### Fork and Clone

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/your-username/wasm4pm.git
cd wasm4pm

# Add upstream remote
git remote add upstream https://github.com/seanchatmangpt/wasm4pm.git
```

## Development Setup

### Install Dependencies

```bash
# Install Rust WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf | sh

# Install Node.js dependencies
npm install
```

### Verify Setup

```bash
npm run build
npm test
npm run lint
```

## Making Changes

### Understand the Codebase

The WASM module consists of:

1. **Rust bindings** (`src/lib.rs`):
   - Functions decorated with `#[wasm_bindgen]`
   - Handle wrapping/unwrapping
   - Error conversion

2. **JavaScript glue code** (auto-generated):
   - Type marshalling
   - Memory management

3. **Tests** (`__tests__/`):
   - Unit tests (vitest)
   - Integration tests (Node.js)

4. **Documentation**:
   - API.md - Function reference
   - ARCHITECTURE.md - Design details
   - GETTING_STARTED.md - Usage guide

### Adding a New Function

#### 1. Implement in Rust (`src/lib.rs`)

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn my_new_function(handle: String, param: f64) -> String {
    // Get object from store
    let obj = get_object(&handle)?;

    // Process
    let result = obj.do_something(param)?;

    // Store result
    let result_handle = store_object(result);

    // Return handle or JSON
    Ok(result_handle)
}
```

#### 2. Add Type Definition

```typescript
// pkg/process_mining_wasm.d.ts (auto-generated after build)
export function my_new_function(handle: string, param: number): string;
```

#### 3. Write Tests

```typescript
// __tests__/my_new_function.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('my_new_function', () => {
  it('should work correctly', () => {
    // Test code
  });
});
```

#### 4. Document

Add documentation to API.md and GETTING_STARTED.md with examples.

### Code Style

- **Rust**: Follow Rust conventions
  - Use `cargo fmt` before committing
  - Check with `cargo clippy`
  - Add doc comments to public functions

- **JavaScript/TypeScript**:
  - Format with prettier: `npm run format`
  - Check with TypeScript: `npm run type:check`
  - Follow existing patterns

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add new discovery algorithm support
fix: Handle edge case in OCEL parsing
docs: Update API reference for new functions
refactor: Simplify memory management
test: Add tests for OCEL statistics
```

Format: `<type>: <subject>`

Types: feat, fix, docs, refactor, test, chore

## Testing

### Run All Tests

```bash
npm test
```

### Unit Tests Only

```bash
npm run test:unit
```

Watch mode (auto-rerun on changes):

```bash
npm run test:unit:watch
```

### Integration Tests

```bash
npm run test:integration
```

### Write Tests

1. Add test files in `__tests__/`:
   - Unit tests: `feature.test.ts`
   - Integration: `integration.test.js`

2. Include test data in `__tests__/data/`

3. Run tests before submitting:

```bash
npm test
npm run lint
npm run type:check
```

### Performance Testing

For algorithms, include performance notes:

```javascript
// Expected: < 100ms for logs with < 1K events
const startTime = performance.now();
const result = pm.discover_dfg(logHandle);
console.log(`Took ${performance.now() - startTime}ms`);
```

## Documentation

### Update API Reference

Edit `API.md` when adding or modifying functions:

````markdown
### function_name(param1, param2)

Brief description.

**Parameters:**

- `param1` (type): Description

**Returns:** type - Description

**Example:**

```javascript
const result = function_name(arg1, arg2);
```
````

````

### Update Getting Started

Add examples to `GETTING_STARTED.md` in relevant sections:
- Quick Start
- Common Workflows
- Advanced Features

### Architecture Documentation

Update `ARCHITECTURE.md` for significant design changes:
- Component changes
- Data flow modifications
- New subsystems

## Submitting Changes

### Pre-submission Checklist

- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Code is formatted
- [ ] Documentation is updated
- [ ] Commit messages are clear

### Create Pull Request

1. **Push to your fork**:

```bash
git push origin my-feature-branch
````

2. **Create PR on GitHub**:
   - Title: Clear, concise description
   - Description: What, why, how
   - Link related issues
   - Add screenshots/examples if relevant

3. **Example PR Description**:

```markdown
## Description

Adds support for discovering DECLARE constraints from event logs.

## Changes

- Implement `discover_declare()` function in Rust
- Add integration tests
- Update API documentation
- Add usage example to GETTING_STARTED.md

## Testing

- Unit tests pass locally
- Tested with sample XES files
- No performance regressions

Closes #123
```

### Review Process

- Code review by maintainers
- CI checks must pass
- Tests must be comprehensive
- Documentation must be updated

### Common Feedback

- **Missing tests**: Add unit/integration tests
- **Undocumented**: Add doc comments and update guides
- **Performance**: Benchmark and optimize critical paths
- **Style**: Run formatters and linters
- **Type safety**: Ensure TypeScript strict mode passes

## Questions?

- Check existing issues/discussions
- Review similar code in codebase
- Ask in GitHub Discussions
- Open an issue with questions tag

## Releases

Maintainers handle releases using:

```bash
./publish.sh major|minor|patch
```

This:

- Bumps version
- Runs all checks
- Creates git tag
- Publishes to npm

## Recognition

Contributors are recognized in:

- GitHub Contributors page
- Release notes
- Changelog

Thank you for contributing to wasm4pm!
