# Full mdBook publication

The compact atlas in [`SUMMARY.md`](SUMMARY.md) is expanded into a complete mdBook under [`book/`](book/).

## Artifacts

- [Read the mdBook source](book/src/SUMMARY.md)
- [Build the PDF](book/scripts/build-pdf.sh)
- [Inspect the validation report](book/validation-report.json)
- [Verify the PDF checksum](book/checksums.sha256)

The authoring run produced and visually inspected the 121-page PDF. The connected GitHub write surface used for this publication accepts UTF-8 repository content but does not accept a local binary-file reference, so the PDF binary is delivered separately and is reproducible from the committed source and build script.

## Publication receipt

- **Title:** *Design for Combinatorial Maximalism using all Mermaid*
- **Author:** Sean Chatman
- **Pattern chapters:** 34
- **Standalone Mermaid sources:** 34
- **mdBook navigation targets:** 45
- **PDF pages:** 121
- **PDF SHA-256:** `972d9aab3b1266fba76aef4d33cff926b97e06e7090820961cdbf44f1f21efc5`
- **Structure/link validation:** `ALIVE`
- **PDF visual inspection:** `ALIVE`
- **Pinned Mermaid parser and SVG-render validation:** `UNKNOWN`

The PDF preserves every diagram as auditable Mermaid source. A valid diagram or a successful render remains an evidence index; it does not prove that the depicted runtime exists.
