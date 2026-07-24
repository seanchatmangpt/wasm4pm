# AGENTS.md — ChatGPT Operating Contract for wasm4pm

This file is the repository-wide operating contract for ChatGPT and other
OpenAI agents working on `wasm4pm`.

It is intentionally about **how to work truthfully in the available agent
environment**. Project architecture and command details live in `CLAUDE.md`.
Release and proof-closure doctrine lives in `GEMINI.md`.

A more specific `AGENTS.md` in a subdirectory overrides this file for work
under that directory.

## 1. First principle

A claim must not exceed the evidence available in the current environment.

Keep these states separate:

- **Observed**: source, metadata, logs, or artifacts were read.
- **Executed**: a command was actually run in a local checkout.
- **Changed**: a file, branch, issue, or pull request was actually modified.
- **Inferred**: a conclusion was derived from observed evidence.
- **Blocked**: the required boundary could not be reached.

Examples:

- Reading a Vitest file proves that test cases are declared. It does not prove
  that they pass.
- Reading a `package.json` script proves what the script currently expands to.
  It does not prove that the script succeeds.
- A GitHub connector update is a real remote commit. It is not a local working
  tree edit.
- A green workflow proves only the commands and commit covered by that
  workflow.
- A receipt file proves that bytes exist. It does not prove that the receipt
  recomputes or binds to the current commit.

The compact law is:

> No execution claim without execution. No closure claim without verified
> evidence. No hidden assumption presented as repository fact.

## 2. Instruction precedence

Use this order when instructions conflict:

1. Platform, safety, and tool constraints.
2. The user's current request and explicit scope.
3. The nearest path-specific `AGENTS.md`.
4. This root `AGENTS.md`.
5. `CLAUDE.md` for repository architecture, commands, and coding rules.
6. `GEMINI.md` for release, receipt, and proof-closure requirements.
7. Other repository documentation and historical notes.

Do not assume this file was automatically injected into the session. Read it
from the target ref before substantial repository work. Read the nearest
nested `AGENTS.md` as well when one exists.

## 3. Establish the operating mode first

Before editing or making validation claims, determine which environment is
actually available.

### 3.1 Local-checkout mode

A local checkout exists and shell commands can inspect and execute it.

Establish:

```bash
pwd
git rev-parse --show-toplevel
git status -sb
git branch --show-current
git remote -v
```

Then verify required tools individually. Do not assume `gh`, `ggen`,
`wasm-pack`, `just`, Node, pnpm, Rust, browsers, containers, or network access
are installed merely because the repository uses them.

Only local-checkout mode can directly prove:

- working-tree state;
- local diffs and staged files;
- command exit codes;
- locally generated artifacts;
- exact test output;
- local receipt recomputation.

### 3.2 GitHub-connector mode

The repository is accessible through a connected GitHub tool, but there may be
no local checkout.

This mode can usually:

- fetch known files and refs;
- search indexed repository source;
- inspect commits, pull requests, issues, changed paths, and workflow state;
- create or replace UTF-8 repository files;
- create real commits on an existing branch;
- create or update pull requests.

This mode cannot by itself:

- run pnpm, Vitest, Cargo, `just`, `make`, or shell commands;
- inspect an uncommitted working tree;
- generate build artifacts from source;
- prove that a command succeeds;
- claim that literal `grep`, `find`, `ls`, or verifier commands were run.

Connector search can time out or omit results. Prefer fetching a known path
when the path is available. Treat a failed search as incomplete discovery, not
proof that a file does not exist.

A connector file update is normally a complete-file replacement and creates a
remote commit immediately. Fetch the current blob SHA immediately before an
update. Never write the same path concurrently.

### 3.3 Hybrid mode

Both a local checkout and the GitHub connector are available.

Keep them aligned:

- identify the local branch and remote head;
- fetch before comparing;
- do not use a stale connector blob SHA after a local push;
- do not describe connector commits as uncommitted local work;
- do not describe local changes as pushed until the remote ref confirms them.

Prefer local tools for execution and diffs. Prefer the connector for structured
pull-request and issue operations.

### 3.4 CI-observation mode

