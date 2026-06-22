//! Global stored-object state (handles, object pool, arena management).
//!
//! This module implements the handle-based state system that allows the WebAssembly
//! module to persist complex Rust objects across JavaScript calls without
//! expensive serialization or manual lifetime management in JavaScript.

use crate::error::{codes, wasm_err};
#[cfg(feature = "streaming_basic")]
use crate::incremental_dfg::IncrementalDFG;
#[cfg(feature = "streaming_basic")]
use crate::incremental_dfg::StreamingDFG;
use crate::models::{
    DeclareModel, EventLog, NGramPredictor, PetriNet, StreamingConformanceChecker, TemporalProfile,
    DFG, OCEL,
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
#[derive(Clone)]
pub enum StoredObject {
    /// A case-centric event log.
    EventLog(EventLog),
    /// An object-centric event log.
    OCEL(OCEL),
    /// A Petri Net process model.
    PetriNet(PetriNet),
    /// A Directly-Follows Graph.
    DFG(DFG),
    /// A DECLARE model.
    DeclareModel(DeclareModel),
    /// A generic JSON string result.
    #[allow(dead_code)]
    JsonString(String),
    /// A builder for streaming DFG discovery.
    #[cfg(feature = "streaming_basic")]
    StreamingDfgBuilder(StreamingDfgBuilder),
    /// A builder for streaming skeleton discovery.
    #[cfg(feature = "streaming_basic")]
    StreamingSkeletonBuilder(StreamingSkeletonBuilder),
    /// A builder for streaming heuristic discovery.
    #[cfg(feature = "streaming_basic")]
    StreamingHeuristicBuilder(StreamingHeuristicBuilder),
    /// A stateful streaming conformance checker.
    StreamingConformanceChecker(StreamingConformanceChecker),
    /// A temporal profile of activity durations.
    TemporalProfile(TemporalProfile),
    /// A next-activity predictor.
    NGramPredictor(NGramPredictor),
    /// An incremental DFG representation.
    #[cfg(feature = "streaming_basic")]
    IncrementalDFG(IncrementalDFG),
    /// A streaming DFG representation.
    #[cfg(feature = "streaming_basic")]
    StreamingDFG(StreamingDFG),
    /// A full streaming pipeline.
    #[cfg(feature = "streaming_full")]
    StreamingPipeline(StreamingPipeline),
    /// A POWL model stored as (arena, root_index).
    #[cfg(feature = "powl")]
    PowlModel {
        arena: crate::powl_arena::PowlArena,
        root: u32,
    },
}

/// Global application state for managing objects in WASM handle system.
pub struct AppState {
    /// Inner storage mapping handles to objects.
    objects: Arc<Mutex<HashMap<String, StoredObject>>>,
    /// Counter for generating unique handles.
    counter: Arc<Mutex<u64>>,
    /// Lifecycle authority context.
    lsa: Arc<Mutex<crate::lsa::LifecycleAuthority>>,
}

impl AppState {
    /// Create a new empty application state.
    #[must_use]
    pub fn new() -> Self {
        AppState {
            objects: Arc::new(Mutex::new(HashMap::new())),
            counter: Arc::new(Mutex::new(0)),
            lsa: Arc::new(Mutex::new(crate::lsa::LifecycleAuthority::default())),
        }
    }

    /// Store an object and return a unique handle (string ID).
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked.
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

    /// Retrieve an object by handle.
    ///
    /// This method clones the object. For better performance with large objects,
    /// prefer [`with_object`](Self::with_object).
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked.
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
    ///
    /// Use this instead of `get_object()` for all algorithm calls to avoid
    /// expensive cloning of large event logs or models.
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked or
    /// if the closure returns an error.
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
    ///
    /// Use this for in-place mutation (e.g., streaming builder ingestion).
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked or
    /// if the closure returns an error.
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

    /// Execute a closure with the named `EventLog`, returning a typed error if not found.
    pub fn with_event_log<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&EventLog) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::EventLog(log)) => f(log),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("EventLog '{}' not found", id),
            )),
        })
    }

    /// Execute a closure with the named `PetriNet`, returning a typed error if not found.
    pub fn with_petri_net<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&PetriNet) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::PetriNet(net)) => f(net),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a PetriNet")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("PetriNet '{}' not found", id),
            )),
        })
    }
    /// Execute a closure with a mutable reference to the named `PetriNet`.
    pub fn with_petri_net_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut PetriNet) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::PetriNet(net)) => f(net),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a PetriNet")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("PetriNet '{}' not found", id))),
        })
    }

    /// Execute a closure with the named `OCEL`, returning a typed error if not found.
    #[cfg(feature = "ocel")]
    pub fn with_ocel<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&OCEL) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::OCEL(ocel)) => f(ocel),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("OCEL '{}' not found", id),
            )),
        })
    }

    /// Execute a closure with the named `DFG`, returning a typed error if not found.
    pub fn with_dfg<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&DFG) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::DFG(dfg)) => f(dfg),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a DFG")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("DFG '{}' not found", id),
            )),
        })
    }

    /// Execute a closure with the named `JsonString`, returning a typed error if not found.
    pub fn with_json_string<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&str) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::JsonString(s)) => f(s),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a JsonString")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("JsonString '{}' not found", id),
            )),
        })
    }

    /// Execute a closure with a mutable reference to the named `EventLog`.
    pub fn with_event_log_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut EventLog) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::EventLog(log)) => f(log),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("EventLog '{}' not found", id),
            )),
        })
    }

    /// Execute a closure with the named `StreamingDfgBuilder`, returning a typed error if not found.
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_dfg<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&StreamingDfgBuilder) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::StreamingDfgBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingDfgBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingDfgBuilder '{}' not found", id))),
        })
    }

    /// Execute a closure with a mutable reference to the named `StreamingDfgBuilder`.
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_dfg_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut StreamingDfgBuilder) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::StreamingDfgBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingDfgBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingDfgBuilder '{}' not found", id))),
        })
    }


    /// Execute a closure with the named `TemporalProfile`, returning a typed error if not found.
    pub fn with_temporal_profile<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&TemporalProfile) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::TemporalProfile(p)) => f(p),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a TemporalProfile")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("TemporalProfile '{}' not found", id))),
        })
    }

    /// Execute a closure with the named `DeclareModel`, returning a typed error if not found.
    pub fn with_declare_model<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&DeclareModel) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::DeclareModel(m)) => f(m),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a DeclareModel")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("DeclareModel '{}' not found", id))),
        })
    }

    /// Execute a closure with a mutable reference to the named `StreamingConformanceChecker`.
    pub fn with_streaming_conformance_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut StreamingConformanceChecker) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::StreamingConformanceChecker(c)) => f(c),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingConformanceChecker")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingConformanceChecker '{}' not found", id))),
        })
    }


    /// Execute a closure with a mutable reference to the named `StreamingSkeletonBuilder`.
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_skeleton_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut StreamingSkeletonBuilder) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::StreamingSkeletonBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingSkeletonBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingSkeletonBuilder '{}' not found", id))),
        })
    }

    /// Execute a closure with the named `StreamingSkeletonBuilder` (immutable).
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_skeleton<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&StreamingSkeletonBuilder) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::StreamingSkeletonBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingSkeletonBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingSkeletonBuilder '{}' not found", id))),
        })
    }

    /// Execute a closure with a mutable reference to the named `StreamingHeuristicBuilder`.
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_heuristic_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut StreamingHeuristicBuilder) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::StreamingHeuristicBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingHeuristicBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingHeuristicBuilder '{}' not found", id))),
        })
    }

    /// Execute a closure with the named `StreamingHeuristicBuilder` (immutable).
    #[cfg(feature = "streaming_basic")]
    pub fn with_streaming_heuristic<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&StreamingHeuristicBuilder) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::StreamingHeuristicBuilder(b)) => f(b),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingHeuristicBuilder")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingHeuristicBuilder '{}' not found", id))),
        })
    }

    /// Execute a closure with a mutable reference to the named `StreamingPipeline`.
    #[cfg(feature = "streaming_full")]
    pub fn with_streaming_pipeline_mut<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&mut StreamingPipeline) -> Result<R, JsValue>,
    {
        self.with_object_mut(id, |obj| match obj {
            Some(StoredObject::StreamingPipeline(p)) => f(p),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingPipeline")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingPipeline '{}' not found", id))),
        })
    }

    /// Execute a closure with the named `StreamingPipeline` (immutable).
    #[cfg(feature = "streaming_full")]
    pub fn with_streaming_pipeline<F, R>(&self, id: &str, f: F) -> Result<R, JsValue>
    where
        F: FnOnce(&StreamingPipeline) -> Result<R, JsValue>,
    {
        self.with_object(id, |obj| match obj {
            Some(StoredObject::StreamingPipeline(p)) => f(p),
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a StreamingPipeline")),
            None => Err(wasm_err(codes::INVALID_HANDLE, format!("StreamingPipeline '{}' not found", id))),
        })
    }

    /// Delete an object by handle from the registry.
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked.
    pub fn delete_object(&self, id: &str) -> Result<bool, JsValue> {
        let mut objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        Ok(objects.remove(id).is_some())
    }

    /// Return the current number of stored objects.
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked.
    pub fn object_count(&self) -> Result<usize, JsValue> {
        let objects = self.objects.lock().map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to lock objects: {}", e),
            )
        })?;
        Ok(objects.len())
    }

    /// Clear all stored objects from the registry.
    ///
    /// # Errors
    /// Returns a `JsValue` error if the internal mutex cannot be locked.
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


impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

static APP_STATE: Lazy<AppState> = Lazy::new(AppState::new);

/// Get the global application state.
pub fn get_or_init_state() -> &'static AppState {
    &APP_STATE
}

/// JS-accessible function to delete a stored object by handle.
#[wasm_bindgen]
pub fn delete_object(id: &str) -> Result<bool, JsValue> {
    get_or_init_state().delete_object(id)
}

/// JS-accessible function to check if a stored object exists by handle.
#[wasm_bindgen]
pub fn object_exists(id: &str) -> bool {
    get_or_init_state()
        .with_object(id, |obj| Ok(obj.is_some()))
        .unwrap_or(false)
}

/// JS-accessible function to get the current number of stored objects.
#[wasm_bindgen]
pub fn object_count() -> Result<usize, JsValue> {
    get_or_init_state().object_count()
}

/// JS-accessible function to clear all stored objects.
#[wasm_bindgen]
pub fn clear_all_objects() -> Result<(), JsValue> {
    get_or_init_state().clear_all()
}
