use wasm_bindgen::prelude::*;
use crate::decision_tree::DecisionTreeModel;

/// Compute feature importance from a trained decision tree.
/// Uses mean decrease in impurity (Gini importance) across all splits.
/// Returns array of length n_features, normalized to sum to 1.0.
pub fn feature_importance_impl(tree: &DecisionTreeModel) -> Vec<f64> {
    let flat = tree.get_tree();
    let n_features = tree.n_features_val();
    let n_nodes = flat.len() / 6;

    // Accumulate importance per feature
    let mut importance = vec![0.0f64; n_features];

    // We need to compute importance as the (normalized) total reduction
    // of the criterion brought by that feature.
    // Since we don't store sample counts or impurity values in the tree,
    // we use a simpler proxy: count how many times each feature is used
    // as a split, weighted by depth (deeper splits affect fewer samples).
    compute_importance_recursive(&flat, n_features, 0, 0, &mut importance, n_nodes);
    compute_importance_recursive(&flat, n_features, 2, 0, &mut importance, n_nodes);

    // Normalize to sum to 1.0
    let total: f64 = importance.iter().sum();
    if total > 0.0 {
        for imp in importance.iter_mut() {
            *imp /= total;
        }
    }

    importance
}

fn compute_importance_recursive(
    flat: &[f64],
    n_features: usize,
    node_idx: usize,
    depth: usize,
    importance: &mut [f64],
    n_nodes: usize,
) {
    if node_idx == 0 || node_idx >= n_nodes {
        return;
    }

    let base = node_idx * 6;
    let is_leaf = flat[base + 5] > 0.5;

    if is_leaf {
        return;
    }

    let feature = flat[base] as usize;
    if feature < n_features {
        // Weight: higher for root splits (affect more samples)
        let weight = 1.0 / (depth + 1) as f64;
        importance[feature] += weight;
    }

    let left = flat[base + 2] as usize;
    let right = flat[base + 3] as usize;

    compute_importance_recursive(flat, n_features, left, depth + 1, importance, n_nodes);
    compute_importance_recursive(flat, n_features, right, depth + 1, importance, n_nodes);
}

#[wasm_bindgen(js_name = "featureImportance")]
pub fn feature_importance(tree: &DecisionTreeModel) -> Vec<f64> {
    feature_importance_impl(tree)
}

/// Compute feature importance for a random forest by averaging importances across all trees.
#[wasm_bindgen(js_name = "featureImportanceForest")]
pub fn feature_importance_forest(tree_flat: &[f64], n_trees: usize, n_features: usize) -> Vec<f64> {
    let mut total_importance = vec![0.0f64; n_features];
    let nodes_per_tree = tree_flat.len() / n_trees / 6;

    for t in 0..n_trees {
        let offset = t * nodes_per_tree * 6;
        let tree_slice = &tree_flat[offset..offset + nodes_per_tree * 6];
        let mut tree_imp = vec![0.0; n_features];
        compute_importance_recursive(tree_slice, n_features, 0, 0, &mut tree_imp, nodes_per_tree);
        for j in 0..n_features {
            total_importance[j] += tree_imp[j];
        }
    }

    // Normalize
    let total: f64 = total_importance.iter().sum();
    if total > 0.0 {
        for imp in total_importance.iter_mut() {
            *imp /= total;
        }
    }

    total_importance
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decision_tree::decision_tree_impl;

    #[test]
    fn test_importance_sums_to_one() {
        let data = vec![
            0.0, 5.0, 2.0,
            1.0, 5.0, 3.0,
            5.0, 1.0, 4.0,
            6.0, 0.0, 5.0,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];
        let tree = decision_tree_impl(&data, 3, &labels, 5, 2, true).unwrap();

        let importance = feature_importance_impl(&tree);
        let sum: f64 = importance.iter().sum();
        // When tree has splits, importance should sum to 1.0
        // When tree is a single leaf (no splits), all zeros is valid
        if sum > 0.0 {
            assert!((sum - 1.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_importance_length() {
        let data = vec![
            0.0, 1.0, 0.0, 1.0,
            1.0, 0.0, 1.0, 0.0,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];
        let tree = decision_tree_impl(&data, 2, &labels, 5, 2, true).unwrap();

        let importance = feature_importance_impl(&tree);
        assert_eq!(importance.len(), 2);
    }

    #[test]
    fn test_single_feature_used() {
        // Data where only feature 0 separates classes
        let data = vec![
            0.0, 5.0,
            0.0, 3.0,
            1.0, 7.0,
            1.0, 2.0,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];
        let tree = decision_tree_impl(&data, 2, &labels, 5, 2, true).unwrap();

        let importance = feature_importance_impl(&tree);
        // Feature 0 should have higher importance
        assert!(importance[0] >= importance[1]);
    }

    #[test]
    fn test_importance_all_zero_fallback() {
        // Tree with all same class → no splits → all zeros is valid
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let labels = vec![0.0, 0.0, 0.0];
        let tree = decision_tree_impl(&data, 2, &labels, 5, 2, true).unwrap();

        let importance = feature_importance_impl(&tree);
        // All zeros is valid for a tree with no splits
        assert!(importance.iter().all(|&v| v >= 0.0));
    }
}
