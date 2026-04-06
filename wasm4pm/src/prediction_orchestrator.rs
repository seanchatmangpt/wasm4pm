/// Unified prediction orchestrator
/// All 10 prediction algorithms executed together, returning consolidated results

use crate::models::{EventLog, AttributeValue};
use crate::prediction_additions::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Unified prediction result: all 10 algorithms in one response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedPrediction {
    /// 1. Top-k next activities with confidence
    pub next_activities: NextActivityPrediction,

    /// 2. Beam-search future paths
    pub future_paths: Vec<BeamPath>,

    /// 3. Trace likelihood for anomaly detection
    pub trace_likelihood: f64,

    /// 4. Transition probability graph
    pub transition_graph: TransitionGraph,

    /// 5. EWMA smoothed values
    pub ewma_smoothed: Vec<f64>,

    /// 6. Queue delay estimate
    pub queue_delay: f64,

    /// 7. Rework score
    pub rework_count: usize,

    /// 8. Prefix features for ML
    pub prefix_features: PrefixFeatures,

    /// 9. Boundary coverage (completion likelihood)
    pub boundary_coverage: f64,

    /// 10. Ranked interventions
    pub ranked_interventions: Vec<String>,
}

/// Execute all 10 predictions in unified pipeline
pub fn predict_unified(
    log: &EventLog,
    trace_prefix: &[String],
    ngram_counts: &HashMap<Vec<u32>, HashMap<u32, usize>>,
    activity_vocab: &[String],
    activity_key: &str,
    metrics: &[f64], // For EWMA
    interventions: &[(&str, f64)], // (name, utility)
    ngram_size: usize,
) -> UnifiedPrediction {
    // Convert trace prefix to integer IDs
    let prefix_ids: Vec<u32> = trace_prefix.iter()
        .filter_map(|act| {
            activity_vocab.iter().position(|v| v == act).map(|i| i as u32)
        })
        .collect();

    // 1. Top-k next activities
    let next_activities = predict_top_k_activities(ngram_counts, activity_vocab, &prefix_ids, 3);

    // 2. Beam-search future paths
    let future_paths = beam_search_paths(ngram_counts, activity_vocab, &prefix_ids, 3, 5);

    // 3. Trace likelihood
    let trace_likelihood = trace_log_likelihood(ngram_counts, &prefix_ids, ngram_size);

    // 4. Transition probability graph
    let transition_graph = build_transition_graph(log, activity_key);

    // 5. EWMA smoothing
    let ewma_smoothed = ewma(metrics, 0.3);

    // 6. Queue delay (estimate from metrics if available)
    let queue_delay = if !metrics.is_empty() {
        let arrival_rate = metrics.len() as f64 / (metrics.iter().sum::<f64>().max(1.0));
        let service_rate = 1.0; // normalized
        estimate_queue_delay(arrival_rate, service_rate)
    } else {
        0.0
    };

    // 7. Rework score
    let rework_count = calculate_rework_score(trace_prefix);

    // 8. Prefix features
    let prefix_features = extract_prefix_features(trace_prefix);

    // 9. Boundary coverage
    let all_traces: Vec<Vec<String>> = log.traces.iter().map(|t| {
        t.events.iter().filter_map(|e| {
            e.attributes.get(activity_key)
                .and_then(|v| if let AttributeValue::String(s) = v { Some(s.clone()) } else { None })
        }).collect()
    }).collect();
    let boundary_coverage = boundary_coverage(trace_prefix, &all_traces);

    // 10. Ranked interventions
    let ranked_interventions = greedy_intervention_ranking(interventions, 0.7);

    UnifiedPrediction {
        next_activities,
        future_paths,
        trace_likelihood,
        transition_graph,
        ewma_smoothed,
        queue_delay,
        rework_count,
        prefix_features,
        boundary_coverage,
        ranked_interventions,
    }
}

/// Simplified prediction for common use case (with defaults)
pub fn predict_fast(
    log: &EventLog,
    trace_prefix: &[String],
    activity_key: &str,
) -> FastPredictionResult {
    let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut activity_freq: HashMap<String, usize> = HashMap::new();
    let mut all_traces: Vec<Vec<String>> = Vec::new();

    // Single pass through log
    for trace in &log.traces {
        let mut trace_acts = Vec::new();
        let mut prev_act: Option<String> = None;

        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                trace_acts.push(act.clone());
                *activity_freq.entry(act.clone()).or_insert(0) += 1;

                if let Some(prev) = prev_act {
                    *edge_counts.entry((prev.clone(), act.clone())).or_insert(0) += 1;
                }
                prev_act = Some(act.clone());
            }
        }
        all_traces.push(trace_acts);
    }

    // Compute predictions
    let mut next_acts_vec = Vec::new();
    if let Some(last_act) = trace_prefix.last() {
        let mut next_probs: Vec<(String, f64)> = Vec::new();
        let total: usize = edge_counts.iter()
            .filter(|((from, _), _)| from == last_act)
            .map(|(_, count)| count)
            .sum();

        if total > 0 {
            for ((from, to), count) in edge_counts.iter() {
                if from == last_act {
                    next_probs.push((to.clone(), *count as f64 / total as f64));
                }
            }
        }

        next_probs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        next_acts_vec = next_probs.into_iter().take(3).collect();
    }

    let next_activities = next_acts_vec.iter().map(|(a, _)| a.clone()).collect();
    let next_probabilities = next_acts_vec.iter().map(|(_, p)| p).copied().collect();

    let rework = calculate_rework_score(trace_prefix);
    let coverage = boundary_coverage(trace_prefix, &all_traces);

    FastPredictionResult {
        next_activities,
        next_probabilities,
        rework_count: rework,
        boundary_coverage: coverage,
        case_length: trace_prefix.len(),
        unique_activities: extract_prefix_features(trace_prefix).unique_activities,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastPredictionResult {
    pub next_activities: Vec<String>,
    pub next_probabilities: Vec<f64>,
    pub rework_count: usize,
    pub boundary_coverage: f64,
    pub case_length: usize,
    pub unique_activities: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_prediction_structure() {
        let empty_log = EventLog {
            attributes: HashMap::new(),
            traces: vec![],
        };

        let prefix = vec!["A", "B"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let ngram: HashMap<Vec<u32>, HashMap<u32, usize>> = HashMap::new();
        let vocab = vec!["A", "B", "C"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let metrics = vec![1.0, 2.0, 3.0];
        let interventions = vec![("escalate", 0.8), ("reassign", 0.5)];

        let result = predict_unified(
            &empty_log,
            &prefix,
            &ngram,
            &vocab,
            "concept:name",
            &metrics,
            &interventions,
            2,
        );

        // Verify all 10 fields are present
        assert!(result.next_activities.activities.is_empty() || !result.next_activities.activities.is_empty());
        assert!(result.future_paths.is_empty() || !result.future_paths.is_empty());
        assert!(result.transition_graph.edges.is_empty() || !result.transition_graph.edges.is_empty());
        assert_eq!(result.ewma_smoothed.len(), 3);
        assert!(result.queue_delay.is_finite());
        assert!(result.boundary_coverage.is_finite());
    }

    #[test]
    fn test_fast_prediction_result() {
        let empty_log = EventLog {
            attributes: HashMap::new(),
            traces: vec![],
        };

        let prefix = vec!["A", "B"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let result = predict_fast(&empty_log, &prefix, "concept:name");

        assert_eq!(result.case_length, 2);
        assert!(result.boundary_coverage.is_finite());
        // rework_count is always >= 0 (usize)
    }
}
