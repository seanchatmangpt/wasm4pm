# GitHub Actions Implementation - Quick Navigation

Complete GitHub Actions CI/CD pipeline for wasm4pm v26.4.5

## Start Here

**New to this implementation?** Start with:
→ [QUICK_START.md](./QUICK_START.md) (5-minute reference)

## Key Documentation

| Document | Purpose | Best For |
|----------|---------|----------|
| **[QUICK_START.md](./QUICK_START.md)** | Quick reference | Fast answers, common tasks |
| **[WORKFLOWS.md](./WORKFLOWS.md)** | Complete reference | Understanding how everything works |
| **[scripts/README.md](./scripts/README.md)** | Script documentation | Understanding individual scripts |
| **[RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)** | Release notes | Publishing releases |
| **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** | Technical details | Implementation overview |

## Workflows

### 1. Testing
**File:** `.github/workflows/test.yml`

Runs on every commit to main/develop and pull requests.

- Multi-OS testing (Linux, macOS, Windows)
- Multi-version testing (Node 18/20, Rust stable/nightly)
- 800+ unit tests
- Coverage enforcement (70%)
- Security audits
- Browser tests

**Trigger:** Push to main/develop, PR, or manual (`gh workflow run test.yml`)

### 2. Building
**File:** `.github/workflows/build.yml`

Runs after successful tests.

- WASM optimization (wasm-opt -O3)
- All targets built (bundler, nodejs, web)
- SHA256 checksums
- Smoke testing

**Trigger:** After test.yml success or manual (`gh workflow run build.yml`)

### 3. Releasing
**File:** `.github/workflows/release.yml`

Gated release with 10 verification gates.

- Verify release gates
- Generate schemas (OpenAPI, TypeScript)
- Generate changelog
- Publish to npm and crates.io
- Create GitHub release

**Trigger:** Tag push (v*) or manual (`gh workflow run release.yml`)

## Scripts

All located in `.github/scripts/` (all executable):

| Script | Purpose | Usage |
|--------|---------|-------|
| `verify-release.sh` | 10 release gates | `bash .github/scripts/verify-release.sh` or `npm run release:verify` |
| `verify-versions.sh` | Version consistency | `bash .github/scripts/verify-versions.sh` or `npm run release:verify-versions` |
| `verify-parity.sh` | Algorithm parity | `bash .github/scripts/verify-parity.sh` |
| `generate-schemas.sh` | API contracts | `bash .github/scripts/generate-schemas.sh` or `npm run release:generate-schemas` |
| `generate-changelog.sh` | Release notes | `bash .github/scripts/generate-changelog.sh` or `npm run release:generate-changelog` |
| `generate-sbom.sh` | SBOM generation | `bash .github/scripts/generate-sbom.sh` or `npm run release:generate-sbom` |

## Release Gates (10 Total)

### Critical (Fail Release)
1. **Tests Pass** - All 800+ tests must pass
2. **TypeScript** - Zero TypeScript errors
3. **WASM Builds** - All WASM targets build successfully

### Non-Critical (Warn Only)
4. Coverage > 70%
5. Rust clippy linting
6. Code formatting
7. Security audit (cargo audit)
8. OTEL observability
9. Hardcoded secrets check
10. Watch mode verification

## Common Tasks

### Testing
```bash
# Run tests locally
npm test

# Run in watch mode
npm run test:unit:watch

# Run with coverage
npm run test:coverage

# Run specific test
npm run test:unit -- path/to/test.ts
```

### Pre-Release Checks
```bash
# Run all verification gates
npm run release:full

# Check version consistency
npm run release:verify-versions

# Generate API contracts
npm run release:generate-schemas

# Generate changelog
npm run release:generate-changelog
```

### Releasing
```bash
# Create a release tag
git tag -a v26.4.5 -m "Release v26.4.5"

# Push tag to trigger release.yml
git push origin v26.4.5

# Monitor release
gh run watch
```

## Environment Setup

### Required
1. **NPM_TOKEN** - Get from https://www.npmjs.com/settings/~/tokens
   - Scope: Publish
   - Set in: GitHub repository Secrets

### Optional
- **CARGO_TOKEN** - For crates.io publishing
- **GPG_PRIVATE_KEY** - For signing artifacts

## File Structure

```
.github/
├── workflows/
│   ├── test.yml              (214 lines)
│   ├── build.yml             (190 lines)
│   └── release.yml           (323 lines)
│
├── scripts/
│   ├── verify-release.sh     (236 lines)
│   ├── verify-versions.sh    (64 lines)
│   ├── verify-parity.sh      (39 lines)
│   ├── generate-schemas.sh   (357 lines)
│   ├── generate-changelog.sh (158 lines)
│   ├── generate-sbom.sh      (306 lines)
│   └── README.md             (221 lines)
│
├── QUICK_START.md            (332 lines)
├── WORKFLOWS.md              (525 lines)
├── RELEASE_TEMPLATE.md       (171 lines)
├── IMPLEMENTATION_SUMMARY.md (452 lines)
└── INDEX.md                  (this file)
```

## Artifacts Generated

### At Build Time
- Documentation (TypeScript API docs)
- Coverage reports

### At Release Time
- OpenAPI 3.0 schema
- TypeScript type definitions
- JSON Schema validation
- Release changelog
- Software Bill of Materials (SBOM)
- npm package archives
- GitHub release

## Monitoring

### View Workflow Status
```bash
# List recent runs
gh run list --workflow test.yml

# Watch specific run
gh run view <run-id> --log

# Follow live
gh run watch
```

### GitHub Actions Dashboard
https://github.com/seanchatmangpt/wasm4pm/actions

## Troubleshooting

### Tests Fail
1. Run locally: `npm test`
2. Check logs: `gh run view <run-id> --log`
3. Fix and push
4. Tests re-run automatically

### Release Fails
1. Check gates: `npm run release:verify`
2. Fix issues
3. Create new tag: `git tag -a v26.4.6 -m "Release v26.4.6"`

### Coverage Below 70%
1. Run locally: `npm run test:coverage`
2. Check coverage report
3. Write more tests
4. Push fixes

## References

- **GitHub Actions Documentation:** https://docs.github.com/en/actions
- **wasm-pack Manual:** https://rustwasm.org/docs/wasm-pack/
- **Conventional Commits:** https://www.conventionalcommits.org/
- **Semantic Versioning:** https://semver.org/
- **CycloneDX SBOM:** https://cyclonedx.org/

## Support

For help:
1. Check [QUICK_START.md](./QUICK_START.md) for fast answers
2. Check [WORKFLOWS.md](./WORKFLOWS.md) for detailed docs
3. Check [scripts/README.md](./scripts/README.md) for script docs
4. Run scripts with `-x` flag for debugging: `bash -x .github/scripts/verify-release.sh`

## Summary

- **3 workflows** for testing, building, releasing
- **6 executable scripts** for verification and generation
- **5 documentation files** with comprehensive guides
- **10 release gates** for quality assurance
- **3,588 lines** of code and documentation
- **Enterprise-grade** CI/CD pipeline

Status: ✅ Production Ready

---

**Last Updated:** 2026-04-04
**Version:** 26.4.5
