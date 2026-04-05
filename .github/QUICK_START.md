# GitHub Actions Quick Start

## Testing (Automatic on Push/PR)

GitHub Actions automatically runs on:
- Push to `main` or `develop`
- Pull requests against `main` or `develop`

Workflow: `test.yml` (runs on 12 combinations of OS × Node × Rust)

### View Test Results

```bash
# List recent test runs
gh run list --workflow test.yml

# Watch a specific run
gh run view <run-id> --log

# Trigger manually
gh workflow run test.yml --ref main
```

---

## Building (Automatic After Tests Pass)

After successful `test.yml` run, `build.yml` automatically runs:
- Builds all WASM targets
- Optimizes with wasm-opt -O3
- Generates checksums
- Creates artifacts

### Manual Build Trigger

```bash
gh workflow run build.yml --ref main
```

---

## Releasing (Manual via Git Tag)

### Prerequisites

1. **Ensure versions are consistent:**
   ```bash
   npm run release:verify-versions
   ```

2. **Run all verification gates locally (optional):**
   ```bash
   npm run release:full
   ```

### Release Steps

1. **Update version** (if not already updated):
   ```bash
   npm version patch  # or minor, major
   # This updates package.json and creates a git tag
   ```

2. **Verify version is correct:**
   ```bash
   node -p "require('./package.json').version"
   # Should output: 26.4.5 (or your new version)
   ```

3. **Push the tag to GitHub:**
   ```bash
   git push origin v26.4.5  # Replace with your version
   ```

4. **Watch the release workflow:**
   ```bash
   gh run list --workflow release.yml
   gh run view <run-id> --log
   ```

### What Happens in Release

1. ✅ **Verify Release Gates** (10 automated checks)
   - All tests pass
   - Code coverage > 70%
   - No TypeScript errors
   - No Rust warnings
   - Security audit clean
   - etc.

2. ✅ **Generate Artifacts**
   - OpenAPI schema
   - TypeScript types
   - Changelog
   - SBOM (Bill of Materials)

3. ✅ **Build & Test**
   - Full test suite runs
   - WASM built for all targets

4. ✅ **Publish**
   - Publish to npm
   - Publish to crates.io (optional)
   - Create GitHub release

---

## Verification Scripts (Local)

Run any script locally before pushing/releasing:

### Verify All Release Gates
```bash
bash .github/scripts/verify-release.sh
```

### Check Version Consistency
```bash
npm run release:verify-versions
# or
bash .github/scripts/verify-versions.sh
```

### Generate Schemas (API Contracts)
```bash
npm run release:generate-schemas
# or
bash .github/scripts/generate-schemas.sh
```

### Generate Changelog
```bash
npm run release:generate-changelog
# or
bash .github/scripts/generate-changelog.sh
```

### Generate SBOM (Supply Chain)
```bash
npm run release:generate-sbom
# or
bash .github/scripts/generate-sbom.sh
```

### Run All Release Generation
```bash
npm run release:full
```

---

## Common Tasks

### Check CI Status

```bash
# Latest test run
gh run list --workflow test.yml --limit 1

# Watch logs in real-time
gh run watch
```

### Download Artifacts

```bash
# List artifacts from a run
gh run view <run-id> --json artifacts

# Download artifact
gh run download <run-id> --name documentation
```

### Troubleshoot Failed Tests

```bash
# Run tests locally
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test:unit -- path/to/test.ts

# Run in watch mode
npm run test:unit:watch
```

### Fix Formatting Issues

```bash
# Check what's wrong
npm run format:check

# Auto-fix
npm run format
```

### Fix TypeScript Errors

```bash
npm run type:check
# Fix errors in editor, or manually
```

---

## Release Checklist

Before creating a release tag:

- [ ] All tests pass locally: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] No TypeScript errors: `npm run type:check`
- [ ] Version updated: `npm version patch`
- [ ] Verification gates pass: `npm run release:verify`
- [ ] Git pushed: `git push origin main`
- [ ] Tag pushed: `git push origin v26.4.5`

After release tag is pushed:

- [ ] Check GitHub Actions: `gh run watch`
- [ ] Verify npm publish succeeded: `npm info wasm4pm@26.4.5`
- [ ] Check GitHub release was created
- [ ] Download and verify artifacts

---

## Environment Setup

### Required Secrets in GitHub

Set in repository Settings → Secrets and variables → Actions:

1. **NPM_TOKEN**
   - Get from: https://www.npmjs.com/settings/~/tokens
   - Scope: Publish
   - Save as: `NPM_TOKEN`

2. **CARGO_TOKEN** (optional, for crates.io)
   - Get from: https://crates.io/me
   - Save as: `CARGO_TOKEN`

### Check Secrets are Configured

```bash
# This will show which secrets are available (not their values)
gh repo view --json "secretsUrl"
```

---

## Release Notes Template

After release completes, create release notes:

1. Download `CHANGELOG_RELEASE.md` from artifacts
2. Copy `.github/RELEASE_TEMPLATE.md` to draft
3. Fill in sections:
   - New features
   - Bug fixes
   - Performance improvements
   - Known issues
   - Thanks to contributors

4. Publish release notes in GitHub

---

## Troubleshooting

### Tests Fail

1. Run locally: `npm test`
2. Check logs: `gh run view <run-id> --log`
3. Fix issues
4. Push fixes
5. Tests re-run automatically

### Release Fails

1. Check verification report: Look for gate failures in logs
2. Run locally: `bash .github/scripts/verify-release.sh`
3. Fix the issue
4. Create new tag: `git tag -a v26.4.6 -m "Release v26.4.6"`
5. Push tag: `git push origin v26.4.6`

### Coverage Below 70%

1. Run coverage locally: `npm run test:coverage`
2. Check `wasm4pm/coverage/coverage-final.json`
3. Write tests for uncovered code
4. Push fixes
5. Coverage check re-runs

### npm Publish Fails

Check secrets:
```bash
# Verify NPM_TOKEN is set
gh secret list
```

Check package.json:
```bash
# Verify package is public
cat wasm4pm/package.json | grep -A5 '"private"'
```

---

## Reference

- **Complete Workflow Reference:** `.github/WORKFLOWS.md`
- **Scripts Documentation:** `.github/scripts/README.md`
- **Release Template:** `.github/RELEASE_TEMPLATE.md`
- **Implementation Details:** `.github/IMPLEMENTATION_SUMMARY.md`

---

## Quick Links

- [GitHub Actions Logs](https://github.com/seanchatmangpt/wasm4pm/actions)
- [npm Package](https://www.npmjs.com/package/wasm4pm)
- [GitHub Releases](https://github.com/seanchatmangpt/wasm4pm/releases)
- [Repository Settings](https://github.com/seanchatmangpt/wasm4pm/settings)

---

**Last Updated:** 2026-04-04  
**Version:** 26.4.5
