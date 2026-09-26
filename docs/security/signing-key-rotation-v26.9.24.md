# Signing-key rotation (v26.9.24)

Recorded 2026-09-24 (fleet key scan after the single-repo migration). Base `da48e98cdde8` of `wasm4pm`.
Every private key listed here was committed to this repository and is therefore compromised: every receipt or
attestation signed with it carries no signing authority (standing REFUSED, broken_term R_missing_authority).
The keys leave the tree (history is not rewritten; no force-push), and each key directory's `.gitignore` now
covers both halves. Every checkout keeps its own pair: ggen generates one on first use, and a tracked public
half without its private half would make that first `ggen sync` refuse [FM-KEY-010/011]. The canonical
checkout's new public key is published below for anyone verifying its future receipts.

| key dir | removed private key sha256 | removed public key sha256 | new public key (canonical checkout) |
|---|---|---|---|
| `.ggen/keys` | removed earlier | `fdfd8dd058b628e2054f442a1887ff36ec80ec181b6a457933b74754bbe4e164` | `d3782c9f745bc5385c6a764ec19f63bc0dd8e5743b94024989e526ff64548d7d` |

## Keys exposed on non-default branches (revoked 2026-09-24)

The v26.9.24 rotation scanned default branches only. A scan of every `origin/*` branch found the
private keys below committed on non-default branches only. Each is compromised and revoked: any receipt
or attestation signed with it carries no signing authority (standing REFUSED, broken_term
R_missing_authority). A disk scan of the canonical checkouts on 2026-09-24 found three of these keys in
use (ggen/packs, ignored files) and replaced them with fresh pairs. Copies in agent worktrees and tool
caches may still hold them. History is not rewritten, so the branches keep the blobs.

| path | private key sha256 | derived public key | branches (count, first) |
|---|---|---|---|
| `.ggen/keys/signing.key` | `0bc4571baf366d62db2f1f61ba2d5e8a1142539e630906acd8def9fa7936a674` | `49b6dc3bf924e3c31bfda14e4a9ab5fbccacaa457c8b8a7cb982a67ccfa2b014` | 14, `feat/iter16-miniml-prolog8` |
| `lifecycle/.ggen/keys/signing.key` | `3ef91b6161b039f06266f04a620fc653b5387c3dc4b783c94740b7fa5fdd9f68` | `ba2030b3408e301b862cac38a78c8a33f0b52334689d0e66f8a0c0e87950da75` | 14, `feat/iter16-miniml-prolog8` |
