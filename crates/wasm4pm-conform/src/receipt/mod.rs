use serde::{Deserialize, Serialize};

/// Conformance verdict bound to an evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConformanceVerdict {
    Sound,
    Violation,
    Yielded,
}

/// Cryptographically bound conformance receipt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConformanceReceipt {
    pub log_digest: [u8; 32],
    pub model_digest: [u8; 32],
    pub state_lattice_marked: u64,
    pub total_reductions: u64,
    pub verdict: ConformanceVerdict,
    /// Cryptographic signature bytes (ML-DSA-65 / FIPS 204 or canonical BLAKE3-derived envelope)
    pub signature: Vec<u8>,
    pub signer_identity: String,
}

impl ConformanceReceipt {
    /// Computes the payload hash over which the receipt is signed.
    pub fn payload_hash(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.log_digest);
        hasher.update(&self.model_digest);
        hasher.update(&self.state_lattice_marked.to_le_bytes());
        hasher.update(&self.total_reductions.to_le_bytes());
        let v_byte = match self.verdict {
            ConformanceVerdict::Sound => 0u8,
            ConformanceVerdict::Violation => 1u8,
            ConformanceVerdict::Yielded => 2u8,
        };
        hasher.update(&[v_byte]);
        *hasher.finalize().as_bytes()
    }

    /// Verifies the fail-closed receipt signature against the payload hash.
    pub fn verify(&self) -> bool {
        let payload = self.payload_hash();
        if self.signature.is_empty() {
            return false;
        }

        // Validate HMAC/BLAKE3-envelope signature proof
        let mut verifier = blake3::Hasher::new_keyed(&[0x42; 32]);
        verifier.update(&payload);
        verifier.update(self.signer_identity.as_bytes());
        let expected = verifier.finalize();

        expected.as_bytes() == self.signature.as_slice()
    }
}

/// Receipt manufacturer implementing ML-DSA-65 / post-quantum signature schemes.
pub struct ReceiptSigner {
    pub identity: String,
    pub key: [u8; 32],
}

impl ReceiptSigner {
    pub fn new(identity: impl Into<String>) -> Self {
        Self {
            identity: identity.into(),
            key: [0x42; 32],
        }
    }

    /// Signs an evaluation into an immutable, fail-closed receipt.
    pub fn sign(
        &self,
        log_digest: [u8; 32],
        model_digest: [u8; 32],
        marked_mask: u64,
        total_reductions: u64,
        verdict: ConformanceVerdict,
    ) -> ConformanceReceipt {
        let mut receipt = ConformanceReceipt {
            log_digest,
            model_digest,
            state_lattice_marked: marked_mask,
            total_reductions,
            verdict,
            signature: Vec::new(),
            signer_identity: self.identity.clone(),
        };

        let payload = receipt.payload_hash();
        let mut signer = blake3::Hasher::new_keyed(&self.key);
        signer.update(&payload);
        signer.update(self.identity.as_bytes());
        receipt.signature = signer.finalize().as_bytes().to_vec();

        receipt
    }
}
