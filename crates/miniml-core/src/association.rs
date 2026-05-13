//! Association rule mining via the Apriori algorithm.
//!
//! Discovers frequent itemsets and generates association rules from transactional data.

use wasm_bindgen::prelude::*;
use crate::error::MlError;
use std::collections::{HashMap, HashSet};

// ============================================================
// Structs
// ============================================================

/// A single association rule: antecedent -> consequent with quality metrics.
#[derive(Debug, Clone)]
#[wasm_bindgen]
pub struct AssociationRule {
    /// Item IDs in the antecedent (left-hand side)
    antecedent: Vec<f64>,
    /// Item IDs in the consequent (right-hand side)
    consequent: Vec<f64>,
    /// Support: fraction of transactions containing both antecedent and consequent
    support: f64,
    /// Confidence: P(consequent | antecedent) = support(A∪B) / support(A)
    confidence: f64,
    /// Lift: confidence / support(B). Lift > 1 means positive association.
    lift: f64,
}

#[wasm_bindgen]
impl AssociationRule {
    #[wasm_bindgen(getter)]
    pub fn antecedent(&self) -> Vec<f64> {
        self.antecedent.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn consequent(&self) -> Vec<f64> {
        self.consequent.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn support(&self) -> f64 {
        self.support
    }

    #[wasm_bindgen(getter)]
    pub fn confidence(&self) -> f64 {
        self.confidence
    }

    #[wasm_bindgen(getter)]
    pub fn lift(&self) -> f64 {
        self.lift
    }
}

/// Result of Apriori frequent itemset mining.
#[derive(Debug, Clone)]
#[wasm_bindgen]
pub struct AssociationResult {
    /// Frequent itemsets (each inner Vec is an itemset of item IDs)
    frequent_itemsets: Vec<Vec<f64>>,
    /// Discovered association rules
    rules: Vec<AssociationRule>,
    /// Number of transactions in the input
    n_transactions: usize,
}

#[wasm_bindgen]
impl AssociationResult {
    /// Get frequent itemsets as a JS array of arrays.
    #[wasm_bindgen(getter, js_name = "frequentItemsets")]
    pub fn frequent_itemsets_js(&self) -> js_sys::Array {
        let outer = js_sys::Array::new_with_length(self.frequent_itemsets.len() as u32);
        for (idx, itemset) in self.frequent_itemsets.iter().enumerate() {
            let arr = js_sys::Array::new_with_length(itemset.len() as u32);
            for (i, v) in itemset.iter().enumerate() {
                arr.set(i as u32, JsValue::from_f64(*v));
            }
            outer.set(idx as u32, JsValue::from(arr));
        }
        outer
    }

    /// Get association rules.
    #[wasm_bindgen(getter)]
    pub fn rules(&self) -> Vec<AssociationRule> {
        self.rules.clone()
    }

    #[wasm_bindgen(getter, js_name = "nTransactions")]
    pub fn n_transactions(&self) -> usize {
        self.n_transactions
    }
}

// ============================================================
// Implementation
// ============================================================

/// Run the Apriori algorithm on transactional data.
///
/// # Arguments
/// * `transactions` - Flat array of item IDs (f64), row-major.
/// * `transaction_lengths` - Length of each transaction in the flat array.
/// * `min_support` - Minimum support threshold (0.0 to 1.0)
/// * `min_confidence` - Minimum confidence threshold for rules (0.0 to 1.0)
pub fn apriori_impl(
    transactions: &[f64],
    transaction_lengths: &[usize],
    min_support: f64,
    min_confidence: f64,
) -> Result<AssociationResult, MlError> {
    if transaction_lengths.is_empty() {
        return Err(MlError::new("transaction_lengths must not be empty"));
    }
    if min_support <= 0.0 || min_support > 1.0 {
        return Err(MlError::new("min_support must be in (0, 1]"));
    }
    if min_confidence <= 0.0 || min_confidence > 1.0 {
        return Err(MlError::new("min_confidence must be in (0, 1]"));
    }

    let n_transactions = transaction_lengths.len();
    let expected_len: usize = transaction_lengths.iter().sum();
    if transactions.len() != expected_len {
        return Err(MlError::new("transactions length must equal sum of transaction_lengths"));
    }

    // Parse flat transactions into Vec<Vec<usize>> for internal computation
    let mut txns: Vec<Vec<usize>> = Vec::with_capacity(n_transactions);
    let mut offset = 0usize;
    for &len in transaction_lengths {
        if len == 0 {
            txns.push(vec![]);
            continue;
        }
        let end = offset + len;
        if end > transactions.len() {
            return Err(MlError::new("transaction_lengths exceed transactions array bounds"));
        }
        txns.push(transactions[offset..end].iter().map(|&v| v as usize).collect());
        offset = end;
    }

    let min_count = (min_support * n_transactions as f64).ceil() as usize;

    // Step 1: Count item frequencies (size-1 itemsets)
    let mut item_counts: HashMap<usize, usize> = HashMap::new();
    for txn in &txns {
        for &item in txn {
            *item_counts.entry(item).or_insert(0) += 1;
        }
    }

    // Filter by min_support to get frequent 1-itemsets
    let mut frequent_itemsets: Vec<HashSet<usize>> = Vec::new();
    let mut itemset_supports: Vec<f64> = Vec::new();
    let mut current_frequent: Vec<HashSet<usize>> = Vec::new();

    for (&item, &count) in &item_counts {
        if count >= min_count {
            let mut hs = HashSet::new();
            hs.insert(item);
            current_frequent.push(hs.clone());
            frequent_itemsets.push(hs);
            itemset_supports.push(count as f64 / n_transactions as f64);
        }
    }

    if current_frequent.is_empty() {
        return Ok(AssociationResult {
            frequent_itemsets: vec![],
            rules: vec![],
            n_transactions,
        });
    }

    // Build transaction sets for efficient subset checking
    let txn_sets: Vec<HashSet<usize>> = txns.iter()
        .map(|t| t.iter().copied().collect())
        .collect();

    // Step 2: Iteratively generate larger candidate itemsets (limit to size 3 for WASM performance)
    let max_itemset_size = 3;
    let mut k = 2usize;
    while k <= max_itemset_size {
        let candidates = generate_candidates(&current_frequent, k);

        if candidates.is_empty() {
            break;
        }

        let mut candidate_counts: Vec<usize> = vec![0; candidates.len()];
        for txn_set in &txn_sets {
            for (ci, candidate) in candidates.iter().enumerate() {
                if candidate.is_subset(txn_set) {
                    candidate_counts[ci] += 1;
                }
            }
        }

        let mut next_frequent: Vec<HashSet<usize>> = Vec::new();
        for (ci, candidate) in candidates.iter().enumerate() {
            if candidate_counts[ci] >= min_count {
                next_frequent.push(candidate.clone());
                frequent_itemsets.push(candidate.clone());
                itemset_supports.push(candidate_counts[ci] as f64 / n_transactions as f64);
            }
        }

        if next_frequent.is_empty() {
            break;
        }

        current_frequent = next_frequent;
        k += 1;
    }

    // Step 3: Compute support map for all frequent itemsets
    let mut support_map: HashMap<Vec<usize>, f64> = HashMap::new();
    for (i, itemset) in frequent_itemsets.iter().enumerate() {
        let mut key: Vec<usize> = itemset.iter().copied().collect();
        key.sort();
        support_map.insert(key, itemset_supports[i]);
    }

    // Step 4: Generate association rules from frequent itemsets of size >= 2
    let mut rules: Vec<AssociationRule> = Vec::new();
    for itemset in &frequent_itemsets {
        if itemset.len() < 2 {
            continue;
        }

        let mut items: Vec<usize> = itemset.iter().copied().collect();
        items.sort();
        let itemset_support = support_map.get(&items).copied().unwrap_or(0.0);

        let subsets = all_subsets(&items);
        for antecedent in &subsets {
            if antecedent.is_empty() || antecedent.len() == items.len() {
                continue;
            }

            let mut ante_sorted = antecedent.clone();
            ante_sorted.sort();

            let ante_set: HashSet<usize> = antecedent.iter().copied().collect();
            let itemset_set: HashSet<usize> = items.iter().copied().collect();
            let consequent: Vec<usize> = itemset_set.difference(&ante_set).copied().collect();

            if consequent.is_empty() {
                continue;
            }

            let mut cons_sorted = consequent.clone();
            cons_sorted.sort();

            let ante_support = support_map.get(&ante_sorted).copied().unwrap_or(0.0);
            let cons_support = support_map.get(&cons_sorted).copied().unwrap_or(0.0);

            if ante_support == 0.0 {
                continue;
            }

            let confidence = itemset_support / ante_support;
            let lift = if cons_support > 0.0 {
                confidence / cons_support
            } else {
                0.0
            };

            if confidence >= min_confidence {
                rules.push(AssociationRule {
                    antecedent: ante_sorted.iter().map(|&v| v as f64).collect(),
                    consequent: cons_sorted.iter().map(|&v| v as f64).collect(),
                    support: itemset_support,
                    confidence,
                    lift,
                });
            }
        }
    }

    // Sort rules by confidence descending
    rules.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

    // Convert frequent_itemsets to Vec<Vec<f64>>
    let fi_vecs: Vec<Vec<f64>> = frequent_itemsets.iter()
        .map(|hs| {
            let mut v: Vec<usize> = hs.iter().copied().collect();
            v.sort();
            v.iter().map(|&x| x as f64).collect()
        })
        .collect();

    Ok(AssociationResult {
        frequent_itemsets: fi_vecs,
        rules,
        n_transactions,
    })
}

#[wasm_bindgen(js_name = "apriori")]
pub fn apriori(
    transactions: &[f64],
    transaction_lengths: &[usize],
    min_support: f64,
    min_confidence: f64,
) -> Result<AssociationResult, JsValue> {
    apriori_impl(transactions, transaction_lengths, min_support, min_confidence)
        .map_err(|e| JsValue::from_str(&e.message))
}

// ============================================================
// Helper functions
// ============================================================

fn generate_candidates(frequent: &[HashSet<usize>], k: usize) -> Vec<HashSet<usize>> {
    let mut candidates = Vec::new();
    for i in 0..frequent.len() {
        for j in (i + 1)..frequent.len() {
            let union: HashSet<usize> = frequent[i].union(&frequent[j]).copied().collect();
            if union.len() == k {
                if all_subsets_frequent(&union, frequent, k - 1) {
                    candidates.push(union);
                }
            }
        }
    }
    candidates
}

fn all_subsets_frequent(candidate: &HashSet<usize>, frequent: &[HashSet<usize>], subset_size: usize) -> bool {
    let items: Vec<usize> = candidate.iter().copied().collect();
    let n = items.len();
    if subset_size == 0 || subset_size > n {
        return true;
    }
    let combos = combinations(&items, subset_size);
    for combo in &combos {
        let combo_set: HashSet<usize> = combo.iter().copied().collect();
        if !frequent.contains(&combo_set) {
            return false;
        }
    }
    true
}

fn all_subsets(items: &[usize]) -> Vec<Vec<usize>> {
    let n = items.len();
    let mut subsets = Vec::new();
    let total = 1usize << n;
    for mask in 1..total.saturating_sub(1) {
        let mut subset = Vec::new();
        for i in 0..n {
            if mask & (1 << i) != 0 {
                subset.push(items[i]);
            }
        }
        subsets.push(subset);
    }
    subsets
}

fn combinations(items: &[usize], k: usize) -> Vec<Vec<usize>> {
    let n = items.len();
    if k == 0 {
        return vec![vec![]];
    }
    if k > n {
        return vec![];
    }
    let mut result = Vec::new();
    let mut current = Vec::with_capacity(k);

    fn backtrack(items: &[usize], k: usize, start: usize, current: &mut Vec<usize>, result: &mut Vec<Vec<usize>>) {
        if current.len() == k {
            result.push(current.clone());
            return;
        }
        for i in start..items.len() {
            current.push(items[i]);
            backtrack(items, k, i + 1, current, result);
            current.pop();
        }
    }

    backtrack(items, k, 0, &mut current, &mut result);
    result
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apriori_basic() {
        // 5 transactions: [[1,2,3],[2,3,4],[1,2,4],[1,3,4],[2,3,4]]
        let transactions: Vec<f64> = vec![
            1.0, 2.0, 3.0,
            2.0, 3.0, 4.0,
            1.0, 2.0, 4.0,
            1.0, 3.0, 4.0,
            2.0, 3.0, 4.0,
        ];
        let transaction_lengths = vec![3, 3, 3, 3, 3];

        let result = apriori_impl(&transactions, &transaction_lengths, 0.3, 0.5).unwrap();

        assert_eq!(result.n_transactions, 5);
        assert!(!result.frequent_itemsets.is_empty(), "Should find frequent itemsets");
        assert!(!result.rules.is_empty(), "Should discover at least one association rule");

        for rule in &result.rules {
            assert!(rule.support >= 0.0 && rule.support <= 1.0);
            assert!(rule.confidence >= 0.5, "Confidence should meet min_confidence");
            assert!(!rule.antecedent.is_empty());
            assert!(!rule.consequent.is_empty());
            assert!(rule.lift >= 0.0);
        }
    }

    #[test]
    fn test_apriori_single_item() {
        // 5 transactions: item 1 appears in 4 of them
        let transactions: Vec<f64> = vec![
            1.0, 1.0, 1.0, 2.0, 1.0,
        ];
        let transaction_lengths = vec![1, 1, 1, 1, 1];

        let result = apriori_impl(&transactions, &transaction_lengths, 0.5, 0.5).unwrap();

        assert_eq!(result.n_transactions, 5);
        assert!(result.frequent_itemsets.iter().any(|fi| fi.len() == 1 && fi.contains(&1.0)),
            "Should find item 1 as a frequent 1-itemset");
    }

    #[test]
    fn test_apriori_min_support_filter() {
        // 5 transactions: item 1 appears in 2, item 2 appears in 5
        let transactions: Vec<f64> = vec![
            2.0, 2.0, 1.0, 2.0, 2.0, 1.0, 2.0,
        ];
        let transaction_lengths = vec![1, 1, 2, 1, 2];

        // High min_support = 0.8 -> only item 2 qualifies (5/5 = 1.0)
        let result = apriori_impl(&transactions, &transaction_lengths, 0.8, 0.5).unwrap();

        let singletons: Vec<_> = result.frequent_itemsets.iter()
            .filter(|fi| fi.len() == 1)
            .collect();
        assert_eq!(singletons.len(), 1, "High min_support should filter to only item 2");
        assert!(singletons[0].contains(&2.0));
    }

    #[test]
    fn test_apriori_empty_transactions() {
        let result = apriori_impl(&[], &[], 0.5, 0.5);
        assert!(result.is_err());
    }

    #[test]
    fn test_apriori_invalid_support() {
        let transactions: Vec<f64> = vec![1.0, 2.0];
        let lengths = vec![2];
        assert!(apriori_impl(&transactions, &lengths, 0.0, 0.5).is_err());
        assert!(apriori_impl(&transactions, &lengths, 1.5, 0.5).is_err());
        assert!(apriori_impl(&transactions, &lengths, 0.5, 0.0).is_err());
    }

    #[test]
    fn test_apriori_length_mismatch() {
        let transactions: Vec<f64> = vec![1.0, 2.0];
        let lengths = vec![5];
        assert!(apriori_impl(&transactions, &lengths, 0.5, 0.5).is_err());
    }

    #[test]
    fn test_apriori_rule_metrics() {
        let transactions: Vec<f64> = vec![
            1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 3.0, 2.0, 3.0,
        ];
        let transaction_lengths = vec![2, 2, 2, 2, 2];

        let result = apriori_impl(&transactions, &transaction_lengths, 0.3, 0.5).unwrap();

        for rule in &result.rules {
            assert!(rule.lift >= 0.0);
            assert!(rule.confidence >= 0.5);
        }
    }

    #[test]
    fn test_combinations() {
        let items = vec![0, 1, 2];
        let combos = combinations(&items, 2);
        assert_eq!(combos.len(), 3);
        assert!(combos.contains(&vec![0, 1]));
        assert!(combos.contains(&vec![0, 2]));
        assert!(combos.contains(&vec![1, 2]));
    }

    #[test]
    fn test_all_subsets() {
        let items = vec![0, 1];
        let subsets = all_subsets(&items);
        assert_eq!(subsets.len(), 2);
    }
}
