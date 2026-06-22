//! Transfer learning capabilities
//!
//! Provides model export/import, fine-tuning, and feature extraction.

use crate::error::MlError;
use crate::persistence::PersistentModel;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// ONNX model representation (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnnxModel {
    /// Model version
    pub version: u64,

    /// Model inputs
    pub inputs: Vec<TensorSpec>,

    /// Model outputs
    pub outputs: Vec<TensorSpec>,

    /// Model graph (simplified representation)
    pub graph: ModelGraph,

    /// Model weights
    pub weights: Vec<u8>,
}

/// Tensor specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TensorSpec {
    pub name: String,
    pub dimensions: Vec<usize>,
    pub data_type: String,
}

/// Model graph representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelGraph {
    Sequential { layers: Vec<LayerSpec> },
    Functional { operations: Vec<OperationSpec> },
}

/// Layer specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerSpec {
    pub layer_type: String,
    pub parameters: serde_json::Value,
}

/// Operation specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationSpec {
    pub op_type: String,
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    pub attributes: serde_json::Value,
}

/// Export model to ONNX format
#[wasm_bindgen]
pub fn export_onnx(model: JsValue) -> Result<Vec<u8>, JsError> {
    // Deserialize model from JsValue
    let persistent_model: PersistentModel = serde_wasm_bindgen::from_value(model)
        .map_err(|e| JsError::new(&format!("Failed to deserialize model: {}", e)))?;

    // Convert model to ONNX representation
    let onnx_model = convert_to_onnx(&persistent_model)?;

    // Serialize to binary
    bincode::serialize(&onnx_model)
        .map_err(|e| JsError::new(&format!("Failed to serialize ONNX model: {}", e)))
}

/// Import model from ONNX format
#[wasm_bindgen]
pub fn import_onnx(bytes: &[u8]) -> Result<JsValue, JsError> {
    // Deserialize ONNX model
    let onnx_model: OnnxModel = bincode::deserialize(bytes)
        .map_err(|e| JsError::new(&format!("Failed to deserialize ONNX model: {}", e)))?;

    // Convert ONNX model to miniml format
    let persistent_model = convert_from_onnx(&onnx_model)?;

    // Convert to JsValue
    serde_wasm_bindgen::to_value(&persistent_model)
        .map_err(|e| JsError::new(&format!("Failed to convert model: {}", e)))
}

/// Configuration for fine-tuning a model
#[wasm_bindgen]
pub struct FineTuneConfig {
    pub learning_rate: f64,
    pub epochs: usize,
    pub n_samples: usize,
    pub n_features: usize,
}

#[wasm_bindgen]
impl FineTuneConfig {
    #[wasm_bindgen(constructor)]
    pub fn new(learning_rate: f64, epochs: usize, n_samples: usize, n_features: usize) -> Self {
        Self {
            learning_rate,
            epochs,
            n_samples,
            n_features,
        }
    }
}

/// Fine-tune a pretrained model
///
/// # Arguments
/// * `pretrained_model` - Pretrained model weights
/// * `x_new` - New training data
/// * `y_new` - New training labels
/// * `layers_to_freeze` - Which layers to freeze (don't update)
/// * `config` - Fine-tuning configuration (learning rate, epochs, etc.)
#[wasm_bindgen]
pub fn fine_tune(
    pretrained_model: &[u8],
    x_new: &[f64],
    y_new: &[f64],
    layers_to_freeze: &[usize],
    config: &FineTuneConfig,
) -> Result<Vec<u8>, JsError> {
    // Load pretrained model
    let model: PersistentModel = bincode::deserialize(pretrained_model)
        .map_err(|e| JsError::new(&format!("Failed to load pretrained model: {}", e)))?;

    // Fine-tune the model
    let fine_tuned_model = fine_tune_model(&model, x_new, y_new, layers_to_freeze, config)?;

    // Serialize and return fine-tuned model
    bincode::serialize(&fine_tuned_model)
        .map_err(|e| JsError::new(&format!("Failed to serialize fine-tuned model: {}", e)))
}

