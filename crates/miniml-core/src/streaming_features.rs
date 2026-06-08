use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WelfordStatistics {
    pub count: usize,
    pub mean: f64,
    pub m2: f64,
}

impl WelfordStatistics {
    pub fn update(&mut self, val: f64) {
        self.count += 1;
        let delta = val - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = val - self.mean;
        self.m2 += delta * delta2;
    }

    pub fn variance(&self) -> f64 {
        if self.count < 2 {
            0.0
        } else {
            self.m2 / (self.count - 1) as f64
        }
    }

    pub fn std_dev(&self) -> f64 {
        self.variance().sqrt()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IncrementalTfIdf {
    pub document_count: usize,
    pub term_doc_freq: HashMap<String, usize>,
}

impl IncrementalTfIdf {
    pub fn update(&mut self, terms: &[String]) {
        self.document_count += 1;
        let mut seen = std::collections::HashSet::new();
        for term in terms {
            if seen.insert(term.clone()) {
                *self.term_doc_freq.entry(term.clone()).or_insert(0) += 1;
            }
        }
    }

    pub fn get_tfidf(&self, term: &str, count: usize, doc_len: usize) -> f64 {
        let tf = count as f64 / doc_len as f64;
        let df = *self.term_doc_freq.get(term).unwrap_or(&1);
        let idf = (self.document_count as f64 / (1.0 + df as f64)).ln();
        tf * idf
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StreamingFeatureExtractor {
    pub tfidf_state: IncrementalTfIdf,
    pub duration_stats: WelfordStatistics,
}

impl StreamingFeatureExtractor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update_from_trace(&mut self, activities: &[String], duration_ms: f64) {
        self.tfidf_state.update(activities);
        self.duration_stats.update(duration_ms);
    }

    pub fn extract_vector(&self, activities: &[String], duration_ms: f64) -> Vec<f64> {
        let mut vec = Vec::new();

        // 1. Duration Z-score
        let mean = self.duration_stats.mean;
        let std = self.duration_stats.std_dev();
        let z_score = if std > 0.0 {
            (duration_ms - mean) / std
        } else {
            0.0
        };
        vec.push(z_score);

        // 2. Activity count feature
        vec.push(activities.len() as f64);

        // 3. TF-IDF for common activities (we'd need a fixed vocab or just pick top N)
        // For simplicity, we just use the first few dimensions for raw stats

        vec
    }
}
