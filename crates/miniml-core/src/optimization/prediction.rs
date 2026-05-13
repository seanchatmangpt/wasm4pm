//! Prediction Algorithms (Markov, Beam Search, EWMA)
//!
//! Ported from wasm4pm prediction_additions.rs
//!
//! Provides sequence prediction, trend detection, and
//! statistical modeling algorithms.

use wasm_bindgen::prelude::*;
use std::collections::HashMap;

/// Shannon entropy of a probability distribution
fn entropy(probs: &[f64]) -> f64 {
    probs
        .iter()
        .filter(|&&p| p > 0.0)
        .map(|&p| -p * p.ln())
        .sum()
}

/// Top-k prediction result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct TopKPrediction {
    /// Predicted next items/states
    #[wasm_bindgen(getter_with_clone)]
    pub items: Vec<String>,

    /// Probability for each predicted item
    #[wasm_bindgen(getter_with_clone)]
    pub probabilities: Vec<f64>,

    /// Confidence (max probability)
    #[wasm_bindgen(getter_with_clone)]
    pub confidence: f64,

    /// Normalized entropy [0, 1] (0 = certain, 1 = uncertain)
    #[wasm_bindgen(getter_with_clone)]
    pub entropy: f64,
}

/// Predict top-k next items using n-gram Markov model
///
/// # Arguments
/// * `ngram_counts` - Map from prefix to next-item frequencies
/// * `vocabulary` - Item names indexed by ID
/// * `prefix` - Current prefix sequence
/// * `k` - Number of predictions to return
///
/// # Returns
/// Top-k predictions with probabilities
pub fn predict_top_k(
    ngram_counts: &HashMap<Vec<usize>, HashMap<usize, usize>>,
    vocabulary: &[String],
    prefix: &[usize],
    k: usize,
) -> TopKPrediction {
    let mut candidates: Vec<(String, f64)> = Vec::new();

    if let Some(next_items) = ngram_counts.get(prefix) {
        let total: usize = next_items.values().sum();
        if total == 0 {
            return TopKPrediction {
                items: vec![],
                probabilities: vec![],
                confidence: 0.0,
                entropy: 0.0,
            };
        }

        for (item_id, count) in next_items.iter() {
            if let Some(name) = vocabulary.get(*item_id) {
                let prob = *count as f64 / total as f64;
                candidates.push((name.clone(), prob));
            }
        }
    }

    candidates.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let top_k = k.min(candidates.len());
    let items: Vec<String> = candidates
        .iter()
        .take(top_k)
        .map(|(i, _)| i.clone())
        .collect();
    let probabilities: Vec<f64> = candidates
        .iter()
        .take(top_k)
        .map(|(_, p)| *p)
        .collect();

    let confidence = probabilities.first().copied().unwrap_or(0.0);
    let ent = entropy(&probabilities);
    let max_ent = if !probabilities.is_empty() {
        (probabilities.len() as f64).ln()
    } else {
        0.0
    };
    let entropy_norm = if max_ent > 0.0 { ent / max_ent } else { 0.0 };

    TopKPrediction {
        items,
        probabilities,
        confidence,
        entropy: entropy_norm,
    }
}

/// Beam search path result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct BeamPath {
    /// Predicted sequence
    #[wasm_bindgen(getter_with_clone)]
    pub sequence: Vec<String>,

    /// Probability of this path
    #[wasm_bindgen(getter_with_clone)]
    pub probability: f64,

    /// Length of path
    #[wasm_bindgen(getter_with_clone)]
    pub length: usize,
}

/// Beam search for future path prediction
///
/// # Arguments
/// * `ngram_counts` - N-gram transition model
/// * `vocabulary` - Item names
/// * `prefix` - Starting prefix
/// * `beam_width` - Number of paths to maintain
/// * `max_steps` - Maximum prediction horizon
///
/// # Returns
/// Top beam_width most likely future paths
pub fn beam_search(
    ngram_counts: &HashMap<Vec<usize>, HashMap<usize, usize>>,
    vocabulary: &[String],
    prefix: &[usize],
    beam_width: usize,
    max_steps: usize,
) -> Vec<BeamPath> {
    let mut beams: Vec<(Vec<usize>, f64)> = vec![(prefix.to_vec(), 1.0)];

    for _ in 0..max_steps {
        let mut next_beams: Vec<(Vec<usize>, f64)> = Vec::new();

        for (current_seq, current_prob) in beams.iter() {
            if let Some(next_items) = ngram_counts.get(current_seq) {
                let total: usize = next_items.values().sum();
                if total == 0 {
                    continue;
                }

                for (item_id, count) in next_items.iter() {
                    let trans_prob = *count as f64 / total as f64;
                    let new_prob = current_prob * trans_prob;
                    let mut new_seq = current_seq.clone();
                    new_seq.push(*item_id);
                    next_beams.push((new_seq, new_prob));
                }
            }
        }

        next_beams.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        beams = next_beams.into_iter().take(beam_width).collect();
    }

    beams
        .iter()
        .map(|(seq, prob)| {
            let items: Vec<String> = seq
                .iter()
                .skip(prefix.len())
                .filter_map(|id| vocabulary.get(*id).cloned())
                .collect();
            BeamPath {
                sequence: items,
                probability: *prob,
                length: seq.len() - prefix.len(),
            }
        })
        .collect()
}

