use serde::Serialize;
#[derive(Debug, Clone, Serialize)]
pub struct OcelEvent<'a> {
    pub event_type: &'a str,
    pub subject: &'a str,
    pub effect_id: &'a str,
    pub provider: &'a str,
    pub outcome: &'a str,
}
