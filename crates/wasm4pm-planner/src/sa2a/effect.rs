use blake3::Hasher;
pub fn effect_id(subject:&str, operation:&str, payload_digest:&str)->String {
 let mut h=Hasher::new_derive_key("sa2a.portable.effect.v1"); h.update(subject.as_bytes()); h.update(&[0]); h.update(operation.as_bytes()); h.update(&[0]); h.update(payload_digest.as_bytes()); h.finalize().to_hex().to_string()
}
