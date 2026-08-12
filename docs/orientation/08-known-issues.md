# Phase 8: Known Issues

This is a real, evidenced rollup of every gap identified during the 2026-08
fixture audit and readiness pass — not an invented severity table. Every
item below cites the real command or artifact that established it. If a
fix has landed since this file was last touched, delete the entry rather
than leave it stale (see `docs/orientation/INDEX.md`'s dating convention).

**Last verified**: 2026-08-12, against `main@164f348f9dfd57814d78ad82343b2a8fc98597ec`
and `gh run list --repo seanchatmangpt/wasm4pm --branch main`.

## CI is red on `main`

`gh run list --repo seanchatmangpt/wasm4pm --branch main --limit 20` shows
these workflows failing on the last completed push to `main` (not on a
feature branch — on the trunk itself):

- `Cloud Agent bootstrap`
- `ggen Conformance Gate`
- `Test on Windows`
- `Test on Linux (incl. all features, linting, formatting)`
- `TypeScript CI`
- `Comprehensive Test Suite`
- `examples`
- `WASM Build & Test`
- `CLI Fortune 5 Production`
- `PR Staleness Detection`

`Repo Hygiene`, `Test on macOS`, `Version Sync Check`, `pnpm Install
Gate`, and `Benchmark Regression Detection` are green.

**In flight, not duplicated by this pass**: PR #558 ("ci: rebuild CI from
Rust/WASM/TypeScript product boundaries") is an open, non-draft,
ground-up ERRC reconstruction that deletes all 59 historically-registered
workflows and replaces them with a single dependency-closed verification
rail. Its own new check (`exact-subject Rust/WASM/TypeScript/CLI`) is
itself `FAILURE` as of its last run (2026-08-08) — confirmed via
`gh pr view 558 --repo seanchatmangpt/wasm4pm --json statusCheckRollup`.
This PR is the correct place to resolve the above list; do not start a
second, parallel CI-repair effort without first re-checking its status.

## The 3 "pre-existing and unrelated" interview tests: root-caused and fixed (PR #579)

`full_hour_state_selects_committed_coordinate_python`,
`full_hour_commits_and_completes_coordinate_traversal`, and
`text_screens_show_the_hour_evolving` had been called "pre-existing and
unrelated" across multiple sessions without ever being investigated. Root
cause: three distinct, real bugs in checked-in fixture/domain data
(`crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json`
and `tests/fixtures/full_hour_coordinate_interview.json`), not the
scoring engine — see PR #579 for the full writeup. Verified via
`cargo test -p wasm4pm-cognition --no-fail-fast` (443 lib tests + all
integration suites, zero failures) after the fix.

## `soar.json`'s primary-source gap

`crates/wasm4pm-cognition/tests/fixtures/papers/soar.json`'s
`provenance.extraction` is `secondary-source`, not `verbatim`. Every
attempt this session to retrieve a real copy of Laird, Newell &
Rosenbloom (1987) failed: the PDF at
`/Users/sac/Documents/Papers/AI_LLM/Laird-Newell-Rosenbloom-1987-SOAR-AIJ.pdf`
actually contains the Hearsay-II paper, and DTIC (accessions
`ADA188742`/`ADA205407`), CMU KiltHub, ResearchGate, and Semantic Scholar
all returned 403s / site-permission blocks via both `WebFetch` and the
Chrome browser tool. The fixture is honestly grounded against a real,
retrieved secondary source (`jimdavies.org/summaries/laird1987.html`)
rather than left unimproved or given a fabricated primary citation. A
real PDF, if one becomes accessible, should upgrade `extraction` to
`verbatim` and add a page-cited quote.

## `~/ggen` path-traversal gap (named in an earlier FMEA, not fixed)

Named during this session's FMEA pass on `~/ggen`'s template resolution;
not remediated in this pass — out of scope for wasm4pm's own tree. Needs
its own session against the `~/ggen` repo.

## `wasm4pm-compat`'s own `ggen.toml` E0011 issue

Named earlier this session in `~/wasm4pm-compat`; not fixed — separate
repo, separate PR needed.

## 40 latent OPTIONAL-without-DISTINCT `.rq` files

Named earlier this session as latent-but-safe (no observed incorrect
output, but a SPARQL pattern that can silently duplicate rows if the
`OPTIONAL` clause's cardinality assumption ever changes). Not fixed —
listed here so it isn't lost, not because it's currently causing wrong
behavior.

## Single-owner CODEOWNERS

`.github/CODEOWNERS` names exactly one person (`@seanchatmangpt`) for
every path in the repo, with no secondary owner or team. This is a real
org/business decision, not a code defect — named here for handoff
visibility, explicitly out of scope for a code fix.

## See Also

- `docs/orientation/INDEX.md` — master architecture index this file extends
- PR #558 — in-flight ground-up CI rebuild
- PR #579 — the interview-domain fix this file documents
