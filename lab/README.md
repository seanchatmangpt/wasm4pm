# lab/

Post-release user behavior validation. Unlike `playground/` (which runs against local source),
this validates the published npm artifact — what a real user gets after installing from the registry.

## Purpose

- Simulate what an end user does after `npm install @seanchatmangpt/pictl`
- Catch regressions in the published WASM API surface
- Verify algorithm availability, execution contracts, and configuration loading
- Run after every release to confirm the artifact matches developer expectations

## Structure

```
tests/
  nodejs.test.ts       # WASM library API surface (require('@seanchatmangpt/pictl'))
  conformance.test.ts  # Data contracts and algorithmic correctness
  browser.test.ts      # Browser-compatible module shape
fixtures/              # Sample XES event logs
reports/               # Generated test reports (gitignored)
```

## Usage

```bash
cd lab
npm install           # installs @seanchatmangpt/pictl from npm (not workspace source)
npm test              # 124 tests across 3 files
```

## Dependency

`lab/` depends on `"@seanchatmangpt/pictl": "^26.4.5"` — the published npm package, not `workspace:*`.
This is intentional: the tests validate the artifact, not the source.

To test a new release: update the version in `package.json`, run `npm install`, run `npm test`.
