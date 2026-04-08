/// Additional prediction algorithms for enhanced process intelligence
///
/// Covers 80/20 value-add features:
/// 1. Top-k next activity with confidence
/// 2. Beam-search future path prediction
/// 3. Prefix/trace likelihood scoring
/// 4. Transition probability graphs
/// 5. Exponential moving average (EWMA) for drift
/// 6. Queue delay estimation
/// 7. Rework/loop detection
/// 8. Prefix feature extraction
/// 9. Boundary coverage (start/end probability)
/// 10. Greedy intervention ranking
use crate::models::{AttributeValue, EventLog};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Shannon entropy of a probability distribution
fn entropy(probs: &[f64]) -> f64 {
    probs
        .iter()
        .filter(|&&p| p > 0.0)
        .map(|&p| -p * p.ln())
        .sum()
}

/// Top-k next activities with confidence scores
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextActivityPrediction {
    pub activities: Vec<String>,
    pub probabilities: Vec<f64>,
    pub confidence: f64, // max probability
    pub entropy: f64,    // distribution uncertainty [0, 1]
}

/// Get top-k next activities from n-gram model
pub fn predict_top_k_activities(
    ngram_counts: &HashMap<Vec<u32>, HashMap<u32, usize>>,
    activity_vocab: &[String],
    prefix: &[u32],
    k: usize,
) -> NextActivityPrediction {
    let mut candidates: Vec<(String, f64)> = Vec::new();

    if let Some(next_acts) = ngram_counts.get(prefix) {
        let total: usize = next_acts.values().sum();
        if total == 0 {
            return NextActivityPrediction {
                activities: vec![],
                probabilities: vec![],
                confidence: 0.0,
                entropy: 0.0,
            };
        }

        for (act_id, count) in next_acts.iter() {
            if let Some(name) = activity_vocab.get(*act_id as usize) {
                let prob = *count as f64 / total as f64;
                candidates.push((name.clone(), prob));
            }
        }
    }

    candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let top_k = std::cmp::min(k, candidates.len());
    let activities: Vec<String> = candidates
        .iter()
        .take(top_k)
        .map(|(a, _)| a.clone())
        .collect();
    let probabilities: Vec<f64> = candidates
        .iter()
        .take(top_k)
        .map(|(_, p)| p)
        .copied()
        .collect();

    let confidence = probabilities.first().copied().unwrap_or(0.0);
    let ent = entropy(&probabilities);
    let max_ent = if probabilities.len() > 0 {
        (probabilities.len() as f64).ln()
    } else {
        0.0
    };
    let entropy_norm = if max_ent > 0.0 { ent / max_ent } else { 0.0 };

    NextActivityPrediction {
        activities,
        probabilities,
        confidence,
        entropy: entropy_norm,
    }
}

/// Beam-search future path (top-k likely future sequences)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamPath {
    pub sequence: Vec<String>,
    pub probability: f64,
    pub length: usize,
}

pub fn beam_search_paths(
    ngram_counts: &HashMap<Vec<u32>, HashMap<u32, usize>>,
    activity_vocab: &[String],
    prefix: &[u32],
    beam_width: usize,
    max_steps: usize,
) -> Vec<BeamPath> {
    let mut beams: Vec<(Vec<u32>, f64)> = vec![(prefix.to_vec(), 1.0)];

    for _ in 0..max_steps {
        let mut next_beams: Vec<(Vec<u32>, f64)> = Vec::new();

        for (current_seq, current_prob) in beams.iter() {
            if let Some(next_acts) = ngram_counts.get(current_seq) {
                let total: usize = next_acts.values().sum();
                if total == 0 {
                    continue;
                }

                for (act_id, count) in next_acts.iter() {
                    let trans_prob = *count as f64 / total as f64;
                    let new_prob = current_prob * trans_prob;
                    let mut new_seq = current_seq.clone();
                    new_seq.push(*act_id);
                    next_beams.push((new_seq, new_prob));
                }
            }
        }

        next_beams.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        beams = next_beams.into_iter().take(beam_width).collect();
    }

    beams
        .iter()
        .map(|(seq, prob)| {
            let activities: Vec<String> = seq
                .iter()
                .skip(prefix.len())
                .filter_map(|id| activity_vocab.get(*id as usize).cloned())
                .collect();
            BeamPath {
                sequence: activities,
                probability: *prob,
                length: seq.len() - prefix.len(),
            }
        })
        .collect()
}

