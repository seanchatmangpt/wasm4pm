# CAMPAIGN-RECEIPT — wasm4pm v26.10.8

| Field | Value |
|---|---|
| Branch | `fix/v26.9.30-ci-fmt-tsc` |
| HEAD | `1edbdbd6acdc72ec26a24d1b8fa3deaac6af1d95` (concurrent fleet lanes actively landing on this branch; HEAD re-read at write time) |
| Base tag | `v26.10.8` (`cdbdd136122ffa0bcef2247b218a1fc4091b0733`) |
| In-sync with origin | in sync with `origin/fix/v26.9.30-ci-fmt-tsc` at receipt time |

## Campaign commits since `v26.10.8`

| SHA | Subject |
|---|---|
| `1edbdbd6` | docs(archive): land 2026-08-02 archive bodies (generator output) |
| `7a6c91c9` | docs: apply migrate-markdown archive-pointer rewrites (generator output) |
| `00a7eb34` | docs: fix dead relative links (fleet link sweep) |
| `77e8b09d` | docs(policy): document flat-diataxis layout choice + manifest regeneration |
| `5a59b1be` | docs(reference): OCEL 2.0 conformance surface (fleet campaign) |
| `0ea4062e` | docs: cross-reference OCEL train (fleet campaign) |
| `72da2514` | docs(changelog): backfill 26.10.6-26.10.8 entries (fleet campaign) |

## Witnessed gates

| Gate | Result |
|---|---|
| Cargo check | `cargo check` green |
| Lock coordination | Cargo lockfile coordination completed with concurrent lanes, no lock conflicts |

## Standing

ALIVE — cargo check green; lock coordination witnessed.

## Open residues

| Residue | Detail |
|---|---|
| Untracked `eu_gate` | `crates/eu_gate/` is untracked at receipt time; disposition pending |
| Concurrent lane activity | ~1,708 modified paths in the working tree from other fleet lanes; branch HEAD advancing during receipt write |
