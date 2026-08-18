# wasm4pm-u8-part

Reference interchangeable part for the construct-only standing runtime.

The semantic call surface is one byte: `run(u8)`. The byte does not contain a
query, code, executable IR, prompt, path, resource name, or business payload.
It selects a host-owned pre-admitted construct capsule. The host must establish
OCEL v2 process conformance plus exact corpus and part standing before module
instantiation; this crate deliberately does not duplicate that authority.

For `wasm32`, the only declared host import is `chatman.construct`. The `run`
body forwards the selector without application-level branching. Rich ontology,
process, planning, and source semantics remain on the manufacturing side rather
than being serialized into this part.

Qualification builds the exact WASM, strips all semantically optional custom
sections, and then fails closed unless:

- no custom section remains;
- no runtime data segment remains;
- the import surface is exactly `chatman.construct`;
- `run` is a function export;
- the exact compiled `run` body contains no block, loop, if, br, br_if,
  br_table, or indirect-call opcode;
- the native oracle enumerates all 256 semantic selector values.

The artifact verifier does **not** prove signing, BLAKE3 identity, OCEL standing,
or a real SPARQL `CONSTRUCT` host. Those are composition-boundary claims and
remain separate until exact-subject evidence exists.
