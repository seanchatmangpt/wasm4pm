//! POWL8 Operation primitive.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Powl8OpError {
    InvalidDiscriminant,
}

impl core::fmt::Display for Powl8OpError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "Invalid Powl8Op discriminant")
    }
}

/// The operator for a process motion edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
#[repr(u8)]
pub enum Powl8Op {
    #[default]
    NoOp = 0,
    Act = 1,
    Choice = 2,
    Parallel = 3,
    Join = 4,
    Loop = 5,
    Block = 6,
    Silent = 7,
}

impl TryFrom<u8> for Powl8Op {
    type Error = Powl8OpError;
    fn try_from(val: u8) -> Result<Self, Self::Error> {
        match val {
            0 => Ok(Self::NoOp),
            1 => Ok(Self::Act),
            2 => Ok(Self::Choice),
            3 => Ok(Self::Parallel),
            4 => Ok(Self::Join),
            5 => Ok(Self::Loop),
            6 => Ok(Self::Block),
            7 => Ok(Self::Silent),
            _ => Err(Powl8OpError::InvalidDiscriminant),
        }
    }
}
