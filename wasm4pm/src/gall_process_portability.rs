//! GALL-021..023 portable process qualification courts.
//!
//! The courts admit only evidence that was produced by executing an exact
//! WASM artifact:
//!
//! * [`RuntimeWitness`] values cannot be constructed outside this crate; the
//!   native harness (`gall_runtime_harness`) is the only producer, and it
//!   records the engine family, the runtime version reported by the host
//!   binary, the module digest and the input digest of the run.
//! * Host capabilities are derived from the module's import section
//!   ([`crate::gall_wasm_lowering::inspect_module`]), never asserted.
//! * GALL-022 compares executed acceptor verdicts against a generative
//!   reference language (trace-set probe), checks the hierarchy skeleton read
//!   back from module bytes, and rebuilds the module to bind compiler identity.
//! * GALL-023 compares executed OCPQ results against the ex4pm reference
//!   evaluator.
//!
//! This module performs no I/O and exposes no external consequence
//! capability (authority NONE; evidence ceiling COMPUTE).

use crate::gall_wasm_lowering::{
    gall017_reference_evaluate, inspect_module, lower_gall017_query, lower_powl, Gall017Ocel,
    Gall017Query, Gall017Result, LanguageProbe, ModuleInspection, PortableModule, PowlSubject,
    KIND_GALL017_OCPQ, KIND_POWL_ACCEPTOR,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

pub(crate) fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

pub(crate) fn digest_json<T: Serialize>(value: &T) -> String {
    sha256(&serde_json::to_vec(value).expect("serializable qualification subject"))
}

pub(crate) fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    })
}

/// Maximum admitted POWL nesting depth (root = level 1, leaf included).
/// Deeper models are refused, never walked, so adversarial input cannot
/// overflow the stack.
///
/// The bound is tied to replay: partial-order and choice levels cost two JSON
/// nesting levels (object + `children` array) in both the GALL-016 input
/// dialect and the `gall.powl.skeleton` module section, so a depth-D model
/// serializes at nesting `2*D - 1`. serde_json admits at most
/// [`MAX_JSON_NESTING`] = 127 levels, hence D <= 64. A larger bound would admit
/// subjects whose own module section cannot be read back by `inspect_module`.
pub const MAX_POWL_DEPTH: usize = 64;

/// Deepest JSON nesting serde_json parses with its default recursion limit.
pub const MAX_JSON_NESTING: usize = 127;

const _: () = assert!(2 * MAX_POWL_DEPTH - 1 <= MAX_JSON_NESTING);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PortabilityRefusal {
    InvalidDigest(String),
    NeedTwoIndependentRuntimes,
    /// Two witnesses come from the same engine family (e.g. two V8 hosts).
    DuplicateRuntimeIdentity,
    UnboundHostCapability(String),
    /// The module imports something outside the qualified WASI surface.
    UnsupportedHostImport(String),
    SemanticResultMismatch,
    UnsupportedPowlConstruct(String),
    InvalidPowlInput(String),
    /// Source and module skeleton / alphabet differ (hierarchy, boundary or
    /// construct structure was not preserved).
    PowlPreservationMismatch,
    /// Module names a different admitted POWL/query subject
    /// (ARD: source digest mismatch => REFUSED).
    SourceDigestMismatch,
    /// Executed acceptor verdicts diverge from the reference language
    /// (ARD: semantic probe divergence => FAIL).
    SemanticProbeDivergence,
    /// A partial-order edge names an endpoint that is not a direct child, is a
    /// self-loop, or the declared edges contain a cycle.
    MalformedPartialOrder(String),
    /// POWL nesting exceeds [`MAX_POWL_DEPTH`].
    PowlDepthExceeded,
    /// The POWL automaton or reference language exceeds its admitted budget.
    PowlStateSpaceExceeded,
    OcpqReferenceMismatch,
    MissingRelationBecamePass,
    UnsupportedOcpqOperator(String),
    InvalidOcpqQuery(String),
    InvalidOcel(String),
    /// A receipt's `receipt_digest` does not match its recomputed digest.
    ReceiptDigestMismatch,
    /// Module bytes fail validation or lack the GALL sections.
    InvalidModule(String),
    /// Module kind does not match the court it was presented to.
    ModuleKindMismatch(String),
    /// Rebuilding the subject with the current compiler does not reproduce
    /// the presented module bytes (compiler identity / determinism).
    ModuleIdentityMismatch,
    /// A witness ran a different module or input than the subject names.
    WitnessSubjectMismatch,
    /// The probe was built for a different subject.
    ProbeSubjectMismatch,
    /// A runtime's output does not have the lowered module's output shape.
    PortableOutputMalformed(String),
    /// The requested runtime is not installed on this host (UNSUPPORTED).
    RuntimeUnavailable(String),
    /// The runtime failed to execute the module (trap, crash, timeout).
    RuntimeFailure(String),
}

