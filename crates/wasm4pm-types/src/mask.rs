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
        Self(self.0 | (1 << bit.get()))
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
        Self(self.0 | (1 << bit.get()))
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
