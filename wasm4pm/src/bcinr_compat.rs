//! Compatibility layer for `bcinr` functions missing in certain versions.
//!
//! Provides fallback implementations for `fnv1a_64` and `find_byte`
//! to ensure build stability across environments.

/// Fallback sketch algorithms
pub mod sketch {
    /// Compute FNV-1a 64-bit hash (portable fallback)
    pub fn fnv1a_64(data: &[u8]) -> u64 {
        const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
        const FNV_PRIME: u64 = 0x100000001b3;
        let mut hash = FNV_OFFSET_BASIS;
        for &byte in data {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(FNV_PRIME);
        }
        hash
    }
}

/// Fallback scanning algorithms
pub mod scan {
    /// Find first occurrence of a byte (portable fallback)
    pub fn find_byte(data: &[u8], byte: u8) -> Option<usize> {
        data.iter().position(|&b| b == byte)
    }
}
