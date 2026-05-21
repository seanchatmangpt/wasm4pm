//! Minimal DataFrame implementation for data manipulation
//!
//! Provides core DataFrame operations: select, filter, group, aggregate, join, sort.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Data type for DataFrame columns
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[wasm_bindgen]
pub enum DataType {
    Numeric,
    Categorical,
    Boolean,
    Temporal,
}

/// Column in a DataFrame
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    /// Column name
    pub name: String,

    /// Column data type
    pub data_type: DataType,

    /// Numeric data (if numeric type)
    pub numeric_data: Vec<f64>,

    /// Categorical data (if categorical type)
    pub categorical_data: Vec<String>,
}

impl Column {
    /// Create a new numeric column
    pub fn numeric(name: &str, data: Vec<f64>) -> Self {
        Self {
            name: name.to_string(),
            data_type: DataType::Numeric,
            numeric_data: data,
            categorical_data: Vec::new(),
        }
    }

    /// Create a new categorical column
    pub fn categorical(name: &str, data: Vec<String>) -> Self {
        Self {
            name: name.to_string(),
            data_type: DataType::Categorical,
            numeric_data: Vec::new(),
            categorical_data: data,
        }
    }

    /// Get length of column
    pub fn len(&self) -> usize {
        match self.data_type {
            DataType::Numeric | DataType::Boolean => self.numeric_data.len(),
            DataType::Categorical | DataType::Temporal => self.categorical_data.len(),
        }
    }

    /// Check if column is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Aggregation function
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggFunction {
    Mean,
    Sum,
    Count,
    Min,
    Max,
    Std,
    Quantile(f64),
}

/// DataFrame structure (column-major)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataFrame {
    /// Column names
    pub columns: Vec<String>,

    /// Column data
    pub data: Vec<Vec<f64>>,

    /// Column types
    pub types: Vec<String>,

    /// Number of rows
    pub n_rows: usize,

    /// Number of columns
    pub n_cols: usize,
}

impl DataFrame {
    /// Create a new DataFrame from 2D array
    pub fn new(data: Vec<Vec<f64>>, columns: Vec<String>) -> Self {
        let n_rows = data.first().map_or(0, |col| col.len());
        let n_cols = data.len();

        Self {
            columns,
            data,
            types: vec!["numeric".to_string(); n_cols],
            n_rows,
            n_cols,
        }
    }

    /// Select specific columns
    pub fn select(&self, cols: &[String]) -> Result<DataFrame, MlError> {
        let mut new_data = Vec::new();
        let mut new_columns = Vec::new();
        let mut new_types = Vec::new();

        for col_name in cols {
            if let Some(idx) = self.columns.iter().position(|c| c == col_name) {
                new_data.push(self.data[idx].clone());
                new_columns.push(self.columns[idx].clone());
                new_types.push(self.types[idx].clone());
            } else {
                return Err(MlError::new(format!("Column not found: {}", col_name)));
            }
        }

        Ok(DataFrame {
            columns: new_columns,
            data: new_data,
            types: new_types,
            n_rows: self.n_rows,
            n_cols: cols.len(),
        })
    }

    /// Filter rows by predicate
    pub fn filter(&self, predicate: impl Fn(usize) -> bool) -> DataFrame {
        let mut new_data = vec![vec![]; self.n_cols];

        for row_idx in 0..self.n_rows {
            if predicate(row_idx) {
                for (new_col, self_col) in new_data.iter_mut().zip(self.data.iter()) {
                    new_col.push(self_col[row_idx]);
                }
            }
        }

        let n_rows = new_data.first().map_or(0, |col| col.len());
        DataFrame {
            columns: self.columns.clone(),
            data: new_data,
            types: self.types.clone(),
            n_rows,
            n_cols: self.n_cols,
        }
    }

    /// Sort by column
    pub fn sort(&self, col_name: &str, ascending: bool) -> Result<DataFrame, MlError> {
        let col_idx = self
            .columns
            .iter()
            .position(|c| c == col_name)
            .ok_or_else(|| MlError::new(format!("Column not found: {}", col_name)))?;

        // Create row indices
        let mut indices: Vec<usize> = (0..self.n_rows).collect();

        // Sort indices by column values
        indices.sort_by(|&a, &b| {
            let val_a = self.data[col_idx][a];
            let val_b = self.data[col_idx][b];
            if ascending {
                val_a.partial_cmp(&val_b).unwrap()
            } else {
                val_b.partial_cmp(&val_a).unwrap()
            }
        });

        // Create sorted data
        let mut new_data = vec![vec![]; self.n_cols];
        for (new_col, self_col) in new_data.iter_mut().zip(self.data.iter()) {
            for &row_idx in &indices {
                new_col.push(self_col[row_idx]);
            }
        }

        Ok(DataFrame {
            columns: self.columns.clone(),
            data: new_data,
            types: self.types.clone(),
            n_rows: self.n_rows,
            n_cols: self.n_cols,
        })
    }

