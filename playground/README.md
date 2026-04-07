# playground/

Dev behavior simulation. Unlike `lab/` (which validates published artifacts), this runs against local source and is meant to be fast, loose, and disposable.

## Purpose

- Simulate what a dev does after cloning or changing a feature
- Catch shape mismatches between layers (engine → MCP → CLI)
- Experiment with algorithms and config without touching test suites

## Usage

```bash
cd playground
npm install
npm run dev          # watch mode — re-runs on save
npm run run          # single run
npm run scenario "prediction"   # run matching scenarios only
```

## Structure

```
scenarios/           # one file per behavioral scenario
helpers/
  fixtures.ts        # shared XES samples and data
vitest.config.ts     # verbose, non-isolated by default
```

## Adding a scenario

Drop a `.ts` file in `scenarios/`. No registration needed — vitest picks it up automatically.

Keep scenarios:
- **Focused** — one behavior per file
- **Annotated** — explain what dev action you're simulating
- **Permissive** — use `console.info` freely, skip gracefully when APIs aren't wired yet