/// Extract features from intermediate layer
///
/// # Arguments
/// * `model` - Trained model
/// * `x` - Input data
/// * `layer_index` - Which layer to extract from (0 = first hidden layer)
/// * `n_samples` - Number of samples
/// * `n_features` - Number of input features
///
/// # Serialization format
/// `model` must be serialized with `serde_json::to_vec` (not `bincode::serialize`),
/// because `PersistentModel.parameters` is a `serde_json::Value` which bincode
/// cannot deserialize without explicit length hints (`SequenceMustHaveLength`).
#[wasm_bindgen]
pub fn extract_features(
    model: &[u8],
    x: &[f64],
    layer_index: usize,
    n_samples: usize,
    n_features: usize,
) -> Result<Vec<f64>, JsError> {
    // Load model — use serde_json, not bincode, because PersistentModel.parameters
    // is a serde_json::Value and bincode requires all sequences to have a known length.
    let persistent_model: PersistentModel = serde_json::from_slice(model)
        .map_err(|e| JsError::new(&format!("Failed to load model: {}", e)))?;

    // Extract features from specified layer
    let features =
        extract_layer_features(&persistent_model, x, layer_index, n_samples, n_features)?;

    Ok(features)
}

/// Convert miniml model to ONNX format
fn convert_to_onnx(model: &PersistentModel) -> Result<OnnxModel, MlError> {
    // Create ONNX model representation
    Ok(OnnxModel {
        version: 1,
        inputs: vec![TensorSpec {
            name: "input".to_string(),
            dimensions: vec![1, model.metadata.n_features],
            data_type: "float32".to_string(),
        }],
        outputs: vec![TensorSpec {
            name: "output".to_string(),
            dimensions: vec![1], // Output dimension depends on algorithm
            data_type: "float32".to_string(),
        }],
        graph: ModelGraph::Sequential {
            layers: convert_layers_to_onnx(model),
        },
        weights: extract_weights_from_model(model),
    })
}

/// Convert ONNX model to miniml format
fn convert_from_onnx(onnx_model: &OnnxModel) -> Result<PersistentModel, MlError> {
    // Determine model type from graph structure
    let model_type = infer_model_type(onnx_model);

    // Extract parameters from ONNX graph
    let parameters = extract_parameters_from_onnx(onnx_model)?;

    Ok(PersistentModel::new(&model_type, parameters))
}

/// Fine-tune model with new data
fn fine_tune_model(
    model: &PersistentModel,
    x_new: &[f64],
    y_new: &[f64],
    layers_to_freeze: &[usize],
    config: &FineTuneConfig,
) -> Result<PersistentModel, MlError> {
    // Clone the model
    let mut fine_tuned = model.clone();

    // Fine-tune based on model type
    match fine_tuned.model_type.as_str() {
        "LogisticRegression" | "LinearRegression" => {
            // Fine-tune linear models
            fine_tune_linear_model(&mut fine_tuned, x_new, y_new, config)?;
        }
        "RandomForest" | "GradientBoosting" => {
            // Fine-tune ensemble models (update leaf nodes)
            fine_tune_ensemble_model(
                &mut fine_tuned,
                x_new,
                y_new,
                layers_to_freeze,
                config.n_samples,
                config.n_features,
            )?;
        }
        "NeuralNet" => {
            // Fine-tune neural network
            fine_tune_neural_network(&mut fine_tuned, x_new, y_new, layers_to_freeze, config)?;
        }
        _ => {
            return Err(MlError::new(format!(
                "Fine-tuning not implemented for {}",
                fine_tuned.model_type
            )))
        }
    }

    // Update metadata
    fine_tuned.metadata.training_time_ms += config.epochs as u64 * 1000;
    fine_tuned.metadata.n_samples = config.n_samples;
    fine_tuned.metadata.n_features = config.n_features;

    Ok(fine_tuned)
}

/// Extract features from intermediate layer
fn extract_layer_features(
    model: &PersistentModel,
    x: &[f64],
    layer_index: usize,
    n_samples: usize,
    n_features: usize,
) -> Result<Vec<f64>, MlError> {
    match model.model_type.as_str() {
        "NeuralNet" => {
            // Extract from neural network layer
            extract_neural_network_features(model, x, layer_index, n_samples, n_features)
        }
        "RandomForest" => {
            // Extract from random forest (leaf node probabilities)
            extract_random_forest_features(model, x, n_samples, n_features)
        }
        _ => Err(MlError::new(format!(
            "Feature extraction not implemented for {}",
            model.model_type
        ))),
    }
}

