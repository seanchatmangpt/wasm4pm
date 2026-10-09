<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/jira/v26.9.16/RFC-CLOSURE.md; source-sha256: 8346aeccbe48b4d5729d2ddfebb5f4ff9483ef5f251de54bd04307f4942c00ad; reason: path-local documentation retained pending domain-specific supersession -->

# wasm4pm v26.9.16 — RFC Closure Contract

Status: DRAFT IMPLEMENTATION PR.

## Canonical Jira tickets

- A2A-2609 — portable content-addressed `graphlaw.wasm`
- A2A-2607 — Blue River Dam cross-repo closure (portable-law leg)

## RFC ownership

This repo owns the portable WebAssembly/process-runtime side of the semantic-law story: the same admitted law subject must execute under supported WASM hosts without becoming a host-specific interpretation.

## Required closure

1. Define the stable WASM ABI consumed by the GraphLaw portable artifact.
2. Bind module bytes, profile, semantic-law revision and canonicalization algorithm into exact content identity.
3. Execute identical admission fixtures in at least two independent supported host contexts and compare canonical verdict/post-state evidence.
4. Ensure the WASM runtime exposes no implicit consequence authority; law evaluation returns verdict/state evidence only.
5. Preserve bounded execution/resource limits and typed refusal on unsupported host capabilities.
6. Emit receipts compatible with the ggen/SA2A exact semantic subject.

## Chicago falsifiers

- same exact module/input/profile yields divergent canonical result across qualified hosts;
- host-specific metadata leaks into canonical semantic identity;
- law module can invoke consequence-bearing host functionality not declared by profile;
- timeout/resource exhaustion is converted into PASS;
- mutable network dereference changes law semantics after subject identity was established.

## Definition of done

The exact PR head contains a reproducible portable-law build and cross-host court proving equivalent semantics for the same content-addressed subject, with negative controls for host capability, resource exhaustion and actuation attempts.
