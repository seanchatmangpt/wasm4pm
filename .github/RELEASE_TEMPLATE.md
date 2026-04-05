# Release Notes Template - v26.4.5

> This is a template for creating release notes. Copy and customize for each release.

## Overview

Brief description of the release scope and major accomplishments.

## What's New

### Features
- Feature 1 description
- Feature 2 description
- Feature 3 description

### Bug Fixes
- Bug 1 fix description
- Bug 2 fix description

### Performance Improvements
- Performance improvement 1
- Performance improvement 2

### Documentation
- Documentation addition 1
- Documentation addition 2

## Breaking Changes

None for v26.4.x → v26.4.y

## Migration Guide

If upgrading from v26.3.x, no changes needed. API is backward compatible.

## Installation

### npm
```bash
npm install wasm4pm@26.4.5
```

### Yarn
```bash
yarn add wasm4pm@26.4.5
```

### pnpm
```bash
pnpm add wasm4pm@26.4.5
```

## Build Information

### WASM Targets
- **bundler** - ES modules (Node.js + bundlers)
- **nodejs** - CommonJS (Node.js runtime)
- **web** - Browser-optimized

### Optimization Flags
```
RUSTFLAGS: -C target-feature=+simd128
wasm-opt: -O3 --enable-simd
```

### Platform Support
| Platform | Version | Status |
|----------|---------|--------|
| Node.js | 14.0.0+ | ✓ Supported |
| Chrome | 57+ | ✓ Supported |
| Firefox | 52+ | ✓ Supported |
| Safari | 11+ | ✓ Supported |
| Edge | 79+ | ✓ Supported |

## Test Results

- **Unit Tests:** 800+ tests, 100% pass
- **Integration Tests:** 50+ tests, 100% pass
- **Browser Tests:** All major browsers, 100% pass
- **Code Coverage:** 75% (threshold: 70%)
- **Performance:** Linear O(n) scaling verified

## Quality Gates

All release gates passed:
- ✓ Tests: 800+ tests passed
- ✓ Coverage: 75% (threshold: 70%)
- ✓ TypeScript: No errors
- ✓ Rust: No clippy warnings
- ✓ Formatting: All code formatted
- ✓ Security: cargo audit clean
- ✓ Parity: explain() == run()
- ✓ OTEL: Observability verified
- ✓ SBOM: Generated and signed

## Known Issues

### None in this release
- Previous issues have been resolved

## Commits

Total commits in this release: **X**

See detailed commit history: [compare view](https://github.com/seanchatmangpt/wasm4pm/compare/v26.4.4...v26.4.5)

## Contributors

- Contributor 1
- Contributor 2
- ... (full list in git log)

## Checksums

SHA256 checksums for WASM artifacts:

```
[Generated from wasm4pm-checksums.txt]
```

## Verification

To verify the release:

```bash
# Check package version
npm info wasm4pm@26.4.5

# Verify WASM module
npm install wasm4pm@26.4.5
node -e "const w = require('wasm4pm'); console.log(Object.keys(w).slice(0,10))"

# Run tests locally
git clone https://github.com/seanchatmangpt/wasm4pm.git
cd wasm4pm && npm install && npm test
```

## Release Assets

- `wasm4pm-26.4.5.tgz` - npm package
- `wasm4pm-checksums.txt` - SHA256 checksums
- `SBOM_26.4.5.json` - CycloneDX SBOM
- `documentation.tar.gz` - TypeScript + Rust docs

## Related Documentation

- [README](../README.md) - Project overview
- [API Reference](../docs/API.md) - Complete API documentation
- [Algorithm Guide](../docs/ALGORITHMS.md) - Algorithm descriptions
- [Quickstart Guide](../docs/QUICKSTART.md) - 5-minute setup
- [FAQ](../docs/FAQ.md) - Frequently asked questions

## Support

Need help? Check out:
- [GitHub Issues](https://github.com/seanchatmangpt/wasm4pm/issues)
- [GitHub Discussions](https://github.com/seanchatmangpt/wasm4pm/discussions)
- [Documentation](https://github.com/seanchatmangpt/wasm4pm)

## License

MIT OR Apache-2.0

---

**Release Date:** 2026-04-04  
**Build Date:** [Generated at publish time]  
**Git Commit:** [Commit SHA at tag creation]  
**Build Number:** [CI Build ID]

Thank you for using wasm4pm! ❤️
