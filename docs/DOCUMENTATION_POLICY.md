<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/DOCUMENTATION_POLICY.md; source-sha256: 651945384fd0b2bf595d5c689056f0217929170f1cfb1be8483cac680c4aec9f; reason: canonical documentation governance -->

# Documentation policy

Documentation is a projection of executable source and evidence. It is not an independent authority for runtime standing.

## States

Every Markdown file is classified as one of three states:

- **Active** — current guidance, governance, reference, tutorial, or explanation.
- **Archive pointer** — a stable original path that redirects to an immutable historical copy.
- **Archived** — historical evidence retained under `docs/archive/` or `docs_quarantine/`.

Active does not mean executed. Statements about behavior must identify the source, command, receipt, or exact artifact that supports them. Historical reports may preserve old claims, but their archive header makes clear that they are not current product truth.

## Canonical surfaces

The active documentation entrypoints are:

- `README.md` — product orientation and supported entrypoints.
- `docs/README.md` — documentation map and standing rules.
- `docs/VISION_2030.md` — capability target, admission conditions, and falsifiers.
- `docs/explanation/architecture_overview.md` — implemented system architecture.
- `WASM_API.md` — WASM boundary and export verification procedure.
- `TESTING.md` — validation ladder and evidence semantics.
- `CONTRIBUTING.md` — contribution workflow.
- `SECURITY.md` — security reporting and trust boundaries.
- `AGENTS.md` — repository-wide agent doctrine.

Path-local `AGENTS.md` and `README.md` files remain active because they govern or orient their subtree.

## Archive law

Status reports, audits, completion summaries, migration reports, checklists, handoffs, retrospectives, and generated evidence narratives are archived when they are not canonical inputs to the current system.

Archiving is reversible and lineage-preserving:

1. Copy the original bytes to `docs/archive/YYYY-MM-DD/<original-path>`.
2. Add an archived status header and source digest to the copy.
3. Replace the original with an archive pointer.
4. Keep Git history and the SHA-256 digest as independent lineage evidence.

Do not delete legal documents, governance contracts, security policy, license terms, active ADRs, or path-local agent instructions as part of a documentation cleanup.

## Migration commands

```bash
# Preview classifications and changes
pnpm run docs:inventory

# Rewrite active metadata and archive stale documents
pnpm run docs:migrate

# Prove the migration is idempotent
pnpm run docs:governance

# Validate active Markdown formatting and links
pnpm run docs:check
```

`docs:migrate` manufactures `docs/DOCUMENTATION_MANIFEST.md` from the exact checkout. A complete migration requires the manifest, an idempotent second pass, Markdown lint, and link verification against the same commit.

## Updating documentation

When behavior changes:

1. Update the owning source and tests first.
2. Update the smallest canonical documentation surface that explains the behavior.
3. Replace fixed counts with executable discovery commands unless the count is generated from the same ref.
4. Label intended, unsupported, blocked, and historical behavior explicitly.
5. Run `pnpm run docs:migrate` and `pnpm run docs:check`.
6. Preserve command exits and the exact Git commit in the PR receipt.

A document must never convert source inspection, a declared workflow, or a queued CI run into a successful execution claim.
