use blake3::Hasher;
pub fn digest(bytes: &[u8]) -> String {
    let mut h = Hasher::new_derive_key("sa2a.portable.digest.v1");
    h.update(bytes);
    h.finalize().to_hex().to_string()
}
