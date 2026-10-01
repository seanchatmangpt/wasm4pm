use serde::{Deserialize, Serialize};

/// Administrative failure domain for a signing custodian.
///
/// C3 quorum is counted across distinct trust domains, not merely key ids or
/// custodian labels. Two custodians controlled by the same domain contribute
/// one independent vote.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TrustDomainId(pub String);

impl TrustDomainId {
    pub fn parse(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        if value.trim().is_empty() {
            None
        } else {
            Some(Self(value))
        }
    }
}
