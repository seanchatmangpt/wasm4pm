# GitHub Actions Scripts

This directory contains helper scripts used by GitHub Actions workflows for testing, building, and releasing pictl.

## Scripts

### verify-release.sh
Comprehensive release gate verification before publishing.

**Purpose:** Ensures all quality gates pass before releasing to npm/crates.io

**Gates Verified:**
1. All tests pass (800+ tests)
2. Code coverage > 70%
3. TypeScript type checking
4. Rust clippy linting
5. Code formatting (Prettier + rustfmt)
6. Security audit (cargo audit)
7. OTEL observability integration
8. No hardcoded secrets
9. Watch mode functionality
10. WASM builds successful

**Output:** `.github/verification-report.md`

**Usage:**
```bash
bash .github/scripts/verify-release.sh
```

### verify-versions.sh
Ensures version consistency across all package manifests.

**Purpose:** Prevents releasing with mismatched versions

**Checks:**
- Root package.json version matches wasm4pm/package.json
- wasm4pm/package.json version matches wasm4pm/Cargo.toml
- All @pictl/* packages have consistent versions

**Output:** stdout + exit code (0 = success)

**Usage:**
```bash
bash .github/scripts/verify-versions.sh
```

### verify-parity.sh
Verifies algorithm parity (explain() == run()).

**Purpose:** Ensures algorithm implementations produce consistent results

**Checks:**
- Runs integration test suite
- Verifies parity between explain and run functions
- Checks for deterministic algorithm behavior

**Output:** Integration test results

**Usage:**
```bash
bash .github/scripts/verify-parity.sh
```

### generate-schemas.sh
Generates OpenAPI schemas and TypeScript types from source.

**Purpose:** Creates contract definitions for API versioning

**Generates:**
- `openapi.json` - OpenAPI 3.0 specification
- `types.ts` - TypeScript interface definitions
- `event-log.schema.json` - JSON Schema for validation
- `CHECKSUMS` - Integrity verification

**Output:** `.github/schemas/` directory

**Usage:**
```bash
bash .github/scripts/generate-schemas.sh
```

### generate-changelog.sh
Generates release notes from git commit history.

**Purpose:** Creates human-readable changelog for releases

**Source:** Git commits with conventional format (feat:, fix:, perf:, etc.)

**Output:** `CHANGELOG_RELEASE.md`

**Includes:**
- New features
- Bug fixes
- Performance improvements
- Installation instructions
- Build information

**Usage:**
```bash
bash .github/scripts/generate-changelog.sh
```

### generate-sbom.sh
Generates Software Bill of Materials (SBOM) in multiple formats.

**Purpose:** Documents all dependencies and licenses for compliance

**Generates:**
- `sbom-26.4.5.json` - CycloneDX 1.4 format
- `npm-dependencies.json` - npm package tree
- `cargo-dependencies.json` - Rust crate tree
- `SBOM_SUMMARY.md` - Human-readable summary
- `CHECKSUMS` - Integrity verification

**Output:** `.github/sbom/` directory

**Complies With:**
- CycloneDX 1.4 specification
- SPDX license expressions
- Software supply chain transparency requirements

**Usage:**
```bash
bash .github/scripts/generate-sbom.sh
```

## Workflow Integration

These scripts are called by GitHub Actions workflows:

- **test.yml** → verify-release.sh (indirectly via coverage checks)
- **build.yml** → (no scripts, standalone optimization)
- **release.yml** → all scripts in sequence
  1. verify-release.sh
  2. verify-versions.sh
  3. verify-parity.sh
  4. generate-schemas.sh
  5. generate-changelog.sh
  6. generate-sbom.sh

## Development Notes

### Adding a New Gate
To add a new release gate:

1. Add a function to `verify-release.sh`
2. Echo `✓` or `✗` output
3. Append to `$VERIFICATION_REPORT`
4. Update FAILED counter if gate is critical
5. Document gate in this README

### Dependencies

Scripts require:
- bash 4.0+
- Node.js 18+
- Rust toolchain (cargo, rustc)
- git
- Standard Unix tools (sha256sum, grep, etc.)

### Error Handling

- Scripts use `set -e` for fail-fast on errors
- Warnings (⚠) are non-fatal and continue
- Errors (✗) will fail the workflow
- Reports are always generated for debugging

### Environment Variables

- `GITHUB_SHA` - Git commit SHA (GitHub Actions)
- `GITHUB_REF` - Git ref (tag/branch name)
- `NODE_AUTH_TOKEN` - npm authentication
- `CARGO_TOKEN` - crates.io authentication

## Testing Scripts Locally

```bash
# Test release gates
bash .github/scripts/verify-release.sh

# Check versions
bash .github/scripts/verify-versions.sh

# Generate schemas
bash .github/scripts/generate-schemas.sh

# Generate changelog
bash .github/scripts/generate-changelog.sh

# Generate SBOM
bash .github/scripts/generate-sbom.sh
```

## Troubleshooting

### Scripts hang or timeout
- Check Node.js/Rust installation
- Verify npm cache: `npm cache clean --force`
- Check git: `git status`

### Permission denied errors
- Make scripts executable: `chmod +x .github/scripts/*.sh`
- Check PATH for required tools

### Version mismatch errors
- Update versions consistently: `npm version patch`
- Sync Cargo.toml manually for Rust crates
- Re-run verify-versions.sh

### Coverage below threshold
- Run `npm run test:coverage` locally
- Debug failing tests with `npm run test:unit:watch`
- Check `wasm4pm/coverage/coverage-final.json` (or run from wasm4pm directory)

## References

- [CycloneDX Specification](https://cyclonedx.org/)
- [SPDX License List](https://spdx.org/licenses/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.0)
