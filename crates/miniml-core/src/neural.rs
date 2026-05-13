//! Neural network primitives
//!
//! Minimal neural network implementation with dense layers, activations, and optimizers.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use js_sys;

/// Layer types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Layer {
    Dense {
        input_size: usize,
        output_size: usize,
        weights: Vec<Vec<f64>>,
        biases: Vec<f64>,
    },
    Dropout {
        rate: f64,
    },
    BatchNorm {
        epsilon: f64,
        gamma: Vec<f64>,
        beta: Vec<f64>,
    },
}

impl Layer {
    /// Create a new dense layer with Xavier initialization
    pub fn dense(input_size: usize, output_size: usize) -> Self {
        let mut weights = Vec::with_capacity(output_size);
        let mut rng = XorShift64::new();

        // Xavier initialization
        let scale = (2.0 / (input_size + output_size) as f64).sqrt();

        for _ in 0..output_size {
            let mut neuron_weights = Vec::with_capacity(input_size);
            for _ in 0..input_size {
                neuron_weights.push((rng.next_f64() - 0.5) * 2.0 * scale);
            }
            weights.push(neuron_weights);
        }

        // Zero-initialized biases
        let biases = vec![0.0; output_size];

        Layer::Dense {
            input_size,
            output_size,
            weights,
            biases,
        }
    }

    /// Get output size of layer
    pub fn output_size(&self) -> Option<usize> {
        match self {
            Layer::Dense { output_size, .. } => Some(*output_size),
            Layer::Dropout { .. } => None,
            Layer::BatchNorm { gamma, .. } => Some(gamma.len()),
        }
    }
}

/// Activation function types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActivationType {
    ReLU,
    Sigmoid,
    Tanh,
    LeakyReLU { alpha: f64 },
}

impl ActivationType {
    /// Apply activation function
    pub fn apply(&self, x: f64) -> f64 {
        match self {
            Self::ReLU => x.max(0.0),
            Self::Sigmoid => 1.0 / (1.0 + (-x).exp()),
            Self::Tanh => x.tanh(),
            Self::LeakyReLU { alpha } => {
                if x >= 0.0 {
                    x
                } else {
                    x * alpha
                }
            }
        }
    }

    /// Apply activation function derivative
    pub fn derivative(&self, x: f64) -> f64 {
        match self {
            Self::ReLU => {
                if x > 0.0 {
                    1.0
                } else {
                    0.0
                }
            }
            Self::Sigmoid => {
                let s = 1.0 / (1.0 + (-x).exp());
                s * (1.0 - s)
            }
            Self::Tanh => {
                1.0 - x.tanh().powi(2)
            }
            Self::LeakyReLU { alpha } => {
                if x > 0.0 {
                    1.0
                } else {
                    *alpha
                }
            }
        }
    }
}

/// Optimizer types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Optimizer {
    SGD {
        learning_rate: f64,
    },
    Adam {
        learning_rate: f64,
        beta1: f64,
        beta2: f64,
        epsilon: f64,
        t: usize,
    },
    RMSProp {
        learning_rate: f64,
        alpha: f64,
        epsilon: f64,
    },
}

impl Optimizer {
    /// Create SGD optimizer
    pub fn sgd(learning_rate: f64) -> Self {
        Optimizer::SGD {
            learning_rate,
        }
    }

    /// Create Adam optimizer
    pub fn adam(learning_rate: f64, beta1: f64, beta2: f64, epsilon: f64) -> Self {
        Optimizer::Adam {
            learning_rate,
            beta1,
            beta2,
            epsilon,
            t: 0,
        }
    }

    /// Update weights with gradients
    pub fn update(&mut self, layers: &mut [Layer], gradients: &[Vec<f64>]) {
        match self {
            Optimizer::SGD { learning_rate } => {
                // Simple SGD: weight = weight - learning_rate * gradient
                let mut grad_idx = 0;
                for layer in layers.iter_mut() {
                    if let Layer::Dense { ref mut weights, .. } = layer {
                        if grad_idx < gradients.len() {
                            for (neuron_weights, grad_vec) in weights.iter_mut().zip(gradients[grad_idx..].iter()) {
                                for (weight, g) in neuron_weights.iter_mut().zip(grad_vec.iter()) {
                                    *weight -= *learning_rate * g;
                                }
                            }
                        }
                        grad_idx += 1;
                    }
                }
            }
            Optimizer::Adam {
                learning_rate,
                beta1: _,
                beta2: _,
                epsilon: _,
                t,
            } => {
                *t += 1;
                // Simplified Adam update
                let mut grad_idx = 0;
                for layer in layers.iter_mut() {
                    if let Layer::Dense { ref mut weights, .. } = layer {
                        if grad_idx < gradients.len() {
                            for (neuron_weights, grad_vec) in weights.iter_mut().zip(gradients[grad_idx..].iter()) {
                                for (weight, g) in neuron_weights.iter_mut().zip(grad_vec.iter()) {
                                    *weight -= *learning_rate * g;
                                }
                            }
                        }
                        grad_idx += 1;
                    }
                }
            }
            Optimizer::RMSProp {
                learning_rate,
                alpha: _,
                epsilon,
            } => {
                // Simplified RMSProp update
                let mut grad_idx = 0;
                for layer in layers.iter_mut() {
                    if let Layer::Dense { ref mut weights, .. } = layer {
                        if grad_idx < gradients.len() {
                            for (neuron_weights, grad_vec) in weights.iter_mut().zip(gradients[grad_idx..].iter()) {
                                for (weight, g) in neuron_weights.iter_mut().zip(grad_vec.iter()) {
                                    *weight -= *learning_rate * g / (g * g + *epsilon).sqrt();
                                }
                            }
                        }
                        grad_idx += 1;
                    }
                }
            }
        }
    }
}

