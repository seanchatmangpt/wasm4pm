# Full-hour visual interview contract

This directory contains the Playwright specification for the complete 60-minute interview.

## Chicago TDD boundary

The suite is classical or Chicago-style TDD at the browser boundary:

- the production Next.js application is built and served;
- the actual browser-target `wasm4pm-cognition` package is initialized;
- the real cognition ledger, matcher, inference engine, replay verifier, code projector, and Monaco editor collaborate;
- transcript observations are entered through the visible textarea;
- track confirmation is performed through the visible **Yes** button;
- no network route is mocked;
- no WASM export is replaced;
- no React state, `localStorage`, or cognition state is injected;
- no implementation object is inspected by the test;
- the sole behavioral oracle is the rendered page screenshot.

The browser clock is set to the fictional timestamp of each fixture event. Time control removes wall-clock delay; it does not replace an application collaborator. UUID generation remains real. Receipt text is masked because receipt values intentionally incorporate nonce-sensitive observation identities.

## Interview scope

The shared fixture contains 26 ordered events from 9:00 AM through 10:00 AM. The Playwright test drives every event and captures nine full-page visual checkpoints:

1. opening;
2. clarification;
3. approach detected;
4. approach confirmed;
5. implementation midpoint;
6. complexity;
7. solution complete;
8. streaming and concurrency follow-up;
9. wrap-up.

The screenshots cover the visible hypothesis ranking, commitment transition, concept coverage, confirmation card, phase progression, Monaco filename, provisional versus committed selection status, and the cognition-selected Python source.

## Commands

From the repository root:

```bash
pnpm run interview:test:visual:install
pnpm run interview:test:visual:update
pnpm run interview:test:visual
```

`interview:test:visual:update` authors or intentionally replaces local baselines. Review the image changes before committing them. Normal CI execution sets `updateSnapshots: "none"`; missing or changed baselines therefore fail rather than being silently accepted.

Interactive debugging:

```bash
pnpm run interview:test:visual:ui
```

Failure artifacts are written to `test-results/` and `playwright-report/`. Traces, screenshots, and videos are retained on failure.
