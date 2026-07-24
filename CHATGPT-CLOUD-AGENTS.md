# CHATGPT-CLOUD-AGENTS.md — Hosted ChatGPT Environment Guide

This file is an environment-specific addendum to `AGENTS.md`.

It applies only to ChatGPT agents working in a hosted session where repository
access may be split across:

- a GitHub connector;
- an ephemeral shell or container;
- GitHub Actions metadata and logs;
- conversation file references;
- tools with different visibility and write semantics.

Read `AGENTS.md` first. This file does not redefine project architecture,
quality standards, release law, or coding rules.

Claude Code and other agents operating in a normal local checkout may skip this
file unless their runtime has the same constraints.

## 1. First environment law

Do not collapse these four boundaries into one claim:

1. Source inspected through a connector.
2. Source changed through a connector.
3. Commands executed in a local checkout.
4. CI observed for a specific remote commit.

They are different evidence classes.

Examples:

- Fetching a file through GitHub is not `cat`.
- Searching connector indexes is not `grep`.
- Replacing a file through GitHub is not editing a local worktree.
- A connector commit does not prove a local test ran.
- A CI pass does not prove an unlisted local command ran.

## 2. Determine the available mode

Before performing repository work, classify the session.

### 2.1 Local-checkout mode

A real checkout exists in the shell or container.

Establish it with:

```bash
pwd
git rev-parse --show-toplevel
git status -sb
git branch --show-current
git remote -v
```

Then verify tools individually:

```bash
command -v git
command -v gh
command -v just
command -v pnpm
command -v node
command -v cargo
command -v wasm-pack
command -v ggen
```

Do not assume a tool exists because the repository uses it.

Only a real checkout can directly prove:

- uncommitted and staged state;
- local diffs;
- command exit codes;
- local generated artifacts;
- exact test output;
- local receipt recomputation;
- the current filesystem tree.

### 2.2 GitHub-connector mode

The repository is available through a connected GitHub tool, but no local
checkout is available.

This mode can usually:

- fetch a known file from a known ref;
- search indexed source;
- inspect commits, branches, pull requests, issues, and changed paths;
- inspect workflow runs, jobs, steps, and logs when exposed;
- create or replace UTF-8 files on an existing branch;
- create real remote commits;
- update pull request metadata.

This mode cannot by itself:

- run pnpm, Vitest, Cargo, `just`, `make`, or shell commands;
- inspect an uncommitted worktree;
- execute literal `grep`, `find`, `ls`, `cat`, or `git status`;
- build WASM or package artifacts;
- generate receipts from source;
- prove that a command succeeds.

### 2.3 Hybrid mode

A local checkout and the connector are both available.

Keep them aligned:

- resolve the local branch and remote head;
- fetch before comparing;
- confirm a local push before describing changes as remote;
- do not reuse a stale connector blob SHA after another write or push;
- do not describe a connector commit as an uncommitted local edit;
- tie CI observations to the exact remote head SHA.

Prefer local tools for execution, diffs, generation, and staging. Prefer the
connector for structured pull request and issue operations.

### 2.4 CI-observation mode

GitHub Actions may be the only execution evidence available.

CI evidence is bounded by the workflow definition and commit SHA.

- Queued is not running.
- Running is not passed.
- A successful setup step is not a successful test step.
- A generic `test all packages` step does not prove a requested file-level
  command ran.
- A green run for an older SHA does not validate a newer head.
- An artifact name does not prove its contents until inspected.

## 3. Known hosted-environment behavior

The hosted ChatGPT environment is not a developer laptop and is not stable
across sessions.

| Capability | Expected behavior |
|---|---|
| Fetch a known GitHub file | Usually reliable through the connector |
| Search repository source | Useful, but may time out or omit results |
| Replace a GitHub text file | Reliable when branch and blob SHA are current |
| Create a connector commit | Real remote write, often one commit per update |
| Run repository commands | Requires a mounted checkout and installed tools |
| Clone from GitHub | May fail because outbound DNS or network is unavailable |
| Use `gh` | May be absent or unauthenticated |
| Download a whole repository | Not guaranteed through file-oriented connectors |
| Inspect Actions | Use run, job, step, log, and artifact data for the current SHA |
| Continue work in background | Not available unless a scheduling tool is explicitly used |

A connector search timeout means discovery is incomplete. It is not proof that
a file or symbol does not exist.

When a path is known, prefer direct file fetch over code search.

## 4. Lawful fallback when no checkout exists

Use this sequence:

1. Look for the expected checkout once.
2. Verify the required CLI or command once.
3. Attempt the appropriate repository acquisition boundary once.
4. If checkout acquisition fails because of network, DNS, authentication, or
   unsupported connector behavior, stop retrying the same boundary.
5. Switch to connector-backed source inspection or remote documentation work.
6. Mark local execution, disk inspection, and generated-artifact verification
   as blocked.
7. Never invent command output to complete the requested report.

