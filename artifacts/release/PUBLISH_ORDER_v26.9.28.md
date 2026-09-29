# Publish order for v26.9.28

Status: dry-run runbook. Nothing here has been published. Publishing needs
explicit owner authorization (AGENTS.md sections 4, 13).

All crates and npm packages are at 26.9.28.

## Prerequisites

```bash
git status --short && git rev-parse HEAD          # clean tree, record SHA
pnpm install --frozen-lockfile                    # lockfile must be consistent
rustup target add wasm32-unknown-unknown
cargo install wasm-pack                           # wasm-pack 0.15.0 used for the dry-run
```

The release evidence gates in AGENTS.md section 13 (`pnpm run release:full`,
`pnpm run prepublish:pack-smoke`, `cargo test --workspace`) are still required
before a real publish. They were not run for this runbook.

## A. crates.io (strict order)

`cargo publish` resolves against crates.io, not local paths. Each step must be
visible in the index (`cargo search <name>` or the crate page) before the next.

| # | Crate | Dir | Needs on crates.io first |
|---|-------|-----|--------------------------|
| 1 | `prolog8` | crates/prolog8 | none |
| 2 | `miniml` | crates/miniml-core | none |
| 3 | `ocpq` | crates/ocpq | none (`wasm4pm-compat` 26.8.7 already published) |
| 4 | `wasm4pm-cognition` | crates/wasm4pm-cognition | `prolog8` 26.9.28 |
| 5 | `wasm4pm` | wasm4pm | `miniml` 26.9.28, `wasm4pm-cognition` 26.9.28 |
| 6 | `wasm4pm-planner` | crates/wasm4pm-planner | `prolog8`, `wasm4pm`, `wasm4pm-cognition` |
| 7 | `wasm4pm-cli` | crates/wasm4pm-cli | `wasm4pm`, `wasm4pm-cognition` |

Steps 1-3 are independent. 6 and 7 are independent of each other.

```bash
for c in prolog8 miniml ocpq wasm4pm-cognition wasm4pm wasm4pm-planner wasm4pm-cli; do
  cargo publish --dry-run --allow-dirty -p "$c"     # dry run; drop --dry-run only when authorized
done
```

Dry-run results (recorded on this branch):

- Pass fully: `prolog8`, `miniml`, `ocpq`.
- Fail only with `failed to select a version for the requirement ...^26.9.28`
  because the upstream crates are not yet published (expected):
  `wasm4pm-cognition` (prolog8), `wasm4pm` (miniml), `wasm4pm-planner`
  (prolog8), `wasm4pm-cli` (wasm4pm). Re-run each after its predecessors land;
  `cargo package --list -p <crate>` succeeds for all of them.
- `wasm4pm-cli`: the `affidavit` git dependency was replaced by the crates.io
  release (`version = "26.6.22"`, `features = ["core"]`) in the root
  `[workspace.dependencies]`; `cargo check -p wasm4pm-cli --bins` passes.
  Crates.io rejects git-only dependencies, so this was required.

## B. npm (after crates are in place)

Do not run recursive `pnpm -r publish`. Publish only the packages below.

Build first. `dist/` is not committed, and `pnpm publish --dry-run` passes even
when it is missing, so an unbuilt tree would ship empty tarballs. Use this
order (the `build:all` order; `@wasm4pm/testing` must build before
`@wasm4pm/engine`, a plain `pnpm -r build` fails on that cycle):

```bash
pnpm run build:wasm            # or: (cd wasm4pm && wasm-pack build --target nodejs --release --features cloud)
for d in packages/contracts packages/config packages/observability packages/ml packages/planner \
         packages/testing packages/kernel packages/engine packages/agents packages/cognition \
         packages/supabase packages/noun-verb apps/wasm4pm; do
  pnpm --dir "$d" run build
done
```

Publish order (workspace deps are rewritten from `workspace:*` to 26.9.28 by pnpm):

1. `@wasm4pm/core` (wasm4pm/, needs `pkg/`)
2. `@wasm4pm/contracts`, `@wasm4pm/config`, `@wasm4pm/observability`, `@wasm4pm/ml`, `@wasm4pm/planner`
3. `@wasm4pm/testing`, `wasm4pm` (packages/kernel), `@wasm4pm/supabase`, `@wasm4pm/noun-verb`
4. `@wasm4pm/engine`
5. `@wasm4pm/agents`, `@wasm4pm/cognition`
6. `@wasm4pm/cli` (apps/wasm4pm)

```bash
pnpm --dir <dir> publish --dry-run --no-git-checks     # all 14 pass at 26.9.28
```

`@wasm4pm/core` has a `prepublishOnly` (`build:all && lint && test`); the
dry-run above used `--ignore-scripts` for it.

## C. Not published (publish=false / private)

| Item | Why |
|------|-----|
| `wasm4pm-ex4pm-bindings` (26.8.27) | `publish = false`; kept out of this release (commit 5df9e752) |
| `wasm4pm-cmca` | `publish = false` |
| `wasm4pm-testing` (crate) | `publish = false` |
| `bench-tools` | `publish = false` |
| `wasm4pm-bindings-py` | no `publish=false`, not in scope for this release; not dry-run |
| `tps-metrics` | workspace member, not in scope for this release; not dry-run |
| repo root, `apps/playground-web`, lab, examples, playground, tests/* | private/non-release packages; several still carry stale 26.6.25 versions, which is harmless as they are not published |
| `wasm4pm-compat` | crates.io-only, never a path dependency (AGENTS.md section 4) |
