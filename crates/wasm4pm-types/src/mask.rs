#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
#[repr(transparent)]
pub struct FieldMask(pub u64);

impl FieldMask {
    #[inline]
    #[must_use]
    pub const fn empty() -> Self {
        Self(0)
    }
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0 == 0
    }
    #[inline]
    #[must_use]
    pub const fn with_bit(self, bit: FieldBit) -> Self {
        // PR #71 MCC class: the literal `1` would be `i32` here, which silently
        // overflows for bit.get() >= 31. Use `1u64` to keep the shift in the
        // mask's actual storage type.
        Self(self.0 | (1u64 << bit.get()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
#[repr(transparent)]
pub struct CompletedMask(pub u64);

impl CompletedMask {
    #[inline]
    #[must_use]
    pub const fn empty() -> Self {
        Self(0)
    }
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0 == 0
    }
    #[inline]
    #[must_use]
    pub const fn with_bit(self, bit: FieldBit) -> Self {
        // PR #71 MCC class: see FieldMask::with_bit comment.
        Self(self.0 | (1u64 << bit.get()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
#[repr(transparent)]
pub struct FieldBit(u8);

impl FieldBit {
    /// # Errors
    /// Returns `MaskError` if value > 63.
    #[inline]
    pub const fn new_checked(value: u8) -> Result<Self, MaskError> {
        if value < 64 {
            Ok(Self(value))
        } else {
            Err(MaskError::OutOfRange)
        }
    }
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: u8) -> Self {
        Self(value)
    }
    #[inline]
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MaskError {
    OutOfRange,
}

impl core::fmt::Display for MaskError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::OutOfRange => write!(f, "FieldBit must be in range [0, 63]"),
        }
    }
}

impl std::error::Error for MaskError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rank-1 (mathematical theorem): for every legal bit position b in [0,63],
    /// `with_bit(b)` on an empty mask must equal exactly `1u64 << b`.
    /// Regression for PR #71 MCC class — the original literal `1` was `i32`
    /// and overflowed for b >= 31, silently producing the wrong mask value.
    #[test]
    fn with_bit_matches_pow2_for_every_bit() {
        for b in 0u8..64u8 {
            let bit = FieldBit::new_checked(b).unwrap();
            let m = FieldMask::empty().with_bit(bit);
            assert_eq!(m.0, 1u64 << b, "FieldMask bit {b} mismatch");
            let cm = CompletedMask::empty().with_bit(bit);
            assert_eq!(cm.0, 1u64 << b, "CompletedMask bit {b} mismatch");
        }
    }

    /// Rank-2 (domain contract): FieldBit::new_checked rejects 64..=255 with
    /// MaskError::OutOfRange, and accepts 0..=63.
    #[test]
    fn field_bit_range_contract() {
        for v in 0u8..64u8 {
            assert_eq!(FieldBit::new_checked(v).unwrap().get(), v);
        }
        for v in 64u8..=200u8 {
            assert_eq!(FieldBit::new_checked(v), Err(MaskError::OutOfRange));
        }
    }
}
