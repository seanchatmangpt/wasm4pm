use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IngestionKnowledgeBase {
    pub learned_date_formats: HashMap<String, String>,
    pub ignored_noise_attributes: HashSet<String>,
}

impl IngestionKnowledgeBase {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn learn_date_format(&mut self, key: String, format: String) {
        self.learned_date_formats.insert(key, format);
    }

    pub fn ignore_attribute(&mut self, key: String) {
        self.ignored_noise_attributes.insert(key);
    }
}