/// Neural network model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralNet {
    pub layers: Vec<Layer>,
    pub activation: ActivationType,
    pub optimizer: Option<Optimizer>,
}

impl NeuralNet {
    /// Create a new neural network
    pub fn new(activation: ActivationType) -> Self {
        Self {
            layers: Vec::new(),
            activation,
            optimizer: None,
        }
    }

    /// Add a layer to the network
    pub fn add_layer(mut self, layer: Layer) -> Self {
        self.layers.push(layer);
        self
    }

    /// Set optimizer
    pub fn with_optimizer(mut self, optimizer: Optimizer) -> Self {
        self.optimizer = Some(optimizer);
        self
    }

    /// Forward pass through the network
    pub fn forward(&self, input: &[f64]) -> Vec<f64> {
        let mut current = input.to_vec();

        for layer in &self.layers {
            match layer {
                Layer::Dense {
                    weights, biases, ..
                } => {
                    let mut output = vec![0.0; weights.len()];
                    for (neuron_idx, neuron_weights) in weights.iter().enumerate() {
                        let mut sum = biases[neuron_idx];
                        for (&w, &input_val) in neuron_weights.iter().zip(current.iter()) {
                            sum += w * input_val;
                        }
                        output[neuron_idx] = sum;
                    }
                    current = output;
                }
                Layer::Dropout { rate } => {
                    // Only apply during training
                    // During inference, we scale by (1 - rate)
                    for val in current.iter_mut() {
                        *val /= 1.0 - rate;
                    }
                }
                Layer::BatchNorm {
                    gamma, beta, epsilon, ..
                } => {
                    let mean: f64 = current.iter().sum::<f64>() / current.len() as f64;
                    let variance = current
                        .iter()
                        .map(|x| (x - mean).powi(2))
                        .sum::<f64>()
                        / current.len() as f64;
                    let std = (variance + epsilon).sqrt();

                    for (i, val) in current.iter_mut().enumerate() {
                        *val = gamma[i] * (*val - mean) / std + beta[i];
                    }
                }
            }
        }

        // Apply activation function to final output
        current
            .iter()
            .map(|&x| self.activation.apply(x))
            .collect()
    }

    /// Train the network
    pub fn train(
        &mut self,
        X: &[f64],
        y: &[f64],
        n_samples: usize,
        n_features: usize,
        n_epochs: usize,
        batch_size: usize,
    ) -> Result<(), MlError> {
        if self.optimizer.is_none() {
            self.optimizer = Some(Optimizer::sgd(0.01));
        }

        for epoch in 0..n_epochs {
            for batch_start in (0..n_samples).step_by(batch_size) {
                let batch_end = (batch_start + batch_size).min(n_samples);

                // Compute gradients (backpropagation)
                let gradients = self.compute_batch_gradients(X, y, batch_start, batch_end, n_features);

                // Update weights
                if let Some(ref mut optimizer) = self.optimizer {
                    optimizer.update(&mut self.layers, &gradients);
                }
            }
        }

        Ok(())
    }

