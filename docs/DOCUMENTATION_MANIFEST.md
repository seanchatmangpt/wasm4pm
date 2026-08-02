<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/DOCUMENTATION_MANIFEST.md; source-sha256: 0cd3cd1aa5b026cd4aa74ce7406f73994a9512349dc9b07a90cc33241d686603; reason: partial connector-backed migration manifest pending exact-checkout generation -->

# Documentation migration manifest

## Standing

`PARTIAL_ALIVE`

This manifest records documentation changed or positively observed through the GitHub connector on 2026-08-02. It is not the exhaustive full-tree manifest manufactured by `pnpm run docs:migrate` because recursive tree materialization was blocked in this execution capsule.

## Exact subject

- Repository: `seanchatmangpt/wasm4pm`
- Migration base: `afe541a67167edfb9e7ef3bd250afc96f2194079`
- Branch: `agent/vision-2030-doctor-brce`
- Review date: 2026-08-02
- Recursive connector tree listing: unavailable
- Exact archive download / clone: DNS or transport blocked
- Repository code search: upstream 502 during this pass

## Canonical documents rewritten

| Path | State | Result |
|---|---|---|
| `README.md` | active | Rewritten around executable standing and current proof entrypoints. |
| `docs/README.md` | active | Added as the canonical documentation map. |
| `docs/VISION_2030.md` | active | Added as the capability contract and crown condition. |
| `docs/DOCUMENTATION_POLICY.md` | active | Added active/archive classification and lineage law. |
| `docs/explanation/architecture_overview.md` | active | Rewritten around admission, BRCE, receipts, replay, session, AAT-Live, and release closure. |
| `docs/tutorials/getting_started.md` | active | Rewritten as an exact-checkout tutorial with typed standing and replay. |
| `docs/ENTERPRISE.md` | active | Rewritten as an artifact, authority, deployment, and rollback evidence contract. |
| `TESTING.md` | active | Rewritten as an evidence ladder without fixed pass counts. |
| `WASM_API.md` | active | Rewritten as a build-specific boundary contract instead of a dated hand-counted export list. |
| `CONTRIBUTING.md` | active | Rewritten to align with repository doctrine and generated-surface law. |
| `SECURITY.md` | active | Rewritten with bounded trust, disclosure, signature, release, and telemetry claims. |
| `CLAUDE.md` | active | Reduced to a compatibility pointer to the canonical agent doctrine. |
| `GEMINI.md` | active | Reduced to a compatibility pointer to the canonical agent doctrine. |

## Generated projections preserved

| Path | State | Owner |
|---|---|---|
| `docs/reference/cli_commands.md` | generated | `apps/wasm4pm/scripts/gen-cli-docs.ts` and the live noun/verb registry. |
| `docs/reference/algorithms.md` | generated | The repository algorithm-documentation generator. |

Generated Markdown is not rewritten by the migration engine. It must be regenerated from its owning source and checked for drift.

## Documents archived

| Original path | Archive | Identity |
|---|---|---|
| `ALGORITHM_AND_BREED_STATUS.md` | `docs/archive/2026-08-02/ALGORITHM_AND_BREED_STATUS.md` | Source commit and Git blob retained; active path replaced by pointer. |

The repository-owned `GEMBA-FILES.txt` referenced several April 2026 Markdown files, but the connector returned `404` for sampled root files. The inventory itself is stale and is not evidence that those Markdown paths remain in the target tree.

## Migration mechanism

`scripts/docs/migrate-markdown.mjs` traverses an exact checkout and:

- classifies every `.md` as active, generated, archive pointer, or archived;
- excludes build and dependency directories;
- adds status, review date, original path, reason, and source digest metadata;
- copies stale documents to `docs/archive/2026-08-02/<original-path>`;
- replaces original paths with stable archive pointers;
- preserves legal, governance, agent, README, Diátaxis, ADR, and generator-owned surfaces;
- generates the exhaustive `docs/DOCUMENTATION_MANIFEST.md`;
- returns non-zero in `--check` mode when another migration would change files.

The migration engine is covered by `scripts/docs/test-migrate-markdown.mjs`.

## Validation executed

```text
node scripts/docs/test-migrate-markdown.mjs
{"status":"PASS","assertions":14,"fixture":"synthetic"}

node --check scripts/docs/migrate-markdown.mjs
exit 0

node --check scripts/docs/test-migrate-markdown.mjs
exit 0
```

The synthetic test proves active rewrite, historical archive copy, stable archive pointer, generated projection preservation, manifest generation, and a zero-change second pass.

## Completion command

A full repository checkout must execute:

```bash
pnpm run docs:inventory
pnpm run docs:migrate
pnpm run docs:governance
pnpm run docs:check
pnpm --filter @wasm4pm/cli run gen:docs -- --check
```

The resulting generated manifest supersedes this partial connector manifest only when the second migration pass reports zero changes and lint, link, and generated-reference checks pass against the same exact commit.

## Falsifiers

The documentation migration is not globally `ALIVE` while any of these remain true:

- a Markdown file is absent from the generated full-tree manifest;
- a stale status, audit, report, or completion document remains active without justification;
- an archive pointer lacks immutable lineage;
- an active document contains a fixed count or success claim that does not recompute at the same ref;
- a generated reference drifts from its owning source;
- `docs:governance`, Markdown lint, link verification, or generator drift checks exit non-zero;
- the exact-head workflow has not executed successfully.
