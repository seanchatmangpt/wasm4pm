#![allow(clippy::all, unused_mut)]
//! Adversarial bypass tests: every detector must catch a malicious
//! evidence-source crafted to slip past a naive flag-based check.
//!
//! The construction pattern is uniform: build a `MockEvidence` value that
//! looks "fine" by every superficial measure (gate flags set, dummy
//! evidence strings present, etc.) but encodes the violation in the
//! independently verified surface (digest count, span topology, signing
//! skew, threshold history, external Merkle root). The detector under
//! test MUST still emit a finding.

use std::time::Duration;

use wasm4pm_cognition::authority::AuthorityKind;
use wasm4pm_cognition::autosystems::adversarial::{
    bench_missing::BenchMissingDetector, central_firehose::CentralFirehoseDetector,
    human_authority::HumanAuthorityDetector, missing_evidence::MissingEvidenceDetector,
    repair_weakens::RepairWeakensDetector, replay_broken::ReplayBrokenDetector,
    self_certify::SelfCertifyDetector, stub_gate::StubGateDetector,
};
use wasm4pm_cognition::autosystems::findings::Detector;
use wasm4pm_cognition::autosystems::receipt::ReceiptChain;
use wasm4pm_cognition::evidence::{Artifact, EvidenceSource, Verdict, VerifyingKey};

/// Hand-built evidence source: the test author specifies exactly what the
/// "verified" surface looks like. Detectors must use only this surface.
#[derive(Default)]
struct MockEvidence {
    gates_passed: Vec<String>,
    digest_evidence: Vec<(String, usize)>,
    artifacts: Vec<(String, Vec<Artifact>)>,
    authority_kinds: Vec<(String, AuthorityKind)>,
    central_bus: bool,
    chain: ReceiptChain,
    exec_pubkey: Option<VerifyingKey>,
    verifier_pubkey: Option<VerifyingKey>,
    skew: Option<Duration>,
    descends: Option<bool>,
    bench: Vec<(String, Verdict)>,
    bench_targets_known: Vec<String>,
    threshold_history: Vec<(String, Vec<f64>)>,
    external_root: Option<[u8; 32]>,
}

impl EvidenceSource for MockEvidence {
    fn gate_passed(&self, gate_id: &str) -> bool {
        self.gates_passed.iter().any(|g| g == gate_id)
    }
    fn evidence_count(&self, gate_id: &str) -> usize {
        self.digest_evidence
            .iter()
            .find(|(g, _)| g == gate_id)
            .map(|(_, c)| *c)
            .unwrap_or(0)
    }
    fn gate_ids(&self) -> Vec<String> {
        let mut v: Vec<String> = self.gates_passed.clone();
        v.extend(self.digest_evidence.iter().map(|(g, _)| g.clone()));
        v.extend(self.artifacts.iter().map(|(g, _)| g.clone()));
        v.extend(self.threshold_history.iter().map(|(g, _)| g.clone()));
        v.sort();
        v.dedup();
        v
    }
    fn authority_text(&self, slot: &str) -> AuthorityKind {
        self.authority_kinds
            .iter()
            .find(|(s, _)| s == slot)
            .map(|(_, k)| *k)
            .unwrap_or(AuthorityKind::Empty)
    }
    fn runtime_proof_artifacts(&self, gate_id: &str) -> Vec<Artifact> {
        self.artifacts
            .iter()
            .find(|(g, _)| g == gate_id)
            .map(|(_, a)| a.clone())
            .unwrap_or_default()
    }
    fn central_bus_present(&self) -> bool {
        self.central_bus
    }
    fn receipt_chain(&self) -> &ReceiptChain {
        &self.chain
    }
    fn executor_pubkey(&self) -> Option<VerifyingKey> {
        self.exec_pubkey
    }
    fn verifier_pubkey(&self) -> Option<VerifyingKey> {
        self.verifier_pubkey
    }
    fn signing_time_skew(&self) -> Option<Duration> {
        self.skew
    }
    fn attestation_descends(&self) -> Option<bool> {
        self.descends
    }
    fn benchmark_verdict(&self, target: &str) -> Option<Verdict> {
        if !self.bench_targets_known.is_empty()
            && !self.bench_targets_known.iter().any(|t| t == target)
        {
            return None;
        }
        self.bench
            .iter()
            .find(|(t, _)| t == target)
            .map(|(_, v)| *v)
    }
    fn threshold_history(&self, gate_id: &str) -> Vec<f64> {
        self.threshold_history
            .iter()
            .find(|(g, _)| g == gate_id)
            .map(|(_, h)| h.clone())
            .unwrap_or_default()
    }
    fn external_chain_root(&self) -> Option<[u8; 32]> {
        self.external_root
    }
}