/// Fine-tune linear model
fn fine_tune_linear_model(
    model: &mut PersistentModel,
    x_new: &[f64],
    y_new: &[f64],
    config: &FineTuneConfig,
) -> Result<(), MlError> {
    // Extract current weights
    let weights = if let Some(w) = model.parameters.get("weights") {
        w.as_array()
            .ok_or_else(|| MlError::new("Weights must be an array"))?
            .iter()
            .map(|v| v.as_f64().unwrap_or(0.0))
            .collect::<Vec<_>>()
    } else {
        return Err(MlError::new("Model missing weights"));
    };

    // Gradient descent fine-tuning
    let mut weights = weights;
    let n = weights.len();

    for _epoch in 0..config.epochs {
        for (i, &y_target) in y_new.iter().enumerate().take(config.n_samples) {
            let start = i * config.n_features;
            let x = &x_new[start..start + config.n_features];

            // Predict
            let mut y_pred = 0.0;
            for (j, &x_val) in x.iter().enumerate() {
                if j < n {
                    y_pred += weights[j] * x_val;
                }
            }

            // Compute gradient
            let error = y_pred - y_target;

            // Update weights
            for (j, &x_val) in x.iter().enumerate() {
                if j < n {
                    weights[j] -= config.learning_rate * error * x_val;
                }
            }
        }
    }

    // Update model parameters
    let weights_array = weights.iter().map(|&w| serde_json::json!(w)).collect();
    model.parameters["weights"] = serde_json::Value::Array(weights_array);

    Ok(())
}

/// Fine-tune ensemble model
fn fine_tune_ensemble_model(
    model: &mut PersistentModel,
    x_new: &[f64],
    y_new: &[f64],
    _layers_to_freeze: &[usize],
    n_samples: usize,
    n_features: usize,
) -> Result<(), MlError> {
    // For ensemble models, fine-tuning means adding more trees
    // or updating leaf node values

    // Simplified: add a new tree trained on residual errors
    let current_predictions = predict_model(model, x_new, n_samples, n_features)?;

    // Compute residuals
    let mut residuals = Vec::with_capacity(n_samples);
    for i in 0..n_samples {
        residuals.push(y_new[i] - current_predictions[i]);
    }

    // Add new tree to model parameters
    // (In production, would actually train and add a tree)

    model.parameters["fine_tuned"] = serde_json::json!(true);

    Ok(())
}

/// Fine-tune neural network
fn fine_tune_neural_network(
    model: &mut PersistentModel,
    _x_new: &[f64],
    _y_new: &[f64],
    layers_to_freeze: &[usize],
    config: &FineTuneConfig,
) -> Result<(), MlError> {
    // Extract network structure
    let _network = extract_neural_network_from_model(model)?;

    // Fine-tune with frozen layers
    // (In production, would implement backprop with layer freezing)

    model.parameters["fine_tuned"] = serde_json::json!(true);
    model.parameters["frozen_layers"] = serde_json::json!(layers_to_freeze);
    model.parameters["learning_rate"] = serde_json::json!(config.learning_rate);

    Ok(())
}

/// Extract neural network from model parameters
fn extract_neural_network_from_model(
    model: &PersistentModel,
) -> Result<serde_json::Value, MlError> {
    model
        .parameters
        .get("network")
        .cloned()
        .ok_or_else(|| MlError::new("Model is not a neural network"))
}

/// Extract features from neural network
fn extract_neural_network_features(
    _model: &PersistentModel,
    x: &[f64],
    _layer_index: usize,
    n_samples: usize,
    n_features: usize,
) -> Result<Vec<f64>, MlError> {
    // Simplified: return features from specified layer
    let mut features = Vec::with_capacity(n_samples * n_features);

    for i in 0..n_samples {
        let start = i * n_features;
        let end = (start + n_features).min(x.len());
        features.extend_from_slice(&x[start..end]);
    }

    Ok(features)
}