    /// Get summary statistics (describe)
    pub fn describe(&self) -> DataFrame {
        let mut summary_data = Vec::new();
        let _summary_cols = ["count".to_string(),
            "mean".to_string(),
            "std".to_string(),
            "min".to_string(),
            "25%".to_string(),
            "50%".to_string(),
            "75%".to_string(),
            "max".to_string()];

        for col_idx in 0..self.n_cols {
            let col = &self.data[col_idx];
            let n = col.len() as f64;

            if n == 0.0 {
                summary_data.push(vec![0.0; 8]);
                continue;
            }

            let mean: f64 = col.iter().sum::<f64>() / n;
            let variance = col.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n;
            let std = variance.sqrt();

            let mut sorted = col.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

            let q1_idx = (n * 0.25).floor() as usize;
            let q2_idx = (n * 0.50).floor() as usize;
            let q3_idx = (n * 0.75).floor() as usize;

            summary_data.push(vec![
                n,
                mean,
                std,
                sorted.first().copied().unwrap_or(0.0),
                sorted.get(q1_idx).copied().unwrap_or(0.0),
                sorted.get(q2_idx).copied().unwrap_or(0.0),
                sorted.get(q3_idx).copied().unwrap_or(0.0),
                sorted.last().copied().unwrap_or(0.0),
            ]);
        }

        DataFrame {
            columns: self.columns.clone(),
            data: summary_data,
            types: vec!["summary".to_string(); self.n_cols],
            n_rows: self.n_cols,
            n_cols: 8,
        }
    }

    /// Aggregate by function
    pub fn agg(&self, func: AggFunction) -> Vec<f64> {
        self.data
            .iter()
            .map(|col| match func {
                AggFunction::Mean => {
                    if col.is_empty() {
                        0.0
                    } else {
                        col.iter().sum::<f64>() / col.len() as f64
                    }
                }
                AggFunction::Sum => col.iter().sum(),
                AggFunction::Count => col.len() as f64,
                AggFunction::Min => col.iter().fold(f64::INFINITY, |a, &b| a.min(b)),
                AggFunction::Max => col.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b)),
                AggFunction::Std => {
                    if col.is_empty() {
                        0.0
                    } else {
                        let mean = col.iter().sum::<f64>() / col.len() as f64;
                        let variance = col.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / col.len() as f64;
                        variance.sqrt()
                    }
                }
                AggFunction::Quantile(q) => {
                    if col.is_empty() {
                        0.0
                    } else {
                        let mut sorted = col.clone();
                        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                        let idx = (q * sorted.len() as f64).floor() as usize;
                        sorted.get(idx).copied().unwrap_or(0.0)
                    }
                }
            })
            .collect()
    }

    /// Get column values by index
    pub fn get_column(&self, idx: usize) -> Option<Vec<f64>> {
        self.data.get(idx).cloned()
    }

    /// Get row values by index
    pub fn get_row(&self, idx: usize) -> Option<Vec<f64>> {
        if idx >= self.n_rows {
            return None;
        }

        Some(
            self.data
                .iter()
                .map(|col| col.get(idx).copied().unwrap_or(0.0))
                .collect(),
        )
    }
}

/// Grouped DataFrame (for aggregation)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupedDataFrame {
    pub groups: HashMap<String, DataFrame>,
}

impl GroupedDataFrame {
    /// Create grouped DataFrame
    pub fn new(groups: HashMap<String, DataFrame>) -> Self {
        Self { groups }
    }

    /// Aggregate groups
    pub fn agg(&self, func: AggFunction) -> DataFrame {
        let mut result_data = Vec::new();
        let mut result_cols = Vec::new();

        for (group_name, df) in &self.groups {
            result_cols.push(group_name.clone());
            result_data.push(df.agg(func.clone()));
        }

        let n_cols = result_cols.len();
        DataFrame {
            columns: result_cols,
            data: result_data,
            types: vec!["aggregated".to_string(); n_cols],
            n_rows: 1,
            n_cols,
        }
    }
}

