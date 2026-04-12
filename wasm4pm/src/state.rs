use crate::error::{codes, wasm_err};
use crate::incremental_dfg::IncrementalDFG;
use crate::incremental_dfg::StreamingDFG;
use crate::models::{
    DeclareModel, DirectlyFollowsGraph, EventLog, NGramPredictor, PetriNet,
    StreamingConformanceChecker, TemporalProfile, OCEL,
};
#[cfg(feature = "streaming_basic")]
use crate::streaming::{StreamingDfgBuilder, StreamingHeuristicBuilder, StreamingSkeletonBuilder};
#[cfg(feature = "streaming_full")]
use crate::streaming_pipeline::StreamingPipeline;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;

/// Typed object storage for the WASM handle-based state system.
///
/// All objects created by the library (event logs, process models, streaming
/// builders, etc.) are stored internally and referenced by string handles.
/// This enum provides type-safe access to stored objects and enables
/// efficient serialization across the WASM boundary without requiring
/// JavaScript to manage Rust object lifetimes.
#[allow(clippy::large_enum_variant)]
pub enum StoredObject {
    EventLog(EventLog),
    OCEL(OCEL),
    PetriNet(PetriNet),
    DirectlyFollowsGraph(DirectlyFollowsGraph),
    DeclareModel(DeclareModel),
    #[allow(dead_code)]
    JsonString(String),
    #[cfg(feature = "streaming_basic")]
    StreamingDfgBuilder(StreamingDfgBuilder),
    #[cfg(feature = "streaming_basic")]
    StreamingSkeletonBuilder(StreamingSkeletonBuilder),
    #[cfg(feature = "streaming_basic")]
    StreamingHeuristicBuilder(StreamingHeuristicBuilder),
    StreamingConformanceChecker(StreamingConformanceChecker),
    TemporalProfile(TemporalProfile),
    NGramPredictor(NGramPredictor),
    IncrementalDFG(IncrementalDFG),
    StreamingDFG(StreamingDFG),
    #[cfg(feature = "streaming_full")]
    StreamingPipeline(StreamingPipeline),
}

/// Global application state for managing objects in WASM handle system.
pub struct AppState {
    objects: Arc<Mutex<HashMap<String, StoredObject>>>,
    counter: Arc<Mutex<u64>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            objects: Arc::new(Mutex::new(HashMap::new())),
            counter: Arc::new(Mutex::new(0)),
        }
    }

    /// Store an object and return a handle (string ID)
    pub fn store_object(&self, obj: StoredObject) -> Result<String, JsValue> {
        let mut counter = self.counter.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock counter: {}", e),
            )
        })?;
        let id = format!("obj_{}", counter);
        *counter += 1;

        let mut objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        objects.insert(id.clone(), obj);
        Ok(id)
    }

    /// Retrieve an object by handle (clones — prefer with_object for performance)
    pub fn get_object(&self, id: &str) -> Result<Option<StoredObject>, JsValue> {
        let objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        Ok(objects.get(id).cloned())
    }

    /// Execute a closure with a borrowed reference to the named object — zero clone.
    /// Use this instead of get_object() for all algorithm calls.
    pub fn with_object<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(Option<&StoredObject>) -> Result<R, JsValue>,
    {
        let objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        f(objects.get(id))
    }

    /// Execute a closure with a mutable reference to the named object — zero clone.
    /// Use this for in-place mutation (e.g., streaming builder ingestion).
    pub fn with_object_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(Option<&mut StoredObject>) -> Result<R, JsValue>,
    {
        let mut objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        f(objects.get_mut(id))
    }

    /// Delete an object by handle
    pub fn delete_object(&self, id: &str) -> Result<bool, JsValue> {
        let mut objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        Ok(objects.remove(id).is_some())
    }

    /// Get the number of stored objects
    pub fn object_count(&self) -> Result<usize, JsValue> {
        let objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        Ok(objects.len())
    }

    /// Clear all stored objects
    pub fn clear_all(&self) -> Result<(), JsValue> {
        let mut objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        objects.clear();
        Ok(())
    }
}

impl Clone for StoredObject {
    fn clone(&self) -> Self {
        match self {
            StoredObject::EventLog(el) => StoredObject::EventLog(el.clone()),
            StoredObject::OCEL(o) => StoredObject::OCEL(o.clone()),
            StoredObject::PetriNet(pn) => StoredObject::PetriNet(pn.clone()),
            StoredObject::DirectlyFollowsGraph(dfg) => {
                StoredObject::DirectlyFollowsGraph(dfg.clone())
            }
            StoredObject::DeclareModel(dm) => StoredObject::DeclareModel(dm.clone()),
            StoredObject::JsonString(s) => StoredObject::JsonString(s.clone()),
            #[cfg(feature = "streaming_basic")]
            StoredObject::StreamingDfgBuilder(b) => StoredObject::StreamingDfgBuilder(b.clone()),
            #[cfg(feature = "streaming_basic")]
            StoredObject::StreamingSkeletonBuilder(b) => {
                StoredObject::StreamingSkeletonBuilder(b.clone())
            }
            #[cfg(feature = "streaming_basic")]
            StoredObject::StreamingHeuristicBuilder(b) => {
                StoredObject::StreamingHeuristicBuilder(b.clone())
            }
            StoredObject::StreamingConformanceChecker(c) => {
                StoredObject::StreamingConformanceChecker(c.clone())
            }
            StoredObject::TemporalProfile(p) => StoredObject::TemporalProfile(p.clone()),
            StoredObject::NGramPredictor(p) => StoredObject::NGramPredictor(p.clone()),
            StoredObject::IncrementalDFG(d) => StoredObject::IncrementalDFG(d.clone()),
            StoredObject::StreamingDFG(d) => StoredObject::StreamingDFG(d.clone()),
            #[cfg(feature = "streaming_full")]
            StoredObject::StreamingPipeline(p) => StoredObject::StreamingPipeline(p.clone()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

static APP_STATE: Lazy<AppState> = Lazy::new(AppState::new);

pub fn get_or_init_state() -> &'static AppState {
    &APP_STATE
}

/// JS-accessible functions for state management
#[wasm_bindgen]
pub fn delete_object(id: &str) -> Result<bool, JsValue> {
    get_or_init_state().delete_object(id)
}

#[wasm_bindgen]
pub fn object_count() -> Result<usize, JsValue> {
    get_or_init_state().object_count()
}

#[wasm_bindgen]
pub fn clear_all_objects() -> Result<(), JsValue> {
    get_or_init_state().clear_all()
}
