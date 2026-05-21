//! Fixture Registry — Enhanced test fixture management with better error reporting
//!
//! Provides:
//! - Named fixture registry (string → loaded data)
//! - Batch fixture loading with diagnostics
//! - Fixture lifecycle hooks (setup/teardown)
//! - Clear error messages on fixture loading failures

use lazy_static::lazy_static;
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;

const FIXTURES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");

/// Represents a fixture that can be loaded on demand
#[derive(Clone, Debug)]
pub struct Fixture {
    name: String,
    content: String,
}

impl Fixture {
    /// Create fixture from file
    pub fn from_file(name: &str) -> Result<Self, String> {
        let path = format!("{FIXTURES_DIR}/{name}");
        fs::read_to_string(&path)
            .map(|content| Self {
                name: name.to_string(),
                content,
            })
            .map_err(|e| format!("Failed to load fixture '{}' from '{}': {}", name, path, e))
    }

    /// Parse fixture as JSON
    pub fn as_json<T: serde::de::DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_str(&self.content).map_err(|e| {
            format!(
                "Failed to parse fixture '{}' as JSON: {} (content length: {} bytes)",
                self.name,
                e,
                self.content.len()
            )
        })
    }

    /// Get raw content
    pub fn content(&self) -> &str {
        &self.content
    }

    /// Get fixture name
    pub fn name(&self) -> &str {
        &self.name
    }
}

lazy_static! {
    static ref REGISTRY: Mutex<HashMap<String, Fixture>> = Mutex::new(HashMap::new());
}

/// Register a fixture (after loading from file)
pub fn register(name: &str, fixture: Fixture) {
    REGISTRY
        .lock()
        .unwrap_or_else(|e| panic!("Failed to acquire fixture registry lock: {}", e))
        .insert(name.to_string(), fixture);
}

/// Get a fixture by name
pub fn get(name: &str) -> Result<Fixture, String> {
    let registry = REGISTRY
        .lock()
        .unwrap_or_else(|e| panic!("Failed to acquire fixture registry lock: {}", e));

    registry.get(name).cloned().ok_or_else(|| {
        let available = registry.keys().map(|k| k.as_str()).collect::<Vec<_>>();
        if available.is_empty() {
            format!("Fixture '{}' not found. No fixtures registered.", name)
        } else {
            format!(
                "Fixture '{}' not found. Available: {}",
                name,
                available.join(", ")
            )
        }
    })
}

/// Load a fixture from file and register it
pub fn load_and_register(name: &str) -> Result<Fixture, String> {
    let fixture = Fixture::from_file(name)?;
    register(name, fixture.clone());
    Ok(fixture)
}

/// Batch-load fixtures from directory
/// Returns count of successfully loaded fixtures and list of any errors
pub fn batch_load(names: &[&str]) -> (usize, Vec<String>) {
    let mut errors = Vec::new();
    let mut count = 0;

    for name in names {
        match load_and_register(name) {
            Ok(_) => count += 1,
            Err(e) => errors.push(e),
        }
    }

    (count, errors)
}

/// Clear all registered fixtures (useful for test isolation)
pub fn clear() {
    REGISTRY
        .lock()
        .unwrap_or_else(|e| panic!("Failed to acquire fixture registry lock: {}", e))
        .clear();
}

/// Get list of all registered fixture names
pub fn registered_names() -> Vec<String> {
    let registry = REGISTRY
        .lock()
        .unwrap_or_else(|e| panic!("Failed to acquire fixture registry lock: {}", e));
    registry.keys().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    lazy_static! {
        static ref TEST_LOCK: Mutex<()> = Mutex::new(());
    }

    #[test]
    fn test_fixture_registry_lifecycle() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear();
        assert_eq!(registered_names().len(), 0);

        let fixture = Fixture {
            name: "test".to_string(),
            content: r#"{"name":"test"}"#.to_string(),
        };

        register("test", fixture.clone());
        assert_eq!(registered_names().len(), 1);

        let retrieved = get("test").expect("Should retrieve fixture");
        assert_eq!(retrieved.name(), "test");

        clear();
        assert_eq!(registered_names().len(), 0);
    }

    #[test]
    fn test_fixture_json_parsing() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear();

        let fixture = Fixture {
            name: "json_test".to_string(),
            content: r#"{"key":"value"}"#.to_string(),
        };

        register("json_test", fixture);
        let retrieved = get("json_test").expect("Should retrieve fixture");

        let parsed: serde_json::Value = retrieved.as_json().expect("Should parse JSON");
        assert_eq!(parsed["key"].as_str(), Some("value"));

        clear();
    }

    #[test]
    fn test_fixture_not_found_error() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear();
        let result = get("nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}
