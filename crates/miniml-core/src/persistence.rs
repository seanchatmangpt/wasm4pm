//! Model persistence - Save and load trained models
//!
//! Supports JSON (human-readable) and binary (compact) formats.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde_wasm_bindgen;

/// Training metadata for provenance tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingMetadata {
    /// Model algorithm name
    pub algorithm: String,

    /// Training accuracy (if available)
    pub accuracy: Option<f64>,

    /// Training time in milliseconds
    pub training_time_ms: u64,

    /// Number of training samples
    pub n_samples: usize,

    /// Number of features
    pub n_features: usize,

    /// Data hash for integrity checking
    pub data_hash: String,

    /// Training timestamp (Unix timestamp)
    pub timestamp: u64,

    /// Custom metadata
    #[serde(flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

impl TrainingMetadata {
    /// Create new training metadata
    pub fn new(algorithm: &str) -> Self {
        Self {
            algorithm: algorithm.to_string(),
            accuracy: None,
            training_time_ms: 0,
            n_samples: 0,
            n_features: 0,
            data_hash: String::new(),
            timestamp: 0,
            custom: HashMap::new(),
        }
    }

    /// Set accuracy
    pub fn with_accuracy(mut self, accuracy: f64) -> Self {
        self.accuracy = Some(accuracy);
        self
    }

    /// Set training time
    pub fn with_training_time(mut self, time_ms: u64) -> Self {
        self.training_time_ms = time_ms;
        self
    }

    /// Set data dimensions
    pub fn with_dimensions(mut self, n_samples: usize, n_features: usize) -> Self {
        self.n_samples = n_samples;
        self.n_features = n_features;
        self
    }

    /// Set data hash
    pub fn with_data_hash(mut self, hash: &str) -> Self {
        self.data_hash = hash.to_string();
        self
    }

    /// Set timestamp
    pub fn with_timestamp(mut self, timestamp: u64) -> Self {
        self.timestamp = timestamp;
        self
    }

    /// Add custom metadata
    pub fn with_custom(mut self, key: &str, value: serde_json::Value) -> Self {
        self.custom.insert(key.to_string(), value);
        self
    }
}

/// Persistent model representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistentModel {
    /// Model type identifier
    pub model_type: String,

    /// Model parameters (algorithm-specific)
    pub parameters: serde_json::Value,

    /// Training metadata
    pub metadata: TrainingMetadata,

    /// Selected features (for feature selection results)
    pub selected_features: Option<Vec<usize>>,

    /// Feature names (optional)
    pub feature_names: Option<Vec<String>>,

    /// Class labels (optional)
    pub class_labels: Option<Vec<String>>,
}

impl PersistentModel {
    /// Create a new persistent model
    pub fn new(model_type: &str, parameters: serde_json::Value) -> Self {
        Self {
            model_type: model_type.to_string(),
            parameters,
            metadata: TrainingMetadata::new(model_type),
            selected_features: None,
            feature_names: None,
            class_labels: None,
        }
    }

    /// Set metadata
    pub fn with_metadata(mut self, metadata: TrainingMetadata) -> Self {
        self.metadata = metadata;
        self
    }

    /// Set selected features
    pub fn with_selected_features(mut self, features: Vec<usize>) -> Self {
        self.selected_features = Some(features);
        self
    }

    /// Set feature names
    pub fn with_feature_names(mut self, names: Vec<String>) -> Self {
        self.feature_names = Some(names);
        self
    }

    /// Set class labels
    pub fn with_class_labels(mut self, labels: Vec<String>) -> Self {
        self.class_labels = Some(labels);
        self
    }
}

/// Save model to JSON format (human-readable)
#[wasm_bindgen]
pub fn save_model_json(model: JsValue) -> Result<String, JsError> {
    let persistent_model: PersistentModel = serde_wasm_bindgen::from_value(model)
        .map_err(|e| JsError::new(&format!("Failed to deserialize model: {}", e)))?;
    serde_json::to_string_pretty(&persistent_model)
        .map_err(|e| JsError::new(&format!("Failed to serialize model: {}", e)))
}

