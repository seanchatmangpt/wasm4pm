<!-- wasm4pm-doc-status: archived; reviewed: 2026-08-02; original: ALGORITHM_AND_BREED_STATUS.md; source-sha256: deferred-to-full-tree-migration; reason: superseded fixed-count capability and reachability ledger -->

# Archived algorithm and breed validation ledger

This archive record preserves the immutable identity of the superseded `ALGORITHM_AND_BREED_STATUS.md` document without treating its fixed counts or `Closed` labels as current product truth.

## Immutable source

- Original path: `ALGORITHM_AND_BREED_STATUS.md`
- Source commit: `afe541a67167edfb9e7ef3bd250afc96f2194079`
- Source Git blob: `8812af1696559878af8d52f858a56d20d39a4e7d`
- Immutable source view: <https://github.com/seanchatmangpt/wasm4pm/blob/afe541a67167edfb9e7ef3bd250afc96f2194079/ALGORITHM_AND_BREED_STATUS.md>
- Archived: 2026-08-02

The source document claimed fixed totals and global `Closed`/`Valid` states while separately recording that only a subset of algorithms were kernel-reachable. It also linked to host-local `file:///Users/...` paths. Those properties make it historical evidence rather than a canonical runtime ledger.

## Current authority

Use current executable and generated evidence instead:

```bash
wpm system doctor capabilities --format json
wpm algorithms
pnpm run release:algorithm-reachability
pnpm run release:algorithm-behavior
pnpm run release:verify-algorithm-behavior
```

A complete release claim additionally requires the exact release certificate and independent replay described in [`../../VISION_2030.md`](../../VISION_2030.md).

The full-tree migration command will compute the source SHA-256 when it executes against an exact checkout. Until then, the Git blob and commit above are the immutable byte identity.
