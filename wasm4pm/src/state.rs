use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;
use crate::models::{EventLog, OCEL, PetriNet, DirectlyFollowsGraph, DeclareModel};

/// A wrapper around different types of objects that can be stored in the WASM state
pub enum StoredObject {
    EventLog(EventLog),
    OCEL(OCEL),
    PetriNet(PetriNet),
    DirectlyFollowsGraph(DirectlyFollowsGraph),
    DeclareModel(DeclareModel),
    #[allow(dead_code)]
    JsonString(String),
}

/// Global application state for managing objects
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
        let mut counter = self
            .counter
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock counter: {}", e)))?;
        let id = format!("obj_{}", counter);
        *counter += 1;

        let mut objects = self
            .objects
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock objects: {}", e)))?;
        objects.insert(id.clone(), obj);
        Ok(id)
    }

    /// Retrieve an object by handle
    pub fn get_object(&self, id: &str) -> Result<Option<StoredObject>, JsValue> {
        let objects = self
            .objects
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock objects: {}", e)))?;
        Ok(objects.get(id).cloned())
    }

    /// Delete an object by handle
    pub fn delete_object(&self, id: &str) -> Result<bool, JsValue> {
        let mut objects = self
            .objects
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock objects: {}", e)))?;
        Ok(objects.remove(id).is_some())
    }

    /// Get the number of stored objects
    pub fn object_count(&self) -> Result<usize, JsValue> {
        let objects = self
            .objects
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock objects: {}", e)))?;
        Ok(objects.len())
    }

    /// Clear all stored objects
    pub fn clear_all(&self) -> Result<(), JsValue> {
        let mut objects = self
            .objects
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Failed to lock objects: {}", e)))?;
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
            StoredObject::DirectlyFollowsGraph(dfg) => StoredObject::DirectlyFollowsGraph(dfg.clone()),
            StoredObject::DeclareModel(dm) => StoredObject::DeclareModel(dm.clone()),
            StoredObject::JsonString(s) => StoredObject::JsonString(s.clone()),
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
