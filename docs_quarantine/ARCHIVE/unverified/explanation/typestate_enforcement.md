<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/unverified/explanation/typestate_enforcement.md; source-sha256: 20cc5e4411798f8c28af1980c4fa3e4d93fbbdcfd50586c335abeb50c5da6639; reason: tooling or agent control surface -->

# Explanation: Typestate Enforcement in Rust

`wasm4pm` heavily utilizes the **Typestate Pattern** in Rust to turn runtime errors into compile-time guarantees, particularly within the Adversarial Admissibility pipeline.

## What is Typestate?
Typestate encodes the state of a state machine directly into the type system. 

## The Conformance Proof Pipeline

Instead of a boolean flag `is_verified`, we use types:

```rust
struct UnverifiedRun { result: Model }
struct VerifiedRun { result: Model, receipt: Blake3Hash }

impl UnverifiedRun {
    // This function CONSUMES the unverified run and returns a verified one
    // only if the 24 adversarial probes pass.
    pub fn verify(self, probes: ProbeSuite) -> Result<VerifiedRun, AdversarialError> {
        // ... probe execution ...
        Ok(VerifiedRun { result: self.result, receipt: hash })
    }
}
```

## Why it Matters
Because `wpm results --export` only accepts a `VerifiedRun` type as an argument, it is **computationally impossible** for an unverified model to be exported. The Rust compiler simply will not build the code if a developer tries to bypass the adversarial gates. This guarantees absolute architectural soundness.
