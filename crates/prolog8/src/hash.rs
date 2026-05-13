//! BLAKE3 hashing with domain-separation tags.
//!
//! Every Prolog8 hash uses a derived BLAKE3 key so that the output of one
//! hashing scheme can never collide with another (e.g., a fact hash cannot
//! be confused with a proof-node hash).

use once_cell::sync::Lazy;

/// 32-byte BLAKE3 hash output.
pub type Hash = [u8; 32];

/// Domain key for a fact row's canonical hash.
pub static DOMAIN_PROLOG8_FACT: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.fact.v1", b""));

/// Domain key for a fact block header.
pub static DOMAIN_PROLOG8_BLOCK_HEADER: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.block_header.v1", b""));

/// Domain key for the rolling fact-block content hash.
pub static DOMAIN_PROLOG8_BLOCK: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.block.v1", b""));

/// Domain key for a proof-DAG node.
pub static DOMAIN_PROLOG8_PROOF_NODE: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.proof_node.v1", b""));

/// Domain key for the rolling proof-root.
pub static DOMAIN_PROLOG8_PROOF_ROOT: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.proof_root.v1", b""));

/// Domain key for receipts.
pub static DOMAIN_PROLOG8_RECEIPT: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.receipt.v1", b""));

/// Domain key for input query roots.
pub static DOMAIN_PROLOG8_INPUT: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.input.v1", b""));

/// Domain key for output binding roots.
pub static DOMAIN_PROLOG8_OUTPUT: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.output.v1", b""));

/// Domain key for the catalog root.
pub static DOMAIN_PROLOG8_CATALOG: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.catalog.v1", b""));

/// Domain key for the rule artifact root.
pub static DOMAIN_PROLOG8_RULES: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.rules.v1", b""));

/// Domain key for chain-link hashes (length-prefixed).
pub static DOMAIN_PROLOG8_LINK: Lazy<[u8; 32]> =
    Lazy::new(|| blake3::derive_key("prolog8.link.v1", b""));

/// Hash arbitrary bytes under a domain key.
pub fn hash_bytes(domain: &[u8; 32], bytes: &[u8]) -> Hash {
    let mut hasher = blake3::Hasher::new_keyed(domain);
    hasher.update(bytes);
    hasher.finalize().into()
}

/// Combine multiple roots into a single canonical root with length prefixes.
///
/// Encoding: for each input `h_i`, write `len_le(32) || h_i`. Then BLAKE3 with
/// the receipt domain key. This makes prefix-collisions impossible across
/// inputs of different cardinality.
pub fn combine_roots(roots: &[&Hash]) -> Hash {
    let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_RECEIPT);
    hasher.update(&(roots.len() as u32).to_le_bytes());
    for r in roots {
        hasher.update(&32u32.to_le_bytes());
        hasher.update(*r);
    }
    hasher.finalize().into()
}

/// Compute a length-prefixed link hash given step number, input hash, output
/// hash, and previous link hash. Used to chain receipts.
pub fn link_hash(step: u64, input: &Hash, output: &Hash, prev: &Hash) -> Hash {
    let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_LINK);
    hasher.update(&step.to_le_bytes());
    hasher.update(&32u32.to_le_bytes());
    hasher.update(input);
    hasher.update(&32u32.to_le_bytes());
    hasher.update(output);
    hasher.update(&32u32.to_le_bytes());
    hasher.update(prev);
    hasher.finalize().into()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_keys_are_distinct() {
        assert_ne!(*DOMAIN_PROLOG8_FACT, *DOMAIN_PROLOG8_RECEIPT);
        assert_ne!(*DOMAIN_PROLOG8_PROOF_NODE, *DOMAIN_PROLOG8_RECEIPT);
        assert_ne!(*DOMAIN_PROLOG8_INPUT, *DOMAIN_PROLOG8_OUTPUT);
    }

    #[test]
    fn combine_roots_is_collision_resistant_under_length_prefix() {
        // Two distinct splittings of the same byte sequence must produce
        // distinct roots.
        let a = [1u8; 32];
        let b = [2u8; 32];
        let c = [3u8; 32];
        let h1 = combine_roots(&[&a, &b, &c]);
        let h2 = combine_roots(&[&a, &b]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn link_hash_chains_consistently() {
        let z = [0u8; 32];
        let a = [1u8; 32];
        let h0 = link_hash(0, &a, &a, &z);
        let h1 = link_hash(1, &a, &a, &h0);
        // Re-running with same inputs must give same result.
        assert_eq!(h0, link_hash(0, &a, &a, &z));
        assert_eq!(h1, link_hash(1, &a, &a, &h0));
        // Different prev breaks chain.
        let h1_alt = link_hash(1, &a, &a, &z);
        assert_ne!(h1, h1_alt);
    }
}
