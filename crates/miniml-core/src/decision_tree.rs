use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get};
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
struct Node {
    feature: usize,
    threshold: f64,
    left: usize,   // index into nodes vec (0 = none)
    right: usize,
    prediction: f64,
    is_leaf: bool,
}

/// Arena-allocated decision tree (flat Vec storage instead of recursive Box<Node>)
pub struct TreeArena {
    nodes: Vec<TreeNode>,
    root_idx: u32,
}

/// Tree node enum for arena storage (internal use)
#[derive(Clone)]
enum TreeNode {
    Leaf(f64),
    Internal { feature: usize, threshold: f64, left: u32, right: u32 },
}

/// Flat tree node (stored in Vec instead of Box)
pub struct FlatTreeNode {
    pub node_type: u8,  // 0=Leaf, 1=Internal
    pub feature_idx: u32,
    pub threshold: f64,
    pub left_idx: Option<u32>,
    pub right_idx: Option<u32>,
    pub value: Option<f64>,
}

impl TreeArena {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            root_idx: 0,
        }
    }

    pub fn allocate_node(&mut self, node: TreeNode) -> u32 {
        let idx = self.nodes.len() as u32;
        self.nodes.push(node);
        idx
    }

    pub fn set_root(&mut self, idx: u32) {
        self.root_idx = idx;
    }

    /// Predict using arena indices
    pub fn predict_flat(&self, features: &[f64]) -> f64 {
        let mut idx = self.root_idx;
        loop {
            let node = &self.nodes[idx as usize];
            match node {
                TreeNode::Leaf(value) => return *value,
                TreeNode::Internal { feature, threshold, left, right } => {
                    let feature_val = features[*feature];
                    idx = if feature_val <= *threshold { *left } else { *right };
                }
            }
        }
    }
}

#[wasm_bindgen]
pub struct DecisionTreeModel {
    nodes: Vec<Node>,
    n_features: usize,
    depth: usize,
}

#[wasm_bindgen]
impl DecisionTreeModel {
    #[wasm_bindgen(getter)]
    pub fn depth(&self) -> usize { self.depth }

    /// Number of features (public for use by other algorithms like feature importance)
    pub fn n_features_val(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "nNodes")]
    pub fn n_nodes(&self) -> usize { self.nodes.len() }

    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);
        for i in 0..n {
            let mut node_idx = 0;
            loop {
                let node = &self.nodes[node_idx];
                if node.is_leaf {
                    result.push(node.prediction);
                    break;
                }
                let val = data[i * self.n_features + node.feature];
                node_idx = if val <= node.threshold { node.left } else { node.right };
            }
        }
        result
    }

    /// Predict single value without allocation (for ensemble use)
    #[inline]
    pub fn predict_single(&self, features: &[f64]) -> f64 {
        self.predict(features)[0]
    }
}

// Non-WASM methods (for internal Rust use only)
impl DecisionTreeModel {
    /// Convert to arena-allocated tree for better performance
    pub fn to_arena(&self) -> TreeArena {
        let mut arena = TreeArena::new();
        let root_idx = self.node_to_arena(0, &mut arena);
        arena.set_root(root_idx);
        arena
    }

    /// Helper to convert flat node array to arena tree
    fn node_to_arena(&self, node_idx: usize, arena: &mut TreeArena) -> u32 {
        let node = &self.nodes[node_idx];
        if node.is_leaf {
            arena.allocate_node(TreeNode::Leaf(node.prediction))
        } else {
            let left_idx = self.node_to_arena(node.left, arena);
            let right_idx = self.node_to_arena(node.right, arena);
            arena.allocate_node(TreeNode::Internal {
                feature: node.feature,
                threshold: node.threshold,
                left: left_idx,
                right: right_idx,
            })
        }
    }
}

#[wasm_bindgen]
impl DecisionTreeModel {
    /// Return flat tree: [feature, threshold, left, right, prediction, is_leaf] per node
    #[wasm_bindgen(js_name = "getTree")]
    pub fn get_tree(&self) -> Vec<f64> {
        let mut flat = Vec::with_capacity(self.nodes.len() * 6);
        for node in &self.nodes {
            flat.push(node.feature as f64);
            flat.push(node.threshold);
            flat.push(node.left as f64);
            flat.push(node.right as f64);
            flat.push(node.prediction);
            flat.push(if node.is_leaf { 1.0 } else { 0.0 });
        }
        flat
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("DecisionTree(depth={}, nodes={})", self.depth, self.nodes.len())
    }
}

/// Count occurrences of each unique label (no HashMap)
fn label_counts(labels: &[f64]) -> Vec<(u32, usize)> {
    let mut counts: Vec<(u32, usize)> = Vec::new();
    for &l in labels {
        let key = l as u32;
        if let Some(entry) = counts.iter_mut().find(|(k, _)| *k == key) {
            entry.1 += 1;
        } else {
            counts.push((key, 1));
        }
    }
    counts
}

