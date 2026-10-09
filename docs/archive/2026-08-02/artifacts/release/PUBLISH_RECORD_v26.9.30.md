<!-- wasm4pm-doc-status: archived; reviewed: 2026-08-02; original: artifacts/release/PUBLISH_RECORD_v26.9.30.md; source-sha256: 98f29d2595ad837ec62e7932f3ef0b58a8de6b16ca376d5c4b52a2ff9734fe85; reason: historical, generated, status, or evidence narrative -->

# crates.io publish record: v26.9.30

Source commit: `cd08cc0e5` (branch `release/v26.9.30`, parent `1e8101a09`).
Published 2026-09-30/10-01 UTC, in dependency order, each after the previous
was available on the registry:

| Crate | Version | Packaged size |
|---|---|---|
| prolog8 | 26.9.30 | 59 KB |
| miniml | 26.9.30 | 191 KB |
| wasm4pm-cognition | 26.9.30 | 690 KB |
| wasm4pm | 26.9.30 | 2.3 MB |

Evidence (observed): `cargo publish --dry-run` exit 0 for all four (upstream
crates patched locally before they were on the registry); `cargo test --locked
--lib` for the four crates: 394 + 73 + 1167 (12 ignored) + 443 passed, 0
failed; real `cargo publish` printed "Published <crate> v26.9.30" for each;
crates.io API lists 26.9.30 as max_version, not yanked, for all four; a clean
consumer with `wasm4pm = "=26.9.30"` passes `cargo check` under the repo's
pinned nightly (`rust-toolchain.toml`; stable fails with E0554 in the
`wasm4pm-compat` dependency).

Not covered: npm packages (separate release), `cargo test` beyond `--lib`,
tag/GitHub release (not created).