A useful partial result is preferable to fictional execution.

## 5. Connector read protocol

For a known repository file:

1. Identify repository, path, and exact ref.
2. Fetch the file directly.
3. Record the returned blob SHA.
4. Use line ranges when only a bounded section is required.
5. Re-fetch after writes before citing final content.

For discovery:

- use repository search for symbols, filenames, and error text;
- keep queries simple;
- expect timeouts and index gaps;
- fetch candidate files directly to confirm results;
- do not treat zero search results as definitive absence.

Connector file references are not automatically local files. Do not invent a
`sandbox:/mnt/data/...` link for a file that was not materialized into the
active runtime.

## 6. Connector write protocol

Connector writes usually use the GitHub Contents API. A text-file update is a
complete replacement and creates a remote commit immediately.

For each file:

1. Confirm the requested branch already exists.
2. Fetch the file from that branch.
3. Capture the current blob SHA.
4. Construct the complete replacement text.
5. Update the file with that SHA.
6. Re-fetch the file from the branch.
7. Inspect the committed result.
8. Compare the branch with its base after all writes.

Rules:

- Never update the same path concurrently.
- Never reuse a blob SHA after another write to that path.
- Expect one connector commit per file update.
- There is no staging area.
- There is no connector equivalent of an uncommitted worktree.
- A successful update proves a remote commit, not tests or local generation.
- Audit the final changed-file list before reporting scope.

When new writes materially change a pull request, update its title and body.
Keep draft status unless the user requests ready-for-review.

Never merge without an explicit instruction.

## 7. Shell and container limits

When a shell exists, it may still have important constraints:

- the expected repository may not be mounted;
- outbound internet access may be disabled;
- DNS resolution may fail;
- `gh` may not be installed;
- package caches may be empty;
- browsers, containers, Ollama, and datasets may be unavailable;
- destructive commands such as `rm` may be blocked;
- execution time and process lifetime may be limited.

Verify each prerequisite rather than assuming a complete development machine.

When `rm` is blocked, use `trash` if available. Do not silently substitute a
different destructive operation.

Do not promise to continue work after the current response. Perform the work
through available tools now or report the exact blocker.

## 8. Testing claims in connector-only sessions

Source inspection can establish:

- declared test cases;
- conditional test forms;
- hardcoded paths;
- imports and mocked boundaries;
- the command declared in package scripts;
- likely prerequisites.

It cannot establish:

- pass, fail, or skipped counts;
- execution duration;
- process exit status;
- runtime-only errors;
- generated snapshots;
- browser or Ollama availability.

Use language such as:

- `The file declares four cases.`
- `Two cases use it.runIf.`
- `Execution results are unavailable in connector-only mode.`

Do not say:

- `Four tests passed.`
- `The suite is green.`
- `Vitest confirmed this.`

unless execution evidence actually exists.

## 9. CI evidence protocol

When using Actions as evidence:

1. Resolve the current branch head SHA.
2. Fetch workflow runs associated with that SHA.
3. Select the relevant workflow.
4. Inspect jobs and steps.
5. Inspect logs for the exact command and result.
6. Inspect artifacts when the claim depends on generated files.
7. State the command coverage precisely.

A workflow can support a claim only when the logs show the relevant boundary
ran against the current SHA.

If a workflow runs a broader or different command, report it as supplementary
evidence, not as a substitute for the requested command.

## 10. Remote documentation work

Connector-only documentation can still be high-value when it is source-grounded.

Use this method:

1. Fetch every cited source file from the current branch or base.
2. Trace imports, calls, and route boundaries explicitly.
3. Distinguish implementation from design intent.
4. Record missing files and broken composition paths.
5. Re-run source searches after editing.
6. Re-fetch all changed documents.
7. Compare changed paths with the base branch.
8. State which shell checks were not run.

Do not use a diagram or planning document as proof of runtime behavior.

## 11. Reporting format for hosted ChatGPT work

Use a bounded report:

```text
State:
Repository and ref:
Operating mode:
Remote commits created:
Files changed:
Source inspected:
Commands actually executed:
CI observed:
Commands not executed:
Remaining blockers:
Pull request:
```

Do not include fields that are irrelevant, but never omit a required check that
could not run.

## 12. Forbidden hosted-agent behavior

Never:

- pretend a checkout exists;
- describe connector search as `grep`;
- describe connector fetch as `cat`;
- describe connector commits as staged local changes;
- claim `git status` from remote metadata;
- fabricate test output, hashes, line counts, receipts, or file trees;
- infer absence solely from a timed-out connector search;
- use an old workflow run for a new commit;
- treat a generic green workflow as an exact requested command;
- create fake local download links for connector references;
- retry an unavailable network boundary indefinitely;
- say work will continue after the response;
- merge, publish, delete, or rewrite history without explicit authorization.

The correct outcome of an unavailable boundary is `Blocked` or `Partial`, not
fabricated completion.