fn majority_class(labels: &[f64]) -> f64 {
    let counts = label_counts(labels);
    let (cls, _) = counts.iter().max_by_key(|(_, v)| v).unwrap();
    *cls as f64
}

fn mean_value(targets: &[f64]) -> f64 {
    targets.iter().sum::<f64>() / targets.len() as f64
}

struct TreeBuilder<'a> {
    data: &'a [f64],
    targets: &'a [f64],
    n_features: usize,
    max_depth: usize,
    min_samples_split: usize,
    is_classifier: bool,
    nodes: Vec<Node>,
    max_depth_reached: usize,
}

impl<'a> TreeBuilder<'a> {
    fn build(&mut self, indices: &[usize], depth: usize) -> usize {
        if depth > self.max_depth_reached { self.max_depth_reached = depth; }

        let targets: Vec<f64> = indices.iter().map(|&i| self.targets[i]).collect();

        // Leaf conditions
        if indices.len() < self.min_samples_split || depth >= self.max_depth || self.is_pure(&targets) {
            let pred = if self.is_classifier { majority_class(&targets) } else { mean_value(&targets) };
            let idx = self.nodes.len();
            self.nodes.push(Node { feature: 0, threshold: 0.0, left: 0, right: 0, prediction: pred, is_leaf: true });
            return idx;
        }

        // Find best split
        let (best_feature, best_threshold, best_score) = self.find_best_split(indices, &targets);

        if best_score < 0.0 {
            let pred = if self.is_classifier { majority_class(&targets) } else { mean_value(&targets) };
            let idx = self.nodes.len();
            self.nodes.push(Node { feature: 0, threshold: 0.0, left: 0, right: 0, prediction: pred, is_leaf: true });
            return idx;
        }

        // Split
        let (left_idx, right_idx): (Vec<usize>, Vec<usize>) = indices.iter()
            .partition(|&&i| mat_get(self.data, self.n_features, i, best_feature) <= best_threshold);

        if left_idx.is_empty() || right_idx.is_empty() {
            let pred = if self.is_classifier { majority_class(&targets) } else { mean_value(&targets) };
            let idx = self.nodes.len();
            self.nodes.push(Node { feature: 0, threshold: 0.0, left: 0, right: 0, prediction: pred, is_leaf: true });
            return idx;
        }

        // Placeholder node
        let node_idx = self.nodes.len();
        self.nodes.push(Node { feature: best_feature, threshold: best_threshold, left: 0, right: 0, prediction: 0.0, is_leaf: false });

        let left = self.build(&left_idx, depth + 1);
        let right = self.build(&right_idx, depth + 1);
        self.nodes[node_idx].left = left;
        self.nodes[node_idx].right = right;

        node_idx
    }

    fn is_pure(&self, targets: &[f64]) -> bool {
        targets.windows(2).all(|w| (w[0] - w[1]).abs() < 1e-10)
    }

