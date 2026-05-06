//! Graph algorithms for network analysis.
//!
//! PageRank, shortest paths (Dijkstra), and community detection (label propagation).

use wasm_bindgen::prelude::*;
use crate::error::MlError;
use std::collections::HashMap;

/// Result of PageRank computation.
#[derive(Debug, Clone)]
pub struct GraphResult {
    pub scores: Vec<f64>,
    pub iterations: usize,
    pub converged: bool,
}

/// Result of shortest path computation.
#[derive(Debug, Clone)]
pub struct ShortestPathResult {
    pub distances: Vec<f64>,
    pub predecessors: Vec<f64>,
    pub source: usize,
}

/// Result of community detection.
#[derive(Debug, Clone)]
pub struct CommunityResult {
    pub labels: Vec<f64>,
    pub n_communities: usize,
}

pub fn pagerank_impl(adjacency: &[f64], n_nodes: usize, damping: f64, max_iter: usize, tol: f64) -> Result<GraphResult, MlError> {
    if n_nodes == 0 { return Err(MlError::new("n_nodes must be > 0")); }
    if adjacency.len() != n_nodes * n_nodes { return Err(MlError::new("adjacency must have n_nodes^2 elements")); }
    if damping <= 0.0 || damping >= 1.0 { return Err(MlError::new("damping must be in (0, 1)")); }
    if max_iter == 0 { return Err(MlError::new("max_iter must be > 0")); }
    let mut out_degree = vec![0.0; n_nodes];
    let mut is_dangling = vec![true; n_nodes];
    for i in 0..n_nodes {
        let mut deg = 0.0;
        for j in 0..n_nodes { if adjacency[i * n_nodes + j] > 0.0 { deg += adjacency[i * n_nodes + j]; } }
        out_degree[i] = deg; if deg > 0.0 { is_dangling[i] = false; }
    }
    let mut pr = vec![1.0 / n_nodes as f64; n_nodes];
    let mut converged = false;
    let mut iterations = 0;
    for iter in 0..max_iter {
        iterations = iter + 1;
        let dangling_sum: f64 = pr.iter().zip(is_dangling.iter()).filter(|(_, &dang)| dang).map(|(&rank, _)| rank).sum();
        let mut new_pr = vec![0.0; n_nodes];
        for j in 0..n_nodes {
            let mut incoming = 0.0;
            for i in 0..n_nodes { let weight = adjacency[i * n_nodes + j]; if weight > 0.0 && out_degree[i] > 0.0 { incoming += pr[i] * weight / out_degree[i]; } }
            new_pr[j] = (1.0 - damping) / n_nodes as f64 + damping * (incoming + dangling_sum / n_nodes as f64);
        }
        let diff: f64 = pr.iter().zip(new_pr.iter()).map(|(a, b)| (a - b).abs()).sum();
        pr = new_pr;
        if diff < tol { converged = true; break; }
    }
    Ok(GraphResult { scores: pr, iterations, converged })
}

#[wasm_bindgen(js_name = "pageRank")]
pub fn pagerank(adjacency: &[f64], n_nodes: usize, damping: f64, max_iter: usize, tol: f64) -> Result<JsValue, JsValue> {
    let result = pagerank_impl(adjacency, n_nodes, damping, max_iter, tol).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![if result.converged { 1.0 } else { 0.0 }, result.iterations as f64]; out.extend(&result.scores);
    Ok(JsValue::from(out))
}

pub fn shortest_path_impl(adjacency: &[f64], n_nodes: usize, source: usize) -> Result<ShortestPathResult, MlError> {
    if n_nodes == 0 { return Err(MlError::new("n_nodes must be > 0")); }
    if adjacency.len() != n_nodes * n_nodes { return Err(MlError::new("adjacency must have n_nodes^2 elements")); }
    if source >= n_nodes { return Err(MlError::new("source must be < n_nodes")); }
    let mut dist = vec![f64::MAX; n_nodes];
    let mut predecessors = vec![-1.0f64; n_nodes];
    let mut visited = vec![false; n_nodes];
    dist[source] = 0.0;
    for _ in 0..n_nodes {
        let mut min_dist = f64::MAX; let mut u = 0; let mut found = false;
        for i in 0..n_nodes { if !visited[i] && dist[i] < min_dist { min_dist = dist[i]; u = i; found = true; } }
        if !found { break; }
        visited[u] = true;
        for v in 0..n_nodes {
            let weight = adjacency[u * n_nodes + v];
            if weight > 0.0 && !visited[v] { let new_dist = dist[u] + weight; if new_dist < dist[v] { dist[v] = new_dist; predecessors[v] = u as f64; } }
        }
    }
    Ok(ShortestPathResult { distances: dist, predecessors, source })
}

#[wasm_bindgen(js_name = "shortestPath")]
pub fn shortest_path(adjacency: &[f64], n_nodes: usize, source: usize) -> Result<JsValue, JsValue> {
    let result = shortest_path_impl(adjacency, n_nodes, source).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![result.source as f64]; out.extend(&result.distances); out.extend(&result.predecessors);
    Ok(JsValue::from(out))
}

