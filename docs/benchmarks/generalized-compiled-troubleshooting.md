# Generalized Compiled Troubleshooting

This benchmark generalizes the SREGym-derived issue calculus into a domain-independent troubleshooting substrate.

## Calculus

`OBSERVE -> NORMALIZE -> ROUTE -> HYPOTHESIZE -> ELIMINATE -> CONSTRUCT -> VERIFY -> ADMIT | REFUSE | FALLBACK -> RECEIPT`

The compiled path is appropriate when observations are structured, the causal/hypothesis graph is finite and admitted, candidate repairs are bounded, and verification is deterministic. Novel causal topology remains `FALLBACK`.

## Domains

The initial generalized inventory spans distributed systems, security, infrastructure, configuration, dependencies, data/schema failures, software/version compatibility, messaging/backpressure, storage, networking, developer tooling/builds, governance/policy, business-process state, and explicit novelty.

These are archetypes, not claims that all incidents in a domain are deterministic.

## Benchmark questions

The rail measures:

1. symptom/evidence routing throughput;
2. hypothesis elimination throughput;
3. compiled-known-pattern throughput;
4. fallback-boundary throughput;
5. complete issue-reasoning throughput;
6. compiled vs fallback observations;
7. receipt production under zero actuation authority.

The flagship scale is 10,000,000 episodes. Every episode executes eight modeled diagnostic transitions and emits a BLAKE3 receipt. `actuation=REFUSED` is invariant.

## General replacement criterion

A troubleshooting class is a candidate for wasm4pm rather than an LLM when:

`structured_evidence AND finite_admitted_graph AND bounded_repairs AND deterministic_verifier`.

The complement is not failure. It is the explicit discovery frontier:

`unknown_or_novel -> FALLBACK -> cognition -> validate pattern -> admit -> compile`.

This creates a ratchet: recurring troubleshooting can migrate from expensive open-ended cognition into deterministic process execution without granting diagnostic hooks ambient DO authority.

## Claim boundary

This executable is a synthetic generalized process-reasoning stress rail. It does not establish production solve rate, human replacement percentage, LLM superiority, token savings, MTTR reduction, or safe autonomous repair. Those require matched real issue corpora and independent outcome verifiers.
