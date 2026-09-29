use std::fmt;

#[derive(Debug)]
pub enum ActuatorRefusal {
    InvalidEffect,
    InvalidCertificate,
    InvalidDigest,
    InvalidKey,
    InvalidSignature,
    UnsupportedAlgorithm,
    UnknownKey,
    RevokedKey,
    KeyOutsideValidity,
    PrincipalMismatch,
    AudienceMismatch,
    EpochMismatch,
    GenerationMismatch,
    CertificateOutsideValidity,
    InsufficientQuorum,
    CustodianIndependence,
    AlreadyClaimed,
    AlreadyExecuted,
    UnknownOutcome,
    EffectorMismatch,
    PathRefused,
    LedgerIo(std::io::Error),
    LedgerEncoding(serde_json::Error),
    EffectFailed(String),
}

impl PartialEq for ActuatorRefusal {
    fn eq(&self, other: &Self) -> bool {
        std::mem::discriminant(self) == std::mem::discriminant(other)
    }
}

impl fmt::Display for ActuatorRefusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "REFUSED:{self:?}")
    }
}

impl std::error::Error for ActuatorRefusal {}

impl From<std::io::Error> for ActuatorRefusal {
    fn from(value: std::io::Error) -> Self { Self::LedgerIo(value) }
}

impl From<serde_json::Error> for ActuatorRefusal {
    fn from(value: serde_json::Error) -> Self { Self::LedgerEncoding(value) }
}