    /// Compute gradients for a batch using backpropagation
    fn compute_batch_gradients(
        &self,
        X: &[f64],
        y: &[f64],
        batch_start: usize,
        batch_end: usize,
        n_features: usize,
    ) -> Vec<Vec<f64>> {
        let batch_size = batch_end - batch_start;
        let mut gradients: Vec<Vec<f64>> = self
            .layers
            .iter()
            .map(|layer| {
                if let Layer::Dense { weights, .. } = layer {
                    // Flatten all weights into a single Vec per layer
                    weights.iter().flat_map(|w| w.iter()).map(|_| 0.0).collect()
                } else {
                    Vec::new()
                }
            })
            .collect();

        // Accumulate gradients over batch
        for i in batch_start..batch_end {
            let input = &X[i * n_features..(i + 1) * n_features];
            let target = y[i];

            // Forward pass (store intermediate values)
            let mut activations = vec![input.to_vec()];
            let mut current = input.to_vec();

            for layer in &self.layers {
                if let Layer::Dense { weights, biases, .. } = layer {
                    let mut output = vec![0.0; weights.len()];
                    for (neuron_idx, neuron_weights) in weights.iter().enumerate() {
                        let mut sum = biases[neuron_idx];
                        for (&w, &input_val) in neuron_weights.iter().zip(current.iter()) {
                            sum += w * input_val;
                        }
                        output[neuron_idx] = sum;
                    }
                    current = output.clone();
                    activations.push(current.clone());
                }
            }

            // Apply activation to get prediction
            let prediction: Vec<f64> = current
                .iter()
                .map(|&x| self.activation.apply(x))
                .collect();

            // Compute output error (MSE loss derivative)
            let output_error: Vec<f64> = prediction
                .iter()
                .enumerate()
                .map(|(i, &p)| {
                    let error = p - target;
                    error * self.activation.derivative(current[i])
                })
                .collect();

            // Backpropagate
            let mut current_error = output_error;
            for (layer_idx, layer) in self.layers.iter().enumerate().rev() {
                if let Layer::Dense { weights, .. } = layer {
                    let input = &activations[layer_idx];
                    let mut layer_gradients = vec![vec![0.0; weights[0].len()]; weights.len()];

                    // Compute gradients for this layer
                    for (neuron_idx, neuron_weights) in weights.iter().enumerate() {
                        let error = current_error[neuron_idx];

                        for (weight_idx, &weight) in neuron_weights.iter().enumerate() {
                            layer_gradients[neuron_idx][weight_idx] += error * input[weight_idx];
                        }
                    }

                    // Propagate error to previous layer
                    if layer_idx > 0 {
                        let mut prev_error = vec![0.0; input.len()];
                        for (input_idx, &input_val) in input.iter().enumerate() {
                            for (neuron_idx, neuron_weights) in weights.iter().enumerate() {
                                prev_error[input_idx] +=
                                    current_error[neuron_idx] * neuron_weights[input_idx];
                            }
                        }
                        current_error = prev_error;
                    }

                    // Accumulate gradients (flatten layer_gradients into gradients[layer_idx])
                    let mut grad_idx = 0;
                    for neuron_grads in layer_gradients.iter() {
                        for &lg in neuron_grads.iter() {
                            gradients[layer_idx][grad_idx] += lg / batch_size as f64;
                            grad_idx += 1;
                        }
                    }
                }
            }
        }

        gradients
    }
}

/// Simple XOR-shift random number generator
struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new() -> Self {
        // Use a fixed seed for deterministic results
        // When compiled to WASM, js_sys::Date::now() would be available
        #[cfg(target_arch = "wasm32")]
        let seed = js_sys::Date::now() as u64;
        #[cfg(not(target_arch = "wasm32"))]
        let seed = 42u64;
        Self { state: seed }
    }

    fn next(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        self.state
    }

    fn next_f64(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

impl Default for XorShift64 {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layer_dense() {
        let layer = Layer::dense(3, 2);

        assert_eq!(layer.output_size(), Some(2));

        if let Layer::Dense { input_size, output_size, weights, biases } = layer {
            assert_eq!(input_size, 3);
            assert_eq!(output_size, 2);
            assert_eq!(weights.len(), 2);
            assert_eq!(biases.len(), 2);
        }
    }

    #[test]
    fn test_activation_relu() {
        let relu = ActivationType::ReLU;

        assert_eq!(relu.apply(1.0), 1.0);
        assert_eq!(relu.apply(-1.0), 0.0);
        assert_eq!(relu.apply(0.0), 0.0);

        assert_eq!(relu.derivative(1.0), 1.0);
        assert_eq!(relu.derivative(-1.0), 0.0);
    }

    #[test]
    fn test_activation_sigmoid() {
        let sigmoid = ActivationType::Sigmoid;

        assert!((sigmoid.apply(0.0) - 0.5).abs() < 1e-10);
        assert!(sigmoid.apply(10.0) > 0.9);
        assert!(sigmoid.apply(-10.0) < 0.1);
    }

    #[test]
    fn test_neural_net_forward() {
        let mut net = NeuralNet::new(ActivationType::ReLU);
        net = net.add_layer(Layer::dense(2, 3));
        net = net.add_layer(Layer::dense(3, 1));

        let input = vec![1.0, 2.0];
        let output = net.forward(&input);

        assert_eq!(output.len(), 1);
    }

    #[test]
    fn test_xorshift() {
        let mut rng = XorShift64::new();
        let val1 = rng.next();
        let val2 = rng.next();

        assert_ne!(val1, val2); // Should produce different values
    }
}