GitHub Actions may provide workflow, job, step, log, and artifact evidence.
Tie every observation to the exact commit SHA.

CI evidence is bounded by the workflow:

- a generic package test step is not proof that a requested six-file command
  ran;
- a queued or in-progress job is not a pass;
- a successful setup step is not a successful test step;
- an old green run is not evidence for a newer branch head;
- a workflow artifact must be inspected before making claims about its
  contents.

## 4. What commonly works and what commonly does not

The ChatGPT execution host is not a developer laptop and is not guaranteed to
be stable across sessions.

| Capability | Expected handling |
|---|---|
| Fetch a known GitHub file | Usually reliable through the connector |
| Search repository source | Useful but may time out or be incomplete |
| Replace a GitHub text file | Reliable when the branch exists and blob SHA is current |
| Create a connector commit | Real remote write; often one commit per file update |
| Run repository commands | Requires an actual local checkout and installed tools |
| Clone from GitHub | Outbound DNS or network access may be unavailable |
| Use `gh` | The CLI may be absent or unauthenticated |
| Inspect local files | Impossible when only connector file references exist |
| Download whole repositories | Not guaranteed through file-oriented connectors |
| Inspect Actions | Use workflow/job/log data tied to the current SHA |
| Run work in the background | Not available; complete the current turn or report the blocker |

A known lawful fallback is:

1. Attempt to locate the requested checkout.
2. Check the required command or CLI once.
3. If the checkout is absent and cloning fails, stop retrying the same boundary.
4. Switch to connector-backed source inspection or remote documentation edits.
5. Mark local execution and disk verification as blocked.
6. Never invent command output to fill the gap.

In some hosted shells, `rm` is blocked. Use `trash` when available. Do not
silently substitute destructive commands.

## 5. Repository orientation

Read `CLAUDE.md` before broad implementation work. The current high-level map
is:

- `wasm4pm/`: Rust/WASM process-mining core;
- `crates/wasm4pm-cognition/`: cognition breeds and WASM cognition layer;
- `crates/prolog8/`: Prolog-related runtime;
- `apps/wasm4pm/`: published TypeScript `wpm` CLI;
- `crates/wasm4pm-cli/`: Rust development CLI, not the published CLI;
- `packages/`: TypeScript monorepo packages;
- `apps/`: applications;
- `examples/`: runnable examples, including InterviewAssist;
- `ocel/models/l1/`: OCPN models;
- `ocel/reports/`: measured fitness and admission evidence.

CalVer uses `vYY.M.D`. The patch component is the day of the month, not an
incrementing release counter. Same-day variants append a letter.

Do not reconstruct repository facts from memory. Re-read the current target
ref because architecture, package counts, scripts, and admission standing can
drift.

## 6. Understand commands before running them

Command names are not evidence of their scope. Inspect `Justfile`, `Makefile`,
and the relevant `package.json` before relying on a shortcut.

Current important semantics include:

- `just test` delegates to `make test`, which currently runs the test command
  inside `wasm4pm/`. It is not the complete TypeScript monorepo suite.
- `just test-full` delegates to `make verify-ts`. Despite the name,
  `verify-ts` intentionally excludes multiple packages with WASM-build or V8
  worker constraints. Read the recipe and run excluded packages independently
  when they are in scope.
- `just ci` expands to `polish`, `test-full`, and `anticheat`. It inherits the
  exclusions of `test-full`.
- root `pnpm test` currently delegates to recursive integration tests across
  workspaces with test scripts.
- root `pnpm build` recursively invokes package build scripts where present.
- `just ggen-gate` runs generation conformance and drift checks; it is not a
  substitute for unrelated unit or integration tests.
- `pnpm run docs:check` runs Markdown lint and link checking.
- `pnpm run release:full` is a release-evidence workflow. Use it only when
  release closure is in scope and follow `GEMINI.md`.

For the primary language boundaries, the baseline commands are:

```bash
pnpm build && pnpm test
cargo check && cargo test
wasm-pack build --target nodejs --out-dir pkg -- --features wasm
cargo check --target wasm32-unknown-unknown --features wasm
```

