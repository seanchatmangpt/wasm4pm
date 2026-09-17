<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/examples/breeds-rust-consumer/README.md; source-sha256: 3c2144937c643494ea6e24f85491519f8651e168e504be24ff9fb5e322eae149; reason: path-local authority or entrypoint -->

# breeds-rust-consumer — working example

A runnable Rust app that consumes the **`wasm4pm-breeds-rust`** ggen pack: it
generates typed cognition-breed bindings from the breed ontology — **no
per-breed hand-coding** — and uses them.

## Run

```bash
ggen sync          # regenerate src/breed_ids.rs + src/breed_catalog.rs from the pack
cargo run          # builds and runs the demo
```

(The generated files are committed so `cargo run` works out of the box; `ggen sync`
regenerates them. Per the ggen doctrine, generated code is first-class source.)

## What it demonstrates

- `BreedId` — a total enum over all 55 breeds, with `as_str`, `from_str_id`, `ALL`.
- `CATALOG` — every breed's id, label, doc, and paper citation.
- The fixed WASM contract types (`BreedInput`/`Fact`/`Rule`/…/`CognitionRunInput`),
  shipped by the pack in `static/breed_types.rs`.
- Building a real MYCIN `cognition_run` request and serializing it.

## How it's wired

`ggen.toml` points at the pack (`../../packs/wasm4pm-breeds-rust`), runs two
Overwrite generation rules (`breed_ids.rs`, `breed_catalog.rs`), and the fixed
contract types are copied once from the pack's `static/`. To use this in your own
crate, copy `ggen.toml`, set the pack path, run `ggen sync`, and add `serde`.
