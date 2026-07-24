# Unfinished work

Grounded in `docs/jira/v26.7.24/README.md` §2 (re-verified this session via `grep`/`ls` against the
real filesystem, not the stale ggen ticket statuses, which marked several of these `PLANNED` while
real code/tests already existed on disk).

## Status map

```mermaid
flowchart TD
    subgraph Done["Confirmed real and merged"]
        UI["Phase-4 UI redesign<br/>SessionHeader/Workspace/ActivityDrawer/CognitionPanel"]
        COG["Cognition adapter + route<br/>4 real outcome branches, receipted"]
        TESTFILES["Scenario test files exist<br/>048-053 all have real .test files"]
        RECEIPTTYPES["Receipt types + emission layer<br/>receipt.ts, receipt-emitter.ts, reducer-with-receipts.ts"]
    end

    subgraph Unverified["Exists, but real pass/fail not yet confirmed this session"]
        RUN048["048 persistence-and-replay.test.ts"]
        RUN049["049 tamper-detection.test.tsx"]
        RUN050["050 accessibility-projection.test.tsx"]
        RUN051["051 zero-input-cognition.test.ts"]
        RUN052["052 self-play-manufacturing.test.ts<br/>(real Ollama call, slow)"]
        RUN053["053 full-decisive-acceptance-test.test.tsx<br/>11 assertions"]
    end

    subgraph Missing["Confirmed absent"]
        M057["057 final verifier report<br/>no file anywhere"]
        M056V["056 hardening: is the 5-step receipt chain<br/>emitted end-to-end for one real session?<br/>(types exist; full-chain assertion unverified)"]
    end

    subgraph Partial["Confirmed partial, disclosed"]
        A11Y["13 of 16 accessibility keys<br/>persist but have no observable visual effect yet"]
    end

    TESTFILES --> RUN048
    TESTFILES --> RUN049
    TESTFILES --> RUN050
    TESTFILES --> RUN051
    TESTFILES --> RUN052
    TESTFILES --> RUN053

    RUN048 & RUN049 & RUN050 & RUN051 & RUN052 & RUN053 --> M057
    RECEIPTTYPES --> M056V --> M057
```

## What "unfinished" concretely means right now

1. **Confirm 048–053 actually pass.** A `vitest run` across all six scenario files was started this
   session and did not complete within the observation window (self-play calls a real local Ollama
   model). Until that run's real output is read, none of the six may be marked ALIVE — they are
   `Unverified`, not `Done` and not `PLANNED`.
2. **TICKET-056 hardening.** The receipt *types* and emission *functions* are real (`receipt.ts`,
   `receipt-emitter.ts`), but whether the full 5-step chain (admission → cognition-run →
   sandbox-execution → test-result → accessibility-projection) is actually emitted end-to-end for
   one real session, with each step's `derivedFrom`/`relation` correctly chaining to the previous
   step's checksum, has not been re-confirmed this session.
3. **TICKET-057 final verifier report.** Confirmed absent by `find`. Cannot be honestly written
   until items 1–2 above produce real, quotable evidence — a report citing unverified claims would
   itself be an overclaim.
4. **Accessibility control effects.** Already-disclosed partial (per the ggen-side executive
   summary, re-affirmed here): 13 of 16 accessibility keys persist as state but don't yet drive an
   observable effect. Each remaining key needs either a real wired effect + test, or an explicit
   negative test asserting "persists, no visual effect yet" — not silence either way.

## See Also

- `docs/jira/v26.7.24/README.md` — the scored backlog and DoD rubrics these items map to
- [ui-ux-redesign.md](ui-ux-redesign.md) — the spec this work realizes
- [sequence-receipt-replay.md](sequence-receipt-replay.md) — the receipt chain item 2 concerns