/// Join two DataFrames (pure Rust implementation)
pub fn join_dataframes_impl(
    left_df: &DataFrame,
    right_df: &DataFrame,
    on: &str,
    how: &JoinType,
) -> Result<DataFrame, MlError> {
    // Find join column indices
    let left_idx = left_df
        .columns
        .iter()
        .position(|c| c == on)
        .ok_or_else(|| MlError::new(format!("Column not found in left: {}", on)))?;

    let right_idx = right_df
        .columns
        .iter()
        .position(|c| c == on)
        .ok_or_else(|| MlError::new(format!("Column not found in right: {}", on)))?;

    // Collect join keys from right (using u64 bits for HashMap key)
    let mut right_map: HashMap<u64, usize> = HashMap::new();
    for (i, &val) in right_df.data[right_idx].iter().enumerate() {
        right_map.insert(val.to_bits(), i);
    }

    // Also build left_map for Right and Outer joins
    let mut left_map: HashMap<u64, usize> = HashMap::new();
    for (i, &val) in left_df.data[left_idx].iter().enumerate() {
        left_map.insert(val.to_bits(), i);
    }

    let mut new_columns = left_df.columns.clone();
    let mut new_types = left_df.types.clone();

    // Add right columns (excluding join column)
    for (i, col_name) in right_df.columns.iter().enumerate() {
        if i != right_idx {
            new_columns.push(col_name.clone());
            new_types.push(right_df.types[i].clone());
        }
    }

    let n_out_cols = new_columns.len();
    let mut new_data: Vec<Vec<f64>> = vec![Vec::new(); n_out_cols];
    let mut n_rows = 0;

    match how {
        JoinType::Inner => {
            for (left_row, &key) in left_df.data[left_idx].iter().enumerate() {
                if let Some(&right_row) = right_map.get(&key.to_bits()) {
                    for (col_idx, col_data) in left_df.data.iter().enumerate() {
                        new_data[col_idx].push(col_data[left_row]);
                    }
                    let mut data_offset = left_df.n_cols;
                    for (col_idx, col_data) in right_df.data.iter().enumerate() {
                        if col_idx != right_idx {
                            new_data[data_offset].push(col_data[right_row]);
                            data_offset += 1;
                        }
                    }
                    n_rows += 1;
                }
            }
        }
        JoinType::Left => {
            for (left_row, &key) in left_df.data[left_idx].iter().enumerate() {
                for (col_idx, col_data) in left_df.data.iter().enumerate() {
                    new_data[col_idx].push(col_data[left_row]);
                }
                let mut data_offset = left_df.n_cols;
                for (col_idx, col_data) in right_df.data.iter().enumerate() {
                    if col_idx != right_idx {
                        if let Some(&right_row) = right_map.get(&key.to_bits()) {
                            new_data[data_offset].push(col_data[right_row]);
                        } else {
                            new_data[data_offset].push(f64::NAN);
                        }
                        data_offset += 1;
                    }
                }
                n_rows += 1;
            }
        }
        JoinType::Right => {
            // All rows from right, matching rows from left (NaN for non-matches)
            for (right_row, &key) in right_df.data[right_idx].iter().enumerate() {
                // Fill left columns
                for (col_idx, col_data) in left_df.data.iter().enumerate() {
                    if let Some(&left_row) = left_map.get(&key.to_bits()) {
                        new_data[col_idx].push(col_data[left_row]);
                    } else {
                        new_data[col_idx].push(f64::NAN);
                    }
                }
                // Fill right columns (excluding join column)
                let mut data_offset = left_df.n_cols;
                for (col_idx, col_data) in right_df.data.iter().enumerate() {
                    if col_idx != right_idx {
                        new_data[data_offset].push(col_data[right_row]);
                        data_offset += 1;
                    }
                }
                n_rows += 1;
            }
        }
        JoinType::Outer => {
            // All rows from left (with NaN for non-matching right columns)
            for (left_row, &key) in left_df.data[left_idx].iter().enumerate() {
                for (col_idx, col_data) in left_df.data.iter().enumerate() {
                    new_data[col_idx].push(col_data[left_row]);
                }
                let mut data_offset = left_df.n_cols;
                for (col_idx, col_data) in right_df.data.iter().enumerate() {
                    if col_idx != right_idx {
                        if let Some(&right_row) = right_map.get(&key.to_bits()) {
                            new_data[data_offset].push(col_data[right_row]);
                        } else {
                            new_data[data_offset].push(f64::NAN);
                        }
                        data_offset += 1;
                    }
                }
                n_rows += 1;
            }
            // Add right-only rows (no match in left)
            for (right_row, &key) in right_df.data[right_idx].iter().enumerate() {
                if !left_map.contains_key(&key.to_bits()) {
                    // Left columns get NaN
                    for col in new_data.iter_mut().take(left_df.n_cols) {
                        col.push(f64::NAN);
                    }
                    // Right columns get actual values
                    let mut data_offset = left_df.n_cols;
                    for (col_idx, col_data) in right_df.data.iter().enumerate() {
                        if col_idx != right_idx {
                            new_data[data_offset].push(col_data[right_row]);
                            data_offset += 1;
                        }
                    }
                    n_rows += 1;
                }
            }
        }
    }

    Ok(DataFrame {
        columns: new_columns,
        data: new_data,
        types: new_types,
        n_rows,
        n_cols: n_out_cols,
    })
}