pub fn community_detection_impl(adjacency: &[f64], n_nodes: usize, max_iter: usize) -> Result<CommunityResult, MlError> {
    if n_nodes == 0 { return Err(MlError::new("n_nodes must be > 0")); }
    if adjacency.len() != n_nodes * n_nodes { return Err(MlError::new("adjacency must have n_nodes^2 elements")); }
    if max_iter == 0 { return Err(MlError::new("max_iter must be > 0")); }
    let mut labels: Vec<usize> = (0..n_nodes).collect();
    for _iter in 0..max_iter {
        let mut changed = false;
        for i in 0..n_nodes {
            let mut label_weights: HashMap<usize, f64> = HashMap::new();
            for j in 0..n_nodes { let weight = adjacency[i * n_nodes + j]; if weight > 0.0 { *label_weights.entry(labels[j]).or_insert(0.0) += weight; } }
            if label_weights.is_empty() { continue; }
            let best_label = label_weights.into_iter().max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)).map(|(label, _)| label).unwrap_or(labels[i]);
            if best_label != labels[i] { labels[i] = best_label; changed = true; }
        }
        if !changed { break; }
    }
    let mut unique_labels: Vec<usize> = labels.iter().copied().collect(); unique_labels.sort(); unique_labels.dedup();
    let mut label_map: HashMap<usize, usize> = HashMap::new();
    for (new_label, &old_label) in unique_labels.iter().enumerate() { label_map.insert(old_label, new_label); }
    let normalized: Vec<f64> = labels.iter().map(|&l| *label_map.get(&l).unwrap_or(&0) as f64).collect();
    Ok(CommunityResult { labels: normalized, n_communities: unique_labels.len() })
}

#[wasm_bindgen(js_name = "communityDetection")]
pub fn community_detection(adjacency: &[f64], n_nodes: usize, max_iter: usize) -> Result<JsValue, JsValue> {
    let result = community_detection_impl(adjacency, n_nodes, max_iter).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![result.n_communities as f64]; out.extend(&result.labels);
    Ok(JsValue::from(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_pagerank_simple() {
        let adj = vec![0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0];
        let pr = pagerank_impl(&adj, 3, 0.85, 1000, 1e-10).unwrap();
        for &p in &pr.scores { assert!(p > 0.0); }
        let sum: f64 = pr.scores.iter().sum(); assert!((sum - 1.0).abs() < 0.01);
    }
    #[test]
    fn test_pagerank_dangling() {
        let adj = vec![0.0, 1.0, 0.0, 0.0];
        let pr = pagerank_impl(&adj, 2, 0.85, 1000, 1e-10).unwrap();
        let sum: f64 = pr.scores.iter().sum(); assert!((sum - 1.0).abs() < 0.01);
    }
    #[test]
    fn test_pagerank_errors() {
        assert!(pagerank_impl(&[], 0, 0.85, 100, 1e-6).is_err());
        assert!(pagerank_impl(&[0.0], 1, 0.0, 100, 1e-6).is_err());
    }
    #[test]
    fn test_shortest_path_4nodes() {
        let adj = vec![0.0, 1.0, 4.0, 0.0, 1.0, 0.0, 2.0, 0.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let result = shortest_path_impl(&adj, 4, 0).unwrap();
        assert!((result.distances[0]).abs() < 1e-10);
        assert!((result.distances[1] - 1.0).abs() < 1e-10);
        assert!((result.distances[2] - 3.0).abs() < 1e-10);
        assert_eq!(result.distances[3], f64::MAX);
    }
    #[test]
    fn test_shortest_path_errors() {
        assert!(shortest_path_impl(&[], 0, 0).is_err());
        assert!(shortest_path_impl(&[0.0], 1, 1).is_err());
    }
    #[test]
    fn test_community_detection_two_communities() {
        let adj = vec![
            0.0,1.0,1.0,0.0,0.0,0.0,
            1.0,0.0,1.0,0.0,0.0,0.0,
            1.0,1.0,0.0,0.1,0.0,0.0,
            0.0,0.0,0.1,0.0,1.0,1.0,
            0.0,0.0,0.0,1.0,0.0,1.0,
            0.0,0.0,0.0,1.0,1.0,0.0,
        ];
        let result = community_detection_impl(&adj, 6, 100).unwrap();
        assert_eq!(result.labels.len(), 6);
        assert_eq!(result.labels[0], result.labels[1]); assert_eq!(result.labels[1], result.labels[2]);
        assert_eq!(result.labels[3], result.labels[4]); assert_eq!(result.labels[4], result.labels[5]);
        assert_ne!(result.labels[0], result.labels[3]);
    }
    #[test]
    fn test_community_detection_errors() {
        assert!(community_detection_impl(&[], 0, 100).is_err());
        assert!(community_detection_impl(&[0.0], 1, 0).is_err());
    }
}
