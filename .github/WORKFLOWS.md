# GitHub Actions Workflows

This document describes the continuous integration and deployment (CI/CD) workflows for wasm4pm.

## Quick Reference

| Workflow | Trigger | Purpose | Duration |
|----------|---------|---------|----------|
| test.yml | Push/PR/Manual | Comprehensive test matrix | ~30 min |
| build.yml | On test success/Manual | Build and optimize WASM | ~15 min |
| release.yml | Tag push / Manual | Verify, build, and publish | ~60 min |

## Workflows

### 1. test.yml - Comprehensive Test Suite

Runs on every commit to main/develop, pull requests, and on manual trigger.

**Trigger Conditions:**
- `push` to `main` or `develop`
- `pull_request` against `main` or `develop`
- `workflow_dispatch` (manual trigger)

**Test Matrix:**
```
OS:     [ubuntu-latest, macos-latest, windows-latest]
Node:   [18, 20]
Rust:   [stable, nightly]
```

Optimization to reduce CI time:
- Nightly tests only run on Linux (saves macOS/Windows CI minutes)

**Steps Executed:**

1. **Setup**
   - Checkout with full history
   - Setup Node.js (with npm cache)
   - Setup Rust toolchain + wasm32 target
   - Install wasm-pack and wasm-opt

2. **Quality Checks**
   - Prettier code formatting check
   - Rust formatting check
   - Clippy linting (warnings continue, don't fail)
   - TypeScript type checking

3. **Build**
   - WASM bundler target
   - WASM Node.js target
   - WASM web target
   - WASM optimization with wasm-opt -O3 --enable-simd

4. **Testing**
   - Unit tests (all platforms)
   - Integration tests (Linux/macOS only)
   - Browser tests (Linux only, chromium)
   - Cargo tests (wasm32-unknown-unknown target)

5. **Coverage & Reports**
   - Generate coverage report (Linux + Node 20 only)
   - Upload to Codecov
   - Check coverage threshold (70% minimum)
   - Security audit with cargo audit

6. **Documentation**
   - Generate TypeScript API docs
   - Upload as artifact (5-day retention)

**Artifacts Produced:**
- `documentation/` - TypeScript API documentation
- `coverage/` - Coverage reports

**Duration:** ~30 minutes per matrix combination

**Failure Handling:**
- All tests must pass except formatting (warnings allowed)
- Coverage check enforced (70% minimum)
- Non-critical checks continue on error

---

### 2. build.yml - Build and Optimize WASM

Triggered after successful test workflow or manual trigger.

**Trigger:**
- On `test.yml` workflow success
- `workflow_dispatch` (manual trigger)

**Steps:**

1. **Setup**
   - Node.js 20 (no matrix)
   - Rust stable
   - wasm-pack 1.3.4
   - wasm-opt (optimization tool)

2. **Build WASM**
   - Build bundler target
   - Build Node.js target
   - Build web target

3. **Optimization**
   - Run wasm-opt -O3 --enable-simd on all WASM binaries
   - Report file size reductions
   - Generate SHA256 checksums

4. **Verification**
   - Verify all targets exist
   - Run smoke test on Node.js build
   - Validate WASM module loading

5. **Artifacts**
   - Upload all WASM outputs
   - Create build summary

**Artifacts Produced:**
- `wasm-artifacts/pkg/` - Bundler target
- `wasm-artifacts/pkg-nodejs/` - Node.js target
- `wasm-artifacts/pkg-web/` - Web target
- `wasm-artifacts/wasm4pm-checksums.txt` - SHA256 checksums
- `build-summary/` - Build report

**Duration:** ~15 minutes

---

### 3. release.yml - Release and Publish

Gated release workflow for publishing to npm and crates.io.

**Trigger:**
- Tag push matching `v*` (e.g., v26.4.5)
- `workflow_dispatch` (manual trigger with release type selection)

**Release Types (for manual trigger):**
- patch
- minor
- major

**Workflow Structure:**

#### Job 1: verify-release

Pre-release verification with 10 release gates:

1. **Gate 1:** All tests pass (800+ tests)
2. **Gate 2:** Code coverage > 70%
3. **Gate 3:** TypeScript type checking
4. **Gate 4:** Rust clippy linting
5. **Gate 5:** Code formatting
6. **Gate 6:** Security audit (cargo audit)
7. **Gate 7:** OTEL observability
8. **Gate 8:** No hardcoded secrets
9. **Gate 9:** Watch mode verification
10. **Gate 10:** WASM builds successful

**Output:** `.github/verification-report.md`

All gates must pass before proceeding to next job.

#### Job 2: build-and-publish

Publishing to npm and crates.io (only runs if verify-release passes).

**Steps:**

1. **Build All**
   - Build wasm4pm
   - (Optional) Build @wasm4pm/* packages

2. **Generate Schemas & Docs**
   - OpenAPI schema
   - TypeScript interfaces
   - Rust documentation

3. **Test Before Publish**
   - Full test suite run

4. **Generate Artifacts**
   - Changelog from git history
   - Release notes
   - Rust docs

5. **Publish**
   - Publish `wasm4pm` to npm
   - Publish `@wasm4pm/types` to npm (if public)
   - Publish `@wasm4pm/connectors` to npm (if public)
   - Publish to crates.io (optional, if Rust crate)

6. **GitHub Release**
   - Create release with:
     - Generated release notes
     - Checksums file
     - Changelog

7. **Upload Documentation**
   - Rust API docs as artifact (30-day retention)

#### Job 3: notify-release

Final notification and status check.

**Duration:** ~60 minutes total

**Environment Variables Used:**
- `NPM_TOKEN` - npm authentication
- `CARGO_TOKEN` - crates.io authentication (optional)
- `GITHUB_TOKEN` - GitHub API access (provided by GitHub)

---

## Release Gates Explained

### Gate 1: All Tests Pass
**Purpose:** Ensure no functionality is broken

**Command:** `npm test`

**Requirement:** All 800+ unit + integration tests must pass

**Skip:** Cannot be skipped

### Gate 2: Code Coverage > 70%
**Purpose:** Maintain code quality

**Command:** `npm run test:coverage`

**Requirement:** Coverage ≥ 70%

**Skip:** Logs warning, continues (non-blocking)

### Gate 3: TypeScript Type Checking
**Purpose:** Catch type errors at compile time

**Command:** `npm run type:check`

**Requirement:** No TypeScript errors

**Skip:** Cannot be skipped

### Gate 4: Rust Code Quality
**Purpose:** Prevent compiler warnings

**Command:** `cargo clippy --all-targets -- -D warnings`

**Requirement:** No clippy warnings

**Skip:** Logs warning, continues (non-blocking)

### Gate 5: Code Formatting
**Purpose:** Consistent code style

**Commands:** `npm run format:check` and `cargo fmt --check`

**Requirement:** All code properly formatted

**Skip:** Logs warning, continues (non-blocking)

### Gate 6: Security Audit
**Purpose:** Detect known vulnerabilities

**Command:** `cargo audit --deny warnings`

**Requirement:** No critical vulnerabilities

**Skip:** Logs warning, continues

### Gate 7: OTEL Integration
**Purpose:** Verify observability integration

**Check:** Grep for OTEL usage

**Skip:** Optional, logs if missing

### Gate 8: Hardcoded Secrets
**Purpose:** Prevent accidental secret leaks

**Check:** Grep for password, token, secret patterns

**Skip:** Manual review required

### Gate 9: Watch Mode
**Purpose:** Verify file watching works

**Check:** Grep for watch tests

**Skip:** Optional

### Gate 10: WASM Builds
**Purpose:** Ensure WASM compilation works for all targets

**Check:** Verify pkg/, pkg-nodejs/, pkg-web/ exist

**Skip:** Cannot be skipped

---

## Local Development

### Running Workflows Locally

To test workflows before pushing:

```bash
# Test workflow (requires act or GitHub CLI)
gh workflow run test.yml --ref main

# Manual release workflow
gh workflow run release.yml --ref main
```

### Testing Scripts

All verification scripts can be run locally:

```bash
bash .github/scripts/verify-release.sh
bash .github/scripts/verify-versions.sh
bash .github/scripts/verify-parity.sh
bash .github/scripts/generate-schemas.sh
bash .github/scripts/generate-changelog.sh
bash .github/scripts/generate-sbom.sh
```

---

## Environment Setup

### Required Secrets

Configure in GitHub repository settings:

| Secret | Purpose | Where to Get |
|--------|---------|-------------|
| `NPM_TOKEN` | Publish to npm | npm account settings |
| `CARGO_TOKEN` | Publish to crates.io | crates.io account settings |
| `GITHUB_TOKEN` | GitHub API access | Provided by GitHub Actions |

### Optional Secrets

| Secret | Purpose |
|--------|---------|
| `GPG_PRIVATE_KEY` | Sign releases (if enabled) |
| `GPG_PASSPHRASE` | GPG key passphrase |

---

## CI/CD Behavior

### On Push to Main
1. Runs `test.yml` immediately
2. If tests pass → runs `build.yml`
3. WASM artifacts available for download

### On Pull Request
1. Runs `test.yml` on PR commit
2. Results shown in PR checks
3. Blocks merge if tests fail

### On Tag Push
1. Runs `test.yml` on tag
2. If tests pass → runs `release.yml`
3. Publishes to npm/crates.io if all gates pass

### Manual Trigger
1. Can trigger any workflow from GitHub UI
2. Optional parameters for release type

---

## Troubleshooting

### Workflow Fails on PR

**Check:**
1. Look at GitHub Actions logs
2. Run `npm test` locally
3. Run linting: `npm run lint`

**Common Issues:**
- Node modules out of sync: `npm install`
- Rust toolchain missing: `rustup update`
- Formatting: `npm run format:check`

### Coverage Below Threshold

**Run Locally:**
```bash
npm run test:coverage
# Check coverage/coverage-final.json
```

**Improve Coverage:**
1. Write tests for uncovered code
2. Check `wasm4pm/__tests__/` for test examples
3. Run tests in watch mode: `npm run test:unit:watch`

### WASM Build Fails

**Check:**
```bash
cargo check --target wasm32-unknown-unknown
wasm-pack build --target bundler
```

**Common Issues:**
- Rust nightly incompatibility: Use stable
- SIMD features: Ensure `RUSTFLAGS` set correctly
- Dependencies: `cargo update`

### Release Fails

**Check Release Gates:**
```bash
bash .github/scripts/verify-release.sh
```

**Common Issues:**
- Version mismatch: Run `bash .github/scripts/verify-versions.sh`
- Secret in code: Check for passwords/tokens
- Tests failing: Must fix before releasing

---

## Monitoring

### View Workflow Status

```bash
# Show recent runs
gh run list --workflow test.yml

# Watch specific run
gh run view <run-id> --log
```

### Artifacts

Artifacts retain for 30-90 days based on workflow:
- `documentation/` - 5 days
- `wasm-artifacts/` - 30 days
- `rust-docs/` - 30 days
- `release-verification/` - 30 days
- `sbom/` - 30 days (generated at release)

---

## Version Management

### Versioning Strategy

Follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** (26.0.0) - Breaking changes
- **MINOR** (26.4.0) - New features (backward compatible)
- **PATCH** (26.4.5) - Bug fixes

### Version Consistency

All these files must have matching versions:
- `package.json` - Root
- `wasm4pm/package.json` - Core WASM library
- `wasm4pm/Cargo.toml` - Rust crate
- `packages/*/package.json` - All @wasm4pm/* packages

Check with:
```bash
npm run release:verify-versions
```

---

## Best Practices

### Before Pushing to Main

```bash
# Run local checks
npm run lint
npm run type:check
npm test

# Test build
npm run build:all

# Verify versions
npm run release:verify-versions
```

### Before Creating Release Tag

```bash
# Run full release verification
npm run release:full

# Check git status
git status

# Create annotated tag
git tag -a v26.4.5 -m "Release v26.4.5"

# Push tag to trigger release
git push origin v26.4.5
```

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [wasm-pack Manual](https://rustwasm.org/docs/wasm-pack/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

---

## Support

For workflow issues:
1. Check GitHub Actions logs
2. Review script output in `.github/` directory
3. Run scripts locally with `bash -x`
4. Open issue on GitHub with logs
