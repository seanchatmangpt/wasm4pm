<!-- wasm4pm-doc-status: archive-pointer; reviewed: 2026-08-02; original: ALGORITHM_AND_BREED_STATUS.md; source-sha256: deferred-to-full-tree-migration; reason: superseded fixed-count capability and reachability ledger -->

# Archived documentation

The fixed-count algorithm and cognitive-breed ledger is historical evidence and is not current product truth.

- Archive record: [`docs/archive/2026-08-02/ALGORITHM_AND_BREED_STATUS.md`](docs/archive/2026-08-02/ALGORITHM_AND_BREED_STATUS.md)
- Original Git blob: `8812af1696559878af8d52f858a56d20d39a4e7d`
- Source commit: `afe541a67167edfb9e7ef3bd250afc96f2194079`
- Archived: 2026-08-02

Current standing is computed from executable and versioned evidence:

```bash
wpm system doctor capabilities --format json
wpm algorithms
pnpm run release:algorithm-reachability
pnpm run release:algorithm-behavior
pnpm run release:verify-algorithm-behavior
```

See [`docs/README.md`](docs/README.md) and [`docs/VISION_2030.md`](docs/VISION_2030.md).
