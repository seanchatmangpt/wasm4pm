<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/VISION_2030.md; source-sha256: 0152289c79ef50eb554fcb9f0c345c56a785e24d63935314bfd1235788e3c4c6; reason: canonical Vision 2030 capability contract -->

# Vision 2030 capability contract

Vision 2030 is the executable target for wasm4pm: object-centric observations become admitted process models, lawful WASM execution, signed evidence, replayable receipts, and bounded standing.

The governing equation is:

```text
A = μ(O*)
R = receipt(A)
```

`O*` is admitted, aligned, grounded, and bounded observation. `μ` is lawful manufacture. `A` is the resulting artifact or decision. `R` binds subject identity, authority, consequence, and replay.

## System law

The runtime sequence is:

```text
parse
  → route
  → admit | refuse
  → diagnose | repair
  → construct
  → BRCE actuation
  → receipt
  → replay
  → standing
```

SELECT, CONSTRUCT, and DO remain separate. BRCE is the exclusive DO path: no operation may actuate after admission without a pending receipt, and every attempted actuation must terminate in an outcome receipt or an explicit receipt failure.

## Standing vocabulary

| Standing | Meaning |
|---|---|
| `UNKNOWN` | The subject or required evidence was not observed. |
| `PARTIAL_ALIVE` | A lawful route exists, but required execution or closure evidence is incomplete. |
| `ALIVE` | The exact admitted subject executed and replayed successfully inside the claimed boundary. |
| `BLOCKED` | A required runtime, authority, identity, or evidence edge could not complete. |
| `BUILD_BROKEN` | The required build or runtime substrate failed. |
| `UNSUPPORTED` | No lawful route is implemented for the requested subject. |
| `REFUSED` | Admission rejected the subject with a typed reason; this may be correct behavior. |

Inspection is not execution. A queued workflow is not a successful workflow. A certificate name is not certificate closure. A generated capability catalog is not a runtime route.

## Executable rails

`wpm system doctor capabilities` evaluates twelve rails from the current checkout:

1. Environment substrate.
2. Process route law.
3. Developer experience.
4. Algorithm runtime.
5. Real-data boundaries.
6. Receipt contract.
7. Observability contract.
8. Configuration admission.
9. BRCE repair admission.
10. OCEL-v2 → POWL → WASM session and replay.
11. AAT-Live signed admission and bundle replay.
12. Exact release-certificate closure.

The report carries a deterministic evidence hash. Individual rails may impose an evidence ceiling when their checks prove only a declared route rather than complete runtime composition.

## OCEL-v2 → POWL → WASM

The session composition root is `wpm evidence session`:

```text
OCEL-v2 bytes
  → Rust/WASM OCEL normalization
  → Rust/WASM object-type flattening
  → independent TypeScript flatten comparison
  → event-log projection
  → POWL discovery
  → POWL parse and partial-order validation
  → bounded WASM execution
  → evidence hash
  → replay
```

The route requires the exact WASM exports used by the session implementation. OCEL-v1 and OCEL NDJSON are typed `UNSUPPORTED` until they have an equivalent executable WASM admission path. A TypeScript-only fallback cannot crown this rail.

## AAT-Live admission

The live chain is:

```text
AAT observation
  → Weaver vocabulary validation
  → POWL route identity
  → wasm4pm release identity
  → MCP+ proof validation
  → Accepted | Refused
  → passport
  → replayable bundle
```

`Accepted` requires the ordered observation stages, a zero-violation Weaver PASS, valid Ed25519 authority signatures, exact subject/trace/route/WASM/manifest identities, an independently verified release certificate bound to the same certificate hash and Git commit, and deterministic replay. A refused subject receives no passport.

## Release closure

A versioned release certificate is `ALIVE` only when it recomputes against:

- published package identity and version;
- exact Git commit;
- algorithm reachability evidence;
- algorithm behavior evidence and per-algorithm receipt hashes;
- executed example manifest;
- retained npm tarball contents and integrity;
- exact WASM bundle bytes;
- canonical certificate self-hash.

The generator writes a pending receipt before packaging, an outcome receipt after packaging, and immediately invokes the independent verifier.

## Current standing

The implementation exists on the active Vision 2030 branch, but repository-wide standing remains `PARTIAL_ALIVE` until all terminal rails execute against the same exact head and their receipts replay. Source inspection, isolated validation capsules, and queued hosted workflows cannot independently establish global `ALIVE`.

## Crown conditions

Vision 2030 reaches `ALIVE` only when all of the following bind to one immutable commit:

- the complete workspace builds and its required tests exit successfully;
- the real Node-target WASM package executes the OCEL-v2 session and exact replay;
- the release evidence ladder manufactures and verifies the exact certificate;
- a production-authority AAT-Live input manufactures an Accepted passport and replayable bundle;
- doctor recomputes all twelve rails without a blocking or capped terminal rail;
- required exact-head CI completes successfully;
- the emitted receipts and evidence hashes independently recompute.

Any identity drift, signature failure, missing export, flatten disagreement, certificate mismatch, replay mismatch, unreceipted actuation, or non-zero required command is a falsifier.
