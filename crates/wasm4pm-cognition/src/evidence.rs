//! Evidence sources: independent, typed providers of detector inputs.
//!
//! Detectors must NOT trust caller-supplied JSON booleans. Instead, they
//! consult an `EvidenceSource` implementation backed by independently
//! verifiable evidence (OTEL spans, filesystem artifacts, external trust
//! anchors). This makes adversarial bypass via flag-flipping impossible.

use crate::authority::AuthorityKind;
use crate::autosystems::receipt::ReceiptChain;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// An ed25519 verifying public key (raw 32 bytes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyingKey(pub [u8; 32]);

/// Verdict of an external benchmark run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Verdict {
    /// Benchmark passed
    Pass,
    /// Benchmark failed
    Fail,
    /// Benchmark intentionally skipped
    Skip,
}

/// A runtime artifact: ledgered evidence with a content digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artifact {
    /// Content digest (e.g. `sha256:...` or BLAKE3 hex)
    pub digest: String,
    /// Where this artifact came from (e.g. `otel:span:abc...`, `fs:/path`)
    pub source: String,
    /// Optional kind tag (e.g. `"otel-span"`, `"file"`)
    pub kind: Option<String>,
}

/// Independent evidence-source trait. Detectors read from this rather than
/// from caller-supplied flags. Implementations are responsible for
/// verifying their own backing evidence (OTEL span ingestion, signature
/// checks, filesystem reads, etc.).
pub trait EvidenceSource: Send + Sync {
    /// Whether the named gate has been recorded as having passed.
    fn gate_passed(&self, gate_id: &str) -> bool;

    /// Number of artifacts that carry an actual digest for this gate.
    /// Plain text strings without a digest must NOT be counted.
    fn evidence_count(&self, gate_id: &str) -> usize;

    /// All known gate identifiers.
    fn gate_ids(&self) -> Vec<String>;

    /// Classify the text recorded for the named authority slot.
    fn authority_text(&self, slot: &str) -> AuthorityKind;

    /// Runtime-proof artifacts (must each carry a digest) for this gate.
    fn runtime_proof_artifacts(&self, gate_id: &str) -> Vec<Artifact>;

    /// Whether a centralized event aggregation point is present in the
    /// observed runtime topology.
    fn central_bus_present(&self) -> bool;

    /// Borrow the receipt chain produced by execution.
    fn receipt_chain(&self) -> &ReceiptChain;

    /// Public key used to sign the executor receipt, if known.
    fn executor_pubkey(&self) -> Option<VerifyingKey> {
        None
    }

    /// Public key used to sign the verifier receipt, if known.
    fn verifier_pubkey(&self) -> Option<VerifyingKey> {
        None
    }

    /// Time difference between executor and verifier signatures.
    fn signing_time_skew(&self) -> Option<Duration> {
        None
    }

    /// Whether the verifier's attestation chain ultimately descends from
    /// the executor's identity (a self-certify red flag).
    fn attestation_descends(&self) -> Option<bool> {
        None
    }

    /// Verdict recorded by an external benchmark for the named target.
    fn benchmark_verdict(&self, _target: &str) -> Option<Verdict> {
        None
    }

    /// Historical threshold values for the named gate, oldest first.
    fn threshold_history(&self, _gate_id: &str) -> Vec<f64> {
        vec![]
    }

    /// Externally anchored Merkle root that the receipt chain must match.
    fn external_chain_root(&self) -> Option<[u8; 32]> {
        None
    }
}

/// Evidence-source backed by ingested OTEL spans.
///
/// `spans` is an opaque JSON array; each span is expected to carry the
/// usual OTEL attributes (`name`, `attributes`, ...). A span only counts
/// toward `evidence_count` if it carries an `evidence.digest` attribute.
pub struct OtelEvidenceSource {
    spans: Vec<serde_json::Value>,
    chain: ReceiptChain,
}

impl OtelEvidenceSource {
    /// Create a new OTEL evidence source from ingested spans.
    pub fn new(spans: Vec<serde_json::Value>, chain: ReceiptChain) -> Self {
        Self { spans, chain }
    }

    fn span_attr<'a>(span: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
        span.get("attributes").and_then(|a| a.get(key))
    }

    fn span_for_gate<'a>(
        spans: &'a [serde_json::Value],
        gate_id: &str,
    ) -> Vec<&'a serde_json::Value> {
        spans
            .iter()
            .filter(|s| {
                Self::span_attr(s, "gate.id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|g| g == gate_id)
            })
            .collect()
    }
}

