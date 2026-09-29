# wasm4pm-sa2a-actuator

Independent SA2A C2/C3 actuator boundary.

This crate is intentionally not part of the WASM4PM planner authority surface. It owns no authority signing key. It accepts a powerless portable PreparedEffect plus an independently issued ActuationCertificate, recomputes RFC8785/JCS SHA-256 effect identity, verifies the certificate locally, durably claims the exact effect digest plus generation, executes one typed effector, and durably records executed or unknown outcome.

The first effector is deliberately narrow: fs.write_utf8 under a fixed actuator-owned root. It has no shell, network credential, dynamic evaluation, NIF, port, or arbitrary command surface.

A crash with an executing record is reconciled to unknown outcome; it is never silently retried.

## Crypto provider boundary

The minimal actuator release locally re-verifies the admitted Ed25519 C2 profile. ML-DSA-65 and SLH-DSA-SHAKE-128f remain explicit wire algorithms but are refused unless a dedicated actuator crypto provider is later admitted. Castle's independent verification boundary remains algorithm-agile for all three; this actuator does not silently downgrade a PQ certificate.
