//! Content-addressed receipt ledger with deterministic replay (ARD §3.16).
//!
//! Generalizes the hash-chain pattern already used by
//! [`crate::session::turn`]'s `SessionReceipt`: every entry's `receipt_hash`
//! is derived from its own fields plus the previous entry's hash, so a
//! persisted ledger can be independently re-verified on load rather than
//! trusted because "we wrote it" (chicken-and-egg guard).

use serde::{Deserialize, Serialize};

const RECEIPT_HASH_DOMAIN: &str = "wasm4pm.cognition.interview.receipt.v1";

/// One entry in the receipt ledger.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    /// 1-based position in the ledger.
    pub sequence: u64,
    /// What kind of thing this receipt records, e.g. `"transition"`, `"admission"`.
    pub kind: String,
    /// BLAKE3 hex digest of the subject (the transition, the admitted fact, ...).
    pub subject_hash: String,
    /// Outcome label, e.g. `"ok"` or a refusal code.
    pub outcome: String,
    /// Hash of the previous receipt in the chain, or `None` for the first entry.
    pub previous_receipt_hash: Option<String>,
    /// This receipt's own content-addressed hash.
    pub receipt_hash: String,
}

fn compute_receipt_hash(
    sequence: u64,
    kind: &str,
    subject_hash: &str,
    outcome: &str,
    previous_receipt_hash: Option<&str>,
) -> String {
    let mut hasher = blake3::Hasher::new_derive_key(RECEIPT_HASH_DOMAIN);
    hasher.update(&sequence.to_le_bytes());
    hasher.update(kind.as_bytes());
    hasher.update(subject_hash.as_bytes());
    hasher.update(outcome.as_bytes());
    hasher.update(previous_receipt_hash.unwrap_or("").as_bytes());
    hasher.finalize().to_hex().to_string()
}

/// A persisted ledger failed independent re-verification on load.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayMismatch {
    /// Sequence number of the first entry whose hash did not recompute.
    pub sequence: u64,
}

/// An append-only, hash-chained receipt ledger.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ReceiptLedger {
    entries: Vec<Receipt>,
}

impl ReceiptLedger {
    /// A fresh, empty ledger (bootstrap: zero receipts).
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// All recorded receipts, in order.
    pub fn entries(&self) -> &[Receipt] {
        &self.entries
    }

    /// Record a new receipt, chained to the previous entry's hash.
    pub fn record(&mut self, kind: &str, subject_hash: &str, outcome: &str) -> &Receipt {
        let sequence = self.entries.len() as u64 + 1;
        let previous_receipt_hash = self.entries.last().map(|r| r.receipt_hash.clone());
        let receipt_hash = compute_receipt_hash(
            sequence,
            kind,
            subject_hash,
            outcome,
            previous_receipt_hash.as_deref(),
        );
        self.entries.push(Receipt {
            sequence,
            kind: kind.to_string(),
            subject_hash: subject_hash.to_string(),
            outcome: outcome.to_string(),
            previous_receipt_hash,
            receipt_hash,
        });
        self.entries.last().expect("just pushed")
    }

    /// Reconstruct a ledger from persisted entries, independently recomputing
    /// every `receipt_hash` from its own fields rather than trusting the
    /// stored value. Any tampered field breaks the chain deterministically.
    pub fn from_persisted(entries: Vec<Receipt>) -> Result<Self, ReplayMismatch> {
        let mut expected_previous: Option<String> = None;
        for (index, entry) in entries.iter().enumerate() {
            let expected_sequence = index as u64 + 1;
            let recomputed = compute_receipt_hash(
                expected_sequence,
                &entry.kind,
                &entry.subject_hash,
                &entry.outcome,
                expected_previous.as_deref(),
            );
            if entry.sequence != expected_sequence
                || entry.previous_receipt_hash != expected_previous
                || recomputed != entry.receipt_hash
            {
                return Err(ReplayMismatch {
                    sequence: expected_sequence,
                });
            }
            expected_previous = Some(entry.receipt_hash.clone());
        }
        Ok(Self { entries })
    }
}
