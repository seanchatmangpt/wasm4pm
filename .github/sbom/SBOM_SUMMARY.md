<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/.github/sbom/SBOM_SUMMARY.md; source-sha256: f0465f881346065936c0838dbe248043a0038db188e21c9b5c9861f4b2e9c363; reason: tooling or agent control surface -->

# Software Bill of Materials (SBOM)

**Version:** 26.5.19
**Generated:** 2026-05-19T23:06:41Z
**Git Commit:** bfb869c8

## Overview

This SBOM describes the software components, dependencies, and licenses used in wasm4pm v26.5.19.

## Key Dependencies

### Rust Ecosystem
- **wasm-bindgen** 0.2.92 - Rust ↔ JavaScript interop
- **serde** 1.0.188 - Serialization framework
- **serde_json** 1.0.105 - JSON support
- **chrono** 0.4.40 - Date/time handling
- **indexmap** 2.0 - Ordered hash maps
- **uuid** 1.16.0 - UUID generation

### TypeScript Ecosystem
- **typescript** 5.3.3 - TypeScript compiler
- **vitest** 1.1.0 - Unit testing
- **prettier** 3.1.1 - Code formatting

## License Summary

All primary dependencies are licensed under:
- BUSL-1.1 (wasm4pm); MIT OR Apache-2.0 (most third-party Rust crates)
- Apache-2.0 (TypeScript compiler)
- MIT (test frameworks)

## Vulnerability Status

No known critical vulnerabilities. Run `cargo audit` for security checks.

## Files

- `sbom-26.5.19.json` - CycloneDX format SBOM
- `npm-dependencies.json` - npm package tree
- `cargo-dependencies.json` - Rust crate tree
- `SBOM_SUMMARY.md` - This summary

## Compliance

This SBOM format complies with:
- CycloneDX 1.4 specification
- SPDX license expressions
- VCS and distribution references