impl EvidenceSource for OtelEvidenceSource {
    fn gate_passed(&self, gate_id: &str) -> bool {
        Self::span_for_gate(&self.spans, gate_id).into_iter().any(|s| {
            Self::span_attr(s, "gate.passed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
    }

    fn evidence_count(&self, gate_id: &str) -> usize {
        Self::span_for_gate(&self.spans, gate_id)
            .into_iter()
            .filter(|s| {
                Self::span_attr(s, "evidence.digest")
                    .and_then(|v| v.as_str())
                    .is_some_and(|d| !d.is_empty())
            })
            .count()
    }

    fn gate_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self
            .spans
            .iter()
            .filter_map(|s| Self::span_attr(s, "gate.id").and_then(|v| v.as_str()).map(String::from))
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }

    fn authority_text(&self, slot: &str) -> AuthorityKind {
        let text = self
            .spans
            .iter()
            .find(|s| {
                Self::span_attr(s, "authority.slot")
                    .and_then(|v| v.as_str())
                    .is_some_and(|x| x == slot)
            })
            .and_then(|s| Self::span_attr(s, "authority.text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        crate::authority::classify(text)
    }

    fn runtime_proof_artifacts(&self, gate_id: &str) -> Vec<Artifact> {
        Self::span_for_gate(&self.spans, gate_id)
            .into_iter()
            .filter_map(|s| {
                let digest = Self::span_attr(s, "evidence.digest")
                    .and_then(|v| v.as_str())?
                    .to_string();
                if digest.is_empty() {
                    return None;
                }
                let source = Self::span_attr(s, "evidence.source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("otel:span")
                    .to_string();
                let kind = Self::span_attr(s, "evidence.kind")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                Some(Artifact { digest, source, kind })
            })
            .collect()
    }

    fn central_bus_present(&self) -> bool {
        let allowlisted_central_systems = ["kafka", "kinesis", "pubsub", "rabbitmq", "nats"];
        self.spans.iter().any(|s| {
            // Direct architectural marker
            if Self::span_attr(s, "bus.kind")
                .and_then(|v| v.as_str())
                .is_some_and(|k| k == "central")
            {
                return true;
            }
            // Or a known centralized messaging system
            Self::span_attr(s, "messaging.system")
                .and_then(|v| v.as_str())
                .is_some_and(|sys| allowlisted_central_systems.contains(&sys))
        })
    }

    fn receipt_chain(&self) -> &ReceiptChain {
        &self.chain
    }

    fn signing_time_skew(&self) -> Option<Duration> {
        let exec_ts = self
            .spans
            .iter()
            .find(|s| {
                Self::span_attr(s, "signing.role")
                    .and_then(|v| v.as_str())
                    .is_some_and(|r| r == "executor")
            })
            .and_then(|s| Self::span_attr(s, "signing.timestamp_ms"))
            .and_then(|v| v.as_u64())?;
        let ver_ts = self
            .spans
            .iter()
            .find(|s| {
                Self::span_attr(s, "signing.role")
                    .and_then(|v| v.as_str())
                    .is_some_and(|r| r == "verifier")
            })
            .and_then(|s| Self::span_attr(s, "signing.timestamp_ms"))
            .and_then(|v| v.as_u64())?;
        let diff = if exec_ts > ver_ts {
            exec_ts - ver_ts
        } else {
            ver_ts - exec_ts
        };
        Some(Duration::from_millis(diff))
    }

    fn benchmark_verdict(&self, target: &str) -> Option<Verdict> {
        let outcome = self
            .spans
            .iter()
            .find(|s| {
                Self::span_attr(s, "benchmark.target")
                    .and_then(|v| v.as_str())
                    .is_some_and(|t| t == target)
            })
            .and_then(|s| Self::span_attr(s, "benchmark.outcome"))
            .and_then(|v| v.as_str())?;
        match outcome {
            "pass" => Some(Verdict::Pass),
            "fail" => Some(Verdict::Fail),
            "skip" => Some(Verdict::Skip),
            _ => None,
        }
    }

    fn threshold_history(&self, gate_id: &str) -> Vec<f64> {
        let mut entries: Vec<(u64, f64)> = self
            .spans
            .iter()
            .filter(|s| {
                Self::span_attr(s, "gate.id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|g| g == gate_id)
            })
            .filter_map(|s| {
                let t = Self::span_attr(s, "threshold.value")?.as_f64()?;
                let ts = Self::span_attr(s, "threshold.timestamp_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                Some((ts, t))
            })
            .collect();
        entries.sort_by_key(|(ts, _)| *ts);
        entries.into_iter().map(|(_, v)| v).collect()
    }
}

/// Evidence-source that reads benchmark outcomes from the local filesystem.
///
/// Looks for `.wasm4pm/results/<target>.json` under `root` and parses
/// `{ "outcome": "pass" | "fail" | "skip" }`. Any other value yields `None`,
/// which is what a real "verdict missing" signal looks like.
pub struct FilesystemEvidenceSource {
    root: std::path::PathBuf,
    chain: ReceiptChain,
}

impl FilesystemEvidenceSource {
    /// Create a new filesystem evidence source rooted at `root`.
    pub fn new<P: Into<std::path::PathBuf>>(root: P, chain: ReceiptChain) -> Self {
        Self {
            root: root.into(),
            chain,
        }
    }
}

impl EvidenceSource for FilesystemEvidenceSource {
    fn gate_passed(&self, _gate_id: &str) -> bool {
        false
    }
    fn evidence_count(&self, _gate_id: &str) -> usize {
        0
    }
    fn gate_ids(&self) -> Vec<String> {
        vec![]
    }
    fn authority_text(&self, _slot: &str) -> AuthorityKind {
        AuthorityKind::Empty
    }
    fn runtime_proof_artifacts(&self, _gate_id: &str) -> Vec<Artifact> {
        vec![]
    }
    fn central_bus_present(&self) -> bool {
        false
    }
    fn receipt_chain(&self) -> &ReceiptChain {
        &self.chain
    }
    fn benchmark_verdict(&self, target: &str) -> Option<Verdict> {
        let path = self
            .root
            .join(".wasm4pm")
            .join("results")
            .join(format!("{}.json", target));
        let content = std::fs::read_to_string(&path).ok()?;
        let v: serde_json::Value = serde_json::from_str(&content).ok()?;
        match v.get("outcome").and_then(|x| x.as_str())? {
            "pass" => Some(Verdict::Pass),
            "fail" => Some(Verdict::Fail),
            "skip" => Some(Verdict::Skip),
            _ => None,
        }
    }
}

/// Evidence-source that fuses OTEL + filesystem data.
///
/// OTEL takes precedence; filesystem is consulted as a fallback when OTEL
/// returns `None`.
pub struct CompositeEvidenceSource {
    pub(crate) otel: OtelEvidenceSource,
    pub(crate) fs: FilesystemEvidenceSource,
}

impl CompositeEvidenceSource {
    /// Create a composite source.
    pub fn new(otel: OtelEvidenceSource, fs: FilesystemEvidenceSource) -> Self {
        Self { otel, fs }
    }
}

impl EvidenceSource for CompositeEvidenceSource {
    fn gate_passed(&self, gate_id: &str) -> bool {
        self.otel.gate_passed(gate_id) || self.fs.gate_passed(gate_id)
    }
    fn evidence_count(&self, gate_id: &str) -> usize {
        self.otel.evidence_count(gate_id) + self.fs.evidence_count(gate_id)
    }
    fn gate_ids(&self) -> Vec<String> {
        let mut ids = self.otel.gate_ids();
        ids.extend(self.fs.gate_ids());
        ids.sort();
        ids.dedup();
        ids
    }
    fn authority_text(&self, slot: &str) -> AuthorityKind {
        match self.otel.authority_text(slot) {
            AuthorityKind::Empty => self.fs.authority_text(slot),
            other => other,
        }
    }
    fn runtime_proof_artifacts(&self, gate_id: &str) -> Vec<Artifact> {
        let mut a = self.otel.runtime_proof_artifacts(gate_id);
        a.extend(self.fs.runtime_proof_artifacts(gate_id));
        a
    }
    fn central_bus_present(&self) -> bool {
        self.otel.central_bus_present() || self.fs.central_bus_present()
    }
    fn receipt_chain(&self) -> &ReceiptChain {
        self.otel.receipt_chain()
    }
    fn signing_time_skew(&self) -> Option<Duration> {
        self.otel.signing_time_skew().or_else(|| self.fs.signing_time_skew())
    }
    fn benchmark_verdict(&self, target: &str) -> Option<Verdict> {
        self.otel
            .benchmark_verdict(target)
            .or_else(|| self.fs.benchmark_verdict(target))
    }
    fn threshold_history(&self, gate_id: &str) -> Vec<f64> {
        let mut h = self.otel.threshold_history(gate_id);
        if h.is_empty() {
            h = self.fs.threshold_history(gate_id);
        }
        h
    }
    fn executor_pubkey(&self) -> Option<VerifyingKey> {
        self.otel.executor_pubkey().or_else(|| self.fs.executor_pubkey())
    }
    fn verifier_pubkey(&self) -> Option<VerifyingKey> {
        self.otel.verifier_pubkey().or_else(|| self.fs.verifier_pubkey())
    }
    fn attestation_descends(&self) -> Option<bool> {
        self.otel
            .attestation_descends()
            .or_else(|| self.fs.attestation_descends())
    }
    fn external_chain_root(&self) -> Option<[u8; 32]> {
        self.otel.external_chain_root().or_else(|| self.fs.external_chain_root())
    }
}
