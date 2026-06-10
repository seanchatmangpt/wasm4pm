//! TypeScript types mirroring Rust serde shapes from `wasm4pm-cognition`.
//!
//! Pure type declarations — zero runtime logic. Every type here is the shape
//! of a value that crosses the WASM boundary as JSON.
//!
//! All types are now derived from Zod schemas in `./schemas.ts` via
//! `z.infer<>`. The schemas are the canonical definitions; this file
//! re-exports the inferred types for backwards-compatible usage.

export type {
  Fact,
  Case,
  Candidate,
  Rule,
  Goal,
  StateAtom,
  BreedId,
  BreedDescriptor,
  ShowReport,
  BreedInput,
  TraceStep,
  BreedOutput,
  Receipt,
  ReceiptLink,
  ReceiptChainSnapshot,
  Finding,
  ContractResult,
  VerifyResult,
  ReplayRecord,
  SystemIntent,
  SystemCandidate,
  SystemDominated,
  SystemBuildResult,
  SystemArtifact,
  SystemVerifyResult,
  DetectorSeverity,
  DetectorDescriptor,
  ChainVerifyOutcome,
  CausalCheckResult,
} from './schemas.js';