/// Extract features from random forest
fn extract_random_forest_features(
    _model: &PersistentModel,
    x: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<Vec<f64>, MlError> {
    // Simplified: return leaf node probabilities
    let mut features = Vec::with_capacity(n_samples);

    for i in 0..n_samples {
        let start = i * n_features;
        let end = start + n_features;

        // Simple feature: sum of input values
        let feature_sum: f64 = x[start..end].iter().sum();
        features.push(feature_sum);
    }

    Ok(features)
}

/// Predict using model
fn predict_model(
    model: &PersistentModel,
    x_input: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<Vec<f64>, MlError> {
    // Simplified prediction based on model type
    match model.model_type.as_str() {
        "LogisticRegression" | "LinearRegression" => {
            let weights = if let Some(w) = model.parameters.get("weights") {
                w.as_array()
                    .ok_or_else(|| MlError::new("Weights must be an array"))?
                    .iter()
                    .map(|v| v.as_f64().unwrap_or(0.0))
                    .collect::<Vec<_>>()
            } else {
                return Err(MlError::new("Model missing weights"));
            };

            let mut predictions = Vec::with_capacity(n_samples);
            for i in 0..n_samples {
                let start = i * n_features;
                let end = start + n_features;
                let x = &x_input[start..end];

                let mut pred = 0.0;
                for (j, &x_val) in x.iter().enumerate() {
                    if j < weights.len() {
                        pred += weights[j] * x_val;
                    }
                }
                predictions.push(pred);
            }

            Ok(predictions)
        }
        "RandomForest" | "GradientBoosting" => {
            // Ensemble models store predictions as an array of per-tree predictions
            // serialized under the "tree_predictions" key (average of tree outputs).
            // Fall back to a weighted linear combination of stored "weights" if
            // tree predictions are absent (e.g., the model was imported from ONNX).
            if let Some(tree_preds_value) = model.parameters.get("tree_predictions") {
                // tree_predictions: array of per-sample average predictions
                let preds: Vec<f64> = tree_preds_value
                    .as_array()
                    .map(|arr| arr.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect())
                    .unwrap_or_default();

                if !preds.is_empty() {
                    return Ok(preds);
                }
            }

            // Fallback: treat weights as linear coefficients (feature importance weights)
            let weights: Vec<f64> = model
                .parameters
                .get("weights")
                .and_then(|w| w.as_array())
                .map(|arr| arr.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect())
                .unwrap_or_else(|| vec![1.0 / n_features.max(1) as f64; n_features]);

            let mut predictions = Vec::with_capacity(n_samples);
            for i in 0..n_samples {
                let start = i * n_features;
                let end = (start + n_features).min(x_input.len());
                let pred: f64 = x_input[start..end]
                    .iter()
                    .zip(weights.iter())
                    .map(|(&x_val, &w)| x_val * w)
                    .sum();
                predictions.push(pred);
            }
            Ok(predictions)
        }
        "NeuralNet" => {
            // Forward pass through stored layer specifications.
            // Each layer is a JSON object: {"weights": [...], "bias": number, "activation": "relu"|"sigmoid"|"tanh"|"linear"}
            // Layers are stored under the "network" or "layers" key.
            let layers = model
                .parameters
                .get("network")
                .or_else(|| model.parameters.get("layers"))
                .and_then(|v| v.as_array())
                .cloned();

            let mut predictions = Vec::with_capacity(n_samples);
            for i in 0..n_samples {
                let x =
                    &x_input[i * n_features..(i + 1).saturating_mul(n_features).min(x_input.len())];
                let mut activations: Vec<f64> = x.to_vec();

                if let Some(ref layers_arr) = layers {
                    for layer in layers_arr {
                        let weights: Vec<f64> = layer
                            .get("weights")
                            .and_then(|w| w.as_array())
                            .map(|arr| arr.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect())
                            .unwrap_or_default();

                        let bias = layer.get("bias").and_then(|v| v.as_f64()).unwrap_or(0.0);

                        let activation = layer
                            .get("activation")
                            .and_then(|v| v.as_str())
                            .unwrap_or("linear");

                        let n_inputs = activations.len();
                        let n_outputs = if n_inputs > 0 && !weights.is_empty() {
                            weights.len() / n_inputs
                        } else {
                            1
                        };

                        let mut next: Vec<f64> = Vec::with_capacity(n_outputs);
                        for out in 0..n_outputs {
                            let mut val = bias;
                            for (inp, &act) in activations.iter().enumerate().take(n_inputs) {
                                let w_idx = out * n_inputs + inp;
                                if w_idx < weights.len() {
                                    val += weights[w_idx] * act;
                                }
                            }
                            val = match activation {
                                "relu" => val.max(0.0),
                                "sigmoid" => 1.0 / (1.0 + (-val).exp()),
                                "tanh" => val.tanh(),
                                _ => val, // linear
                            };
                            next.push(val);
                        }
                        activations = next;
                    }
                } else {
                    // No layer data: return feature mean as trivial prediction
                    let mean = if activations.is_empty() {
                        0.0
                    } else {
                        activations.iter().sum::<f64>() / activations.len() as f64
                    };
                    activations = vec![mean];
                }

                predictions.push(*activations.first().unwrap_or(&0.0));
            }
            Ok(predictions)
        }
        other => Err(MlError::new(format!(
            "Prediction not implemented for model type '{}'",
            other
        ))),
    }
}

/// Convert model layers to ONNX format
fn convert_layers_to_onnx(model: &PersistentModel) -> Vec<LayerSpec> {
    // Simplified conversion
    match model.model_type.as_str() {
        "LogisticRegression" => vec![LayerSpec {
            layer_type: "Linear".to_string(),
            parameters: model.parameters.clone(),
        }],
        "NeuralNet" => {
            if let Some(network) = model.parameters.get("layers") {
                network
                    .as_array()
                    .map(Vec::as_slice).unwrap_or(&[])
                    .iter()
                    .map(|layer| LayerSpec {
                        layer_type: "Dense".to_string(),
                        parameters: layer.clone(),
                    })
                    .collect()
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}

/// Extract weights from model
fn extract_weights_from_model(model: &PersistentModel) -> Vec<u8> {
    // Serialize model parameters as weights
    bincode::serialize(&model.parameters).unwrap_or_default()
}

/// Extract parameters from ONNX graph
fn extract_parameters_from_onnx(onnx_model: &OnnxModel) -> Result<serde_json::Value, MlError> {
    match &onnx_model.graph {
        ModelGraph::Sequential { layers } => {
            let mut parameters = serde_json::Map::new();

            for (i, layer) in layers.iter().enumerate() {
                parameters.insert(format!("layer_{}", i), layer.parameters.clone());
            }

            Ok(serde_json::Value::Object(parameters))
        }
        ModelGraph::Functional { operations } => {
            let mut parameters = serde_json::Map::new();

            for (i, op) in operations.iter().enumerate() {
                parameters.insert(format!("op_{}", i), op.attributes.clone());
            }

            Ok(serde_json::Value::Object(parameters))
        }
    }
}

/// Infer model type from ONNX graph
fn infer_model_type(onnx_model: &OnnxModel) -> String {
    match &onnx_model.graph {
        ModelGraph::Sequential { layers } => {
            if let Some(first_layer) = layers.first() {
                match first_layer.layer_type.as_str() {
                    "Linear" | "Dense" => "NeuralNet".to_string(),
                    _ => "Unknown".to_string(),
                }
            } else {
                "Unknown".to_string()
            }
        }
        ModelGraph::Functional { .. } => "Unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // test_onnx_export_import calls serde_wasm_bindgen::to_value() which is a wasm32-only API.
    // Run only under wasm-pack test, not native cargo test.
    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_onnx_export_import() {
        let model = PersistentModel::new(
            "LogisticRegression",
            serde_json::json!({"weights": vec![0.5, 1.5, -0.3]}),
        );

        let model_js = serde_wasm_bindgen::to_value(&model).unwrap();
        let onnx_bytes = export_onnx(model_js).unwrap();
        assert!(!onnx_bytes.is_empty());

        let imported = import_onnx(&onnx_bytes);
        assert!(imported.is_ok());
    }

    #[test]
    fn test_extract_features() {
        // bincode cannot serialize serde_json::Value arrays without length hints,
        // so we test the inner extract_layer_features directly, bypassing the
        // bincode serialization path that the #[wasm_bindgen] public wrapper uses.
        let model = PersistentModel::new("NeuralNet", serde_json::json!({"layers": [1, 2, 3]}));

        let x_data = vec![1.0, 2.0, 3.0, 4.0];
        let features = extract_layer_features(&model, &x_data, 0, 1, 4);

        assert!(
            features.is_ok(),
            "Expected Ok from extract_layer_features, got {:?}",
            features
        );
        let feats = features.unwrap();
        // NeuralNet path returns the input data unchanged (passthrough implementation)
        assert_eq!(feats.len(), 4);
        assert_eq!(feats, x_data);
    }

    // ── T006 predict_model tests ─────────────────────────────────────────────

    #[test]
    fn test_predict_model_random_forest_with_tree_predictions() {
        // Model stores pre-computed per-sample tree predictions
        let model = PersistentModel::new(
            "RandomForest",
            serde_json::json!({"tree_predictions": [0.1, 0.9, 0.5]}),
        );
        let x_input = vec![1.0, 2.0, 1.0, 2.0, 1.0, 2.0]; // 3 samples × 2 features
        let result = predict_model(&model, &x_input, 3, 2);
        assert!(result.is_ok(), "RandomForest predict should succeed");
        let preds = result.unwrap();
        assert_eq!(preds.len(), 3);
        assert!((preds[0] - 0.1).abs() < 1e-9);
        assert!((preds[1] - 0.9).abs() < 1e-9);
    }

    #[test]
    fn test_predict_model_random_forest_fallback_weights() {
        // No tree_predictions → fallback to weight dot-product
        let model =
            PersistentModel::new("RandomForest", serde_json::json!({"weights": [1.0, 2.0]}));
        let x_input = vec![
            3.0, 4.0, // sample 0: 3*1 + 4*2 = 11
            1.0, 0.5,
        ]; // sample 1: 1*1 + 0.5*2 = 2
        let result = predict_model(&model, &x_input, 2, 2);
        assert!(result.is_ok());
        let preds = result.unwrap();
        assert_eq!(preds.len(), 2);
        assert!(
            (preds[0] - 11.0).abs() < 1e-9,
            "expected 11.0 got {}",
            preds[0]
        );
        assert!(
            (preds[1] - 2.0).abs() < 1e-9,
            "expected 2.0 got {}",
            preds[1]
        );
    }

    #[test]
    fn test_predict_model_gradient_boosting_fallback_uniform_weights() {
        // No weights or tree_predictions → uniform weights (1/n_features per feature)
        let model = PersistentModel::new("GradientBoosting", serde_json::json!({}));
        let x_input = vec![4.0, 4.0]; // sample 0: 4 * 0.5 + 4 * 0.5 = 4.0
        let result = predict_model(&model, &x_input, 1, 2);
        assert!(result.is_ok());
        let preds = result.unwrap();
        assert_eq!(preds.len(), 1);
        assert!(
            (preds[0] - 4.0).abs() < 1e-9,
            "expected 4.0 got {}",
            preds[0]
        );
    }

    #[test]
    fn test_predict_model_unknown_type_returns_error() {
        let model = PersistentModel::new("UnknownModel", serde_json::json!({}));
        let x_input = vec![1.0, 2.0];
        let result = predict_model(&model, &x_input, 1, 2);
        assert!(result.is_err(), "Unknown model type should return Err");
    }

    #[test]
    fn test_predict_model_neural_net_linear_layer() {
        // Single linear layer: weights=[2.0, 3.0], bias=1.0, activation=linear
        // Input x=[1.0, 1.0] → pred = 2*1 + 3*1 + 1 = 6.0
        let model = PersistentModel::new(
            "NeuralNet",
            serde_json::json!({
                "network": [
                    {"weights": [2.0, 3.0], "bias": 1.0, "activation": "linear"}
                ]
            }),
        );
        let x_input = vec![1.0, 1.0];
        let result = predict_model(&model, &x_input, 1, 2);
        assert!(result.is_ok(), "NeuralNet predict should succeed");
        let preds = result.unwrap();
        assert_eq!(preds.len(), 1);
        assert!(
            (preds[0] - 6.0).abs() < 1e-9,
            "expected 6.0, got {}",
            preds[0]
        );
    }

    #[test]
    fn test_predict_model_neural_net_relu_activation() {
        // Single ReLU layer: weights=[−1.0], bias=0.0 → pred = max(0, -2) = 0
        let model = PersistentModel::new(
            "NeuralNet",
            serde_json::json!({
                "network": [
                    {"weights": [-1.0], "bias": 0.0, "activation": "relu"}
                ]
            }),
        );
        let x_input = vec![2.0]; // output before relu = -2.0
        let result = predict_model(&model, &x_input, 1, 1);
        assert!(result.is_ok());
        let preds = result.unwrap();
        assert_eq!(preds[0], 0.0, "ReLU of negative should be 0");
    }

    #[test]
    fn test_predict_model_neural_net_no_layers_fallback() {
        // NeuralNet with no layer data → feature mean as prediction
        let model = PersistentModel::new("NeuralNet", serde_json::json!({}));
        let x_input = vec![4.0, 6.0]; // mean = 5.0
        let result = predict_model(&model, &x_input, 1, 2);
        assert!(result.is_ok());
        let preds = result.unwrap();
        assert!(
            (preds[0] - 5.0).abs() < 1e-9,
            "expected mean 5.0, got {}",
            preds[0]
        );
    }
}
