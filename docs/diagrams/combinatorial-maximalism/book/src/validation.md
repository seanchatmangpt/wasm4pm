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
