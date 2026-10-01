use super::{CandidatePlan, PortableRequest, Sa2aError};
pub trait CandidateProvider {
    fn id(&self) -> &str;
    fn supports(&self, formalism: &str) -> bool;
    fn propose(&self, request: &PortableRequest) -> Result<CandidatePlan, Sa2aError>;
}
pub fn select<'a>(
    providers: &'a [&'a dyn CandidateProvider],
    formalism: &str,
    excluded: &[String],
) -> Option<&'a dyn CandidateProvider> {
    providers
        .iter()
        .copied()
        .find(|p| p.supports(formalism) && !excluded.iter().any(|x| x == p.id()))
}