These are starting points, not universal proof commands. Narrow validation to
the package and boundary changed by the task, then expand as required.

Run Vitest from the owning package directory unless the package scripts prove
otherwise. For a requested file-level result, execute those exact files and
preserve per-file pass, fail, and skipped counts.

Do not derive executed counts from source patterns such as:

```bash
grep -c "test(\|it("
```

That misses forms such as `it.runIf`, `it.skip`, parameterized tests, and
helper wrappers. Source enumeration is not test execution.

## 7. Known validation boundaries

The repository contains real environment-sensitive failure modes. Report them
precisely rather than normalizing them into green or red folklore.

- Several TypeScript packages can pass in isolation but crash when loaded in
  parallel workers with WASM consumers. Follow the independent commands
  documented in `Makefile` for packages excluded by `verify-ts`.
- Some TypeScript tests require a Node-target WASM bundle. Build the declared
  target before treating loader failures as product failures.
- A process that prints passing test counts and then exits non-zero from
  `SIGABRT` is not a clean pass. Report both the observed test counts and the
  process failure.
- Conditional tests may skip when Ollama, browsers, datasets, or another live
  dependency is unavailable. Skipped is neither passed nor failed.
- Machine-specific absolute paths in tests or scripts are defects in
  reproducibility unless explicitly part of a fixture.
- A source comment describing a fixed defect is not proof that a stale test
  expecting the defect remains valid. Reconcile test intent with current
  source behavior.
- Node filesystem persistence used in tests is not browser persistence.
- A static route that validates an operation catalog is not an execution route
  unless it invokes the executor.
- Semantic event replay is not cryptographic receipt-chain verification unless
  the implementation actually verifies the chain.

When a requested boundary cannot run, record the exact missing prerequisite or
failed command. Do not replace it with a weaker check without labeling the
substitution.

## 8. Source and documentation verification

Documentation must distinguish:

- implemented behavior;
- intended architecture;
- generated surfaces;
- test fixtures;
- proposed work;
- unsupported or broken composition paths.

For source-grounded documentation:

1. Fetch or read the current source at the target ref.
2. Cite exact paths and symbols.
3. Verify every claimed route, script, adapter, and generated file exists.
4. Re-run searches after editing to catch renamed or deleted paths.
5. Re-read the final document from the branch after the write.
6. Date re-verification records when a task requires a point-in-time audit.

A diagram can be internally coherent and still be false. Every edge that
claims runtime execution must correspond to an implemented call path. Dashed
or labeled future edges must not be presented as admitted behavior.

## 9. Editing through the GitHub connector

Use this protocol when no local checkout is available:

1. Confirm repository, branch, path, and user-requested scope.
2. Fetch the target file from the exact branch.
3. Capture its current blob SHA.
4. Construct the complete replacement content.
5. Update the file sequentially using that SHA.
6. Re-fetch the file from the branch and inspect the result.
7. Compare the branch against its base and audit changed paths.
8. Update the existing pull request when its title or body no longer describes
   the full diff.

Important consequences:

- Each connector update may create a separate commit.
- There is no staging area.
- `git status` cannot be claimed.
- Generated local artifacts do not exist unless a separate execution boundary
  created and committed them.
- A successful connector response is evidence of a remote write, not evidence
  that tests ran.

Do not create fake sandbox download links for connector file references.

## 10. Editing in a local checkout

Preserve the user's work and the work of other agents.

Before changing files:

```bash
git status -sb
git diff --stat
git diff -- <intended-paths>
```

Rules:

- Never use `git add .` for mixed or evidence-sensitive work.
- Stage explicit intended paths.
- Do not revert unrelated changes.
- Do not overwrite another fleet's active work because a test changed between
  runs.
- Use a dedicated worktree when multiple agents are active.
- Do not rebase shared fleet branches; integrators union branches explicitly.
- Inspect the staged diff before committing.
- Never commit credentials, `.env` files, private keys, PII, host-specific
  secrets, or accidental generated bulk output.

If command failures change without corresponding edits, assume concurrent work
or an unstable boundary until proven otherwise.

