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

## 4. Known Gaps

As of 2026-04-27:

- Running `npm install` from the monorepo root **does not** trigger the
  `build:nodejs` step for `wasm4pm/`. The build artifact must be produced
  manually (or via a CI pre-step).
- `@seanchatmangpt/pictl` workspace linking requires `pnpm`; plain `npm install`
  at the root may not establish the alias correctly.
- These 13 infrastructure-gated test failures are tracked under spec
  `053-T003` in speckit-ralph and are considered resolved once the above
  prerequisites are documented and honoured by CI.
