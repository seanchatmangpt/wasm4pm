//! BLAKE3-linked receipt chain for replay and integrity.

use serde::{Deserialize, Serialize};

/// A link in the receipt chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainLink {
    /// Step number in the chain
    pub step: u32,
    /// Input hash (hex-encoded)
    pub input_hash: String,
    /// Output hash (hex-encoded)
    pub output_hash: String,
    /// Previous link's hash (hex-encoded)
    pub previous_hash: String,
    /// This link's hash (hex-encoded, 64 chars)
    pub link_hash: String,
}

/// A receipt chain: proof of execution via linked hashes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptChain {
    /// Chain links in order
    pub links: Vec<ChainLink>,
}

impl ReceiptChain {
    /// Create a new empty chain.
    pub fn new() -> Self {
        ReceiptChain { links: vec![] }
    }

    /// Add a link to the chain (alias for append).
    pub fn add_link(&mut self, input_hash: String, output_hash: String) {
        self.append(input_hash, output_hash);
    }

    /// Append a link to the chain.
    pub fn append(&mut self, input_hash: String, output_hash: String) {
        let prev_hash = if let Some(last) = self.links.last() {
            last.link_hash.clone()
        } else {
            "0".repeat(64)
        };

        let step = self.links.len() as u32;
        let combined = format!(
            "{}{}{}{}",
            step.to_string(),
            input_hash,
            output_hash,
            prev_hash
        );
        let link_hash_bytes = blake3::hash(combined.as_bytes());
        let link_hash = link_hash_bytes.to_hex().to_string();

        self.links.push(ChainLink {
            step,
            input_hash,
            output_hash,
            previous_hash: prev_hash,
            link_hash,
        });
    }

    /// Verify the chain: replay all links and check hashes.
    pub fn verify_chain(&self) -> bool {
        let mut expected_prev = "0".repeat(64);

        for link in &self.links {
            let combined = format!(
                "{}{}{}{}",
                link.step, link.input_hash, link.output_hash, link.previous_hash
            );
            let computed = blake3::hash(combined.as_bytes()).to_hex().to_string();

            if computed != link.link_hash {
                return false;
            }
            if link.previous_hash != expected_prev {
                return false;
            }
            expected_prev = link.link_hash.clone();
        }

        true
    }

    /// Get the final hash (replay pointer) of the chain.
    pub fn replay_pointer(&self) -> String {
        if let Some(last) = self.links.last() {
            last.link_hash[..16].to_string()
        } else {
            "0".repeat(16)
        }
    }
}

impl Default for ReceiptChain {
    fn default() -> Self {
        Self::new()
    }
}
