# Design for Combinatorial Maximalism using all Mermaid

This directory is an mdBook-compatible source tree and deterministic PDF publication pipeline.

## Build HTML with mdBook

```bash
mdbook build
```

The HTML theme loads Mermaid 11.16.0 from the official CDN and preserves source blocks when rendering is unavailable.

## Build PDF

```bash
./scripts/build-pdf.sh
python3 ./scripts/validate-book.py
sha256sum -c checksums.sha256
```

The expected generated artifact is:

```text
Design-for-Combinatorial-Maximalism-using-all-Mermaid.pdf
```

The authoring run produced 121 pages with SHA-256 `972d9aab3b1266fba76aef4d33cff926b97e06e7090820961cdbf44f1f21efc5` and passed a full-page visual inspection. The binary is not committed through the connector-only GitHub write path; it is reproducible from this source tree.

The PDF intentionally includes auditable Mermaid source for every diagram. Parser/render success is tracked separately from architectural standing.