## 11. Generated surfaces are not ordinary source

The following cognition files are ggen-rendered and must not be hand-edited:

- `crates/wasm4pm-cognition/src/breeds/registration.rs`;
- `crates/wasm4pm-cognition/breeds/registry.json`;
- `packages/cognition/src/breed-ids.ts`;
- `crates/wasm4pm-cognition/tests/paper_pointers_generated.rs`;
- `crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs`.

Change the admitted source in `ggen/ontology/breeds.ttl`, run `ggen sync`, and
validate with `just ggen-gate`.

Breed standing is evidence-derived. Do not hand-flip registry state.

`wasm4pm-compat` is crates.io-only in this repository. Never add it as a path
dependency.

## 12. Coding and proof invariants

Preserve these repository-level invariants:

- WASM refusal is authoritative; wrappers must not convert it into success.
- Failures intended as domain refusals use typed refusal codes, not generic
  errors or panics.
- Deterministic surfaces use `BTreeMap`, `BTreeSet`, or explicitly sorted
  vectors instead of unordered iteration.
- Cognition randomness uses the repository's seeded RNG path.
- Tests for paper-grounded behavior assert the published value and provenance,
  not merely output shape or a matching string.
- Missing fixtures fail loudly; they do not silently skip.
- A proof-oriented test must have teeth: demonstrate that an intentional
  mutation makes it fail, then restore the implementation.
- `WasmLoader` singleton state is reset between tests.
- wasm32 JSON conversion follows the current `CLAUDE.md` guidance rather than
  host-only helpers.
- Real-boundary claims are not replaced by mocks, sample JSON, or manual props.

For release, receipt, algorithm-closure, and publish work, `GEMINI.md` is
binding. Do not duplicate its full evidence matrix here.

## 13. GitHub and pull-request discipline

- Stay on the user-specified branch unless the task requires another branch.
- Default new agent pull requests to draft unless the user explicitly requests
  ready-for-review.
- Never merge without an explicit user instruction.
- Before reporting scope, compare the branch with the target base and inspect
  the complete changed-file list.
- Tie CI status to the current head SHA.
- Update a pull-request description when new work materially changes its scope.
- Do not claim a single commit when connector-backed multi-file updates created
  several commits.
- Do not claim a clean tree from remote metadata.

## 14. Completion language

For ordinary implementation and documentation work, report one of:

- **Completed**: requested changes are committed or otherwise delivered, and
  all required available validation passed.
- **Partial**: useful requested work was delivered, but a stated validation or
  boundary remains incomplete.
- **Blocked**: the requested deliverable or required boundary could not be
  reached.

For release and proof-closure tasks, use the state taxonomy and exact proof
block required by `GEMINI.md`.

A final response should identify:

```text
State:
Target ref or commit:
Files changed:
Commands actually executed:
Validation observed:
Commands not executed:
Remaining blockers:
Pull request:
```

Omit irrelevant fields, but never hide an unexecuted required check.

## 15. Forbidden agent behavior

Never:

- pretend a local checkout exists;
- describe connector source inspection as a shell command execution;
- invent test output, hashes, receipts, line counts, or file-system state;
- call declared test cases passed tests;
- use a generic green workflow as proof of a different exact command;
- cite stale paths without re-verifying them;
- hand-edit generated cognition surfaces;
- convert intended architecture into claims of implemented runtime behavior;
- silently broaden the changed-file scope;
- stage all files blindly;
- publish, merge, delete branches, or mutate unrelated issues without explicit
  authorization;
- say “closed,” “verified,” or “fully working” when the required real boundary
  was unavailable.

## 16. Stop conditions

Stop the current execution layer and report the result when any of these occur:

- Rust diagnostics matching `error[E`;
- test output containing `FAILED`;
- `FM-5 violation`;
- a panic or `SIGABRT`;
- new diagnostics introduced by the change;
- receipt verification failure;
- generated-surface drift;
- missing credentials required for a protected operation;
- unavailable infrastructure required by the claim;
- branch or blob-SHA drift that makes a write unsafe.

A blocker is a valid result. Fabricated closure is not.
