<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/diagrams/combinatorial-maximalism/book/src/validation.md; source-sha256: d4fd556b4111897b1ebbf707e1a0fa538a76b673d1e41f2ff66edca25a915071; reason: tooling or agent control surface -->

# Validation and rendering

This book separates four validation layers.

## 1. Source completeness

Every pattern chapter has a standalone `.mmd` source and appears in `src/SUMMARY.md`. This is a documentation property.

## 2. Mermaid parser validation

Pin a Mermaid version and parse every source. Report stable, beta, experimental, and integration grammars separately. Parser success means the source is accepted by that parser version. It does not establish runtime truth.

## 3. Renderer validation

Render each accepted source to SVG and inspect for clipped labels, missing glyphs, unreadable density, and renderer-specific drift. Bind each SVG to a source hash and renderer version.

## 4. Architecture validation

For every non-diagnostic edge, locate source, trace, policy, test, proof, receipt, or decision evidence. Apply each chapter’s falsifier. Assign typed standing.

## Suggested CI contract

A future CI job should:

1. verify the mdBook summary contains every chapter;
2. verify every linked `.mmd` exists;
3. parse all sources with pinned Mermaid;
4. render accepted grammars to SVG;
5. produce a machine-readable matrix of pass, fail, unsupported, and quarantined;
6. build the mdBook HTML;
7. export the combined Markdown to PDF;
8. attach hashes and tool versions;
9. refuse to promote runtime standing based only on parser or renderer success.
