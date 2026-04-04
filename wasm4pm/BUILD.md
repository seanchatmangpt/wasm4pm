# Building and Publishing wasm4pm

Complete guide for building, testing, and publishing the wasm4pm npm package.

## Prerequisites

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Install Node.js build tools
npm install -g npm@latest
```

## Building the WASM Module

### Build for All Targets

```bash
npm run build:all
```

This generates three distribution types:

1. **Bundler** (default) - For webpack, rollup, parcel
   ```bash
   npm run build
   ```

2. **Web** - For direct browser `<script>` tags
   ```bash
   npm run build:web
   ```

3. **Node.js** - For Node.js CommonJS
   ```bash
   npm run build:nodejs
   ```

### Output Structure

```
pkg/
├── wasm4pm.d.ts           # TypeScript type definitions
├── wasm4pm.js             # JavaScript wrapper
├── wasm4pm_bg.js          # WASM module loader
├── wasm4pm_bg.wasm        # Compiled WASM binary
├── package.json           # Package metadata
└── README.md              # Package documentation
```

## Running Tests

### Unit Tests

```bash
# Run once
npm run test:unit

# Watch mode for development
npm run test:unit:watch
```

### Integration Tests

```bash
npm run test:integration
```

### Browser Tests

```bash
npm run test:browser
```

### All Tests

```bash
npm test
```

## Performance Benchmarks

Run benchmarks to validate performance:

```bash
npm run bench
```

Expected results:
- DFG discovery (1000 cases): ~27ms
- Alpha++ (1000 cases): ~50ms
- Bundle size: ~600KB (180KB gzipped)

## Type Checking

```bash
npm run type:check
```

Validates TypeScript definitions and client library.

## Code Formatting

### Format Code

```bash
npm run format
```

### Check Formatting

```bash
npm run format:check
```

## Generate Documentation

```bash
npm run docs
```

Generates TypeDoc documentation in `docs/` folder.

## Publishing to npm

### Pre-Publication Checklist

- [ ] Update version in package.json (semantic versioning)
- [ ] Update CHANGELOG.md
- [ ] Run full test suite: `npm test`
- [ ] Build all targets: `npm run build:all`
- [ ] Check bundle size: `wasm-pack build --release`
- [ ] Type check: `npm run type:check`

### Configure NPM Credentials

```bash
npm login
# Enter your npm username and password
```

### Publish

```bash
# Dry run to verify
npm publish --dry-run

# Actual publish
npm publish
```

Or use wasm-pack's publish shortcut:

```bash
wasm-pack publish
```

### Publish Specific Version

```bash
npm publish --tag beta      # Beta release
npm publish --tag next      # Next version
npm publish                 # Latest (default)
```

## Local Testing Before Publish

### Test Installation Locally

```bash
# Create a test directory
mkdir test-wasm4pm
cd test-wasm4pm

# Install from local tarball
npm install ../process_mining_wasm

# Test it works
node -e "const w = require('wasm4pm'); console.log('Loaded:', w)"
```

### Test in Browser

```bash
# Build for web
npm run build:web

# Serve using any HTTP server
npx http-server

# Open test HTML file in browser
```

## Troubleshooting

### "wasm-pack not found"

```bash
cargo install wasm-pack
```

### WASM module not initializing

- Check browser console for errors
- Ensure WASM file is served with correct MIME type
- Verify all dependencies are installed: `npm install`

### TypeScript compilation errors

```bash
npm run type:check
# Fix any reported issues
```

### Performance degradation

Profile with DevTools:
1. Open Chrome DevTools → Performance
2. Record while running algorithms
3. Look for bottlenecks in WASM execution

## Continuous Integration

GitHub Actions workflow builds and tests automatically on push:

```yaml
# .github/workflows/build.yml
- Run: npm run build:all
- Run: npm test
- Run: npm run type:check
```

## Development Workflow

1. Make changes to Rust code
2. Run `cargo check --target wasm32-unknown-unknown`
3. Build: `npm run build`
4. Test: `npm test`
5. If tests pass, commit and push
6. CI automatically validates on merge

## Advanced Options

### Optimization Levels

Release builds with maximum optimization:

```bash
npm run build -- --release
```

Profile-guided optimization (slower build, faster runtime):

```bash
RUSTFLAGS="-C llvm-args=-pgo-warn-missing-function" wasm-pack build
```

### Custom Build Directory

```bash
wasm-pack build --out-dir custom-pkg
```

### Bundler Configuration

The package uses standard wasm-pack exports, compatible with all bundlers:

- Webpack 4+
- Rollup 2+
- Parcel 2+
- Vite
- Next.js
- Remix

## Maintenance

### Updating Dependencies

```bash
cargo update
npm update
```

### Checking for Vulnerabilities

```bash
cargo audit
npm audit
```

### Version Strategy

- **Patch** (0.5.4 → 0.5.5): Bug fixes, minor improvements
- **Minor** (0.5.4 → 0.6.0): New features, backward compatible
- **Major** (0.5.4 → 1.0.0): Breaking changes

## Support

For build issues:
- Check wasm-pack documentation: https://rustwasm.github.io/docs/wasm-pack/
- Check npm documentation: https://docs.npmjs.com/
- File issues on GitHub: https://github.com/seanchatmangpt/wasm4pm/issues

---

**Last Updated**: 2026-04-04  
**WASM Pack Version**: 1.3.4+  
**Node.js**: 14.0.0+
