# Scope: version_bump_and_verification

## Architecture
- Root `package.json` and workspaces.
- Root `Cargo.toml` and workspace members in Rust.
- Wasm pack or builder scripts to rebuild the WASM core.
- Release scripts such as `npm run release:full` or specific verification scripts.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|---|---|---|---|---|
| M1 | File Analysis & Script Verification | Locate all package.json and Cargo.toml files in the monorepo, analyze their current versions and dependencies, and locate the build and verification scripts. | None | DONE | ef01f369-6add-499c-be8a-4f3f750ecc36 |
| M2 | Version Bump & Rebuild | Perform the version bump to 26.6.5 across all package.json and Cargo.toml files. Rebuild the WASM bundle. | M1 | IN_PROGRESS | 54e4a40d-4468-4f89-b469-500864d1ec07 |
| M3 | Verification and Gate Validation | Run all release checks, tests, and verification gates (using `npm run release:full` or appropriate scripts). Verify receipt files, release certificates, and recompute evidence hashes. Perform boundary proof verification. | M2 | PLANNED | |
| M4 | Gate and Auditor Verification | Run Forensic Auditor to ensure no integrity violations exist and finalize handoff. | M3 | PLANNED | |

## Interface Contracts
- Package version must match exactly 26.6.5 across all files.
- The release certificate, reachability evidence, behavior evidence, example receipts, npm pack output, and post-publish receipt must all use the same package identity `wasm4pm@26.6.5`.
- Release certificate embeds the correct hashes.