/// Compute log-likelihood of a sequence
///
/// # Arguments
/// * `ngram_counts` - N-gram transition model
/// * `sequence` - Sequence to score
/// * `ngram_size` - Size of n-gram (1 for unigram, 2 for bigram, etc.)
///
/// # Returns
/// Log-likelihood (higher = more likely)
pub fn sequence_log_likelihood(
    ngram_counts: &HashMap<Vec<usize>, HashMap<usize, usize>>,
    sequence: &[usize],
    ngram_size: usize,
) -> f64 {
    if ngram_size == 0 || sequence.is_empty() {
        return 0.0;
    }

    let mut ll = 0.0;

    match ngram_size {
        1 => {
            // Unigram: no prefix context
            for item in sequence.iter() {
                if let Some(next_items) = ngram_counts.get(&vec![]) {
                    let total: usize = next_items.values().sum();
                    if total > 0 {
                        if let Some(count) = next_items.get(item) {
                            let prob = *count as f64 / total as f64;
                            ll += prob.ln();
                        } else {
                            ll += 1e-9_f64.ln();
                        }
                    }
                }
            }
        }
        _ => {
            // N-gram with n >= 2
            if sequence.len() < ngram_size {
                return 0.0;
            }
            for i in ngram_size - 1..sequence.len() {
                let prefix = &sequence[i - ngram_size + 1..i];
                let next_item = sequence[i];

                if let Some(next_items) = ngram_counts.get(&prefix.to_vec()) {
                    let total: usize = next_items.values().sum();
                    if total > 0 {
                        if let Some(count) = next_items.get(&next_item) {
                            let prob = *count as f64 / total as f64;
                            ll += prob.ln();
                        } else {
                            ll += 1e-9_f64.ln();
                        }
                    }
                }
            }
        }
    }

    ll
}

/// Transition graph edge
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct TransitionEdge {
    /// Source state
    #[wasm_bindgen(getter_with_clone)]
    pub from: String,

    /// Destination state
    #[wasm_bindgen(getter_with_clone)]
    pub to: String,

    /// Transition probability
    #[wasm_bindgen(getter_with_clone)]
    pub probability: f64,
}

/// Transition graph result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct TransitionGraph {
    /// All edges with probabilities
    #[wasm_bindgen(getter_with_clone)]
    pub edges: Vec<TransitionEdge>,

    /// All unique states/activities
    #[wasm_bindgen(getter_with_clone)]
    pub states: Vec<String>,
}

