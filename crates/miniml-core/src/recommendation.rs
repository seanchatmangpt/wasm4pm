//! Collaborative filtering recommendation algorithms.
//!
//! Matrix factorization and user-user collaborative filtering.

use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::Rng;

/// Matrix factorization model for collaborative filtering.
#[derive(Debug, Clone)]
pub struct MatrixFactorizationModel {
    pub user_factors: Vec<f64>,
    pub item_factors: Vec<f64>,
    pub global_mean: f64,
    pub n_users: usize,
    pub n_items: usize,
    pub n_factors: usize,
}

pub fn matrix_factorization_impl(
    ratings: &[f64], n_users: usize, n_items: usize, n_factors: usize,
    max_iter: usize, lr: f64, reg: f64, seed: u64,
) -> Result<MatrixFactorizationModel, MlError> {
    if n_users == 0 || n_items == 0 { return Err(MlError::new("n_users and n_items must be > 0")); }
    if n_factors == 0 { return Err(MlError::new("n_factors must be > 0")); }
    if ratings.len() != n_users * n_items { return Err(MlError::new("ratings length must equal n_users * n_items")); }
    let mut rng = Rng::new(seed);
    let init_scale = 0.1;
    let mut user_factors = vec![0.0; n_users * n_factors];
    let mut item_factors = vec![0.0; n_items * n_factors];
    for v in user_factors.iter_mut() { *v = (rng.next_f64() - 0.5) * 2.0 * init_scale; }
    for v in item_factors.iter_mut() { *v = (rng.next_f64() - 0.5) * 2.0 * init_scale; }
    let (sum_ratings, count_ratings): (f64, usize) = ratings.iter().filter(|&&r| r != 0.0).fold((0.0, 0), |(s, c), &r| (s + r, c + 1));
    let global_mean = if count_ratings > 0 { sum_ratings / count_ratings as f64 } else { 0.0 };
    let known_ratings: Vec<(usize, usize, f64)> = (0..n_users).flat_map(|u| (0..n_items).filter_map(move |i| { let r = ratings[u * n_items + i]; if r != 0.0 { Some((u, i, r)) } else { None } })).collect();
    if known_ratings.is_empty() { return Err(MlError::new("ratings must contain at least one non-zero entry")); }
    for _iter in 0..max_iter {
        let mut indices: Vec<usize> = (0..known_ratings.len()).collect();
        for i in 0..indices.len() { let j = rng.next_usize(indices.len()); indices.swap(i, j); }
        for &ri in &indices {
            let (user_idx, item_idx, actual_rating) = known_ratings[ri];
            let u_off = user_idx * n_factors; let i_off = item_idx * n_factors;
            let mut dot = 0.0;
            for k in 0..n_factors { dot += user_factors[u_off + k] * item_factors[i_off + k]; }
            let error = actual_rating - (global_mean + dot);
            for k in 0..n_factors {
                let uf = user_factors[u_off + k]; let i_f = item_factors[i_off + k];
                user_factors[u_off + k] += lr * (error * i_f - reg * uf);
                item_factors[i_off + k] += lr * (error * uf - reg * i_f);
            }
        }
    }
    Ok(MatrixFactorizationModel { user_factors, item_factors, global_mean, n_users, n_items, n_factors })
}

#[wasm_bindgen(js_name = "matrixFactorization")]
pub fn matrix_factorization(ratings: &[f64], n_users: usize, n_items: usize, n_factors: usize, max_iter: usize, lr: f64, reg: f64, seed: u64) -> Result<JsValue, JsValue> {
    let model = matrix_factorization_impl(ratings, n_users, n_items, n_factors, max_iter, lr, reg, seed).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![model.global_mean, model.n_users as f64, model.n_items as f64, model.n_factors as f64];
    out.extend(&model.user_factors); out.extend(&model.item_factors);
    Ok(JsValue::from(out))
}

pub fn matrix_factorization_predict_impl(model: &MatrixFactorizationModel, user_id: usize, item_ids: &[usize]) -> Vec<f64> {
    let mut predictions = Vec::with_capacity(item_ids.len());
    for &item_id in item_ids {
        if user_id >= model.n_users || item_id >= model.n_items { predictions.push(model.global_mean); continue; }
        let mut dot = 0.0;
        let u_off = user_id * model.n_factors; let i_off = item_id * model.n_factors;
        for k in 0..model.n_factors { dot += model.user_factors[u_off + k] * model.item_factors[i_off + k]; }
        predictions.push(model.global_mean + dot);
    }
    predictions
}

#[wasm_bindgen(js_name = "matrixFactorizationPredict")]
pub fn matrix_factorization_predict(model: &[f64], user_id: usize, item_ids: &[f64]) -> Vec<f64> {
    if model.len() < 4 { return vec![]; }
    let global_mean = model[0]; let n_users = model[1] as usize; let n_items = model[2] as usize; let n_factors = model[3] as usize;
    let header_len = 4; let expected = header_len + n_users * n_factors + n_items * n_factors;
    if model.len() < expected { return vec![]; }
    let m = MatrixFactorizationModel { global_mean, n_users, n_items, n_factors, user_factors: model[header_len..header_len + n_users * n_factors].to_vec(), item_factors: model[header_len + n_users * n_factors..expected].to_vec() };
    let item_ids_usize: Vec<usize> = item_ids.iter().map(|&v| v as usize).collect();
    matrix_factorization_predict_impl(&m, user_id, &item_ids_usize)
}

