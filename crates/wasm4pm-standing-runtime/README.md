# wasm4pm-standing-runtime

This is the host-side court paired with `wasm4pm-u8-part`. It makes the OCEL
process mathematics executable rather than treating process evidence as an
after-the-fact audit trail.

A standing session does not exist until a peer presents:

- the exact constitutional identity;
- the exact admitted corpus identity;
- the exact u8 dispatch identity;
- a part already admitted by an external signature verifier;
- the exact OCEL v2 process geometry expected by the local world.

The process geometry itself is the interaction witness. There is no separate
scalar creation password in this crate.

## Algebra

The constitution supplies a partial composition table over semantic u8
operations. Observed operations are folded through that algebra; any undefined
composition refuses. The table can express non-commutative laws.

## Geometry

Each canonical event has a contiguous ordinal, a semantic selector, a sorted
non-empty OCEL object set, and coordinates in an admitted process manifold.
Handshake compares the complete trajectory, not merely the endpoint. Two valid
processes that reach the same final coordinates do not thereby acquire the same
standing.

## Calculus

Because canonical event ordinals are unit-spaced, the court computes discrete
first derivatives, second derivatives, and per-dimension path integrals. The
constitution bounds all three. A process can therefore be refused for how it is
moving or how it arrived even when its current endpoint appears acceptable.

## Construct-only execution

After standing exists, `StandingSession::execute` accepts one `u8`. The byte must
resolve to a pre-admitted `ExecutionCapsule` in the exact dispatch table. The
capsule contains only exact identities for the part, CONSTRUCT, graph view,
policy, receipt shape, and canonical OCEL object set; there is no runtime query
text or executable IR.

`ConstructHost` deliberately has no DO surface. It can produce a candidate
artifact identity and next process coordinates. The candidate process is run
through algebra, geometry, and calculus before the new state acquires standing.

## Cryptographic boundary

`Digest32` means an exact BLAKE3 identity admitted by the surrounding sealing
boundary. This zero-dependency crate does not implement or substitute for
BLAKE3. Likewise, `SignedPart` can only be created through a supplied
`PartSignatureVerifier`; the concrete signature scheme remains a separate
cryptographic boundary.

The distinction is intentional: process geometry is the standing witness;
cryptographic primitives bind exact representations and authorship without
turning a stored scalar secret into the architecture's source of standing.