/// Join two DataFrames
#[wasm_bindgen]
pub fn join_dataframes(
    left: JsValue,
    right: JsValue,
    on: &str,
    how: JoinType,
) -> Result<JsValue, JsError> {
    let left_df: DataFrame = serde_wasm_bindgen::from_value(left)
        .map_err(|e| JsError::new(&format!("Failed to deserialize left DataFrame: {}", e)))?;
    let right_df: DataFrame = serde_wasm_bindgen::from_value(right)
        .map_err(|e| JsError::new(&format!("Failed to deserialize right DataFrame: {}", e)))?;

    let df = join_dataframes_impl(&left_df, &right_df, on, &how)
        .map_err(|e| JsError::new(&e.message))?;

    serde_wasm_bindgen::to_value(&df)
        .map_err(|e| JsError::new(&format!("Failed to convert DataFrame: {}", e)))
}

/// Join type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum JoinType {
    Inner,
    Left,
    Right,
    Outer,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dataframe_creation() {
        let data = vec![
            vec![1.0, 2.0, 3.0],
            vec![4.0, 5.0, 6.0],
            vec![7.0, 8.0, 9.0],
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);

        assert_eq!(df.n_rows, 3);
        assert_eq!(df.n_cols, 3);
        assert_eq!(df.columns, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_dataframe_select() {
        // DataFrame is column-major: data[col_idx] = values for that column across all rows.
        // data[0] = col "a" = [1,2,3], data[1] = col "b" = [4,5,6], data[2] = col "c" = [7,8,9]
        let data = vec![
            vec![1.0, 2.0, 3.0], // column "a"
            vec![4.0, 5.0, 6.0], // column "b"
            vec![7.0, 8.0, 9.0], // column "c"
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);
        let selected = df.select(&vec!["a".to_string(), "c".to_string()]).unwrap();

        assert_eq!(selected.n_cols, 2);
        assert_eq!(selected.columns, vec!["a", "c"]);
        // selected.data[0] = column "a" values, selected.data[1] = column "c" values
        assert_eq!(selected.data[0], vec![1.0, 2.0, 3.0]);
        assert_eq!(selected.data[1], vec![7.0, 8.0, 9.0]);
    }

    #[test]
    fn test_dataframe_filter() {
        // Column-major: data[col_idx] = all row values for that column.
        // data[0] = col "a" = [1,2,3] (rows 0,1,2)
        let data = vec![
            vec![1.0, 2.0, 3.0], // column "a"
            vec![4.0, 5.0, 6.0], // column "b"
            vec![7.0, 8.0, 9.0], // column "c"
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);
        // Keep rows where row_idx % 2 == 0 → rows 0 and 2
        let filtered = df.filter(|row_idx| row_idx % 2 == 0);

        assert_eq!(filtered.n_rows, 2);
        // filtered.data[0] = col "a" values for rows 0 and 2 = [1.0, 3.0]
        assert_eq!(filtered.data[0], vec![1.0, 3.0]);
    }

    #[test]
    fn test_dataframe_sort() {
        // Column-major: data[0]=col"a"=[3,2,1], data[1]=col"b"=[6,5,4], data[2]=col"c"=[9,8,7]
        // Rows: (3,6,9), (2,5,8), (1,4,7)
        // Sort ascending by "c": row with c=7 < c=8 < c=9 → order: row2, row1, row0
        let data = vec![
            vec![3.0, 2.0, 1.0], // column "a"
            vec![6.0, 5.0, 4.0], // column "b"
            vec![9.0, 8.0, 7.0], // column "c"
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);
        let sorted = df.sort("c", true).unwrap();

        // After sort by "c" ascending: rows reordered as [row2, row1, row0]
        // sorted.data[2] = col "c" sorted = [7.0, 8.0, 9.0]
        assert_eq!(sorted.data[2], vec![7.0, 8.0, 9.0]);
        // sorted.data[0] = col "a" in same row order = [1.0, 2.0, 3.0]
        assert_eq!(sorted.data[0], vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn test_dataframe_describe() {
        // Column-major: data[0]=col"a"=[1,4], data[1]=col"b"=[2,5], data[2]=col"c"=[3,6]
        // 3 columns, each with 2 rows.
        let data = vec![
            vec![1.0, 4.0], // column "a": rows [1, 4]
            vec![2.0, 5.0], // column "b": rows [2, 5]
            vec![3.0, 6.0], // column "c": rows [3, 6]
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);
        let summary = df.describe();

        assert_eq!(summary.n_cols, 8); // 8 summary statistics per column
        assert_eq!(summary.n_rows, 3); // one summary row per original column
        assert_eq!(summary.columns, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_dataframe_agg() {
        // Column-major: data[0]=col"a"=[1,4], data[1]=col"b"=[2,5], data[2]=col"c"=[3,6]
        let data = vec![
            vec![1.0, 4.0], // column "a": mean = 2.5
            vec![2.0, 5.0], // column "b": mean = 3.5
            vec![3.0, 6.0], // column "c": mean = 4.5
        ];
        let columns = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let df = DataFrame::new(data, columns);
        let means = df.agg(AggFunction::Mean);

        assert_eq!(means, vec![2.5, 3.5, 4.5]);
    }

    // Helper: create a simple 2-column DataFrame with an "id" join key
    fn make_join_df(ids: Vec<f64>, vals: Vec<f64>, val_col: &str) -> DataFrame {
        DataFrame {
            columns: vec!["id".to_string(), val_col.to_string()],
            data: vec![ids, vals],
            types: vec!["numeric".to_string(), "numeric".to_string()],
            n_rows: 0, // will be set correctly below
            n_cols: 2,
        }
    }

    #[test]
    fn test_join_right() {
        // Left: id=[1,2], a=[10,20]   Right: id=[2,3], b=[200,300]
        // Right join should return 2 rows: (2,20,200) and (NaN,NaN,300)
        let left = DataFrame {
            columns: vec!["id".to_string(), "a".to_string()],
            data: vec![vec![1.0, 2.0], vec![10.0, 20.0]],
            types: vec!["numeric".to_string(); 2],
            n_rows: 2,
            n_cols: 2,
        };
        let right = DataFrame {
            columns: vec!["id".to_string(), "b".to_string()],
            data: vec![vec![2.0, 3.0], vec![200.0, 300.0]],
            types: vec!["numeric".to_string(); 2],
            n_rows: 2,
            n_cols: 2,
        };

        let result = join_dataframes_impl(&left, &right, "id", &JoinType::Right).unwrap();

        // Should have 2 rows (one per right row)
        assert_eq!(result.n_rows, 2);
        // Row 0: right key=2.0, left a=20.0, right b=200.0
        assert_eq!(result.data[1][0], 20.0); // left "a" column
        assert_eq!(result.data[2][0], 200.0); // right "b" column
        // Row 1: right key=3.0, no match in left → NaN
        assert!(result.data[0][1].is_nan()); // left "id" is NaN
        assert_eq!(result.data[2][1], 300.0); // right "b" still has value
    }

    #[test]
    fn test_join_outer() {
        // Left: id=[1,2], a=[10,20]   Right: id=[2,3], b=[200,300]
        // Outer join: rows for id=1 (left only), id=2 (both), id=3 (right only)
        let left = DataFrame {
            columns: vec!["id".to_string(), "a".to_string()],
            data: vec![vec![1.0, 2.0], vec![10.0, 20.0]],
            types: vec!["numeric".to_string(); 2],
            n_rows: 2,
            n_cols: 2,
        };
        let right = DataFrame {
            columns: vec!["id".to_string(), "b".to_string()],
            data: vec![vec![2.0, 3.0], vec![200.0, 300.0]],
            types: vec!["numeric".to_string(); 2],
            n_rows: 2,
            n_cols: 2,
        };

        let result = join_dataframes_impl(&left, &right, "id", &JoinType::Outer).unwrap();

        // Should have 3 rows: 2 from left scan + 1 right-only
        assert_eq!(result.n_rows, 3);

        // "b" column: id=1 → NaN, id=2 → 200, right-only id=3 → 300
        let b_col = &result.data[2];
        assert!(b_col[0].is_nan()); // id=1 has no right match
        assert_eq!(b_col[1], 200.0); // id=2 matches
        assert_eq!(b_col[2], 300.0); // id=3 is right-only
    }
}