// 1. Stub gate — fake evidence strings without digests.
#[test]
fn stub_gate_fires_despite_fake_evidence_strings() {
    let mut ev = MockEvidence::default();
    ev.gates_passed.push("primary".into());
    // ATTACK: caller padded their JSON with strings like ["fake1", "fake2"].
    // The trait counts only digest-bearing artifacts → still 0.
    ev.digest_evidence.push(("primary".into(), 0));
    let det = StubGateDetector;
    let f = det.run(&ev);
    assert!(!f.is_empty(), "StubGate must fire on zero-digest evidence");
    assert_eq!(f[0].code, "STUB_GATE_PASS");
}

// 2. Human authority — mixed text "I think 0123...64hex".
#[test]
fn human_authority_fires_on_mixed_text() {
    let _input = format!("I think {}", "0".repeat(64));
    let mut ev = MockEvidence::default();
    // The classifier already returns Mixed; record that here.
    ev.authority_kinds
        .push(("primary".into(), AuthorityKind::Mixed));
    let det = HumanAuthorityDetector;
    let f = det.run(&ev);
    assert!(!f.is_empty(), "HumanAuthority must fire on Mixed");
    assert_eq!(f[0].code, "HUMAN_OUTPUT_USED_AS_AUTHORITY");
}

// 3. Missing evidence — gate.passed=true but no spans carry evidence.digest.
#[test]
fn missing_evidence_fires_when_spans_lack_digest() {
    let mut ev = MockEvidence::default();
    ev.gates_passed.push("primary".into());
    // ATTACK: caller asserted `has_runtime_proof: true` but recorded no
    // digest-carrying artifact.
    ev.artifacts.push(("primary".into(), vec![]));
    let det = MissingEvidenceDetector;
    let f = det.run(&ev);
    assert!(
        !f.is_empty(),
        "MissingEvidence must fire when artifact list is empty"
    );
    assert_eq!(f[0].code, "MISSING_RUNTIME_EVIDENCE");
}

// 4. Central firehose — bus.kind=central even when messaging.system isn't
// in the well-known central allowlist.
#[test]
fn central_firehose_fires_on_bus_kind_attribute() {
    let mut ev = MockEvidence::default();
    // ATTACK: messaging.system="mybus" (not in allowlist), but bus.kind=central
    // is recorded by an OTEL processor outside the caller's control.
    ev.central_bus = true;
    let det = CentralFirehoseDetector;
    let f = det.run(&ev);
    assert!(
        !f.is_empty(),
        "CentralFirehose must fire on bus.kind=central"
    );
    assert_eq!(f[0].code, "CENTRAL_EVENT_FIREHOSE_REINTRODUCED");
}

// 5. Self-certify — distinct keys, but signing skew under 5 seconds.
#[test]
fn self_certify_fires_on_signing_skew_2s() {
    let mut ev = MockEvidence::default();
    ev.exec_pubkey = Some(VerifyingKey([1u8; 32]));
    ev.verifier_pubkey = Some(VerifyingKey([2u8; 32]));
    // ATTACK: two keys, but signed within 2s — independence is fictional.
    ev.skew = Some(Duration::from_secs(2));
    let det = SelfCertifyDetector;
    let f = det.run(&ev);
    assert!(!f.is_empty(), "SelfCertify must fire on sub-5s skew");
    assert_eq!(f[0].code, "AGENT_SELF_CERTIFIES");
}

