use blake3::Hasher;
pub fn replay_key(subject:&str,effect:&str,provider:&str,attempt:usize)->String{let mut h=Hasher::new_derive_key("sa2a.portable.replay.v1");for x in [subject,effect,provider]{h.update(x.as_bytes());h.update(&[0]);}h.update(&attempt.to_le_bytes());h.finalize().to_hex().to_string()}