/// Log-likelihood of a trace (sum of log-probabilities of observed transitions)
pub fn trace_log_likelihood(
    ngram_counts: &HashMap<Vec<u32>, HashMap<u32, usize>>,
    trace: &[u32],
    ngram_size: usize,
) -> f64 {
    if trace.len() < ngram_size {
        return 0.0;
    }

    let mut ll = 0.0;
    for i in ngram_size - 1..trace.len() {
        let prefix = &trace[i - ngram_size + 1..i];
        let next_act = trace[i];

        if let Some(next_acts) = ngram_counts.get(&prefix.to_vec()) {
            let total: usize = next_acts.values().sum();
            if total > 0 {
                if let Some(count) = next_acts.get(&next_act) {
                    let prob = *count as f64 / total as f64;
                    ll += prob.ln();
                } else {
                    ll += 1e-9_f64.ln(); // smoothing
                }
            }
        }
    }
    ll
}

/// Transition probability graph (directly-follows with probabilities)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransitionGraph {
    pub edges: Vec<(String, String, f64)>, // (from, to, probability)
    pub activities: Vec<String>,
}

pub fn build_transition_graph(log: &EventLog, activity_key: &str) -> TransitionGraph {
    let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut activity_totals: HashMap<String, usize> = HashMap::new();
    let mut activities_set: std::collections::HashSet<String> = std::collections::HashSet::new();

    for trace in &log.traces {
        let mut prev_act: Option<String> = None;
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                activities_set.insert(act.clone());
                *activity_totals.entry(act.clone()).or_insert(0) += 1;
                if let Some(prev) = prev_act {
                    *edge_counts.entry((prev.clone(), act.clone())).or_insert(0) += 1;
                }
                prev_act = Some(act.clone());
            }
        }
    }

    let mut edges: Vec<(String, String, f64)> = edge_counts
        .into_iter()
        .map(|((from, to), count)| {
            let total = activity_totals.get(&from).copied().unwrap_or(1);
            let prob = count as f64 / total as f64;
            (from, to, prob)
        })
        .collect();
    edges.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut activities: Vec<String> = activities_set.into_iter().collect();
    activities.sort();

    TransitionGraph { edges, activities }
}

/// Exponential moving average for trend detection
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

/// Simple M/M/1 queue delay estimator
pub fn estimate_queue_delay(
    arrival_rate: f64, // events per time unit
    service_rate: f64, // events per time unit
) -> f64 {
    if service_rate <= 0.0 || arrival_rate >= service_rate {
        return f64::INFINITY;
    }
    let utilization = arrival_rate / service_rate;
    let mean_service_time = 1.0 / service_rate;
    // W = mean_service_time / (1 - utilization)
    mean_service_time / (1.0 - utilization)
}

/// Rework score: count of repeated activities per trace
pub fn calculate_rework_score(trace: &[String]) -> usize {
    let mut rework_count = 0;
    for i in 1..trace.len() {
        if trace[i] == trace[i - 1] {
            rework_count += 1;
        }
    }
    rework_count
}

/// Extract numeric features from a trace prefix
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefixFeatures {
    pub length: usize,
    pub last_activity: String,
    pub unique_activities: usize,
    pub rework_count: usize,
    pub activity_frequency_entropy: f64,
}

