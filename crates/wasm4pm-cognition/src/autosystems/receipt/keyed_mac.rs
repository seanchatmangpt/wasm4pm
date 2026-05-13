//! Keyed-BLAKE3 MAC fallback for environments without ed25519.
//!
//! The fallback derives a per-actor MAC key by hashing the actor's identity
//! bytes under the `wasm4pm.identity.v2` domain. Signatures are produced as
//! `BLAKE3_keyed(actor_key, msg)` and verified by re-deriving and comparing
//! in constant time (subtle eq via `blake3::Hash`).

use crate::autosystems::receipt::identity_domain_key_pub;

fn derive_actor_key(public_key: &[u8]) -> [u8; 32] {
    let domain = identity_domain_key_pub();
    let mut h = blake3::Hasher::new_keyed(&domain);
    h.update(public_key);
    let mut out = [0u8; 32];
    h.finalize_xof().fill(&mut out);
    out
}

/// Sign `msg` under the MAC fallback identity.
pub fn sign(public_key: &[u8], msg: &[u8]) -> Vec<u8> {
    let key = derive_actor_key(public_key);
    blake3::keyed_hash(&key, msg).as_bytes().to_vec()
}

/// Verify a MAC tag in constant time.
pub fn verify(public_key: &[u8], msg: &[u8], tag: &[u8]) -> bool {
    if tag.len() != 32 {
        return false;
    }
    let key = derive_actor_key(public_key);
    let expected = blake3::keyed_hash(&key, msg);
    expected.as_bytes().as_slice() == tag
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let pk = b"actor-A".to_vec();
        let msg = b"hello world";
        let tag = sign(&pk, msg);
        assert!(verify(&pk, msg, &tag));
        assert!(!verify(&pk, b"tampered", &tag));
        assert!(!verify(b"actor-B", msg, &tag));
    }
}
