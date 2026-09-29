use super::CandidatePlan;
#[derive(Debug, Clone, PartialEq)]
pub struct Advice {
    pub subject: String,
    pub effect_id: String,
    pub plan: serde_json::Value,
}
impl From<&CandidatePlan> for Advice {
    fn from(c: &CandidatePlan) -> Self {
        Self {
            subject: c.subject.clone(),
            effect_id: c.effect_id.clone(),
            plan: c.plan.clone(),
        }
    }
}