/// Build transition probability graph from sequences
///
/// # Arguments
/// * `sequences` - Training sequences
///
/// # Returns
/// Transition graph with edge probabilities
pub fn build_transition_graph<T: std::hash::Hash + Eq + Clone + std::fmt::Display>(
    sequences: &[Vec<T>],
) -> TransitionGraph {
    let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut state_totals: HashMap<String, usize> = HashMap::new();
    let mut states_set: std::collections::HashSet<String> = std::collections::HashSet::new();

    for seq in sequences {
        let mut prev_state: Option<String> = None;
        for state in seq {
            let state_str = state.to_string();
            states_set.insert(state_str.clone());
            *state_totals.entry(state_str.clone()).or_insert(0) += 1;

            if let Some(prev) = prev_state {
                *edge_counts
                    .entry((prev.clone(), state_str.clone()))
                    .or_insert(0) += 1;
            }
            prev_state = Some(state_str);
        }
    }

    let mut edges: Vec<TransitionEdge> = edge_counts
        .into_iter()
        .map(|((from, to), count)| {
            let total = state_totals.get(&from).copied().unwrap_or(1);
            let prob = count as f64 / total as f64;
            TransitionEdge { from, to, probability: prob }
        })
        .collect();
    edges.sort_by(|a, b| {
        b.probability
            .partial_cmp(&a.probability)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut states: Vec<String> = states_set.into_iter().collect();
    states.sort();

    TransitionGraph { edges, states }
}

/// Exponential Weighted Moving Average (EWMA)
///
/// # Arguments
/// * `values` - Time series values
/// * `alpha` - Smoothing factor [0, 1] (lower = more smoothing)
///
/// # Returns
/// EWMA values (same length as input)
pub fn ewma(values: &[f64], alpha: f64) -> Vec<f64> {
    if values.is_empty() {
        return vec![];
    }

    let mut result = Vec::with_capacity(values.len());
    result.push(values[0]);

    for i in 1..values.len() {
        let ema = alpha * values[i] + (1.0 - alpha) * result[i - 1];
        result.push(ema);
    }
    result
}

/// Prefix features for sequence analysis
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct PrefixFeatures {
    /// Length of prefix
    #[wasm_bindgen(getter_with_clone)]
    pub length: usize,

    /// Last item in prefix
    #[wasm_bindgen(getter_with_clone)]
    pub last_item: String,

    /// Number of unique items
    #[wasm_bindgen(getter_with_clone)]
    pub unique_items: usize,

    /// Number of repeated consecutive items
    #[wasm_bindgen(getter_with_clone)]
    pub rework_count: usize,

    /// Normalized entropy of item frequencies [0, 1]
    #[wasm_bindgen(getter_with_clone)]
    pub frequency_entropy: f64,
}

/// Extract features from a sequence prefix
///
/// # Arguments
/// * `prefix` - Sequence prefix to analyze
///
/// # Returns
/// Extracted features
pub fn extract_prefix_features<T: std::hash::Hash + Eq + Clone + std::fmt::Display>(
    prefix: &[T],
) -> PrefixFeatures {
    let length = prefix.len();
    let last_item = prefix.last().map(|s| s.to_string()).unwrap_or_default();

    let mut item_freq: HashMap<String, usize> = HashMap::new();
    for item in prefix {
        *item_freq.entry(item.to_string()).or_insert(0) += 1;
    }
    let unique_items = item_freq.len();

    let rework_count = if length > 1 {
        prefix
            .windows(2)
            .filter(|w| w[0].to_string() == w[1].to_string())
            .count()
    } else {
        0
    };

    let freqs: Vec<f64> = item_freq.values().map(|&c| c as f64).collect();
    let total: f64 = freqs.iter().sum();
    let probs: Vec<f64> = freqs.iter().map(|f| f / total).collect();
    let item_entropy = entropy(&probs);
    let max_ent = if unique_items > 0 {
        (unique_items as f64).ln()
    } else {
        0.0
    };
    let norm_ent = if max_ent > 0.0 { item_entropy / max_ent } else { 0.0 };

    PrefixFeatures {
        length,
        last_item,
        unique_items,
        rework_count,
        frequency_entropy: norm_ent,
    }
}

/// Boundary coverage: probability of normal completion
///
/// # Arguments
/// * `prefix` - Current prefix
/// * `complete_sequences` - Reference completed sequences
///
/// # Returns
/// Probability of normal completion [0, 1]
pub fn boundary_coverage<T: PartialEq>(
    prefix: &[T],
    complete_sequences: &[Vec<T>],
) -> f64 {
    let matching: Vec<&Vec<T>> = complete_sequences
        .iter()
        .filter(|trace| {
            trace.len() >= prefix.len() && &trace[..prefix.len()] == prefix
        })
        .collect();

    if matching.is_empty() {
        return 0.0;
    }

    // Fraction within 2σ of median length
    let lengths: Vec<usize> = matching.iter().map(|t| t.len()).collect();
    let mut sorted_lengths = lengths.clone();
    sorted_lengths.sort();

    let median = sorted_lengths[sorted_lengths.len() / 2];
    let variance: f64 = sorted_lengths
        .iter()
        .map(|&len| ((len as i64 - median as i64).pow(2)) as f64)
        .sum::<f64>()
        / sorted_lengths.len() as f64;
    let sigma = variance.sqrt();
    let threshold = median as f64 + 2.0 * sigma;

    let normal_count = lengths.iter().filter(|&&len| (len as f64) <= threshold).count();
    normal_count as f64 / lengths.len() as f64
}

/// Queue delay estimation (M/M/1 model)
///
/// # Arguments
/// * `arrival_rate` - Arrivals per time unit
/// * `service_rate` - Services per time unit
///
/// # Returns
/// Mean queue delay (INFINITY if unstable)
pub fn estimate_queue_delay(arrival_rate: f64, service_rate: f64) -> f64 {
    if service_rate <= 0.0 || arrival_rate >= service_rate {
        return f64::INFINITY;
    }
    let utilization = arrival_rate / service_rate;
    let mean_service_time = 1.0 / service_rate;
    mean_service_time / (1.0 - utilization)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_predict_top_k() {
        let mut counts: HashMap<Vec<usize>, HashMap<usize, usize>> = HashMap::new();
        let mut next = HashMap::new();
        next.insert(1, 8);
        next.insert(2, 2);
        counts.insert(vec![0], next);

        let vocab = vec!["A".to_string(), "B".to_string(), "C".to_string()];
        let pred = predict_top_k(&counts, &vocab, &[0], 2);

        assert_eq!(pred.items.len(), 2);
        assert!(pred.confidence > 0.7);
    }

    #[test]
    fn test_beam_search() {
        let mut counts: HashMap<Vec<usize>, HashMap<usize, usize>> = HashMap::new();

        // Set up bigram model: prefix [0] can go to 1 or 2
        let mut next0 = HashMap::new();
        next0.insert(1, 5);
        next0.insert(2, 3);
        counts.insert(vec![0], next0);

        // Set up trigram extensions: prefix [0, 1] can go to 3
        let mut next01 = HashMap::new();
        next01.insert(3, 4);
        counts.insert(vec![0, 1], next01);

        // prefix [0, 2] can go to 3
        let mut next02 = HashMap::new();
        next02.insert(3, 2);
        counts.insert(vec![0, 2], next02);

        let vocab = vec!["A".to_string(), "B".to_string(), "C".to_string(), "D".to_string()];
        let paths = beam_search(&counts, &vocab, &[0], 2, 2);

        assert!(!paths.is_empty());
        assert!(paths[0].sequence.len() <= 2);
    }

    #[test]
    fn test_ewma() {
        let values = vec![1.0, 2.0, 3.0, 4.0];
        let ema = ewma(&values, 0.3);

        assert_eq!(ema.len(), 4);
        assert!(ema[3] > ema[0]); // Trend follows data
    }

    #[test]
    fn test_queue_delay() {
        let delay = estimate_queue_delay(0.5, 1.0);
        assert!(delay > 0.0 && delay.is_finite());

        // Unstable system
        let unstable = estimate_queue_delay(1.5, 1.0);
        assert!(unstable == f64::INFINITY);
    }

    #[test]
    fn test_prefix_features() {
        let prefix = vec!["A", "B", "A", "C"];
        let features = extract_prefix_features(&prefix);

        assert_eq!(features.length, 4);
        assert_eq!(features.unique_items, 3);
        assert_eq!(features.last_item, "C");
    }

    #[test]
    fn test_boundary_coverage() {
        let sequences = vec![
            vec![1, 2, 3],
            vec![1, 2, 3, 4],
            vec![1, 2, 3, 4, 5],
        ];

        let coverage = boundary_coverage(&[1, 2], &sequences);
        assert!(coverage > 0.0 && coverage <= 1.0);
    }

    #[test]
    fn test_transition_graph() {
        let sequences = vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B"],
        ];

        let graph = build_transition_graph(&sequences);

        assert!(!graph.edges.is_empty());
        assert!(!graph.states.is_empty());
    }

    #[test]
    fn test_log_likelihood() {
        let mut counts: HashMap<Vec<usize>, HashMap<usize, usize>> = HashMap::new();

        // For ngram_size=1, empty prefix [] can go to 0 or 1
        let mut next = HashMap::new();
        next.insert(0, 5);
        next.insert(1, 10);
        counts.insert(vec![], next);

        let sequence = vec![0, 1];
        // ngram_size=1 means we look at empty prefix for each position
        let ll = sequence_log_likelihood(&counts, &sequence, 1);

        assert!(ll < 0.0); // log of probability < 1
    }

    #[test]
    fn test_empty_sequence() {
        let vocab = vec!["A".to_string()];
        let counts: HashMap<Vec<usize>, HashMap<usize, usize>> = HashMap::new();

        let pred = predict_top_k(&counts, &vocab, &[], 2);
        assert_eq!(pred.items.len(), 0);
    }
}