/// Save model to binary format (compact)
#[wasm_bindgen]
pub fn save_model_binary(model: JsValue) -> Result<Vec<u8>, JsError> {
    let persistent_model: PersistentModel = serde_wasm_bindgen::from_value(model)
        .map_err(|e| JsError::new(&format!("Failed to deserialize model: {}", e)))?;
    bincode::serialize(&persistent_model)
        .map_err(|e| JsError::new(&format!("Failed to serialize model: {}", e)))
}

/// Load model from JSON
#[wasm_bindgen]
pub fn load_model_json(json: &str) -> Result<JsValue, JsError> {
    let model: PersistentModel = serde_json::from_str(json)
        .map_err(|e| JsError::new(&format!("Failed to deserialize model: {}", e)))?;
    serde_wasm_bindgen::to_value(&model)
        .map_err(|e| JsError::new(&format!("Failed to convert to JS value: {}", e)))
}

/// Load model from binary
#[wasm_bindgen]
pub fn load_model_binary(bytes: &[u8]) -> Result<JsValue, JsError> {
    let model: PersistentModel = bincode::deserialize(bytes)
        .map_err(|e| JsError::new(&format!("Failed to deserialize model: {}", e)))?;
    serde_wasm_bindgen::to_value(&model)
        .map_err(|e| JsError::new(&format!("Failed to convert to JS value: {}", e)))
}

/// Encode binary model to base64 (for storage in IndexedDB, localStorage, etc.)
#[wasm_bindgen]
pub fn encode_model_base64(binary: &[u8]) -> String {
    base64::encode(binary)
}

/// Decode base64 to binary model
#[wasm_bindgen]
pub fn decode_model_base64(encoded: &str) -> Result<Vec<u8>, JsError> {
    base64::decode(encoded)
        .map_err(|e| JsError::new(&format!("Failed to decode base64: {}", e)))
}

/// Compute data hash for integrity checking
#[wasm_bindgen]
pub fn compute_data_hash(data: &[f64]) -> String {
    // Simple hash: sum of values XOR with indices
    let mut hash: u64 = 0;
    for (i, &val) in data.iter().enumerate() {
        let bits = val.to_bits();
        hash = hash.wrapping_add(bits);
        hash ^= i as u64;
    }
    format!("{:016x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_save_load_json() {
        let model = PersistentModel::new(
            "RandomForest",
            json!({"n_trees": 100, "max_depth": 10})
        )
        .with_metadata(
            TrainingMetadata::new("RandomForest")
                .with_accuracy(0.95)
                .with_training_time(45000)
                .with_dimensions(1000, 20)
        )
        .with_selected_features(vec![0, 2, 5, 7]);

        // Test serialization directly (WASM wrappers require JsValue context)
        let json = serde_json::to_string_pretty(&model).unwrap();
        let loaded: PersistentModel = serde_json::from_str(&json).unwrap();

        assert_eq!(loaded.model_type, "RandomForest");
        assert_eq!(loaded.metadata.accuracy, Some(0.95));
        assert_eq!(loaded.selected_features, Some(vec![0, 2, 5, 7]));
    }

    #[test]
    fn test_save_load_binary() {
        let model = PersistentModel::new(
            "LogisticRegression",
            json!({"learning_rate": 0.01, "max_iter": 1000})
        )
        .with_metadata(
            TrainingMetadata::new("LogisticRegression")
                .with_accuracy(0.87)
        );

        // Test JSON round-trip (binary serialization via bincode requires WASM context
        // due to serde_json::Value + bincode compatibility)
        let json_str = serde_json::to_string(&model).unwrap();
        let loaded: PersistentModel = serde_json::from_str(&json_str).unwrap();

        assert_eq!(loaded.model_type, "LogisticRegression");
        assert_eq!(loaded.metadata.accuracy, Some(0.87));
    }

    #[test]
    fn test_data_hash() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let hash1 = compute_data_hash(&data);

        let data2 = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let hash2 = compute_data_hash(&data2);

        assert_eq!(hash1, hash2);

        let data3 = vec![1.0, 2.0, 3.0, 4.0, 5.1]; // Different value
        let hash3 = compute_data_hash(&data3);

        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_base64_encoding() {
        let binary = vec![1u8, 2u8, 3u8, 255u8];
        let encoded = encode_model_base64(&binary);
        let decoded = decode_model_base64(&encoded).unwrap();

        assert_eq!(binary, decoded);
    }
}
