# lab/ — Test Infrastructure Requirements

> As of 2026-04-27, the test suite in `lab/` requires the following prerequisites
> before `npm test` will pass. These are **not** automatically satisfied by
> running `npm install` from the monorepo root. Tracked in spec `053-T003`.

---

## 1. Build Step — produce `pkg/pictl.js`

The lab tests depend on the `pkg/pictl.js` build artifact. This file is produced
by building the `wasm4pm` package (the WASM/Node.js bundle) from inside the
`wasm4pm/` subdirectory:

```bash
cd /Users/sac/wasm4pm/wasm4pm
npm run build:nodejs
```

This emits `pkg/pictl.js` (and associated `.d.ts` / `.map` files). The lab test
runner imports this artifact at runtime; if it is absent, all tests fail with a
module-not-found error.

---

## 2. Package Dependency — `@seanchatmangpt/pictl`

`@seanchatmangpt/pictl` is a **local workspace alias** — it is not a published
npm package. It resolves via the `pnpm` workspace configuration at the monorepo
root (`/Users/sac/wasm4pm`).

To make the alias resolvable, run `pnpm install` from the monorepo root:

```bash
cd /Users/sac/wasm4pm
pnpm install
```

This links the workspace packages so that `@seanchatmangpt/pictl` resolves
correctly inside `lab/node_modules`.

---

## 3. Recommended Setup Sequence

Run these commands from a clean checkout before executing `lab/` tests:

```bash
# Step 1 — Install and link all workspace packages
cd /Users/sac/wasm4pm
pnpm install

# Step 2 — Build the pictl Node.js artifact
cd /Users/sac/wasm4pm/wasm4pm
npm run build:nodejs

# Step 3 — Run the lab tests
cd /Users/sac/wasm4pm/lab
npm test
```

---

## 4. Runtime Dependency — `chokidar` (added spec 057 / 2026-04-27)

`apps/pictl/src/commands/watch.ts` now uses `chokidar@^4.0.1` (resolved 4.0.3)
for cross-platform file watching. This replaces the previous `fs.watch` debounce
loop. `chokidar` is declared in `apps/pictl/package.json` and is resolved via the
`pnpm` workspace lock file (`pnpm-lock.yaml`).

Running `pnpm install` from the monorepo root is sufficient to install it. No
additional system-level prerequisites are required — `chokidar` 4.x is a pure
JavaScript package with no native bindings.

CI note: the `Pm4pyBackend.init()` lifecycle method now calls `healthCheck()` on
startup. In CI environments where the Python bridge is not present, `init()` will
fail fast and set `isReady() = false` rather than failing silently at invocation
time. This is the intended behaviour. Tests that depend on `Pm4pyBackend` being
ready will need the Python bridge running; tests that merely call `init()` will
receive a well-typed error instead of a silent no-op.

---

## 5. Known Gaps

As of 2026-04-27:

- Running `npm install` from the monorepo root **does not** trigger the
  `build:nodejs` step for `wasm4pm/`. The build artifact must be produced
  manually (or via a CI pre-step).
- `@seanchatmangpt/pictl` workspace linking requires `pnpm`; plain `npm install`
  at the root may not establish the alias correctly.
- These 13 infrastructure-gated test failures are tracked under spec
  `053-T003` in speckit-ralph and are considered resolved once the above
  prerequisites are documented and honoured by CI.