pub fn user_user_collaborative_impl(ratings: &[f64], n_users: usize, n_items: usize, user_id: usize, k_neighbors: usize) -> Vec<f64> {
    if user_id >= n_users || n_users <= 1 { return vec![0.0; n_items]; }
    let target_start = user_id * n_items;
    let target_ratings = &ratings[target_start..target_start + n_items];
    let target_mean = mean_of_nonzero(target_ratings);
    let mut similarities: Vec<(usize, f64)> = Vec::with_capacity(n_users - 1);
    for other in 0..n_users {
        if other == user_id { continue; }
        let other_ratings = &ratings[other * n_items..(other + 1) * n_items];
        let mut dot = 0.0; let mut norm_a = 0.0; let mut norm_b = 0.0;
        for j in 0..n_items { let a = target_ratings[j]; let b = other_ratings[j]; if a > 0.0 && b > 0.0 { dot += a * b; norm_a += a * a; norm_b += b * b; } }
        if norm_a > 0.0 && norm_b > 0.0 && dot > 0.0 { similarities.push((other, dot / (norm_a.sqrt() * norm_b.sqrt()))); }
    }
    similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let neighbors: Vec<(usize, f64)> = similarities.into_iter().take(k_neighbors).collect();
    let mut predictions = vec![0.0; n_items];
    for item in 0..n_items {
        if target_ratings[item] > 0.0 { predictions[item] = target_ratings[item]; continue; }
        let mut sum_sim = 0.0; let mut sum_weighted = 0.0;
        for &(neighbor, sim) in &neighbors {
            let nr = ratings[neighbor * n_items + item];
            if nr <= 0.0 { continue; }
            let nm = mean_of_nonzero(&ratings[neighbor * n_items..(neighbor + 1) * n_items]);
            sum_sim += sim; sum_weighted += sim * (nr - nm);
        }
        predictions[item] = if sum_sim > 0.0 { (target_mean + sum_weighted / sum_sim).max(0.0) } else { target_mean };
    }
    predictions
}

#[wasm_bindgen(js_name = "userUserCollaborative")]
pub fn user_user_collaborative(ratings: &[f64], n_users: usize, n_items: usize, user_id: usize, k_neighbors: usize) -> Vec<f64> {
    user_user_collaborative_impl(ratings, n_users, n_items, user_id, k_neighbors)
}

fn mean_of_nonzero(values: &[f64]) -> f64 {
    let (sum, count) = values.iter().filter(|&&v| v > 0.0).fold((0.0, 0usize), |(s, c), &v| (s + v, c + 1));
    if count > 0 { sum / count as f64 } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_matrix_factorization_simple() {
        let ratings = vec![5.0, 3.0, 4.0, 4.0, 5.0, 2.0, 1.0, 2.0, 5.0];
        let model = matrix_factorization_impl(&ratings, 3, 3, 2, 500, 0.01, 0.1, 42).unwrap();
        assert_eq!(model.n_users, 3); assert_eq!(model.n_items, 3); assert_eq!(model.n_factors, 2);
        let pred = matrix_factorization_predict_impl(&model, 0, &[0, 1, 2]);
        assert!(pred[0] > 0.0); assert!((model.global_mean - 3.444).abs() < 0.01);
    }
    #[test]
    fn test_matrix_factorization_errors() {
        assert!(matrix_factorization_impl(&[], 1, 1, 2, 100, 0.01, 0.1, 42).is_err());
        assert!(matrix_factorization_impl(&[0.0, 0.0, 5.0], 0, 1, 2, 100, 0.01, 0.1, 42).is_err());
        assert!(matrix_factorization_impl(&[0.0, 0.0], 1, 1, 2, 100, 0.01, 0.1, 42).is_err());
    }
    #[test]
    fn test_user_user_collaborative() {
        let ratings = vec![5.0, 3.0, 0.0, 4.0, 0.0, 2.0, 5.0, 3.0, 4.0];
        let predictions = user_user_collaborative_impl(&ratings, 3, 3, 0, 2);
        assert_eq!(predictions.len(), 3);
        assert!((predictions[0] - 5.0).abs() < 1e-10); assert!((predictions[1] - 3.0).abs() < 1e-10);
        assert!(predictions[2] > 0.0);
    }
    #[test]
    fn test_user_user_out_of_bounds() {
        let predictions = user_user_collaborative_impl(&[5.0, 3.0, 4.0], 1, 3, 5, 2);
        assert_eq!(predictions.len(), 3); assert!(predictions.iter().all(|&p| p == 0.0));
    }
    #[test]
    fn test_mean_of_nonzero() { assert_eq!(mean_of_nonzero(&[3.0, 0.0, 5.0]), 4.0); }
}
