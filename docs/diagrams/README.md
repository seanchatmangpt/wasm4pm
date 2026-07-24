# InterviewAssist diagrams

Index of architecture and UX diagrams for `examples/interview-assist/`. Every diagram in this
directory either (a) reproduces a spec the user authored directly, or (b) is grounded in a real
file this session read and cites in its own "Source" line — none are invented from the prose
mermaid spec alone.

## Contents

- [ui-ux-redesign.md](ui-ux-redesign.md) — the canonical UI/UX spec (interaction model, desktop
  layout, screen/component tree, session state machine, cognition panel, keyboard/focus flow,
  responsive breakpoints, control-replacement table). Already substantially implemented — see
  `docs/jira/v26.7.24/README.md` §2 for the real `grep`-verified confirmation.
- [unfinished-work.md](unfinished-work.md) — what's actually still open, grounded in re-verified
  ground truth, not the stale ggen ticket statuses.
- [c4-context.md](c4-context.md) — System Context diagram.
- [c4-container.md](c4-container.md) — Container diagram.
- [c4-component.md](c4-component.md) — Component diagram (inside the Next.js app).
- [sequence-cognition.md](sequence-cognition.md) — the cognition-run request/response flow, all
  4 real outcome branches.
- [sequence-sandbox-execution.md](sequence-sandbox-execution.md) — code execution flow through the
  sandbox executor.
- [sequence-receipt-replay.md](sequence-receipt-replay.md) — receipt-chain emission and replay
  reconstruction.

## See Also

- `docs/jira/v26.7.24/README.md` — priority matrix and backlog this diagram set supports
- `examples/interview-assist/CLAUDE.md` (if present) / repo root `CLAUDE.md` — project conventions