    fn find_best_split(&self, indices: &[usize], targets: &[f64]) -> (usize, f64, f64) {
        // Build class-to-index map once
        let unique_classes: Vec<_> = targets.iter().map(|&t| t as u32).collect();
        let class_set: HashSet<_> = unique_classes.iter().collect();
        let class_to_idx: HashMap<_, _> =
            class_set.iter().enumerate().map(|(i, &c)| (c, i)).collect();

        let mut best_feature = 0;
        let mut best_threshold = 0.0;
        let mut best_score = -1.0;
        let n = indices.len();
        let nf = n as f64;

        if self.is_classifier {
            // Build class counts for parent
            let counts = label_counts(targets);
            let parent_gini = {
                let mut g = 1.0;
                for &(_, c) in &counts { let p = c as f64 / nf; g -= p * p; }
                g
            };

            for f in 0..self.n_features {
                // Sort indices by feature value
                let mut sorted: Vec<usize> = (0..n).collect();
                sorted.sort_unstable_by(|&a, &b| {
                    let va = mat_get(self.data, self.n_features, indices[a], f);
                    let vb = mat_get(self.data, self.n_features, indices[b], f);
                    va.partial_cmp(&vb).unwrap()
                });

                // Running left counts, right counts start as parent counts
                let mut left_counts: Vec<(u32, usize)> = counts.iter().map(|&(k, _)| (k, 0)).collect();
                let mut right_counts = counts.clone();
                let mut left_n = 0usize;

                for si in 0..n - 1 {
                    let idx = sorted[si];
                    let label = targets[idx] as u32;

                    // Move sample from right to left
                    // Find the count entry for this label
                    let count_idx = left_counts.iter().position(|&(k, _)| k == label).unwrap();
                    left_counts[count_idx].1 += 1;
                    right_counts[count_idx].1 -= 1;
                    left_n += 1;
                    let right_n = n - left_n;

                    // Skip if same feature value as next
                    let v_cur = mat_get(self.data, self.n_features, indices[sorted[si]], f);
                    let v_next = mat_get(self.data, self.n_features, indices[sorted[si + 1]], f);
                    if (v_cur - v_next).abs() < 1e-12 { continue; }

                    // Compute Gini from counts
                    let left_gini = {
                        let mut g = 1.0;
                        let ln = left_n as f64;
                        for &(_, c) in &left_counts { if c > 0 { let p = c as f64 / ln; g -= p * p; } }
                        g
                    };
                    let right_gini = {
                        let mut g = 1.0;
                        let rn = right_n as f64;
                        for &(_, c) in &right_counts { if c > 0 { let p = c as f64 / rn; g -= p * p; } }
                        g
                    };

                    let weighted = (left_n as f64 / nf) * left_gini + (right_n as f64 / nf) * right_gini;
                    let gain = parent_gini - weighted;

                    if gain > best_score {
                        best_score = gain;
                        best_feature = f;
                        best_threshold = (v_cur + v_next) / 2.0;
                    }
                }
            }
        } else {
            // Regression: use running sums for MSE
            let total_sum: f64 = targets.iter().sum();
            let total_sq: f64 = targets.iter().map(|&t| t * t).sum();
            let parent_mse = total_sq / nf - (total_sum / nf).powi(2);

            for f in 0..self.n_features {
                let mut sorted: Vec<usize> = (0..n).collect();
                sorted.sort_unstable_by(|&a, &b| {
                    let va = mat_get(self.data, self.n_features, indices[a], f);
                    let vb = mat_get(self.data, self.n_features, indices[b], f);
                    va.partial_cmp(&vb).unwrap()
                });

                let mut left_sum = 0.0;
                let mut left_sq = 0.0;

                for si in 0..n - 1 {
                    let t = targets[sorted[si]];
                    left_sum += t;
                    left_sq += t * t;
                    let left_n = (si + 1) as f64;
                    let right_n = (n - si - 1) as f64;

                    let v_cur = mat_get(self.data, self.n_features, indices[sorted[si]], f);
                    let v_next = mat_get(self.data, self.n_features, indices[sorted[si + 1]], f);
                    if (v_cur - v_next).abs() < 1e-12 { continue; }

                    let right_sum = total_sum - left_sum;
                    let right_sq = total_sq - left_sq;
                    let left_mse = left_sq / left_n - (left_sum / left_n).powi(2);
                    let right_mse = right_sq / right_n - (right_sum / right_n).powi(2);

                    let weighted = (left_n / nf) * left_mse + (right_n / nf) * right_mse;
                    let gain = parent_mse - weighted;

                    if gain > best_score {
                        best_score = gain;
                        best_feature = f;
                        best_threshold = (v_cur + v_next) / 2.0;
                    }
                }
            }
        }

        (best_feature, best_threshold, best_score)
    }
}

pub fn decision_tree_impl(data: &[f64], n_features: usize, targets: &[f64], max_depth: usize, min_samples_split: usize, is_classifier: bool) -> Result<DecisionTreeModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if n < 2 {
        return Err(MlError::new("Need at least 2 samples"));
    }

    let indices: Vec<usize> = (0..n).collect();
    let mut builder = TreeBuilder {
        data, targets, n_features, max_depth, min_samples_split, is_classifier,
        nodes: Vec::new(), max_depth_reached: 0,
    };
    builder.build(&indices, 0);

    Ok(DecisionTreeModel {
        nodes: builder.nodes,
        n_features,
        depth: builder.max_depth_reached,
    })
}

#[wasm_bindgen(js_name = "decisionTreeClassify")]
pub fn decision_tree_classify(data: &[f64], n_features: usize, labels: &[f64], max_depth: usize, min_samples_split: usize) -> Result<DecisionTreeModel, JsError> {
    decision_tree_impl(data, n_features, labels, max_depth, min_samples_split, true).map_err(|e| JsError::new(&e.message))
}

#[wasm_bindgen(js_name = "decisionTreeRegress")]
pub fn decision_tree_regress(data: &[f64], n_features: usize, targets: &[f64], max_depth: usize, min_samples_split: usize) -> Result<DecisionTreeModel, JsError> {
    decision_tree_impl(data, n_features, targets, max_depth, min_samples_split, false).map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classification() {
        let data = vec![
            0.0, 0.0,  1.0, 0.0,
            0.0, 1.0,  1.0, 1.0,
        ];
        let labels = vec![0.0, 1.0, 0.0, 1.0]; // class depends on feature 0
        let model = decision_tree_impl(&data, 2, &labels, 10, 2, true).unwrap();
        let preds = model.predict(&data);
        assert_eq!(preds, vec![0.0, 1.0, 0.0, 1.0]);
    }

    #[test]
    fn test_regression() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let model = decision_tree_impl(&data, 1, &targets, 10, 2, false).unwrap();
        let preds = model.predict(&data);
        // Should predict close to actual values
        for (p, t) in preds.iter().zip(targets.iter()) {
            assert!((p - t).abs() < 2.0);
        }
    }

    #[test]
    fn test_max_depth() {
        let data = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let labels = vec![0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0];
        let model = decision_tree_impl(&data, 1, &labels, 1, 2, true).unwrap();
        assert!(model.depth <= 1);
    }
}