// 6. Bench missing — `.wasm4pm/results/x.json` with outcome="maybe".
#[test]
fn bench_missing_fires_on_unparseable_outcome() {
    use std::io::Write;
    // Build a temp dir + write a file with outcome:"maybe".
    let dir = std::env::temp_dir().join(format!("wpm-cog-bench-{}", std::process::id()));
    let _ = std::fs::create_dir_all(dir.join(".wasm4pm/results"));
    let path = dir.join(".wasm4pm/results/primary.json");
    let mut f = std::fs::File::create(&path).expect("temp file");
    write!(f, r#"{{"outcome":"maybe"}}"#).unwrap();

    let fs_src = wasm4pm_cognition::evidence::FilesystemEvidenceSource::new(
        dir.clone(),
        ReceiptChain::new(),
    );
    // Filesystem source returns None for unparseable outcomes.
    assert!(fs_src.benchmark_verdict("primary").is_none());

    let det = BenchMissingDetector::default();
    let findings = det.run(&fs_src);
    assert!(
        !findings.is_empty(),
        "BenchMissing must fire when verdict is unparseable"
    );
    assert_eq!(findings[0].code, "BENCHMARK_EXPECTATION_MISSING");
}

// 7. Repair weakens — non-adjacent drop. History [0.5, 0.9, 0.7].
#[test]
fn repair_weakens_fires_on_non_adjacent_drop() {
    let mut ev = MockEvidence::default();
    // ATTACK: history goes UP then back DOWN. Adjacent comparison
    // (0.9 → 0.7) catches it; but if a buggy detector compared first→last
    // (0.5 → 0.7) it would miss. We test the max_prior path.
    ev.threshold_history
        .push(("primary".into(), vec![0.5, 0.9, 0.7]));
    let det = RepairWeakensDetector;
    let f = det.run(&ev);
    assert!(
        !f.is_empty(),
        "RepairWeakens must fire when current<max_prior"
    );
    assert_eq!(f[0].code, "REPAIR_WEAKENS_GATE");
}

// 8. Replay broken — locally consistent chain BUT external root mismatch.
#[test]
fn replay_broken_fires_on_external_root_mismatch() {
    use wasm4pm_cognition::autosystems::receipt::ActorSigner;
    let signer = ActorSigner::from_seed([7u8; 32]);
    let mut chain = ReceiptChain::new();
    chain.append_signed(&signer, vec![0xaau8; 32], vec![0xbbu8; 32]);
    chain.append_signed(&signer, vec![0xccu8; 32], vec![0xddu8; 32]);
    assert!(chain.verify_chain(), "chain must locally verify");
    let mut ev = MockEvidence::default();
    ev.chain = chain;
    // ATTACK: caller produces a self-consistent chain. External anchor
    // disagrees. Detector must catch the mismatch.
    ev.external_root = Some([0xff; 32]);
    let det = ReplayBrokenDetector;
    let f = det.run(&ev);
    assert!(
        !f.is_empty(),
        "ReplayBroken must fire on external root mismatch"
    );
    assert_eq!(f[0].code, "REPLAY_BROKEN");
}

// --------- WASM DoS hardening (native test, exercises shared limits) ---------
#[cfg(feature = "wasm")]
#[test]
fn wasm_input_too_large_is_rejected() {
    use wasm4pm_cognition::wasm::{cognition_run, MAX_INPUT_LEN};
    let big = "x".repeat(MAX_INPUT_LEN + 1);
    let res = cognition_run(&big);
    assert!(res.is_err());
}

// Bounded registry test — independent of WASM feature.
#[test]
fn bounded_registry_does_not_grow_without_limit() {
    use wasm4pm_cognition::registry::{BoundedRegistry, CognitionReceipt};
    let mut reg = BoundedRegistry::new();
    for i in 0..(BoundedRegistry::capacity_limit() + 100) {
        reg.insert(
            format!("id-{}", i),
            CognitionReceipt {
                run_id: format!("id-{}", i),
                output_hash: "0".repeat(64),
                replay_pointer: "0".repeat(16),
            },
        );
    }
    assert!(reg.len() <= BoundedRegistry::capacity_limit());
}
