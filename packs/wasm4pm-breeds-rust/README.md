# wasm4pm-breeds-rust

A self-contained [ggen](https://ggen.dev) pack that generates a **standalone Rust
consumer surface** for the wasm4pm cognition-breed layer. External app authors
get fully-generated `BreedId` enum and breed `CATALOG` — no hand-writing, and no
dependency on the `wasm4pm` / `wasm4pm-compat` repos. The breed ontology (55
breeds) is bundled inside this pack.

## What it generates

Run via `ggen sync` (Overwrite mode) into your crate:

| File | Contents |
|------|----------|
| `src/breed_ids.rs` | `pub enum BreedId` — one PascalCase variant per breed, plus `impl BreedId { fn as_str(&self) -> &'static str; fn from_str_id(s: &str) -> Option<Self>; const ALL: &'static [BreedId] }`. |
| `src/breed_catalog.rs` | `pub struct BreedInfo { id, label, doc, citation }` and `pub const CATALOG: &[BreedInfo]` — one entry per breed with paper provenance. |

## Fixed contract types (ship as static files, not generated)

The WASM runtime contract does not vary per breed, so it is provided verbatim in
[`static/`](static/). Copy these into your crate once:

- [`static/breed_types.rs`](static/breed_types.rs) — `BreedInput`, `Fact`, `Rule`,
  `Goal`, `StateAtom`, `Candidate`, `Case`, `CognitionRunInput`, `ContractResult`
  (serde derives included).
- [`static/client.rs`](static/client.rs) — a short sketch of how to call
  `cognition_run`. The WASM binding itself is host-provided and out of scope.

## Usage

### 1. Add the pack to your `ggen.toml`

Copy [`example-consumer-ggen.toml`](example-consumer-ggen.toml) into your crate
root as `ggen.toml` and replace `/ABS/PATH/TO/wasm4pm-breeds-rust` with the path
to this pack. If your ggen workflow uses the `[[packs]]` registry mechanism, the
equivalent declaration is:

```toml
[[packs]]
name = "wasm4pm-breeds-rust"
path = "/ABS/PATH/TO/wasm4pm-breeds-rust"
```

…and then reference the pack's `ggen/queries/extract-breeds.rq` and
`ggen/templates/*.tera` from your generation rules. The file-path form in the
example toml is the most portable and is what the included render test uses.

The two generation rules (Overwrite mode):

```toml
[[generation.rules]]
name        = "breed-ids"
query       = { file = ".../ggen/queries/extract-breeds.rq" }
template    = { file = ".../ggen/templates/breed_ids.rs.tera" }
output_file = "src/breed_ids.rs"
mode        = "Overwrite"

[[generation.rules]]
name        = "breed-catalog"
query       = { file = ".../ggen/queries/extract-breeds.rq" }
template    = { file = ".../ggen/templates/breed_catalog.rs.tera" }
output_file = "src/breed_catalog.rs"
mode        = "Overwrite"
```

> ggen's DMAIC quality gate requires `[project]` to have `name` + `description`
> and at least one `[inference]` rule. The example toml includes a trivial
> `mark-breeds` CONSTRUCT that satisfies this without changing the output.

### 2. Generate

```bash
ggen sync
```

This writes `src/breed_ids.rs` and `src/breed_catalog.rs` (55 breeds).

### 3. Use the generated surface

```rust
mod breed_ids;
mod breed_catalog;
mod breed_types;
mod client;

use breed_ids::BreedId;
use breed_catalog::CATALOG;

fn main() {
    // Enumerate every breed.
    for b in BreedId::ALL {
        println!("{}", b.as_str());
    }

    // Round-trip a wire id.
    assert_eq!(BreedId::from_str_id("mycin"), Some(BreedId::Mycin));
    assert_eq!(BreedId::Mycin.as_str(), "mycin");

    // Look up paper provenance.
    let info = CATALOG.iter().find(|i| i.id == "bayesian_network").unwrap();
    println!("{}: {}", info.label, info.citation);
}
```

## Pack layout

```
wasm4pm-breeds-rust/
  ggen/ontology/breed-vocabulary.ttl  # CognitionBreed class + predicate vocab
  ggen/ontology/breeds.ttl            # the 55 breed instances (bundled)
  ggen/queries/extract-breeds.rq      # SELECT — columns become Tera row fields
  ggen/templates/breed_ids.rs.tera    # -> breed_ids.rs
  ggen/templates/breed_catalog.rs.tera# -> breed_catalog.rs
  static/breed_types.rs               # fixed WASM contract types
  static/client.rs                    # cognition_run call sketch
  example-consumer-ggen.toml          # copy-paste consumer config
  README.md
```

## Note on citations

ggen 26.6.11's RDF/SPARQL binding does not decode TTL string-internal escaped
double quotes (`\"`) — it truncates the literal at that point. To keep the pack
self-contained and render all 55 citations correctly, the three affected
citations in the bundled `breeds.ttl` use typographic curly quotes (`“ ”`)
instead of escaped straight quotes. This is lossless for human-readable
citations. The `breed_id` and `breed_label` fields never contain quotes, so the
`BreedId` enum is unaffected regardless.
```