pub fn extract_prefix_features(prefix: &[String]) -> PrefixFeatures {
    let length = prefix.len();
    let last_activity = prefix.last().cloned().unwrap_or_default();

    let mut activity_freq: HashMap<String, usize> = HashMap::new();
    for act in prefix {
        *activity_freq.entry(act.clone()).or_insert(0) += 1;
    }
    let unique_activities = activity_freq.len();

    let rework_count = calculate_rework_score(prefix);

    let freqs: Vec<f64> = activity_freq.values().map(|&c| c as f64).collect();
    let total: f64 = freqs.iter().sum();
    let probs: Vec<f64> = freqs.iter().map(|f| f / total).collect();
    let activity_frequency_entropy = entropy(&probs);
    let max_ent = if unique_activities > 0 {
        (unique_activities as f64).ln()
    } else {
        0.0
    };
    let norm_ent = if max_ent > 0.0 {
        activity_frequency_entropy / max_ent
    } else {
        0.0
    };

    PrefixFeatures {
        length,
        last_activity,
        unique_activities,
        rework_count,
        activity_frequency_entropy: norm_ent,
    }
}

/// Boundary coverage: probability of reaching a normal end from current state
pub fn boundary_coverage(prefix: &[String], all_complete_traces: &[Vec<String>]) -> f64 {
    let matching_traces: Vec<&Vec<String>> = all_complete_traces
        .iter()
        .filter(|trace| trace.len() >= prefix.len() && &trace[..prefix.len()] == prefix)
        .collect();

    if matching_traces.is_empty() {
        return 0.0;
    }

    // Fraction of completions that were "normal" (heuristic: within 2σ of median length)
    let lengths: Vec<usize> = matching_traces.iter().map(|t| t.len()).collect();
    let sorted_lengths = {
        let mut sorted = lengths.clone();
        sorted.sort();
        sorted
    };

    let median = sorted_lengths[sorted_lengths.len() / 2];
    let variance: f64 = sorted_lengths
        .iter()
        .map(|&len| ((len as i64 - median as i64).pow(2)) as f64)
        .sum::<f64>()
        / sorted_lengths.len() as f64;
    let sigma = variance.sqrt();
    let threshold = median as f64 + 2.0 * sigma;

    let normal_count = lengths
        .iter()
        .filter(|&&len| (len as f64) <= threshold)
        .count();
    normal_count as f64 / lengths.len() as f64
}

/// Greedy intervention selection (UCB-like heuristic without full bandits)
pub fn greedy_intervention_ranking(
    interventions: &[(&str, f64)], // (name, utility_estimate)
    exploitation_weight: f64,      // 0-1: how much to favor highest utility
) -> Vec<String> {
    let mut ranked = interventions
        .iter()
        .enumerate()
        .map(|(i, (name, utility))| {
            let exploration_bonus = (1.0 / (i as f64 + 1.0).sqrt()).min(1.0);
            let score =
                exploitation_weight * utility + (1.0 - exploitation_weight) * exploration_bonus;
            (name.to_string(), score)
        })
        .collect::<Vec<_>>();

    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.into_iter().map(|(name, _)| name).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_top_k_activities() {
        let mut counts: HashMap<Vec<u32>, HashMap<u32, usize>> = HashMap::new();
        let mut next = HashMap::new();
        next.insert(1, 8);
        next.insert(2, 2);
        counts.insert(vec![0], next);

        let vocab = vec!["A", "B", "C"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let pred = predict_top_k_activities(&counts, &vocab, &[0], 2);

        assert_eq!(pred.activities.len(), 2);
        assert!(pred.confidence > 0.7);
    }

    #[test]
    fn test_rework_score() {
        let trace = vec!["A", "B", "A", "B", "B", "C"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let rework = calculate_rework_score(&trace);
        assert_eq!(rework, 1); // only B→B is a repeat
    }

    #[test]
    fn test_ewma() {
        let values = vec![1.0, 2.0, 3.0, 4.0];
        let ema = ewma(&values, 0.3);
        assert_eq!(ema.len(), 4);
        assert!(ema[3] > ema[0]);
    }

    #[test]
    fn test_queue_delay() {
        let delay = estimate_queue_delay(0.5, 1.0);
        assert!(delay > 0.0 && delay.is_finite());
    }

    #[test]
    fn test_prefix_features() {
        let prefix = vec!["A", "B", "A", "C"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let features = extract_prefix_features(&prefix);
        assert_eq!(features.length, 4);
        assert_eq!(features.unique_activities, 3);
        assert_eq!(features.rework_count, 1);
    }
}