// ---------------------------------------------------------------------------
// Host capability fence (derived from module imports)
// ---------------------------------------------------------------------------

/// Unknown capability names are refused at the parse boundary (fail closed):
/// a capability this fence does not model cannot be silently dropped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct HostCapabilityFence {
    #[serde(default)]
    pub clock: bool,
    #[serde(default)]
    pub randomness: bool,
    #[serde(default)]
    pub filesystem: bool,
    #[serde(default)]
    pub network: bool,
}

impl HostCapabilityFence {
    /// Every capability present must be explicitly bound into the subject.
    pub fn validate(&self, explicitly_bound: &BTreeSet<String>) -> Result<(), PortabilityRefusal> {
        for (name, present) in [
            ("clock", self.clock),
            ("randomness", self.randomness),
            ("filesystem", self.filesystem),
            ("network", self.network),
        ] {
            if present && !explicitly_bound.contains(name) {
                return Err(PortabilityRefusal::UnboundHostCapability(name.into()));
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Runtime witnesses (harness-produced only)
// ---------------------------------------------------------------------------

/// Engine family. Independence is decided by engine, not by label spelling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEngine {
    /// wasmtime (Cranelift code generator).
    Cranelift,
    /// V8 (node).
    V8,
    /// JavaScriptCore (bun).
    JavaScriptCore,
}

impl RuntimeEngine {
    pub const ALL: [RuntimeEngine; 3] = [
        RuntimeEngine::Cranelift,
        RuntimeEngine::V8,
        RuntimeEngine::JavaScriptCore,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            RuntimeEngine::Cranelift => "cranelift",
            RuntimeEngine::V8 => "v8",
            RuntimeEngine::JavaScriptCore => "javascriptcore",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct RuntimeIdentity {
    pub engine: RuntimeEngine,
    pub version: String,
}

/// Observation of one execution of an exact module over an exact input.
/// Fields are private and there is no public constructor or `Deserialize`:
/// only the in-crate harness can produce a witness.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RuntimeWitness {
    engine: RuntimeEngine,
    runtime_version: String,
    module_digest: String,
    input_digest: String,
    canonical_result: Vec<u8>,
    /// Performance is recorded but never part of semantic identity.
    wall_nanos: u128,
}

impl RuntimeWitness {
    pub(crate) fn observed(
        engine: RuntimeEngine,
        runtime_version: String,
        module_digest: String,
        input_digest: String,
        canonical_result: Vec<u8>,
        wall_nanos: u128,
    ) -> Self {
        Self {
            engine,
            runtime_version,
            module_digest,
            input_digest,
            canonical_result,
            wall_nanos,
        }
    }

    pub fn engine(&self) -> RuntimeEngine {
        self.engine
    }

    pub fn identity(&self) -> RuntimeIdentity {
        RuntimeIdentity {
            engine: self.engine,
            version: self.runtime_version.clone(),
        }
    }

    pub fn module_digest(&self) -> &str {
        &self.module_digest
    }

    pub fn input_digest(&self) -> &str {
        &self.input_digest
    }

    pub fn canonical_result(&self) -> &[u8] {
        &self.canonical_result
    }

    pub fn semantic_result_digest(&self) -> String {
        sha256(&self.canonical_result)
    }

    pub fn wall_nanos(&self) -> u128 {
        self.wall_nanos
    }
}

/// Admit >= 2 witnesses from distinct engines that ran exactly
/// (`module_digest`, `input_digest`) and agree on the canonical result.
fn admit_witnesses<'a>(
    module_digest: &str,
    input_digest: &str,
    witnesses: &'a [RuntimeWitness],
) -> Result<(Vec<RuntimeIdentity>, &'a [u8]), PortabilityRefusal> {
    if witnesses.len() < 2 {
        return Err(PortabilityRefusal::NeedTwoIndependentRuntimes);
    }
    let mut engines = BTreeSet::new();
    let mut runtimes = Vec::new();
    for w in witnesses {
        if w.module_digest != module_digest || w.input_digest != input_digest {
            return Err(PortabilityRefusal::WitnessSubjectMismatch);
        }
        if !engines.insert(w.engine) {
            return Err(PortabilityRefusal::DuplicateRuntimeIdentity);
        }
        runtimes.push(w.identity());
    }
    let first = &witnesses[0].canonical_result;
    if witnesses.iter().any(|w| &w.canonical_result != first) {
        return Err(PortabilityRefusal::SemanticResultMismatch);
    }
    runtimes.sort();
    Ok((runtimes, first))
}

fn replay_check<T: Serialize + Clone>(
    value: &T,
    clear: impl FnOnce(&mut T) -> String,
) -> Result<(), PortabilityRefusal> {
    let mut unsigned = value.clone();
    let claimed = clear(&mut unsigned);
    if digest_json(&unsigned) != claimed {
        return Err(PortabilityRefusal::ReceiptDigestMismatch);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// GALL-021 portable process execution
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableProcessSubject {
    /// Admitted process source (POWL source digest, query digest, ...).
    pub process_digest: String,
    pub module_digest: String,
    pub input_digest: String,
    pub parameters_digest: String,
    /// Host capabilities the subject explicitly binds (empty = fully fenced).
    #[serde(default)]
    pub explicitly_bound: BTreeSet<String>,
}

impl PortableProcessSubject {
    pub fn new(
        process_digest: &str,
        module: &PortableModule,
        input: &[u8],
        parameters_digest: &str,
    ) -> Self {
        Self {
            process_digest: process_digest.into(),
            module_digest: module.digest().into(),
            input_digest: sha256(input),
            parameters_digest: parameters_digest.into(),
            explicitly_bound: BTreeSet::new(),
        }
    }

    pub fn validate(&self) -> Result<(), PortabilityRefusal> {
        for (name, value) in [
            ("process_digest", &self.process_digest),
            ("module_digest", &self.module_digest),
            ("input_digest", &self.input_digest),
            ("parameters_digest", &self.parameters_digest),
        ] {
            if !valid_digest(value) {
                return Err(PortabilityRefusal::InvalidDigest(name.into()));
            }
        }
        Ok(())
    }

    pub fn digest(&self) -> String {
        digest_json(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableExecutionReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub subject_digest: String,
    pub module_digest: String,
    pub input_digest: String,
    pub semantic_result_digest: String,
    pub runtimes: Vec<RuntimeIdentity>,
    pub host_imports: Vec<(String, String)>,
    pub falsifiers: Vec<String>,
    pub authority: String,
    pub evidence_ceiling: String,
    pub receipt_digest: String,
}

impl PortableExecutionReceipt {
    /// Replay check: recompute the digest over every field except
    /// `receipt_digest` and refuse on mismatch.
    pub fn verify_digest(&self) -> Result<(), PortabilityRefusal> {
        replay_check(self, |r| std::mem::take(&mut r.receipt_digest))
    }
}

/// Qualify one exact module execution across independent engines.
pub fn qualify_portable_execution(
    subject: &PortableProcessSubject,
    module: &PortableModule,
    witnesses: &[RuntimeWitness],
) -> Result<PortableExecutionReceipt, PortabilityRefusal> {
    subject.validate()?;
    if module.digest() != subject.module_digest {
        return Err(PortabilityRefusal::WitnessSubjectMismatch);
    }
    let inspection = inspect_module(module)?;
    inspection.host_fence.validate(&subject.explicitly_bound)?;
    let (runtimes, canonical) =
        admit_witnesses(&subject.module_digest, &subject.input_digest, witnesses)?;

    let mut receipt = PortableExecutionReceipt {
        schema: "gall.portable-process-execution-receipt/2".into(),
        checkpoint: "GALL-021".into(),
        subject_digest: subject.digest(),
        module_digest: subject.module_digest.clone(),
        input_digest: subject.input_digest.clone(),
        semantic_result_digest: sha256(canonical),
        runtimes,
        host_imports: inspection.imports,
        falsifiers: vec![
            "cross-engine-semantic-equality(executed)".into(),
            "witness-bound-to-module-and-input".into(),
            "host-fence-derived-from-imports".into(),
            "performance-excluded-from-semantic-identity".into(),
        ],
        authority: "NONE".into(),
        evidence_ceiling: "COMPUTE only; no external DO".into(),
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest_json(&receipt);
    Ok(receipt)
}

// ---------------------------------------------------------------------------
// GALL-022 POWL language preservation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PowlPreservationReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub source_digest: String,
    pub compiler_digest: String,
    pub module_digest: String,
    pub skeleton_digest: String,
    pub probe_bound: usize,
    pub probe_traces: usize,
    pub probe_accepted: usize,
    pub probe_input_digest: String,
    pub verdict_digest: String,
    pub runtimes: Vec<RuntimeIdentity>,
    pub falsifiers: Vec<String>,
    pub authority: String,
    pub evidence_ceiling: String,
    pub receipt_digest: String,
}

impl PowlPreservationReceipt {
    pub fn verify_digest(&self) -> Result<(), PortabilityRefusal> {
        replay_check(self, |r| std::mem::take(&mut r.receipt_digest))
    }
}

fn expect_kind(inspection: &ModuleInspection, kind: &str) -> Result<(), PortabilityRefusal> {
    if inspection.subject.kind != kind {
        return Err(PortabilityRefusal::ModuleKindMismatch(
            inspection.subject.kind.clone(),
        ));
    }
    Ok(())
}

/// Court for GALL-022. Order: identity -> structure -> executed language ->
/// rebuild determinism, so each falsifier has its own typed refusal.
pub fn verify_powl_preservation(
    subject: &PowlSubject,
    module: &PortableModule,
    probe: &LanguageProbe,
    witnesses: &[RuntimeWitness],
) -> Result<PowlPreservationReceipt, PortabilityRefusal> {
    let inspection = inspect_module(module)?;
    expect_kind(&inspection, KIND_POWL_ACCEPTOR)?;
    inspection.host_fence.validate(&BTreeSet::new())?;
    if inspection.subject.source_digest != subject.source_digest() {
        return Err(PortabilityRefusal::SourceDigestMismatch);
    }
    if inspection.skeleton.as_ref() != Some(subject.skeleton())
        || inspection.subject.symbols != subject.alphabet()
    {
        return Err(PortabilityRefusal::PowlPreservationMismatch);
    }
    if probe.subject_digest() != subject.source_digest() {
        return Err(PortabilityRefusal::ProbeSubjectMismatch);
    }
    let input_digest = sha256(probe.input());
    let (runtimes, verdicts) = admit_witnesses(module.digest(), &input_digest, witnesses)?;
    let expected = probe.expected_output(subject)?;
    if verdicts != expected.as_slice() {
        return Err(PortabilityRefusal::SemanticProbeDivergence);
    }
    let rebuilt = lower_powl(subject)?;
    if rebuilt != *module {
        return Err(PortabilityRefusal::ModuleIdentityMismatch);
    }

    let mut receipt = PowlPreservationReceipt {
        schema: "gall.powl-language-preservation-receipt/2".into(),
        checkpoint: "GALL-022".into(),
        source_digest: subject.source_digest().into(),
        compiler_digest: inspection.subject.compiler_digest.clone(),
        module_digest: module.digest().into(),
        skeleton_digest: digest_json(subject.skeleton()),
        probe_bound: probe.bound(),
        probe_traces: probe.traces().len(),
        probe_accepted: expected.iter().filter(|b| **b == b'1').count(),
        probe_input_digest: input_digest,
        verdict_digest: sha256(verdicts),
        runtimes,
        falsifiers: vec![
            "source-digest-bound-in-module".into(),
            "hierarchy-skeleton-read-from-module".into(),
            "executed-trace-set-equals-reference-language".into(),
            "rebuild-reproduces-module-bytes".into(),
            "cross-engine-verdict-equality".into(),
        ],
        authority: "NONE".into(),
        evidence_ceiling: "COMPILE/COMPUTE only".into(),
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest_json(&receipt);
    Ok(receipt)
}

/// Language-level equality of two POWL subjects on every word of length
/// <= `bound` (reference semantics, no structure comparison).
pub fn powl_language_equivalent_within(
    a: &PowlSubject,
    b: &PowlSubject,
    bound: usize,
) -> Result<bool, PortabilityRefusal> {
    let map = |s: &PowlSubject| -> Result<BTreeSet<Vec<String>>, PortabilityRefusal> {
        Ok(
            crate::gall_wasm_lowering::powl_reference_language(s, bound)?
                .into_iter()
                .map(|w| {
                    w.iter()
                        .map(|&x| s.alphabet()[x as usize].clone())
                        .collect()
                })
                .collect(),
        )
    };
    Ok(map(a)? == map(b)?)
}

// ---------------------------------------------------------------------------
// GALL-023 OCPQ portability
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcpqQualificationReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub query_digest: String,
    pub ocel_digest: String,
    pub corpus_digest: String,
    pub module_digest: String,
    pub compiler_digest: String,
    pub reference_evaluator: String,
    pub reference_result_digest: String,
    pub portable_result_digest: String,
    pub runtimes: Vec<RuntimeIdentity>,
    pub semantics: String,
    pub authority: String,
    pub receipt_digest: String,
}

impl OcpqQualificationReceipt {
    pub fn verify_digest(&self) -> Result<(), PortabilityRefusal> {
        replay_check(self, |r| std::mem::take(&mut r.receipt_digest))
    }
}

/// Reference evaluator identity bound into GALL-023 receipts.
pub const GALL017_REFERENCE: &str =
    "ex4pm Ex4pm.Gall.Ocpq.evaluate/2 @ b74753fd70f270b9b31f0493cb026c6e38980ec2 (transcribed)";

/// Court for GALL-023: executed portable result vs ex4pm reference result.
pub fn qualify_ocpq(
    query: &Gall017Query,
    ocel: &Gall017Ocel,
    corpus_digest: &str,
    module: &PortableModule,
    input: &[u8],
    witnesses: &[RuntimeWitness],
) -> Result<OcpqQualificationReceipt, PortabilityRefusal> {
    if !valid_digest(corpus_digest) {
        return Err(PortabilityRefusal::InvalidDigest("corpus_digest".into()));
    }
    let inspection = inspect_module(module)?;
    expect_kind(&inspection, KIND_GALL017_OCPQ)?;
    inspection.host_fence.validate(&BTreeSet::new())?;
    if inspection.subject.source_digest != query.digest() {
        return Err(PortabilityRefusal::SourceDigestMismatch);
    }
    if crate::gall_wasm_lowering::encode_gall017_input(query, ocel) != input {
        return Err(PortabilityRefusal::WitnessSubjectMismatch);
    }
    let (runtimes, canonical) = admit_witnesses(module.digest(), &sha256(input), witnesses)?;
    let portable: Gall017Result = serde_json::from_slice(canonical)
        .map_err(|e| PortabilityRefusal::PortableOutputMalformed(e.to_string()))?;
    let reference = gall017_reference_evaluate(ocel, query);
    if !reference.violations.is_empty()
        && portable.standing == "pass"
        && portable.bindings.is_empty()
    {
        return Err(PortabilityRefusal::MissingRelationBecamePass);
    }
    if portable != reference {
        return Err(PortabilityRefusal::OcpqReferenceMismatch);
    }
    if lower_gall017_query(query)? != *module {
        return Err(PortabilityRefusal::ModuleIdentityMismatch);
    }

    let mut receipt = OcpqQualificationReceipt {
        schema: "gall.ocpq-portability-receipt/2".into(),
        checkpoint: "GALL-023".into(),
        query_digest: query.digest(),
        ocel_digest: ocel.digest(),
        corpus_digest: corpus_digest.into(),
        module_digest: module.digest().into(),
        compiler_digest: inspection.subject.compiler_digest.clone(),
        reference_evaluator: GALL017_REFERENCE.into(),
        reference_result_digest: reference.digest(),
        portable_result_digest: portable.digest(),
        runtimes,
        semantics: "bag of event bindings (event ids unique; no dedup)".into(),
        authority: "NONE".into(),
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest_json(&receipt);
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    //! Court refusal paths that need no WASM runtime. Witnesses here are built
    //! with the crate-private constructor to model adversarial evidence; the
    //! executed positive paths live in `tests/gall_021_023_portable_execution.rs`.
    use super::*;
    use crate::gall_wasm_lowering::{
        canonical_powl_output, encode_gall017_input, fence_from_imports, powl_dfa, LanguageProbe,
        PowlSkeleton,
    };

    fn powl(json: &str) -> PowlSubject {
        PowlSubject::from_gall016_json(json.as_bytes()).unwrap()
    }

    fn witness(engine: RuntimeEngine, module: &str, input: &str, result: &[u8]) -> RuntimeWitness {
        RuntimeWitness::observed(
            engine,
            "test".into(),
            module.into(),
            input.into(),
            result.to_vec(),
            1,
        )
    }

    /// Model the acceptor's verdicts on the host (diagnostic automaton) to
    /// build witness payloads without a runtime.
    fn dfa_verdicts(subject: &PowlSubject, probe: &LanguageProbe) -> Vec<u8> {
        let dfa = powl_dfa(subject).unwrap();
        probe
            .traces()
            .iter()
            .map(|t| if dfa.accepts(t) { b'1' } else { b'0' })
            .collect()
    }

    const PARALLEL: &str = r#"{"type":"partial_order","children":["a","b"],"order":[]}"#;

    #[test]
    fn gall_022_same_language_different_structure_is_language_equal() {
        let with = powl(
            r#"{"type":"partial_order","children":["a","b","c"],"order":[["a","b"],["b","c"],["a","c"]]}"#,
        );
        let without = powl(
            r#"{"type":"partial_order","children":["a","b","c"],"order":[["a","b"],["b","c"]]}"#,
        );
        let seq = powl(r#"{"type":"sequence","children":["a","b","c"]}"#);
        assert!(powl_language_equivalent_within(&with, &without, 6).unwrap());
        assert!(powl_language_equivalent_within(&with, &seq, 6).unwrap());
        // Transitive closure makes the redundant edge structurally invisible.
        assert_eq!(with.skeleton(), without.skeleton());
        let par = powl(PARALLEL);
        let ab = powl(r#"{"type":"sequence","children":["a","b"]}"#);
        assert!(!powl_language_equivalent_within(&par, &ab, 4).unwrap());
    }

    #[test]
    fn gall_022_edges_must_name_direct_children() {
        let nested = r#"{"type":"partial_order","children":["a",{"type":"hierarchy","id":"h","child":{"type":"sequence","children":["b","c"]}}],"order":[["a","c"]]}"#;
        assert_eq!(
            PowlSubject::from_gall016_json(nested.as_bytes()).unwrap_err(),
            PortabilityRefusal::MalformedPartialOrder("endpoint c is not a direct child".into())
        );
        let into_choice = r#"{"type":"partial_order","children":["a",{"type":"choice","children":["x","y"]}],"order":[["a","x"]]}"#;
        assert_eq!(
            PowlSubject::from_gall016_json(into_choice.as_bytes()).unwrap_err(),
            PortabilityRefusal::MalformedPartialOrder("endpoint x is not a direct child".into())
        );
        let to_boundary = r#"{"type":"partial_order","children":["a",{"type":"hierarchy","id":"h","child":{"type":"sequence","children":["b","c"]}}],"order":[["a","h"]]}"#;
        assert!(PowlSubject::from_gall016_json(to_boundary.as_bytes()).is_ok());
        let cycle =
            r#"{"type":"partial_order","children":["a","b"],"order":[["a","b"],["b","a"]]}"#;
        assert_eq!(
            PowlSubject::from_gall016_json(cycle.as_bytes()).unwrap_err(),
            PortabilityRefusal::MalformedPartialOrder("cycle".into())
        );
    }

    #[test]
    fn gall_022_unknown_fields_and_kinds_are_refused_not_dropped() {
        let cond = r#"{"type":"choice","children":["a","b"],"conditions":["x>1","else"]}"#;
        assert_eq!(
            PowlSubject::from_gall016_json(cond.as_bytes()).unwrap_err(),
            PortabilityRefusal::UnsupportedPowlConstruct("choice.conditions".into())
        );
        assert_eq!(
            PowlSubject::from_gall016_json(br#"{"type":"race","id":"x"}"#).unwrap_err(),
            PortabilityRefusal::UnsupportedPowlConstruct("race".into())
        );
    }

    #[test]
    fn gall_022_forged_module_refusals_are_typed_in_court_order() {
        let subject = powl(PARALLEL);
        let module = lower_powl(&subject).unwrap();
        let probe = LanguageProbe::for_subject(&subject);
        let input = sha256(probe.input());
        let good = dfa_verdicts(&subject, &probe);
        let ws = |m: &PortableModule, v: &[u8]| {
            vec![
                witness(RuntimeEngine::Cranelift, m.digest(), &input, v),
                witness(RuntimeEngine::V8, m.digest(), &input, v),
            ]
        };
        assert!(verify_powl_preservation(&subject, &module, &probe, &ws(&module, &good)).is_ok());

        // Module compiled from another subject.
        let other = powl(r#"{"type":"sequence","children":["a","b"]}"#);
        let other_module = lower_powl(&other).unwrap();
        assert_eq!(
            verify_powl_preservation(&subject, &other_module, &probe, &ws(&other_module, &good)),
            Err(PortabilityRefusal::SourceDigestMismatch)
        );

        let section = crate::gall_wasm_lowering::inspect_module(&module)
            .unwrap()
            .subject;
        // Flattening mutant, honest skeleton: structure court refuses.
        let flat_dfa = powl_dfa(&other).unwrap();
        let flat_skel =
            crate::gall_wasm_lowering::emit_powl_module(&section, other.skeleton(), &flat_dfa)
                .unwrap();
        assert_eq!(
            verify_powl_preservation(&subject, &flat_skel, &probe, &ws(&flat_skel, &good)),
            Err(PortabilityRefusal::PowlPreservationMismatch)
        );
        // Flattening mutant stamped with the source skeleton: the executed
        // language (one interleaving only) diverges from the reference.
        let forged =
            crate::gall_wasm_lowering::emit_powl_module(&section, subject.skeleton(), &flat_dfa)
                .unwrap();
        let flat_verdicts: Vec<u8> = probe
            .traces()
            .iter()
            .map(|t| if flat_dfa.accepts(t) { b'1' } else { b'0' })
            .collect();
        assert_eq!(
            verify_powl_preservation(&subject, &forged, &probe, &ws(&forged, &flat_verdicts)),
            Err(PortabilityRefusal::SemanticProbeDivergence)
        );
        // Correct language but bytes the current compiler does not produce
        // (forged compiler digest): rebuild court refuses.
        let mut forged_section = section.clone();
        forged_section.compiler_digest = format!("sha256:{}", "9".repeat(64));
        let foreign = crate::gall_wasm_lowering::emit_powl_module(
            &forged_section,
            subject.skeleton(),
            &powl_dfa(&subject).unwrap(),
        )
        .unwrap();
        assert_eq!(
            verify_powl_preservation(&subject, &foreign, &probe, &ws(&foreign, &good)),
            Err(PortabilityRefusal::ModuleIdentityMismatch)
        );
        // Witnesses of another module or input are not evidence here.
        assert_eq!(
            verify_powl_preservation(&subject, &module, &probe, &ws(&other_module, &good)),
            Err(PortabilityRefusal::WitnessSubjectMismatch)
        );
        // One engine counted twice is not independence.
        let twice = vec![
            witness(RuntimeEngine::V8, module.digest(), &input, &good),
            witness(RuntimeEngine::V8, module.digest(), &input, &good),
        ];
        assert_eq!(
            verify_powl_preservation(&subject, &module, &probe, &twice),
            Err(PortabilityRefusal::DuplicateRuntimeIdentity)
        );
        // Probe of another subject.
        let other_probe = LanguageProbe::for_subject(&other);
        assert_eq!(
            verify_powl_preservation(&subject, &module, &other_probe, &ws(&module, &good)),
            Err(PortabilityRefusal::ProbeSubjectMismatch)
        );
        assert!(canonical_powl_output(&probe, b"01").is_err());
    }

    #[test]
    fn gall_022_hierarchy_boundary_is_part_of_the_skeleton() {
        let nested = powl(
            r#"{"type":"hierarchy","id":"parent","child":{"type":"sequence","children":["a","b"]}}"#,
        );
        let flat = powl(r#"{"type":"sequence","children":["a","b"]}"#);
        assert!(powl_language_equivalent_within(&nested, &flat, 5).unwrap());
        assert!(matches!(nested.skeleton(), PowlSkeleton::Boundary { id, .. } if id == "parent"));
        assert_ne!(nested.skeleton(), flat.skeleton());
    }

    #[test]
    fn gall_021_fence_is_derived_from_imports() {
        let wasi = |n: &str| ("wasi_snapshot_preview1".to_string(), n.to_string());
        assert_eq!(
            fence_from_imports(&[wasi("fd_read"), wasi("clock_time_get")]).unwrap(),
            HostCapabilityFence {
                clock: true,
                ..Default::default()
            }
        );
        let fence = fence_from_imports(&[wasi("random_get"), wasi("path_open"), wasi("sock_send")])
            .unwrap();
        assert!(fence.randomness && fence.filesystem && fence.network);
        assert_eq!(
            fence.validate(&BTreeSet::new()),
            Err(PortabilityRefusal::UnboundHostCapability(
                "randomness".into()
            ))
        );
        let all: BTreeSet<String> = ["randomness", "filesystem", "network"]
            .into_iter()
            .map(String::from)
            .collect();
        assert!(fence.validate(&all).is_ok());
        assert_eq!(
            fence_from_imports(&[("env".into(), "now".into())]),
            Err(PortabilityRefusal::UnsupportedHostImport("env::now".into()))
        );
        assert_eq!(
            fence_from_imports(&[wasi("proc_exit")]),
            Err(PortabilityRefusal::UnsupportedHostImport(
                "wasi_snapshot_preview1::proc_exit".into()
            ))
        );
    }

    #[test]
    fn gall_021_witnesses_bind_module_input_and_engine() {
        let subject = powl(PARALLEL);
        let module = lower_powl(&subject).unwrap();
        let probe = LanguageProbe::for_subject(&subject);
        let s = PortableProcessSubject::new(
            subject.source_digest(),
            &module,
            probe.input(),
            &sha256(b"{}"),
        );
        let out = dfa_verdicts(&subject, &probe);
        let ok = vec![
            witness(
                RuntimeEngine::Cranelift,
                &s.module_digest,
                &s.input_digest,
                &out,
            ),
            witness(
                RuntimeEngine::JavaScriptCore,
                &s.module_digest,
                &s.input_digest,
                &out,
            ),
        ];
        let receipt = qualify_portable_execution(&s, &module, &ok).unwrap();
        assert_eq!(receipt.verify_digest(), Ok(()));
        assert_eq!(receipt.authority, "NONE");

        // Same witnesses do not qualify another subject.
        let other = powl(r#"{"type":"sequence","children":["a","b"]}"#);
        let other_module = lower_powl(&other).unwrap();
        let s2 = PortableProcessSubject::new(
            other.source_digest(),
            &other_module,
            probe.input(),
            &sha256(b"{}"),
        );
        assert_eq!(
            qualify_portable_execution(&s2, &other_module, &ok),
            Err(PortabilityRefusal::WitnessSubjectMismatch)
        );
        // Module bytes that are not the subject's module.
        assert_eq!(
            qualify_portable_execution(&s, &other_module, &ok),
            Err(PortabilityRefusal::WitnessSubjectMismatch)
        );
        // Divergent semantics.
        let mut bad = out.clone();
        bad[0] = if bad[0] == b'1' { b'0' } else { b'1' };
        let diverge = vec![
            witness(
                RuntimeEngine::Cranelift,
                &s.module_digest,
                &s.input_digest,
                &out,
            ),
            witness(RuntimeEngine::V8, &s.module_digest, &s.input_digest, &bad),
        ];
        assert_eq!(
            qualify_portable_execution(&s, &module, &diverge),
            Err(PortabilityRefusal::SemanticResultMismatch)
        );
        assert_eq!(
            qualify_portable_execution(&s, &module, &ok[..1]),
            Err(PortabilityRefusal::NeedTwoIndependentRuntimes)
        );
        // Performance differs, semantic digest does not.
        let slow = vec![
            RuntimeWitness::observed(
                RuntimeEngine::Cranelift,
                "t".into(),
                s.module_digest.clone(),
                s.input_digest.clone(),
                out.clone(),
                999_999,
            ),
            ok[1].clone(),
        ];
        assert_eq!(
            qualify_portable_execution(&s, &module, &slow)
                .unwrap()
                .semantic_result_digest,
            receipt.semantic_result_digest
        );
        // Tampered receipt fails replay.
        let mut t = receipt.clone();
        t.authority = "DO".into();
        assert_eq!(
            t.verify_digest(),
            Err(PortabilityRefusal::ReceiptDigestMismatch)
        );
        // Malformed subject digests.
        let mut m = s.clone();
        m.parameters_digest = "sha256:x".into();
        assert_eq!(
            qualify_portable_execution(&m, &module, &ok),
            Err(PortabilityRefusal::InvalidDigest(
                "parameters_digest".into()
            ))
        );
    }

    #[test]
    fn gall_023_court_refuses_divergence_and_missing_relation_pass() {
        let ocel = Gall017Ocel::from_json(
            br#"{"events":[{"id":"e1","activity":"create","sequence":1,"objects":[["order:1","order","target"]]}]}"#,
        )
        .unwrap();
        let query = Gall017Query::from_json(br#"{"activity":"never"}"#).unwrap();
        let module = lower_gall017_query(&query).unwrap();
        let input = encode_gall017_input(&query, &ocel);
        let corpus = sha256(b"corpus");
        let reference = gall017_reference_evaluate(&ocel, &query);
        assert_eq!(reference.standing, "violation");
        let w = |bytes: &[u8]| {
            vec![
                witness(
                    RuntimeEngine::Cranelift,
                    module.digest(),
                    &sha256(&input),
                    bytes,
                ),
                witness(RuntimeEngine::V8, module.digest(), &sha256(&input), bytes),
            ]
        };
        let ok = reference.canonical_bytes();
        let receipt = qualify_ocpq(&query, &ocel, &corpus, &module, &input, &w(&ok)).unwrap();
        assert_eq!(receipt.verify_digest(), Ok(()));
        assert_eq!(receipt.module_digest, module.digest());
        assert_eq!(receipt.runtimes.len(), 2);

        let pass = Gall017Result {
            bindings: vec![],
            violations: vec![],
            standing: "pass".into(),
        };
        assert_eq!(
            qualify_ocpq(
                &query,
                &ocel,
                &corpus,
                &module,
                &input,
                &w(&pass.canonical_bytes())
            ),
            Err(PortabilityRefusal::MissingRelationBecamePass)
        );
        let q2 = Gall017Query::from_json(br#"{"activity":"create"}"#).unwrap();
        let m2 = lower_gall017_query(&q2).unwrap();
        assert_eq!(
            qualify_ocpq(&query, &ocel, &corpus, &m2, &input, &w(&ok)),
            Err(PortabilityRefusal::SourceDigestMismatch)
        );
        assert_eq!(
            qualify_ocpq(&query, &ocel, "sha256:zz", &module, &input, &w(&ok)),
            Err(PortabilityRefusal::InvalidDigest("corpus_digest".into()))
        );
        let other_ocel = Gall017Ocel::from_json(br#"{"events":[]}"#).unwrap();
        assert_eq!(
            qualify_ocpq(&query, &other_ocel, &corpus, &module, &input, &w(&ok)),
            Err(PortabilityRefusal::WitnessSubjectMismatch)
        );
    }

    #[test]
    fn gall_023_unsupported_operator_and_malformed_ocel_are_typed() {
        assert_eq!(
            Gall017Query::from_json(br#"{"activity":"a","count":2}"#),
            Err(PortabilityRefusal::UnsupportedOcpqOperator("count".into()))
        );
        assert!(matches!(
            Gall017Query::from_json(br#"{"activity":3}"#),
            Err(PortabilityRefusal::InvalidOcpqQuery(_))
        ));
        assert!(matches!(
            Gall017Ocel::from_json(br#"{"events":[{"id":"e1"},{"id":"e1"}]}"#),
            Err(PortabilityRefusal::InvalidOcel(_))
        ));
        assert!(matches!(
            Gall017Ocel::from_json(br#"{"events":[{"id":"e1","objects":[["o","t"]]}]}"#),
            Err(PortabilityRefusal::InvalidOcel(_))
        ));
    }

    #[test]
    fn gall_022_adversarial_depth_refused_without_stack_overflow() {
        use crate::powl_arena::PowlArena;
        let mut arena = PowlArena::new();
        let mut idx = arena.add_transition(Some("leaf".into()));
        for _ in 0..100_000 {
            idx = arena.add_strict_partial_order(vec![idx]);
        }
        assert_eq!(
            PowlSubject::from_arena(arena, idx).unwrap_err(),
            PortabilityRefusal::PowlDepthExceeded
        );
        let mut arena = PowlArena::new();
        let mut idx = arena.add_transition(Some("leaf".into()));
        for _ in 0..(MAX_POWL_DEPTH - 1) {
            idx = arena.add_strict_partial_order(vec![idx]);
        }
        assert!(PowlSubject::from_arena(arena, idx).is_ok());
    }
}
