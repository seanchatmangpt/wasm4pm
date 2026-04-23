/**
 * Generic result for operations
 */
export class OperationResult {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OperationResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_operationresult_free(ptr, 0);
    }
    /**
     * @returns {string | undefined}
     */
    data() {
        const ret = wasm.operationresult_data(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {boolean}
     */
    is_success() {
        const ret = wasm.operationresult_is_success(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    message() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.operationresult_message(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) OperationResult.prototype[Symbol.dispose] = OperationResult.prototype.free;

/**
 * Multi-dimensional RL state with quantized dimensions
 */
export class RlState {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RlState.prototype);
        obj.__wbg_ptr = ptr;
        RlStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RlStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rlstate_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get activity_count_q() {
        const ret = wasm.__wbg_get_rlstate_activity_count_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get circuit_state() {
        const ret = wasm.__wbg_get_rlstate_circuit_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get cycle_phase() {
        const ret = wasm.__wbg_get_rlstate_cycle_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get drift_status() {
        const ret = wasm.__wbg_get_rlstate_drift_status(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get event_rate_q() {
        const ret = wasm.__wbg_get_rlstate_event_rate_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get health_level() {
        const ret = wasm.__wbg_get_rlstate_health_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get rework_ratio_q() {
        const ret = wasm.__wbg_get_rlstate_rework_ratio_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get spc_alert_level() {
        const ret = wasm.__wbg_get_rlstate_spc_alert_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set activity_count_q(arg0) {
        wasm.__wbg_set_rlstate_activity_count_q(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set circuit_state(arg0) {
        wasm.__wbg_set_rlstate_circuit_state(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set cycle_phase(arg0) {
        wasm.__wbg_set_rlstate_cycle_phase(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set drift_status(arg0) {
        wasm.__wbg_set_rlstate_drift_status(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set event_rate_q(arg0) {
        wasm.__wbg_set_rlstate_event_rate_q(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set health_level(arg0) {
        wasm.__wbg_set_rlstate_health_level(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set rework_ratio_q(arg0) {
        wasm.__wbg_set_rlstate_rework_ratio_q(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set spc_alert_level(arg0) {
        wasm.__wbg_set_rlstate_spc_alert_level(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) RlState.prototype[Symbol.dispose] = RlState.prototype.free;

/**
 * Wrapper for EventLog - stores handle in WASM state
 */
export class WasmEventLog {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmEventLogFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmeventlog_free(ptr, 0);
    }
    /**
     * Get attributes count
     * @returns {number}
     */
    attribute_count() {
        const ret = wasm.wasmeventlog_attribute_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the number of cases in the log
     * @returns {number}
     */
    case_count() {
        const ret = wasm.wasmeventlog_case_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the number of events in the log
     * @returns {number}
     */
    event_count() {
        const ret = wasm.wasmeventlog_event_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the internal handle (for internal use only)
     * @returns {string}
     */
    handle() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmeventlog_handle(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} handle
     */
    constructor(handle) {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmeventlog_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        WasmEventLogFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get basic statistics as JSON
     * @returns {any}
     */
    stats() {
        const ret = wasm.wasmeventlog_stats(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) WasmEventLog.prototype[Symbol.dispose] = WasmEventLog.prototype.free;

/**
 * Wrapper for OCEL
 */
export class WasmOCEL {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmOCELFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmocel_free(ptr, 0);
    }
    /**
     * Get the number of events in the OCEL
     * @returns {number}
     */
    event_count() {
        const ret = wasm.wasmocel_event_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the internal handle (for internal use only)
     * @returns {string}
     */
    handle() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmocel_handle(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} handle
     */
    constructor(handle) {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmeventlog_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        WasmOCELFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get the number of objects in the OCEL
     * @returns {number}
     */
    object_count() {
        const ret = wasm.wasmocel_object_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get basic statistics as JSON
     * @returns {any}
     */
    stats() {
        const ret = wasm.wasmocel_stats(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) WasmOCEL.prototype[Symbol.dispose] = WasmOCEL.prototype.free;

/**
 * @returns {string}
 */
export function advanced_algorithms_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.advanced_algorithms_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} log_handle
 * @param {string} petri_net_handle
 * @param {string} config_json
 * @returns {any}
 */
export function align_etconformance_precision(log_handle, petri_net_handle, config_json) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.align_etconformance_precision(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} log_handle
 * @param {string} petri_net_handle
 * @param {string} config_json
 * @returns {any}
 */
export function alignment_fitness(log_handle, petri_net_handle, config_json) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.alignment_fitness(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Activity Co-occurrence - find activities that happen together
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_activity_cooccurrence(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_activity_cooccurrence(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Activity Dependency Analysis - identify predecessor/successor relationships
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_activity_dependencies(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_activity_dependencies(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Case Attribute Analysis - correlate case attributes with process behavior
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_case_attributes(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_case_attributes(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Analyze case duration from an EventLog
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function analyze_case_duration(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_case_duration(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Perform dotted chart analysis on an EventLog
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function analyze_dotted_chart(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_dotted_chart(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get event statistics from an EventLog
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function analyze_event_statistics(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_event_statistics(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover infrequent behavior patterns (deviations from main process)
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} frequency_threshold
 * @returns {any}
 */
export function analyze_infrequent_paths(eventlog_handle, activity_key, frequency_threshold) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_infrequent_paths(ptr0, len0, ptr1, len1, frequency_threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Analyze object-centric performance across all object types.
 *
 * For each object type, builds a performance DFG with per-edge duration
 * statistics derived from event timestamps. The `timestamp_key` parameter
 * is accepted for API consistency but OCEL timestamps are always read from
 * the standard `time` / `timestamp` field of each event (ISO 8601).
 *
 * Returns JSON keyed by object type:
 * ```json
 * {
 *   "Order": {
 *     "nodes": [{"id":"Create Order","label":"Create Order","frequency":50}],
 *     "edges": [{"from":"Create Order","to":"Pay","count":45,
 *                "mean_ms":86400000,"median_ms":82800000,"p95_ms":172800000}],
 *     "start_activities": {"Create Order": 50},
 *     "end_activities":   {"Close": 50}
 *   },
 *   "Item": { ... }
 * }
 * ```
 * @param {string} ocel_handle
 * @param {string} _timestamp_key
 * @returns {any}
 */
export function analyze_oc_performance(ocel_handle, _timestamp_key) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_oc_performance(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get object statistics from an OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function analyze_ocel_statistics(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_ocel_statistics(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Identify where process accelerates/decelerates over time.
 * @param {string} eventlog_handle
 * @param {string} timestamp_key
 * @param {number} _window_size
 * @returns {any}
 */
export function analyze_process_speedup(eventlog_handle, timestamp_key, _window_size) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_process_speedup(ptr0, len0, ptr1, len1, _window_size);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Analyze resource-activity matrix: which resources perform which activities.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "matrix": {
 *     "Alice": { "Approve": 40, "Review": 5 },
 *     "Bob": { "Process": 50, "Validate": 10 }
 *   },
 *   "specialization_scores": {
 *     "Alice": 0.85,
 *     "Bob": 0.72
 *   }
 * }
 * ```
 * @param {string} log_handle
 * @param {string} resource_key
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_resource_activity_matrix(log_handle, resource_key, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_resource_activity_matrix(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Analyze resource utilization: total events, time periods, concurrent cases, top activities.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "resources": {
 *     "Alice": {
 *       "event_count": 45,
 *       "first_event": "2024-01-01T10:00Z",
 *       "last_event": "2024-01-31T17:00Z",
 *       "avg_concurrent_cases": 3.5,
 *       "top_activities": ["Approve", "Review"]
 *     },
 *     "Bob": { ... }
 *   },
 *   "total_resources": 5
 * }
 * ```
 * @param {string} log_handle
 * @param {string} resource_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function analyze_resource_utilization(log_handle, resource_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_resource_utilization(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Start/End Activity Analysis - find entry and exit points
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_start_end_activities(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_start_end_activities(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Identify temporal bottlenecks by activity duration.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function analyze_temporal_bottlenecks(eventlog_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_temporal_bottlenecks(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Trace Variants - extract unique process paths and their frequencies
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_trace_variants(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_trace_variants(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Measure variant entropy and diversity in event log.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function analyze_variant_complexity(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_variant_complexity(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get list of available analysis functions
 * @returns {string}
 */
export function available_analysis_functions() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.available_analysis_functions();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get list of available discovery algorithms
 * @returns {any}
 */
export function available_discovery_algorithms() {
    const ret = wasm.available_discovery_algorithms();
    return ret;
}

/**
 * Build an n-gram predictor from an event log.
 *
 * `n` controls how many preceding activities are used as context (default 2).
 *
 * Returns a handle to the predictor stored in state.
 *
 * ```javascript
 * const predHandle = pm.build_ngram_predictor(logHandle, 'concept:name', 2);
 * const preds = JSON.parse(pm.predict_next_activity(predHandle,
 *                 JSON.stringify(['Register', 'Check'])));
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} n
 * @returns {any}
 */
export function build_ngram_predictor(log_handle, activity_key, n) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.build_ngram_predictor(ptr0, len0, ptr1, len1, n);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Build a remaining-time prediction model from a completed event log.
 *
 * # Parameters
 * - `log_handle` — handle to an `EventLog` in state
 * - `activity_key` — attribute name for activity labels (e.g. `"concept:name"`)
 * - `timestamp_key` — attribute name for event timestamps (e.g. `"time:timestamp"`)
 *
 * # Returns
 * A string handle to the stored model (internally a `JsonString`).
 *
 * ```javascript
 * const model = pm.build_remaining_time_model(logHandle, 'concept:name', 'time:timestamp');
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function build_remaining_time_model(log_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.build_remaining_time_model(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Build a transition probability graph from an event log stored in state.
 *
 * Returns `{ edges: [{from, to, probability, count}], activities: string[] }`.
 *
 * ```javascript
 * const graph = JSON.parse(pm.build_transition_probabilities(logHandle, 'concept:name'));
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function build_transition_probabilities(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.build_transition_probabilities(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Calculate trace durations (difference between first and last event timestamps)
 * @param {string} eventlog_handle
 * @param {string} timestamp_key
 * @returns {any}
 */
export function calculate_trace_durations(eventlog_handle, timestamp_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.calculate_trace_durations(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Check data quality of an EventLog for common issues
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function check_data_quality(log_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.check_data_quality(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Check an EventLog against a DECLARE model.
 *
 * `declare_handle` — handle returned by `discover_declare` stored via
 * `store_declare_from_json`, or the raw result stored as a handle.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 100,
 *   "avg_fitness": 0.92,
 *   "constraints": [
 *     {"template":"Response","activities":["A","B"],
 *      "violations": 8, "fitness": 0.92}
 *   ]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} declare_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function check_declare_conformance(log_handle, declare_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(declare_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.check_declare_conformance(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Check DecisionGraph structural soundness (connectivity, acyclicity).
 *
 * Validates a DecisionGraph directly without Petri net conversion.
 * Returns JSON: `{ "sound": bool, "connectivity": {...}, "acyclicity": {...},
 *               "has_start_nodes": bool, "has_end_nodes": bool }`
 *
 * If the root node is not a DecisionGraph, returns `{ "sound": false }`.
 * @param {string} powl_string
 * @returns {string}
 */
export function check_dg_soundness(powl_string) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(powl_string, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.check_dg_soundness(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Check data quality of an OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function check_ocel_data_quality(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.check_ocel_data_quality(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Check soundness of a POWL model (van der Aalst criteria).
 *
 * Returns: `{ "sound": bool, "deadlock_free": bool, "bounded": bool, "liveness": bool }`
 * @param {string} powl_str
 * @returns {string}
 */
export function check_powl_soundness(powl_str) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(powl_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.check_powl_soundness(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Check a log against a temporal profile.
 *
 * Every directly-follows step in every trace is measured.  A step is flagged
 * as a deviation when `|duration - mean| > zeta * stdev`.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 10,
 *   "total_steps": 50,
 *   "deviations": 3,
 *   "fitness": 0.94,
 *   "details": [
 *     {"case_id":"Case1","from":"A","to":"B","duration_ms":9000000,
 *      "mean_ms":3600000,"stdev_ms":600000,"zeta":9.0,"deviation":true}
 *   ]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} profile_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {number} zeta
 * @returns {any}
 */
export function check_temporal_conformance(log_handle, profile_handle, activity_key, timestamp_key, zeta) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(profile_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.check_temporal_conformance(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, zeta);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Check conformance using token-based replay.
 *
 * Performs actual token replay on the Petri net:
 * 1. Start with initial marking
 * 2. For each event in trace, find matching visible transition
 * 3. Check if transition is enabled (all input places have sufficient tokens)
 * 4. Fire transition (consume from input, produce to output)
 * 5. After all events, check if final marking matches any final marking
 * 6. Track consumed/produced/missing/remaining tokens
 * @param {string} eventlog_handle
 * @param {string} petri_net_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function check_token_based_replay(eventlog_handle, petri_net_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.check_token_based_replay(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Clear all caches (parse, columnar, interner).
 */
export function clear_all_caches() {
    wasm.clear_all_caches();
}

export function clear_all_objects() {
    const ret = wasm.clear_all_objects();
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Process Clustering - group similar traces using bitset-based k-means
 * Time complexity: O(T×K) where T = traces, K = clusters (vs O(T×K×A) for string-based)
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} num_clusters
 * @returns {any}
 */
export function cluster_traces(eventlog_handle, activity_key, num_clusters) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.cluster_traces(ptr0, len0, ptr1, len1, num_clusters);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute activity transition matrix (Markov chain).
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function compute_activity_transition_matrix(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_activity_transition_matrix(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Legacy function for backward compatibility: DFG-based alignment (greedy).
 * @param {string} log_handle
 * @param {string} dfg_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function compute_alignments(log_handle, dfg_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(dfg_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.compute_alignments(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute boundary coverage for a prefix against an event log.
 *
 * Returns `{ coverage: number, matching_traces: number, normal_completions: number }`.
 * Coverage is the fraction of matching completions that are "normal" (within 2 sigma of median length).
 * @param {string} log_handle
 * @param {string} prefix_json
 * @param {string} activity_key
 * @returns {any}
 */
export function compute_boundary_coverage(log_handle, prefix_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.compute_boundary_coverage(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute exponential weighted moving average (EWMA) with trend classification.
 * values and classify the overall trend.
 *
 * `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
 * `alpha` — smoothing factor in (0, 1]; higher = more weight on recent values.
 *
 * Returns a JS object:
 * ```json
 * {
 *   "smoothed": [1.0, 1.3, 1.96],
 *   "trend": "rising",
 *   "last_value": 1.96
 * }
 * ```
 * @param {string} values_json
 * @param {number} alpha
 * @returns {any}
 */
export function compute_ewma(values_json, alpha) {
    const ptr0 = passStringToWasm0(values_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_ewma(ptr0, len0, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute permutation importance for each activity in a prefix.
 *
 * For each position in the prefix, remove that activity and measure the
 * change in prediction confidence (top-1 probability). Activities whose
 * removal causes the largest drop are most important.
 *
 * ```javascript
 * const result = JSON.parse(pm.compute_feature_importance(model_handle, JSON.stringify(["A","B","C"]), 3));
 * // { baseline: 0.85, importances: [{activity: "B", position: 1, delta: -0.3}, ...] }
 * ```
 * @param {string} model_handle
 * @param {string} prefix_json
 * @param {number} ngram_order
 * @returns {any}
 */
export function compute_feature_importance(model_handle, prefix_json, ngram_order) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_feature_importance(ptr0, len0, ptr1, len1, ngram_order);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get process model complexity metrics
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function compute_model_metrics(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_model_metrics(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute optimal alignments for all traces in a log against a Petri Net using A*.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 10,
 *   "avg_cost": 0.5,
 *   "alignments": [
 *     {
 *       "case_id": "Case1",
 *       "cost": 0.0,
 *       "sync_moves": 5,
 *       "log_moves": 0,
 *       "model_moves": 0,
 *       "path": ["sync:A", "sync:B", "model:C"]
 *     }
 *   ]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} petri_net_handle
 * @param {string} activity_key
 * @param {string} cost_config_json
 * @returns {any}
 */
export function compute_optimal_alignments(log_handle, petri_net_handle, activity_key, cost_config_json) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(cost_config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.compute_optimal_alignments(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute rework metrics for a trace (JSON string array).
 *
 * Returns `{ rework_count, rework_ratio, repeated_pairs }` where:
 * - `rework_count` — number of consecutive repeated activities
 * - `rework_ratio` — rework_count / max(trace.len() - 1, 1)
 * - `repeated_pairs` — list of `"A→A"` strings for each repeated pair
 *
 * ```javascript
 * const rework = JSON.parse(pm.compute_rework_score(
 *     JSON.stringify(["A", "B", "B", "C", "C", "C"])
 * ));
 * // { rework_count: 3, rework_ratio: 0.6, repeated_pairs: ["B→B", "C→C", "C→C"] }
 * ```
 * @param {string} trace_json
 * @returns {any}
 */
export function compute_rework_score(trace_json) {
    const ptr0 = passStringToWasm0(trace_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_rework_score(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score the likelihood of a trace according to an n-gram predictor model.
 *
 * Returns `{ log_likelihood: number, normalized: number }`.
 * `log_likelihood` is the raw sum of log-probabilities; `normalized` divides by the number of steps.
 *
 * Unlike `score_trace_likelihood` in the base prediction module (which returns a plain float),
 * this returns a structured object with both raw and normalised values.
 * @param {string} model_handle
 * @param {string} trace_json
 * @returns {any}
 */
export function compute_trace_likelihood(model_handle, trace_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(trace_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_trace_likelihood(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute pairwise trace similarity matrix.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function compute_trace_similarity_matrix(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_trace_similarity_matrix(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Clear all cached entries.
 * @param {string} handle
 * @returns {any}
 */
export function conformance_cache_clear(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.conformance_cache_clear(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Look up a cached conformance result.
 *
 * Returns JSON `{ fitness, precision, generalization, trace_count }` on hit,
 * or `null` on miss.
 * @param {string} handle
 * @param {string} log_handle
 * @param {bigint} model_hash
 * @returns {any}
 */
export function conformance_cache_get(handle, log_handle, model_hash) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.conformance_cache_get(ptr0, len0, ptr1, len1, model_hash);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Hash a DFG model for use as a cache key.
 * @param {string} dfg_json
 * @returns {any}
 */
export function conformance_cache_hash_model(dfg_json) {
    const ptr0 = passStringToWasm0(dfg_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.conformance_cache_hash_model(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Insert a conformance result into the cache.
 * @param {string} handle
 * @param {string} log_handle
 * @param {bigint} model_hash
 * @param {number} fitness
 * @param {number} precision
 * @param {number} generalization
 * @param {number} trace_count
 * @returns {any}
 */
export function conformance_cache_insert(handle, log_handle, model_hash, fitness, precision, generalization, trace_count) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.conformance_cache_insert(ptr0, len0, ptr1, len1, model_hash, fitness, precision, generalization, trace_count);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Create a new conformance cache.
 * @returns {string}
 */
export function conformance_cache_new() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.conformance_cache_new();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get cache statistics: `{ hits, misses, entries }`.
 * @param {string} handle
 * @returns {any}
 */
export function conformance_cache_stats(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.conformance_cache_stats(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get conformance checking info
 * @returns {string}
 */
export function conformance_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.conformance_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Create an RlState directly from 8 field values.
 *
 * # Arguments
 *
 * * `health_level` - 0-4 (5 states: Normal, Warning, Degraded, Critical, Failed)
 * * `event_rate_q` - 0-7 (quantized event rate)
 * * `activity_count_q` - 0-7 (quantized activity count)
 * * `spc_alert_level` - 0-3 (SPC alert level)
 * * `drift_status` - 0-2 (drift detection status)
 * * `rework_ratio_q` - 0-7 (quantized rework ratio)
 * * `circuit_state` - 0-2 (circuit breaker state)
 * * `cycle_phase` - 0-3 (autonomic cycle phase)
 *
 * # Returns
 *
 * * `RlState` - WASM-exported state object
 * @param {number} health_level
 * @param {number} event_rate_q
 * @param {number} activity_count_q
 * @param {number} spc_alert_level
 * @param {number} drift_status
 * @param {number} rework_ratio_q
 * @param {number} circuit_state
 * @param {number} cycle_phase
 * @returns {RlState}
 */
export function create_rl_state(health_level, event_rate_q, activity_count_q, spc_alert_level, drift_status, rework_ratio_q, circuit_state, cycle_phase) {
    const ret = wasm.create_rl_state(health_level, event_rate_q, activity_count_q, spc_alert_level, drift_status, rework_ratio_q, circuit_state, cycle_phase);
    return RlState.__wrap(ret);
}

/**
 * Create a new StreamingLog instance and return its handle.
 *
 * The handle is used to reference the instance in subsequent calls.
 * Call `free_streaming_log` to release the instance.
 * @returns {number}
 */
export function create_streaming_log() {
    const ret = wasm.create_streaming_log();
    return ret >>> 0;
}

/**
 * JS-accessible functions for state management
 * @param {string} id
 * @returns {boolean}
 */
export function delete_object(id) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.delete_object(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Detect bottlenecks - activities with high duration or long waiting times
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {bigint} duration_threshold_seconds
 * @returns {any}
 */
export function detect_bottlenecks(eventlog_handle, activity_key, timestamp_key, duration_threshold_seconds) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.detect_bottlenecks(ptr0, len0, ptr1, len1, ptr2, len2, duration_threshold_seconds);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Concept Drift Detection - identify where process behavior changes
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} window_size
 * @returns {any}
 */
export function detect_concept_drift(eventlog_handle, activity_key, window_size) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_concept_drift(ptr0, len0, ptr1, len1, window_size);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Detect concept drift over event log using windowed Jaccard distance.
 *
 * Slides a window of `window_size` traces across the log and computes the
 * Jaccard distance between the activity sets of consecutive windows.  A drift
 * point is recorded whenever the distance exceeds 0.3.
 *
 * Returns a JS object:
 * ```json
 * {
 *   "drifts_detected": 2,
 *   "drifts": [
 *     { "position": 10, "distance": 0.45, "type": "concept_drift" }
 *   ],
 *   "window_size": 5,
 *   "method": "jaccard_window"
 * }
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} window_size
 * @returns {any}
 */
export function detect_drift(log_handle, activity_key, window_size) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_drift(ptr0, len0, ptr1, len1, window_size);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Detect rework patterns (activities that are repeated in same trace)
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function detect_rework(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_rework(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Diff two POWL models (structural + behavioral comparison).
 *
 * Returns: `{ "severity": "...", "always_changes": [...], "order_changes": [...], "structure_changes": [...] }`
 * @param {string} model_a_str
 * @param {string} model_b_str
 * @returns {string}
 */
export function diff_models(model_a_str, model_b_str) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(model_a_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(model_b_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.diff_models(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Ant Colony Optimization for process model discovery
 * Uses pheromone trails and heuristic information to construct process models
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} ant_count
 * @param {number} iterations
 * @returns {any}
 */
export function discover_aco_algorithm(eventlog_handle, activity_key, ant_count, iterations) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_aco_algorithm(ptr0, len0, ptr1, len1, ant_count, iterations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * STUB: Frequency-filtered DFG wrapped as Petri net. Alpha++ not implemented.
 * TODO: footprint matrix, causality relation, length-1/2 loop handling
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} min_support
 * @returns {any}
 */
export function discover_alpha_plus_plus(eventlog_handle, activity_key, min_support) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_alpha_plus_plus(ptr0, len0, ptr1, len1, min_support);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Ant Colony Optimization - pheromone-based model discovery
 * Layer 6b: Edge-set representation with integer-keyed pheromone map
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} num_ants
 * @param {number} iterations
 * @returns {any}
 */
export function discover_ant_colony(eventlog_handle, activity_key, num_ants, iterations) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ant_colony(ptr0, len0, ptr1, len1, num_ants, iterations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * A* Search-based process discovery - informed heuristic search
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} max_iterations
 * @returns {any}
 */
export function discover_astar(eventlog_handle, activity_key, max_iterations) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_astar(ptr0, len0, ptr1, len1, max_iterations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Detect batch processing patterns in an event log.
 *
 * Identifies sequential, concurrent, parallel, and disruptive batch patterns
 * based on temporal overlap of activity executions across cases.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog
 * * `activity_key` - Attribute key for activity names (e.g. "concept:name")
 * * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function discover_batches_wasm(eventlog_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_batches_wasm(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover causal relations using the alpha miner variant.
 *
 * Ports `pm4py.algo.discovery.causal.variants.alpha.apply()`.
 *
 * A relation (A, B) is causal if:
 * - A directly follows B in the log (frequency > 0)
 * - B never directly follows A (either absent or frequency = 0)
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_causal_alpha(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_causal_alpha(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover causal relations using the heuristic variant.
 *
 * Ports `pm4py.algo.discovery.causal.variants.heuristic.apply()`.
 *
 * The heuristic variant uses a threshold-based approach:
 * - Relation (A, B) is causal if its frequency is significantly higher
 *   than the reverse frequency (B, A).
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} threshold
 * @returns {any}
 */
export function discover_causal_heuristic(eventlog_handle, activity_key, threshold) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_causal_heuristic(ptr0, len0, ptr1, len1, threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG from events without case IDs using temporal correlation.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to an EventLog stored in the WASM state.
 * * `activity_key` - Attribute key for activity names (e.g. `"concept:name"`).
 * * `timestamp_key` - Attribute key for timestamps (e.g. `"time:timestamp"`).
 * * `threshold` - Correlation threshold in seconds (default: 86400).
 *
 * # Returns
 *
 * A `CorrelationResult` serialised as a JS object containing edges,
 * start/end activities, and estimated trace count.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {number} threshold
 * @returns {any}
 */
export function discover_correlation(eventlog_handle, activity_key, timestamp_key, threshold) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_correlation(ptr0, len0, ptr1, len1, ptr2, len2, threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover DECLARE constraints from an EventLog
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_declare(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_declare(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a Directly-Follows Graph (DFG) from an EventLog
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_dfg(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover DFG with frequency filtering
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} min_frequency
 * @returns {any}
 */
export function discover_dfg_filtered(eventlog_handle, activity_key, min_frequency) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_filtered(ptr0, len0, ptr1, len1, min_frequency);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG and store it in WASM state, returning a handle string.
 *
 * Identical to `discover_dfg` but stores the result internally so that
 * handle-based functions (e.g. `score_anomaly`) can reference it.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_dfg_handle(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_handle(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG using hierarchical chunking.
 *
 * Splits the event log into `num_chunks` independent partitions, discovers a
 * partial DFG for each, then merges the results.  The output is identical to
 * `discover_dfg` for any `num_chunks >= 1`.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} num_chunks
 * @returns {any}
 */
export function discover_dfg_hierarchical(eventlog_handle, activity_key, num_chunks) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_hierarchical(ptr0, len0, ptr1, len1, num_chunks);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG hierarchically with an event-budget per chunk.
 *
 * Each chunk is limited to at most `max_chunk_events` events.  The number of
 * chunks is determined automatically from the log size.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} max_chunk_events
 * @returns {any}
 */
export function discover_dfg_hierarchical_by_events(eventlog_handle, activity_key, max_chunk_events) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_hierarchical_by_events(ptr0, len0, ptr1, len1, max_chunk_events);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG using the SIMD-accelerated streaming algorithm.
 *
 * Produces identical results to `discover_dfg` but uses WASM SIMD intrinsics
 * for node-frequency accumulation and loop-unrolled edge counting.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 *
 * # Returns
 *
 * JSON `DirectlyFollowsGraph` with nodes, edges, start_activities, end_activities.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_dfg_simd(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_simd(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a DFG using SIMD streaming and store it in WASM state.
 *
 * Returns a handle string that can be used with other handle-based functions.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_dfg_simd_handle(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_dfg_simd_handle(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Genetic Algorithm for process model discovery
 * Evolves a population of edge sets to find models that fit the log well
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} population_size
 * @param {number} generations
 * @returns {any}
 */
export function discover_genetic_algorithm(eventlog_handle, activity_key, population_size, generations) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_genetic_algorithm(ptr0, len0, ptr1, len1, population_size, generations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a handover-of-work social network.
 *
 * `resource_key` — event attribute holding the resource/originator
 *   (typically `"org:resource"` in XES).
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Alice","label":"Alice","workload":42}],
 *   "edges": [{"from":"Alice","to":"Bob","handovers":12}]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} resource_key
 * @returns {any}
 */
export function discover_handover_network(log_handle, resource_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_handover_network(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Heuristic Miner - discovers process models from real-world logs
 * More lenient than Alpha++ for handling noise and incomplete data
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} dependency_threshold
 * @returns {any}
 */
export function discover_heuristic_miner(eventlog_handle, activity_key, dependency_threshold) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_heuristic_miner(ptr0, len0, ptr1, len1, dependency_threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Hill Climbing - greedy local optimization
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_hill_climbing(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_hill_climbing(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Frequency-aware Petri net discovery with noise filtering.
 * Filters directly-follows relations to include only edges that occur ≥ 2 times,
 * reducing overfitting to rare behaviors while maintaining high fitness on core process.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ilp_petri_net(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ilp_petri_net(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Inductive Miner - recursive structure discovery via cuts
 * Implements IM-basic (no noise filtering, all directly-follows preserved)
 * Returns ProcessTree via XOR/Sequence/Parallel/Loop cuts
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_inductive_miner(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_inductive_miner(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_classify(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_classify(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_forecast(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_forecast(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_pca(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_pca(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_regress(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_regress(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover Object-Centric Petri Nets from OCEL
 *
 * For each object type in the OCEL:
 * 1. Flatten OCEL to single-type EventLog
 * 2. Discover Petri Net using specified algorithm
 * 3. Tag places with object type
 * 4. Return per-type nets as JSON mapping
 *
 * Returns: JSON { "Order": { places, transitions, ... }, "Item": { ... } }
 * @param {string} ocel_handle
 * @param {string} algorithm
 * @returns {any}
 */
export function discover_oc_petri_net(ocel_handle, algorithm) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_oc_petri_net(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a Directly-Follows Graph (DFG) from an OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function discover_ocel_dfg(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ocel_dfg(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a Directly-Follows Graph (DFG) per object type from an OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function discover_ocel_dfg_per_type(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ocel_dfg_per_type(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover POWL model from OCEL event log
 *
 * # Arguments
 * * `ocel_json` - OCEL event log as JSON string
 * * `variant` - OCEL variant: "flattening" or "oc_powl"
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string, "ocel_variant": string }`
 * @param {string} ocel_json
 * @param {string} variant
 * @returns {any}
 */
export function discover_ocel_powl(ocel_json, variant) {
    const ptr0 = passStringToWasm0(ocel_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ocel_powl(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover optimal DFG using constraint satisfaction
 * Balances fitness and simplicity using weighted optimization
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} fitness_weight
 * @param {number} simplicity_weight
 * @returns {any}
 */
export function discover_optimized_dfg(eventlog_handle, activity_key, fitness_weight, simplicity_weight) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_optimized_dfg(ptr0, len0, ptr1, len1, fitness_weight, simplicity_weight);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a time-annotated DFG from an EventLog.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Register","label":"Register","frequency":100}],
 *   "edges": [{"from":"Register","to":"Approve","count":80,
 *              "mean_ms":3600000,"median_ms":3500000,"p95_ms":7200000}],
 *   "start_activities": {"Register": 100},
 *   "end_activities":   {"Close": 100}
 * }
 * ```
 * `timestamp_key` defaults to `"time:timestamp"` in most XES logs.
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function discover_performance_dfg(log_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_performance_dfg(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover the performance spectrum for a target activity.
 *
 * Measures time durations between each occurrence of `target_activity`
 * and the immediately following event.  Returns aggregate statistics
 * (min, max, mean, median, count) per `(target, next)` pair.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog
 * * `activity_key` - Attribute key for activity names (e.g. "concept:name")
 * * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
 * * `target_activity` - The activity to analyse
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {string} target_activity
 * @returns {any}
 */
export function discover_performance_spectrum_wasm(eventlog_handle, activity_key, timestamp_key, target_activity) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(target_activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.discover_performance_spectrum_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a POWL model from an event log.
 *
 * # Arguments
 * * `log_json` - Event log as JSON string (same format as pm4py)
 * * `variant` - Discovery variant: "decision_graph_cyclic" (default), "decision_graph_cyclic_strict",
 *               "decision_graph_max", "decision_graph_clustering", "dynamic_clustering",
 *               "maximal", or "tree"
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
 * @param {string} log_json
 * @param {string} variant
 * @returns {any}
 */
export function discover_powl_from_log(log_json, variant) {
    const ptr0 = passStringToWasm0(log_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_powl_from_log(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a POWL model from an event log with custom configuration.
 *
 * # Arguments
 * * `log_json` - Event log as JSON string
 * * `activity_key` - Key to use for activity extraction (default: "concept:name")
 * * `variant` - Discovery variant
 * * `min_trace_count` - Minimum number of traces for a cut (default: 1)
 * * `noise_threshold` - Noise threshold for fall-through (default: 0.0)
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
 * @param {string} log_json
 * @param {string} activity_key
 * @param {string} variant
 * @param {number} min_trace_count
 * @param {number} noise_threshold
 * @returns {any}
 */
export function discover_powl_from_log_config(log_json, activity_key, variant, min_trace_count, noise_threshold) {
    const ptr0 = passStringToWasm0(log_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_powl_from_log_config(ptr0, len0, ptr1, len1, ptr2, len2, min_trace_count, noise_threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover POWL model from partially ordered event log (lifecycle events)
 *
 * # Arguments
 * * `log_json` - Event log as JSON string with lifecycle:transition attribute
 * * `variant` - Discovery variant (same as discover_powl_from_log)
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string, "partial_order": true }`
 * @param {string} log_json
 * @param {string} variant
 * @returns {any}
 */
export function discover_powl_from_partial_orders(log_json, variant) {
    const ptr0 = passStringToWasm0(log_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_powl_from_partial_orders(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * WASM export: Discover a prefix tree from an event log.
 *
 * **Arguments:**
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 * * `max_path_length` - Optional maximum trace length (0 = no limit)
 *
 * **Returns:** JSON object with:
 * - `variants`: Number of unique trace variants
 * - `max_depth`: Maximum depth of the trie
 * - `tree`: The trie structure with nested nodes
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} max_path_length
 * @returns {any}
 */
export function discover_prefix_tree(eventlog_handle, activity_key, max_path_length) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_prefix_tree(ptr0, len0, ptr1, len1, max_path_length);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Particle Swarm Optimization for process discovery
 * Uses swarm intelligence to explore the model space
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} swarm_size
 * @param {number} iterations
 * @returns {any}
 */
export function discover_pso_algorithm(eventlog_handle, activity_key, swarm_size, iterations) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_pso_algorithm(ptr0, len0, ptr1, len1, swarm_size, iterations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a simple process tree from an event log using frequency-based
 * heuristics (flower model as a baseline — SEQ of all activities in
 * frequency order, with a top-level XOR for branching).
 *
 * Returns a JSON string representing the process tree.
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_simple_process_tree(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_simple_process_tree(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Simulated Annealing - thermal search for optimal models
 * Layer 6b: Edge-set representation with integer-based edge mutation
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} temperature
 * @param {number} cooling_rate
 * @returns {any}
 */
export function discover_simulated_annealing(eventlog_handle, activity_key, temperature, cooling_rate) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_simulated_annealing(ptr0, len0, ptr1, len1, temperature, cooling_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a temporal profile from an event log.
 *
 * Returns a handle to a `TemporalProfile` stored in global state.
 *
 * ```javascript
 * const profHandle = pm.discover_temporal_profile(logHandle, 'concept:name', 'time:timestamp');
 * const result = pm.check_temporal_conformance(logHandle, profHandle,
 *                  'concept:name', 'time:timestamp', 2.0);
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function discover_temporal_profile(log_handle, activity_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_temporal_profile(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * WASM export: discover a transition system from an event log handle.
 *
 * # Arguments
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `activity_key` - Key to extract activity name from event attributes (default: "concept:name")
 * * `window` - Size of the lookback window (default: 2)
 * * `direction` - "forward" (default) or "backward" direction
 *
 * # Returns
 * JSON object with:
 * - `states`: list of {id, name} state objects
 * - `transitions`: list of {from_state, to_state, activity, count} transition objects
 * - `initial_state`: ID of the initial state (or null)
 * - `final_states`: list of final state IDs
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} window
 * @param {string} direction
 * @returns {any}
 */
export function discover_transition_system_from_handle(eventlog_handle, activity_key, window, direction) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(direction, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.discover_transition_system_from_handle(ptr0, len0, ptr1, len1, window, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a working-together network.
 *
 * For every pair of resources (A, B) that appear in the same trace,
 * record the co-occurrence count.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Alice","label":"Alice"}],
 *   "edges": [{"from":"Alice","to":"Bob","co_occurrences":7}]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} resource_key
 * @returns {any}
 */
export function discover_working_together_network(log_handle, resource_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_working_together_network(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get discovery module info
 * @returns {any}
 */
export function discovery_info() {
    const ret = wasm.discovery_info();
    return ret;
}

/**
 * Convert bottleneck analysis results (as JSON string) to human-readable text
 * Expected JSON format:
 * {
 *   "bottlenecks": [
 *     {"activity": "Approve", "avg_duration_hours": 2.5, "delayed_cases": 85},
 *     {"activity": "Close", "avg_duration_hours": 1.2, "delayed_cases": 20},
 *     {"activity": "Register", "avg_duration_hours": 0.1, "delayed_cases": 0}
 *   ]
 * }
 * @param {string} result_json
 * @returns {string}
 */
export function encode_bottlenecks_as_text(result_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_bottlenecks_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert conformance check results (as JSON string) to human-readable text
 * Expected JSON format:
 * {
 *   "conforming_cases": 95,
 *   "non_conforming_cases": 5,
 *   "total_cases": 100,
 *   "average_fitness": 0.98
 * }
 * @param {string} result_json
 * @returns {string}
 */
export function encode_conformance_as_text(result_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_conformance_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a DirectlyFollowsGraph to human-readable English text
 * Describes activities, start/end activities, and edge paths with percentages
 * @param {string} dfg_handle
 * @returns {string}
 */
export function encode_dfg_as_text(dfg_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(dfg_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_dfg_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Compare two process models (DFGs or Petri Nets) and produce a text diff
 * Highlights differences in structure, edges, and frequencies
 * @param {string} model1_handle
 * @param {string} model2_handle
 * @returns {string}
 */
export function encode_model_comparison_as_text(model1_handle, model2_handle) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(model1_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(model2_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.encode_model_comparison_as_text(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Convert an Object-Centric Petri Net (stored as JSON) to text
 * The OC Petri Net is stored as a JsonString containing per-type Petri Net structures
 * @param {string} oc_petri_net_handle
 * @returns {string}
 */
export function encode_oc_petri_net_as_text(oc_petri_net_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(oc_petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_oc_petri_net_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert OCEL to a concise text summary for LLM consumption
 * Includes event types, object types, counts, and relationships
 * @param {string} ocel_handle
 * @returns {string}
 */
export function encode_ocel_as_text(ocel_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_ocel_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert OCEL (Object-Centric Event Log) to human-readable summary text
 * @param {string} ocel_handle
 * @returns {string}
 */
export function encode_ocel_summary_as_text(ocel_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_ocel_summary_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a Petri Net to human-readable text for LLM consumption
 * Includes places, transitions, arcs, and markings
 * @param {string} petri_net_handle
 * @returns {string}
 */
export function encode_petri_net_as_text(petri_net_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_petri_net_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert event log statistics to human-readable summary text
 * @param {string} log_handle
 * @returns {string}
 */
export function encode_statistics_as_text(log_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_statistics_as_text(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert top process variants to human-readable text
 * Lists the most common execution sequences with case counts and percentages
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} top_n
 * @returns {string}
 */
export function encode_variants_as_text(log_handle, activity_key, top_n) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.encode_variants_as_text(ptr0, len0, ptr1, len1, top_n);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Run ensemble discovery: discover DFG from log, compute self-fitness,
 * measure complexity metrics, and return a ranked quality assessment.
 *
 * This is a lightweight ensemble that evaluates the DFG model (which is
 * the universal representation all algorithms converge to) rather than
 * running N separate expensive algorithms.
 *
 * ```javascript
 * const result = JSON.parse(pm.ensemble_discover(handle, 'concept:name'));
 * // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function ensemble_discover(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ensemble_discover(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Estimate queue delay using the M/M/1 queueing model.
 *
 * Returns JSON: `{ wait_time: number, utilization: number, is_stable: boolean }`
 * @param {number} arrival_rate
 * @param {number} service_rate
 * @returns {any}
 */
export function estimate_queue_delay(arrival_rate, service_rate) {
    const ret = wasm.estimate_queue_delay(arrival_rate, service_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Export DFG to JSON
 * @param {string} handle
 * @returns {string}
 */
export function export_dfg_to_json(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_dfg_to_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Export EventLog to JSON string
 * @param {string} handle
 * @returns {string}
 */
export function export_eventlog_to_json(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_eventlog_to_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Export EventLog to XES format (generates valid XES XML)
 * @param {string} eventlog_handle
 * @returns {string}
 */
export function export_eventlog_to_xes(eventlog_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_eventlog_to_xes(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Export features as CSV string.
 *
 * Input: JSON array of feature vectors (from extract_case_features or extract_prefix_features)
 * Output: CSV string with headers and one row per feature vector
 * @param {string} features_json
 * @returns {string}
 */
export function export_features_csv(features_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(features_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_features_csv(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Extract features and export as JSON string.
 *
 * Convenience wrapper that calls extract_case_features internally
 * and returns the result as a JSON string (not JsValue).
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {string} config_json
 * @returns {string}
 */
export function export_features_json(log_handle, activity_key, timestamp_key, config_json) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.export_features_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * Export OCEL 2.0 to JSON string (pretty-printed)
 * Retrieves OCEL from state by handle, serializes to JSON string
 * @param {string} handle
 * @returns {string}
 */
export function export_ocel2_to_json(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_ocel2_to_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Export OCEL to JSON string
 * @param {string} handle
 * @returns {string}
 */
export function export_ocel_to_json(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_ocel_to_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Export PetriNet to JSON
 * @param {string} handle
 * @returns {string}
 */
export function export_petri_net_to_json(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.export_petri_net_to_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Extract mandatory activity ordering from event log.
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function extract_activity_ordering(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.extract_activity_ordering(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Extract feature vectors from event log traces for ML training.
 *
 * Config JSON structure:
 * ```json
 * {
 *   "features": ["trace_length", "elapsed_time", "activity_counts", "rework_count"],
 *   "target": "remaining_time"  // or "outcome", "next_activity"
 * }
 * ```
 *
 * Returns: JSON array of feature vectors (one per trace)
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {string} config_json
 * @returns {any}
 */
export function extract_case_features(log_handle, activity_key, timestamp_key, config_json) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.extract_case_features(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Extract feature vectors for each prefix of each trace.
 *
 * Generates one feature vector per prefix (up to prefix_length).
 * This is useful for "predict next activity" or "predict remaining time" tasks.
 *
 * Returns: JSON array with many more entries (one per prefix).
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {number} prefix_length
 * @returns {any}
 */
export function extract_prefix_features(log_handle, activity_key, timestamp_key, prefix_length) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.extract_prefix_features(ptr0, len0, ptr1, len1, ptr2, len2, prefix_length);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Extract numeric features from a trace prefix (JSON string array).
 *
 * Returns `{ length, last_activity, unique_activities, rework_count, activity_frequency_entropy }`.
 *
 * ```javascript
 * const features = JSON.parse(pm.extract_prefix_features_wasm(
 *     JSON.stringify(["Register", "Check", "Approve"])
 * ));
 * ```
 * @param {string} prefix_json
 * @returns {any}
 */
export function extract_prefix_features_wasm(prefix_json) {
    const ptr0 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.extract_prefix_features_wasm(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Process Skeleton - extract minimal model structure
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} min_frequency
 * @returns {any}
 */
export function extract_process_skeleton(eventlog_handle, activity_key, min_frequency) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.extract_process_skeleton(ptr0, len0, ptr1, len1, min_frequency);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function fast_discovery_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.fast_discovery_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Filter traces by case ID list.
 * @param {string} log_handle
 * @param {string} case_ids_json
 * @param {string} case_id_key
 * @returns {any}
 */
export function filter_by_case_ids(log_handle, case_ids_json, case_id_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_ids_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(case_id_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_case_ids(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by case duration in milliseconds.
 * @param {string} log_handle
 * @param {bigint} min_ms
 * @param {bigint} max_ms
 * @param {string} timestamp_key
 * @returns {any}
 */
export function filter_by_case_performance(log_handle, min_ms, max_ms, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_case_performance(ptr0, len0, min_ms, max_ms, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by event count range.
 * Pass 0 for `min_events` or `usize::MAX` equivalent (999999) for no bound.
 * @param {string} log_handle
 * @param {number} min_events
 * @param {number} max_events
 * @returns {any}
 */
export function filter_by_case_size(log_handle, min_events, max_events) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_case_size(ptr0, len0, min_events, max_events);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces containing specified directly-follows activity pairs.
 * `pairs_json` (JSON array of [from, to] arrays).
 *
 * ```javascript
 * const h2 = pm.filter_by_directly_follows(h,
 *   JSON.stringify([['Register','Approve']]), 'concept:name');
 * ```
 * @param {string} log_handle
 * @param {string} pairs_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_by_directly_follows(log_handle, pairs_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(pairs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_directly_follows(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces that end with one of the specified activities.
 * @param {string} log_handle
 * @param {string} activities_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_by_end_activity(log_handle, activities_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_end_activity(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces containing an event with specified attribute value.
 * @param {string} log_handle
 * @param {string} attribute_key
 * @param {string} attribute_value
 * @returns {any}
 */
export function filter_by_event_attribute_value(log_handle, attribute_key, attribute_value) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(attribute_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(attribute_value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_event_attribute_value(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces that start with one of the specified activities.
 *
 * ```javascript
 * const h2 = pm.filter_by_start_activity(h, JSON.stringify(['Register']));
 * ```
 * @param {string} log_handle
 * @param {string} activities_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_by_start_activity(log_handle, activities_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_start_activity(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by timestamp range.
 * Timestamps are ISO 8601 strings (e.g., "2023-01-01T00:00:00Z").
 * @param {string} log_handle
 * @param {string} min_dt
 * @param {string} max_dt
 * @param {string} timestamp_key
 * @returns {any}
 */
export function filter_by_time_range(log_handle, min_dt, max_dt, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(min_dt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(max_dt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_time_range(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by trace attribute value.
 * @param {string} log_handle
 * @param {string} attribute_key
 * @param {string} attribute_value
 * @returns {any}
 */
export function filter_by_trace_attribute(log_handle, attribute_key, attribute_value) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(attribute_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(attribute_value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_trace_attribute(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by top variants covering specified percentage of traces.
 * traces are covered.  E.g. `coverage_pct = 80` keeps the variants that together
 * account for ≥80 % of traces.
 * @param {string} log_handle
 * @param {number} coverage_pct
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_by_variant_coverage(log_handle, coverage_pct, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_variant_coverage(ptr0, len0, coverage_pct, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces by top-k most frequent variants.
 * @param {string} log_handle
 * @param {number} k
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_by_variants_top_k(log_handle, k, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.filter_by_variants_top_k(ptr0, len0, k, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter EventLog by activity (keep only traces containing the activity)
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {string} activity_name
 * @returns {any}
 */
export function filter_log_by_activity(eventlog_handle, activity_key, activity_name) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_log_by_activity(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter EventLog by trace length range
 * @param {string} eventlog_handle
 * @param {number} min_length
 * @param {number} max_length
 * @returns {any}
 */
export function filter_log_by_trace_length(eventlog_handle, min_length, max_length) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.filter_log_by_trace_length(ptr0, len0, min_length, max_length);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces containing rework (repeated activities).
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_rework_traces(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.filter_rework_traces(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces containing all specified activities.
 * @param {string} log_handle
 * @param {string} activities_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_traces_containing_activities(log_handle, activities_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_traces_containing_activities(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces ending with specified activity sequence.
 * @param {string} log_handle
 * @param {string} sequence_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_traces_ending_with_sequence(log_handle, sequence_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(sequence_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_traces_ending_with_sequence(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces excluding any of the specified activities.
 * @param {string} log_handle
 * @param {string} activities_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_traces_excluding_activities(log_handle, activities_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_traces_excluding_activities(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Filter traces starting with specified activity sequence.
 * @param {string} log_handle
 * @param {string} sequence_json
 * @param {string} activity_key
 * @returns {any}
 */
export function filter_traces_starting_with_sequence(log_handle, sequence_json, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(sequence_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.filter_traces_starting_with_sequence(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function final_analytics_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.final_analytics_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Flatten an OCEL to an EventLog by projecting onto a single object type
 *
 * For the given object_type:
 * - Each object of that type becomes a case (trace)
 * - Events referencing that object become the events in the trace
 * - Events are sorted by timestamp within each trace
 * - Stores the flattened EventLog in state and returns its handle
 * @param {string} ocel_handle
 * @param {string} object_type
 * @returns {string}
 */
export function flatten_ocel_to_eventlog(ocel_handle, object_type) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(object_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.flatten_ocel_to_eventlog(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Compute footprints-based conformance (fitness, precision, recall, F1).
 *
 * # Arguments
 * * `powl_str` - POWL model string
 * * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
 *
 * # Returns
 * JSON: `{ "fitness": f64, "precision": f64, "recall": f64, "f1": f64 }`
 * @param {string} powl_str
 * @param {string} log_json
 * @returns {string}
 */
export function footprints_conformance(powl_str, log_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(powl_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(log_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.footprints_conformance(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Free a StreamingLog instance and release its memory.
 * @param {number} handle
 */
export function free_streaming_log(handle) {
    const ret = wasm.free_streaming_log(handle);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Parse a PNML XML string and store the resulting PetriNet in the handle-based
 * state system.  Returns a handle string on success.
 * @param {string} pnml_string
 * @returns {any}
 */
export function from_pnml_wasm(pnml_string) {
    const ptr0 = passStringToWasm0(pnml_string, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.from_pnml_wasm(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute generalization quality metrics for a Petri net against an event log.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `petri_net_handle` - Handle to the stored PetriNet object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 *
 * # Returns
 *
 * JSON object with:
 * - `generalization`: f64 score in [0, 1]
 * - `num_places`: number of places
 * - `num_transitions`: number of transitions
 * - `num_visible_transitions`: number of visible (non-silent) transitions
 * - `num_arcs`: number of arcs
 * - `penalty`: sum of penalties applied
 * @param {string} eventlog_handle
 * @param {string} petri_net_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function generalization(eventlog_handle, petri_net_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.generalization(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Generate recommendations for a given event log.
 *
 * Inspects log characteristics and returns:
 * - Algorithm recommendations (which algorithms suit this log)
 * - Parameter adjustment suggestions
 * - Next steps guidance (conformance, optimization, etc.)
 * - Data preprocessing suggestions
 *
 * Returns: JSON with `algorithm`, `parameters`, `next_steps`, `preprocessing` arrays
 * @param {string} log_handle
 * @returns {any}
 */
export function generate_recommendations(log_handle) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generate_recommendations(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function genetic_discovery_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.genetic_discovery_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get unique activities from EventLog
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function get_activities(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.get_activities(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get activity frequencies
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function get_activity_frequencies(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.get_activity_frequencies(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get all attribute names used in the log
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function get_attribute_names(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_attribute_names(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get cache statistics as JSON string.
 * @returns {string}
 */
export function get_cache_stats() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_cache_stats();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get WASM module capabilities as JSON string.
 *
 * Returns version and feature flags indicating which algorithms
 * and capabilities are available in this build.
 * @returns {string}
 */
export function get_capabilities() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_capabilities();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get the complete capability registry of all pictl functions
 * @returns {any}
 */
export function get_capability_registry() {
    const ret = wasm.get_capability_registry();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get the children arena indices of a node.
 * @param {string} s
 * @param {number} arena_idx
 * @returns {any}
 */
export function get_children(s, arena_idx) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_children(ptr0, len0, arena_idx);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get current drift detection thresholds as JSON string.
 *
 * # Returns
 * JSON string with current threshold values: `{"low":0.3,"high":0.7}`
 *
 * # Example
 * ```javascript
 * const thresholds = JSON.parse(get_drift_thresholds());
 * console.log(thresholds.low, thresholds.high);
 * ```
 * @returns {string}
 */
export function get_drift_thresholds() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_drift_thresholds();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get total event count from EventLog
 * @param {string} eventlog_handle
 * @returns {number}
 */
export function get_event_count(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_event_count(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Get information about supported formats
 * @returns {string}
 */
export function get_io_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_io_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get the number of events in an OCEL
 * @param {string} ocel_handle
 * @returns {number}
 */
export function get_ocel_event_count(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_ocel_event_count(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Get the number of objects in an OCEL
 * @param {string} ocel_handle
 * @returns {number}
 */
export function get_ocel_object_count(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_ocel_object_count(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Get statistics about OCEL structure and content
 * @param {string} ocel_handle
 * @returns {any}
 */
export function get_ocel_type_statistics(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_ocel_type_statistics(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get trace count from EventLog
 * @param {string} eventlog_handle
 * @returns {number}
 */
export function get_trace_count(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_trace_count(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Get min and max trace lengths
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function get_trace_length_statistics(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_trace_length_statistics(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get trace lengths (number of events per trace)
 * @param {string} eventlog_handle
 * @returns {any}
 */
export function get_trace_lengths(eventlog_handle) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_trace_lengths(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function get_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Compute global feature importance across all traces in an event log.
 *
 * Aggregates permutation importance over all prefixes extracted from
 * completed traces. Returns average importance per activity.
 *
 * ```javascript
 * const result = JSON.parse(pm.global_feature_importance(model_handle, log_handle, 'concept:name', 3));
 * // { activities: [{activity: "B", mean_importance: 0.35, count: 50}, ...] }
 * ```
 * @param {string} model_handle
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} ngram_order
 * @returns {any}
 */
export function global_feature_importance(model_handle, log_handle, activity_key, ngram_order) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.global_feature_importance(ptr0, len0, ptr1, len1, ptr2, len2, ngram_order);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Identify resource bottlenecks: waiting times, processing times, queue sizes.
 *
 * Returns a JSON array of bottlenecks:
 * ```json
 * {
 *   "bottlenecks": [
 *     {
 *       "resource": "Alice",
 *       "avg_queue_size": 5.2,
 *       "avg_wait_time_hours": 2.5,
 *       "processing_time_hours": 0.5
 *     },
 *     { "resource": "Bob", ... }
 *   ]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} resource_key
 * @param {string} timestamp_key
 * @param {string} activity_key
 * @returns {any}
 */
export function identify_resource_bottlenecks(log_handle, resource_key, timestamp_key, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.identify_resource_bottlenecks(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function ilp_discovery_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.ilp_discovery_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get the current DFG snapshot as a JSON string.
 * @param {string} handle
 * @returns {string}
 */
export function incremental_dfg_snapshot(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.incremental_dfg_snapshot(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Get streaming DFG stats as JSON: `{"total_events":N,"unique_activities":N,"unique_edges":N}`.
 * @param {string} handle
 * @returns {string}
 */
export function incremental_dfg_stats(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.incremental_dfg_stats(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Infer schema from EventLog by analyzing attribute patterns
 * @param {string} log_handle
 * @returns {any}
 */
export function infer_eventlog_schema(log_handle) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.infer_eventlog_schema(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Infer schema from OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function infer_ocel_schema(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.infer_ocel_schema(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Initialize the WASM module
 * @returns {string}
 */
export function init() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.init();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * List all unique object types in an OCEL
 * @param {string} ocel_handle
 * @returns {any}
 */
export function list_ocel_object_types(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.list_ocel_object_types(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Load an EventLog from JSON string
 * @param {string} content
 * @returns {string}
 */
export function load_eventlog_from_json(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_eventlog_from_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse basic XES format - simplified XML parser
 * XES is the standard eXtensible Event Stream format for process logs
 * @param {string} content
 * @returns {string}
 */
export function load_eventlog_from_xes(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_eventlog_from_xes(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse XES format with parse cache — skips re-parsing if content hash matches.
 *
 * Uses `crate::cache::hash_xes_content` to fingerprint the raw XES string and
 * `crate::cache::parse_cache_get` / `parse_cache_insert` to avoid redundant
 * XML parsing.  Falls back to the normal parse path on cache miss.
 * @param {string} content
 * @returns {string}
 */
export function load_eventlog_from_xes_cached(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_eventlog_from_xes_cached(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Load an OCEL 2.0 from JSON string
 * Parses JSON into OCEL struct, stores in AppState, returns handle
 * @param {string} content
 * @returns {string}
 */
export function load_ocel2_from_json(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_ocel2_from_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Load an OCEL from JSON string
 * @param {string} content
 * @returns {string}
 */
export function load_ocel_from_json(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_ocel_from_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Load an OCEL from XML string using roxmltree parser
 * Supports OCEL-XML structure with events, objects, and typed attributes
 * @param {string} content
 * @returns {string}
 */
export function load_ocel_from_xml(content) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_ocel_from_xml(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

export function main() {
    wasm.main();
}

/**
 * Measure complexity metrics for a POWL model.
 *
 * Returns: `{ "cyclomatic": u32, "cfc": f64, "cognitive": f64, "halstead": { ... } }`
 * @param {string} s
 * @returns {string}
 */
export function measure_complexity(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.measure_complexity(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Sequential Pattern Mining - find frequent activity sequences
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} min_support
 * @param {number} pattern_length
 * @returns {any}
 */
export function mine_sequential_patterns(eventlog_handle, activity_key, min_support, pattern_length) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.mine_sequential_patterns(ptr0, len0, ptr1, len1, min_support, pattern_length);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} log_handle
 * @param {string} _powl_handle
 * @param {string} _root_id
 * @param {string} config_json
 * @returns {any}
 */
export function monte_carlo_simulation(log_handle, _powl_handle, _root_id, config_json) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_powl_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(_root_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.monte_carlo_simulation(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {string}
 */
export function more_discovery_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.more_discovery_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Create a new streaming DFG, store it in global state, and return its handle.
 * @returns {string}
 */
export function new_streaming_dfg() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.new_streaming_dfg();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Get detailed JSON info about a node.
 * @param {string} s
 * @param {number} arena_idx
 * @returns {string}
 */
export function node_info_json(s, arena_idx) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.node_info_json(ptr0, len0, arena_idx);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Get the string representation of a specific node in the arena.
 * @param {string} s
 * @param {number} arena_idx
 * @returns {string}
 */
export function node_to_string(s, arena_idx) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.node_to_string(ptr0, len0, arena_idx);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {number}
 */
export function object_count() {
    const ret = wasm.object_count();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Check conformance of OCEL against an OC Petri Net.
 *
 * For each object type:
 * 1. Flatten OCEL → EventLog
 * 2. Discover reference Petri Net
 * 3. Token-replay each trace
 * 4. Compute fitness (fraction of perfectly-fitting traces)
 *
 * Returns: JSON `{ "Order": { "fitness": 0.95, … }, "Item": { … }, "overall": { … } }`
 * @param {string} ocel_handle
 * @returns {any}
 */
export function oc_conformance_check(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.oc_conformance_check(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get information about OC conformance checking.
 * @returns {any}
 */
export function oc_conformance_info() {
    const ret = wasm.oc_conformance_info();
    return ret;
}

/**
 * Compute per-object-type aggregate performance metrics from an OCEL.
 *
 * Simpler than `analyze_oc_performance` — returns only min / max / mean /
 * median of all inter-event durations per object type.
 *
 * Returns: JSON `{ "Order": { "min_ms": …, "max_ms": …, … }, "Item": { … } }`
 * @param {string} ocel_handle
 * @returns {any}
 */
export function oc_performance_analysis(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.oc_performance_analysis(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Module info for capability registry.
 * @returns {any}
 */
export function oc_performance_info() {
    const ret = wasm.oc_performance_info();
    return ret;
}

/**
 * Get information about OC Petri Net discovery
 * @returns {any}
 */
export function oc_petri_net_info() {
    const ret = wasm.oc_petri_net_info();
    return ret;
}

/**
 * Check whether parallel execution is available.
 *
 * Returns `true` on native targets and `false` on WASM (single-threaded).
 * @returns {boolean}
 */
export function parallel_available() {
    const ret = wasm.parallel_available();
    return ret !== 0;
}

/**
 * Discover a DFG using batch-sequential computation. Returns JSON string.
 *
 * Works on all targets (native and WASM) with identical output.
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {string}
 */
export function parallel_discover_dfg(log_handle, activity_key) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.parallel_discover_dfg(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Run multiple algorithms in parallel. Returns JSON array of results.
 *
 * `algo_json` should be a JSON array of algorithm name strings, e.g.:
 * `["dfg", "alpha_plus_plus", "heuristic_miner"]`
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} algo_json
 * @returns {string}
 */
export function parallel_run_algorithms(log_handle, activity_key, algo_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(algo_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.parallel_run_algorithms(ptr0, len0, ptr1, len1, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Parse a POWL model string.
 *
 * # Arguments
 * * `s` - POWL model string, e.g. `"X (A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
 *
 * # Returns
 * JSON: `{ "root": u32, "node_count": usize, "repr": "..." }`
 * @param {string} s
 * @returns {any}
 */
export function parse_powl(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parse_powl(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} petri_net_handle
 * @param {string} config_json
 * @returns {any}
 */
export function petri_net_playout(petri_net_handle, config_json) {
    const ptr0 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.petri_net_playout(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Convert a Petri Net (JSON) to a POWL model.
 *
 * Input JSON format (same as `powl_to_petri_net` output):
 * ```json
 * { "net": { "places": [...], "transitions": [...], "arcs": [...] }, "initial_marking": {...}, "final_marking": {...} }
 * ```
 *
 * Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
 * @param {string} pn_json
 * @returns {any}
 */
export function petri_net_to_powl(pn_json) {
    const ptr0 = passStringToWasm0(pn_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.petri_net_to_powl(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Feed one event to the pipeline.
 * @param {string} handle
 * @param {string} case_id
 * @param {string} activity
 * @returns {any}
 */
export function pipeline_add_event(handle, case_id, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline_add_event(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming pipeline session.
 *
 * `config_json` is a JSON object with boolean fields:
 * - `include_dfg` (default: true)
 * - `include_skeleton` (default: true)
 * - `include_heuristic` (default: true)
 * @param {string} config_json
 * @returns {string}
 */
export function pipeline_begin(config_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pipeline_begin(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Close a trace in the pipeline.
 * @param {string} handle
 * @param {string} case_id
 * @returns {any}
 */
export function pipeline_close_trace(handle, case_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline_close_trace(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Finalize all open traces and return final models.
 * @param {string} handle
 * @returns {any}
 */
export function pipeline_finalize(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline_finalize(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get combined snapshot from all active algorithms.
 * @param {string} handle
 * @returns {any}
 */
export function pipeline_snapshot(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline_snapshot(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get pipeline statistics.
 * @param {string} handle
 * @returns {any}
 */
export function pipeline_stats(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline_stats(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Play out a DFG (Directly-Follows Graph) and return an event log handle.
 *
 * The DFG is provided as a JSON string with the shape:
 * ```json
 * {
 *   "nodes": [{ "id": "A", "label": "A", "frequency": 10 }],
 *   "edges": [{ "from": "A", "to": "B", "frequency": 8 }],
 *   "start_activities": { "A": 10 },
 *   "end_activities": { "C": 6 }
 * }
 * ```
 *
 * ```javascript
 * const result = JSON.parse(pm.play_out_dfg(dfgJson, JSON.stringify({ num_traces: 50 })));
 * // { handle: "obj_43", trace_count: 50, event_count: 180 }
 * ```
 * @param {string} dfg_json
 * @param {any} params
 * @returns {any}
 */
export function play_out_dfg(dfg_json, params) {
    const ptr0 = passStringToWasm0(dfg_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.play_out_dfg(ptr0, len0, params);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Play out a process tree and return an event log handle.
 *
 * ```javascript
 * const params = { num_traces: 50, include_timestamps: true };
 * const result = JSON.parse(pm.play_out_process_tree(treeJson, 0, JSON.stringify(params)));
 * // { handle: "obj_42", trace_count: 50, event_count: 230 }
 * ```
 * @param {string} tree_json
 * @param {number} _root_node_idx
 * @param {any} params
 * @returns {any}
 */
export function play_out_process_tree(tree_json, _root_node_idx, params) {
    const ptr0 = passStringToWasm0(tree_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.play_out_process_tree(ptr0, len0, _root_node_idx, params);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return JSON statistics about a `.pm4bin` file without fully parsing it.
 *
 * Reads only the header (first 128 bytes) and returns:
 * ```json
 * {
 *   "version": 1,
 *   "num_traces": 10,
 *   "num_events": 100,
 *   "vocab_count": 5,
 *   "has_timestamps": true,
 *   "has_attributes": false,
 *   "file_size": 1024
 * }
 * ```
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function pm4bin_info(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pm4bin_info(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} powl_model_str
 * @param {string} _root_id
 * @param {string} config_json
 * @returns {any}
 */
export function powl_extensive_playout(powl_model_str, _root_id, config_json) {
    const ptr0 = passStringToWasm0(powl_model_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_root_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.powl_extensive_playout(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute footprints (behavioral profiles) for a POWL model.
 *
 * Returns: `{ "start_activities": [...], "end_activities": [...], "parallel": [...], "sequence": [...] }`
 * @param {string} s
 * @returns {string}
 */
export function powl_footprints(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_footprints(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a POWL model to BPMN 2.0 XML.
 * @param {string} s
 * @returns {string}
 */
export function powl_to_bpmn(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_bpmn(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a POWL model to a Petri Net (JSON).
 * @param {string} s
 * @returns {string}
 */
export function powl_to_petri_net(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_petri_net(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a POWL model to a Process Tree (JSON).
 * @param {string} s
 * @returns {string}
 */
export function powl_to_process_tree(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_process_tree(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert a POWL model string to its canonical string representation.
 * @param {string} s
 * @returns {string}
 */
export function powl_to_string(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_string(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Render a POWL model as SVG.
 *
 * # Arguments
 * * `s` - POWL model string, e.g. `"X(A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
 *
 * # Returns
 * SVG string with colored operator nodes and activity labels
 * @param {string} s
 * @returns {string}
 */
export function powl_to_svg(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_svg(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Beam-search future paths from a case prefix.
 *
 * `model_handle` — handle returned by `build_ngram_predictor`.
 * `prefix_json`  — JSON array of activity name strings.
 * `beam_width`   — number of beams (candidate paths) to keep at each step.
 * `max_steps`    — maximum number of future activities to predict.
 *
 * Returns a JSON array of paths:
 * ```json
 * [
 *   { "sequence": ["C","D","E"], "probability": 0.42, "length": 3 },
 *   { "sequence": ["C","F"],     "probability": 0.18, "length": 2 }
 * ]
 * ```
 * Paths are sorted descending by probability.
 * @param {string} model_handle
 * @param {string} prefix_json
 * @param {number} beam_width
 * @param {number} max_steps
 * @returns {any}
 */
export function predict_beam_paths(model_handle, prefix_json, beam_width, max_steps) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_beam_paths(ptr0, len0, ptr1, len1, beam_width, max_steps);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Predict remaining time for a running case given its activity prefix.
 *
 * # Parameters
 * - `model_handle` — handle returned by `build_remaining_time_model`
 * - `prefix_json` — JSON array of activity strings, e.g. `'["Register","Check"]'`
 *
 * # Returns
 * JSON string:
 * ```json
 * {
 *   "remaining_ms": 54000.0,
 *   "confidence": 0.82,
 *   "method": "bucket(Check|2)"
 * }
 * ```
 *
 * Lookup strategy (most specific → least):
 * 1. Exact bucket match `(last_activity, prefix_length)`
 * 2. Same `last_activity`, any prefix length (weighted avg of matching buckets)
 * 3. Same `prefix_length`, any activity
 * 4. Global fallback
 * @param {string} model_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function predict_case_duration(model_handle, prefix_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_case_duration(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Estimate the hazard rate at a given elapsed time using the Weibull survival
 * model fitted to historical case durations.
 *
 * # Parameters
 * - `model_handle` — handle returned by `build_remaining_time_model`
 * - `elapsed_ms` — milliseconds elapsed since case start
 *
 * # Returns
 * JSON string:
 * ```json
 * {
 *   "hazard_rate": 0.00012,
 *   "survival_probability": 0.43,
 *   "cumulative_hazard": 0.844,
 *   "median_remaining_ms": 25000.0,
 *   "shape": 1.8,
 *   "scale": 120000.0
 * }
 * ```
 *
 * - `hazard_rate` h(t) = (k/λ)(t/λ)^{k-1} — instantaneous failure rate
 * - `survival_probability` S(t) = exp(-(t/λ)^k) — P(duration > t)
 * - `cumulative_hazard` H(t) = (t/λ)^k
 * - `median_remaining_ms` — estimated time until 50 % completion probability
 * @param {string} model_handle
 * @param {number} elapsed_ms
 * @returns {any}
 */
export function predict_hazard_rate(model_handle, elapsed_ms) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.predict_hazard_rate(ptr0, len0, elapsed_ms);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Predict the most likely next activities given a prefix sequence.
 *
 * `prefix_json` — JSON array of activity strings (recent history).
 *
 * Returns a JSON string:
 * ```json
 * [
 *   {"activity": "Approve", "probability": 0.75},
 *   {"activity": "Reject",  "probability": 0.25}
 * ]
 * ```
 * Sorted descending by probability.  Returns empty array if the prefix is
 * not in the model.
 * @param {string} predictor_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function predict_next_activity(predictor_handle, prefix_json) {
    const ptr0 = passStringToWasm0(predictor_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_next_activity(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return the top-k most likely next activities for a given prefix.
 *
 * `model_handle` — handle returned by `build_ngram_predictor`.
 * `prefix_json`  — JSON array of activity name strings, e.g. `["A","B"]`.
 * `k`            — how many candidates to return.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "activities":    ["C", "D"],
 *   "probabilities": [0.75, 0.25],
 *   "confidence":    0.75,
 *   "entropy":       0.56
 * }
 * ```
 * `confidence` is the probability of the top-1 prediction.
 * `entropy` is the normalised Shannon entropy of the distribution (0 = certain,
 * 1 = uniform).
 * @param {string} model_handle
 * @param {string} prefix_json
 * @param {number} k
 * @returns {any}
 */
export function predict_next_k(model_handle, prefix_json, k) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_next_k(ptr0, len0, ptr1, len1, k);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Convert a Process Tree (JSON) to a POWL model.
 *
 * Input JSON format (same as `powl_to_process_tree` output):
 * ```json
 * {"operator": "Xor", "children": [{"label": "A"}, {"label": "B"}]}
 * ```
 *
 * Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
 * @param {string} tree_json
 * @returns {any}
 */
export function process_tree_to_powl(tree_json) {
    const ptr0 = passStringToWasm0(tree_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.process_tree_to_powl(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Rank interventions using a greedy UCB-like heuristic.
 *
 * - `interventions_json` — JSON array: `[{ "name": "...", "utility": 0.8 }, ...]`
 * - `exploitation_weight` — 0–1: how much to favour highest utility
 *
 * Returns a JSON array of `{ name, score, rank }` sorted by descending score.
 * @param {string} interventions_json
 * @param {number} exploitation_weight
 * @returns {any}
 */
export function rank_interventions(interventions_json, exploitation_weight) {
    const ptr0 = passStringToWasm0(interventions_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.rank_interventions(ptr0, len0, exploitation_weight);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * WASM entry point: parse BPMN 2.0 XML and return a POWL model string.
 *
 * # Errors
 * Returns a JavaScript `Error` with a descriptive message on failure.
 * @param {string} bpmn_xml
 * @returns {string}
 */
export function read_bpmn(bpmn_xml) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(bpmn_xml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.read_bpmn(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Read a `.pm4bin` binary buffer and store the resulting `EventLog` in WASM
 * state. Returns the object handle.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function read_pm4bin(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.read_pm4bin(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Get information about the recommendations module.
 * @returns {any}
 */
export function recommendations_info() {
    const ret = wasm.recommendations_info();
    return ret;
}

/**
 * Reset drift detection thresholds to defaults (0.3, 0.7).
 * @returns {string}
 */
export function reset_drift_thresholds() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.reset_drift_thresholds();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Create an RlState from a feature slice and health level.
 *
 * This is the primary constructor used by the RL orchestrator.
 * It quantizes continuous feature values into discrete state dimensions.
 *
 * # Arguments
 *
 * * `features` - Slice of 8 f32 values (normalized to [0,1])
 * * `health_level` - 0-4 (explicit health score, not derived from features)
 * * `rework_ratio` - 0.0-1.0 (fraction of traces with repeated activities)
 *
 * # Returns
 *
 * * `RlState` - Quantized state object
 *
 * # Feature Mapping
 *
 * - `features[0]` → event_rate_q (event count / 10,000)
 * - `features[1]` → unused (trace count / 1,000)
 * - `features[2]` → activity_count_q (unique activities / 100)
 * - `features[3]` → unused (health_level / 4, overridden by param)
 * - `features[4]` → unused (special causes / 10)
 * - `features[5]` → spc_alert_level (special causes / 10)
 * - `features[6]` → drift_status (activity entropy)
 * - `features[7]` → circuit_state (circuit_allowed flag)
 * - `rework_ratio` → rework_ratio_q (0-7 quantized levels)
 * @param {Float32Array} features
 * @param {number} health_level
 * @param {number} rework_ratio
 * @returns {RlState}
 */
export function rl_state_from_features(features, health_level, rework_ratio) {
    const ptr0 = passArrayF32ToWasm0(features, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.rl_state_from_features(ptr0, len0, health_level, rework_ratio);
    return RlState.__wrap(ret);
}

/**
 * Get the health_level field from an RlState.
 *
 * # Arguments
 *
 * * `state` - Reference to RlState
 *
 * # Returns
 *
 * * `u8` - Health level (0-4)
 * @param {RlState} state
 * @returns {number}
 */
export function rl_state_health_level(state) {
    _assertClass(state, RlState);
    const ret = wasm.rl_state_health_level(state.__wbg_ptr);
    return ret;
}

/**
 * Score a trace for anomaly against a reference DFG model.
 *
 * Returns `{ score: number, is_anomalous: boolean, threshold: number }`.
 * Score is normalized 0-1 (>0.7 = anomalous).
 *
 * The raw anomaly cost from the DFG is mapped to [0,1] via `1 - exp(-raw/5)`.
 * @param {string} model_handle
 * @param {string} trace_json
 * @returns {any}
 */
export function score_anomaly(model_handle, trace_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(trace_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.score_anomaly(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score every trace in an event log against a reference DFG.
 *
 * Returns a JSON string:
 * ```json
 * [{"case_id": "Case1", "score": 0.0, "steps": 2},
 *  {"case_id": "Case2", "score": 10.0, "steps": 3}]
 * ```
 * Sorted descending by score (most anomalous first).
 * @param {string} log_handle
 * @param {string} dfg_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function score_log_anomalies(log_handle, dfg_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(dfg_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.score_log_anomalies(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score a single trace (given as a JSON array of activity strings) against a
 * reference DFG.
 *
 * ```javascript
 * const dfgJson   = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
 * const dfgHandle = pm.store_dfg_from_json(dfgJson);
 * const score = pm.score_trace_anomaly(dfgHandle,
 *                 JSON.stringify(['Register','Approve','Close']));
 * console.log(score); // 0.0 = perfectly normal
 * ```
 * @param {string} dfg_handle
 * @param {string} activities_json
 * @returns {any}
 */
export function score_trace_anomaly(dfg_handle, activities_json) {
    const ptr0 = passStringToWasm0(dfg_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.score_trace_anomaly(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score how likely a complete trace is according to the n-gram model.
 *
 * Returns log-probability (negative; higher = more likely).
 * Returns 0.0 for empty traces.
 * @param {string} predictor_handle
 * @param {string} activities_json
 * @returns {any}
 */
export function score_trace_likelihood(predictor_handle, activities_json) {
    const ptr0 = passStringToWasm0(predictor_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activities_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.score_trace_likelihood(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Select an intervention using the UCB1 multi-armed bandit algorithm.
 *
 * - `bandit_json` — JSON bandit state with `arms` and `total_pulls`
 * - `exploration_factor` — controls exploration vs exploitation (typically √2 ≈ 1.414)
 *
 * Returns JSON: `{ selected, arm_index, ucb_score, mean_reward, exploration_bonus }`
 * @param {string} bandit_json
 * @param {number} exploration_factor
 * @returns {any}
 */
export function select_intervention(bandit_json, exploration_factor) {
    const ptr0 = passStringToWasm0(bandit_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.select_intervention(ptr0, len0, exploration_factor);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Set drift detection thresholds for RL state feature quantization.
 *
 * # Arguments
 * * `low` - Low threshold (default: 0.3). Values below this are drift_status=0.
 * * `high` - High threshold (default: 0.7). Values at or above this are drift_status=2.
 *           Values in [low, high) are drift_status=1.
 *
 * # Returns
 * * `Ok(String)` - Success message with new thresholds
 * * `Err(JsValue)` - Error if thresholds are invalid
 *
 * # Example
 * ```javascript
 * // Set custom thresholds: 0.2 and 0.8
 * set_drift_thresholds(0.2, 0.8);
 * ```
 * @param {number} low
 * @param {number} high
 * @returns {string}
 */
export function set_drift_thresholds(low, high) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.set_drift_thresholds(low, high);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Get info about the SIMD streaming DFG implementation.
 * @returns {any}
 */
export function simd_streaming_dfg_info() {
    const ret = wasm.simd_streaming_dfg_info();
    return ret;
}

/**
 * SIMD-accelerated token replay for conformance checking.
 *
 * Discovers a DFG from the log, builds a SimdPetriNet, then replays
 * every trace and returns fitness / precision / per-case diagnostics.
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {string}
 */
export function simd_token_replay(log_handle, activity_key) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.simd_token_replay(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Simplify a POWL model using FrequentTransition frequency bounds.
 * @param {string} s
 * @returns {any}
 */
export function simplify_frequent_transitions(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.simplify_frequent_transitions(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Simplify a POWL model (XOR/LOOP merging, nested XOR flattening, SPO inlining).
 * @param {string} s
 * @returns {any}
 */
export function simplify_powl(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.simplify_powl(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get cache statistics as a JSON object: `{"hits":n,"misses":n,"evictions":n}`.
 * @param {string} handle
 * @returns {string}
 */
export function smart_engine_cache_stats(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.smart_engine_cache_stats(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Feed a metric value to the convergence monitor and check if should stop.
 * @param {string} handle
 * @param {number} metric
 * @returns {boolean}
 */
export function smart_engine_check_convergence(handle, metric) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_engine_check_convergence(ptr0, len0, metric);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Check if the convergence monitor has detected convergence.
 * @param {string} handle
 * @returns {boolean}
 */
export function smart_engine_converged(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_engine_converged(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Create a new SmartEngine instance and return its handle.
 * @returns {string}
 */
export function smart_engine_create() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.smart_engine_create();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Create a new SmartEngine instance with custom parameters.
 * @param {number} cache_capacity
 * @param {number} convergence_window
 * @param {number} convergence_threshold
 * @param {number} max_iterations
 * @returns {string}
 */
export function smart_engine_create_with_params(cache_capacity, convergence_window, convergence_threshold, max_iterations) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.smart_engine_create_with_params(cache_capacity, convergence_window, convergence_threshold, max_iterations);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Destroy a smart engine and free its resources.
 * @param {string} handle
 */
export function smart_engine_destroy(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_engine_destroy(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Reset all internal state of a smart engine.
 * @param {string} handle
 */
export function smart_engine_reset(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_engine_reset(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Run an algorithm via the smart engine.  Returns a JSON string result.
 *
 * `traces_json` is a JSON array of arrays of strings:
 * `[["a","b","c"], ["a","b","d"]]`
 * @param {string} handle
 * @param {string} algorithm
 * @param {string} traces_json
 * @returns {string}
 */
export function smart_engine_run(handle, algorithm, traces_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(traces_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.smart_engine_run(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * Store a DECLARE model from its JSON representation and return a handle.
 *
 * ```javascript
 * const declareJson = JSON.stringify(pm.discover_declare(logHandle, 'concept:name'));
 * const declareHandle = pm.store_declare_from_json(declareJson);
 * const result = pm.check_declare_conformance(logHandle, declareHandle, 'concept:name');
 * ```
 * @param {string} declare_json
 * @returns {any}
 */
export function store_declare_from_json(declare_json) {
    const ptr0 = passStringToWasm0(declare_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.store_declare_from_json(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Store a DFG from its JSON representation and return a handle.
 *
 * Use this to bridge the output of `discover_dfg` (which returns inline JSON)
 * into a stored object that `streaming_conformance_begin` and other
 * handle-based APIs can consume.
 *
 * ```javascript
 * const dfgJson = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
 * const dfgHandle = pm.store_dfg_from_json(dfgJson);
 * const session = pm.streaming_conformance_begin(dfgHandle);
 * ```
 * @param {string} dfg_json
 * @returns {any}
 */
export function store_dfg_from_json(dfg_json) {
    const ptr0 = passStringToWasm0(dfg_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.store_dfg_from_json(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Append one event to an in-progress trace.
 *
 * Returns a JSON string: `{"ok": true, "event_count": N, "open_traces": N}`.
 * @param {string} handle
 * @param {string} case_id
 * @param {string} activity
 * @returns {any}
 */
export function streaming_conformance_add_event(handle, case_id, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_add_event(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming conformance session against a reference DFG.
 *
 * `dfg_handle` — handle returned by `store_dfg_from_json` or
 * `streaming_dfg_finalize`.
 *
 * Returns an opaque session handle string.
 * @param {string} dfg_handle
 * @returns {any}
 */
export function streaming_conformance_begin(dfg_handle) {
    const ptr0 = passStringToWasm0(dfg_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_begin(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Close a trace: replay it against the reference DFG and return the result.
 *
 * Returns a JSON string with fields: `ok`, `case_id`, `is_conforming`,
 * `fitness`, `deviations`.
 * @param {string} handle
 * @param {string} case_id
 * @returns {any}
 */
export function streaming_conformance_close_trace(handle, case_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_close_trace(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Finalize the streaming conformance session.
 *
 * Flushes any still-open traces, returns a JSON summary string, and frees the
 * session handle.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_conformance_finalize(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_finalize(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Memory and progress statistics for an open streaming conformance session.
 *
 * Returns a JSON string with `event_count`, `closed_traces`, `open_traces`,
 * `conforming_traces`, `deviating_traces`, `avg_fitness`.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_conformance_stats(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_stats(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Add a batch of events in one call (chunked ingestion).
 * @param {string} handle
 * @param {string} events_json
 * @returns {any}
 */
export function streaming_dfg_add_batch(handle, events_json) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(events_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_add_batch(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Append one event to an in-progress DFG trace.
 * @param {string} handle
 * @param {string} case_id
 * @param {string} activity
 * @returns {any}
 */
export function streaming_dfg_add_event(handle, case_id, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_add_event(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming DFG session.
 * @returns {any}
 */
export function streaming_dfg_begin() {
    const ret = wasm.streaming_dfg_begin();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Close a DFG trace and fold into model.
 * @param {string} handle
 * @param {string} case_id
 * @returns {any}
 */
export function streaming_dfg_close_trace(handle, case_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_close_trace(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * End the current trace on the streaming DFG identified by `handle`.
 * @param {string} handle
 */
export function streaming_dfg_end_trace(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_end_trace(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Finalize the stream and return DFG handle.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_dfg_finalize(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_finalize(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Flush all currently-open DFG traces.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_dfg_flush_open(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_flush_open(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Process a single event on the streaming DFG identified by `handle`.
 *
 * `activity_id` is an integer activity identifier.
 * @param {string} handle
 * @param {number} activity_id
 */
export function streaming_dfg_process_event(handle, activity_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_process_event(ptr0, len0, activity_id);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Take a non-destructive DFG snapshot.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_dfg_snapshot(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_snapshot(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Report memory/progress statistics.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_dfg_stats(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_stats(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * End the current trace.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_dfg_string_end_trace(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_string_end_trace(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Process a single event by activity name (auto-interns strings).
 * @param {string} handle
 * @param {string} activity
 * @returns {any}
 */
export function streaming_dfg_string_event(handle, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_dfg_string_event(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Create a new string-based StreamingDFG, store it in global state, return handle.
 * @returns {string}
 */
export function streaming_dfg_string_new() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.streaming_dfg_string_new();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Get the current DFG snapshot as JSON (with human-readable activity labels).
 * @param {string} handle
 * @returns {string}
 */
export function streaming_dfg_string_snapshot(handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.streaming_dfg_string_snapshot(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Append one event to an in-progress Heuristic trace.
 * @param {string} handle
 * @param {string} case_id
 * @param {string} activity
 * @returns {any}
 */
export function streaming_heuristic_add_event(handle, case_id, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_heuristic_add_event(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming Heuristic Miner session.
 * @param {number} threshold
 * @returns {any}
 */
export function streaming_heuristic_begin(threshold) {
    const ret = wasm.streaming_heuristic_begin(threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Close a Heuristic trace.
 * @param {string} handle
 * @param {string} case_id
 * @returns {any}
 */
export function streaming_heuristic_close_trace(handle, case_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_heuristic_close_trace(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Finalize Heuristic stream.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_heuristic_finalize(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_heuristic_finalize(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Take a non-destructive Heuristic snapshot.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_heuristic_snapshot(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_heuristic_snapshot(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Streaming module info.
 * @returns {string}
 */
export function streaming_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.streaming_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Get the number of unique activities seen.
 * @param {number} handle
 * @returns {number}
 */
export function streaming_log_activity_count(handle) {
    const ret = wasm.streaming_log_activity_count(handle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Add a trace (array of activity strings) to the StreamingLog.
 *
 * # Arguments
 *
 * * `handle` - The handle returned by `create_streaming_log`
 * * `activities` - A JavaScript array of activity name strings
 * @param {number} handle
 * @param {any} activities
 */
export function streaming_log_add_trace(handle, activities) {
    const ret = wasm.streaming_log_add_trace(handle, activities);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Estimate the number of unique traces seen.
 * @param {number} handle
 * @returns {number}
 */
export function streaming_log_estimate_cardinality(handle) {
    const ret = wasm.streaming_log_estimate_cardinality(handle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Estimate the DFG from the StreamingLog and return it as a JSON string.
 *
 * Returns a `DirectlyFollowsGraph` serialized as JSON.
 * @param {number} handle
 * @returns {any}
 */
export function streaming_log_estimate_dfg(handle) {
    const ret = wasm.streaming_log_estimate_dfg(handle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get the total event count.
 * @param {number} handle
 * @returns {number}
 */
export function streaming_log_event_count(handle) {
    const ret = wasm.streaming_log_event_count(handle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Get the approximate memory usage in bytes.
 * @param {number} handle
 * @returns {number}
 */
export function streaming_log_memory_bytes(handle) {
    const ret = wasm.streaming_log_memory_bytes(handle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Append one event to an in-progress Skeleton trace.
 * @param {string} handle
 * @param {string} case_id
 * @param {string} activity
 * @returns {any}
 */
export function streaming_skeleton_add_event(handle, case_id, activity) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(activity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_skeleton_add_event(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming Skeleton session.
 * @param {number} min_frequency
 * @returns {any}
 */
export function streaming_skeleton_begin(min_frequency) {
    const ret = wasm.streaming_skeleton_begin(min_frequency);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Close a Skeleton trace.
 * @param {string} handle
 * @param {string} case_id
 * @returns {any}
 */
export function streaming_skeleton_close_trace(handle, case_id) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(case_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_skeleton_close_trace(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Finalize Skeleton stream.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_skeleton_finalize(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_skeleton_finalize(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Take a non-destructive Skeleton snapshot.
 * @param {string} handle
 * @returns {any}
 */
export function streaming_skeleton_snapshot(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_skeleton_snapshot(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Serialize a stored PetriNet (identified by handle) to PNML XML.
 * @param {string} petri_net_handle
 * @returns {any}
 */
export function to_pnml_wasm(petri_net_handle) {
    const ptr0 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.to_pnml_wasm(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute token replay fitness for a POWL model against an event log.
 *
 * # Arguments
 * * `powl_str` - POWL model string
 * * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
 *
 * # Returns
 * JSON fitness result.
 * @param {string} powl_str
 * @param {string} log_json
 * @returns {string}
 */
export function token_replay_fitness(powl_str, log_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(powl_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(log_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.token_replay_fitness(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Validate that EventLog has activity attribute
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {boolean}
 */
export function validate_has_activities(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_has_activities(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Validate that EventLog has timestamp attribute
 * @param {string} eventlog_handle
 * @param {string} timestamp_key
 * @returns {boolean}
 */
export function validate_has_timestamps(eventlog_handle, timestamp_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_has_timestamps(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Validate OCEL 2.0 structure
 * Checks:
 * - All events reference existing objects (referential integrity)
 * - All timestamps are valid ISO 8601
 * - Object relations: source_id and target_id reference existing objects (if present)
 * Returns a validation report as JSON: { valid: bool, errors: Vec<String> }
 * @param {string} handle
 * @returns {any}
 */
export function validate_ocel(handle) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validate_ocel(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate that all StrictPartialOrder nodes have irreflexive, transitive order.
 * @param {string} s
 * @returns {any}
 */
export function validate_partial_orders(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validate_partial_orders(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Convert a process tree JSON into a simplified flat representation
 * (for JS consumption — the full tree as a JSON string).
 *
 * Input JSON follows the same schema as `node_to_json` output.
 * Validates the structure and returns it back as a pretty-printed JSON string.
 *
 * ```javascript
 * const treeJson = JSON.stringify({
 *   type: "operator", operator: "SEQ",
 *   children: [
 *     { type: "activity", label: "A" },
 *     { type: "activity", label: "B" }
 *   ]
 * });
 * const result = pm.validate_process_tree(treeJson);
 * ```
 * @param {string} tree_json
 * @returns {any}
 */
export function validate_process_tree(tree_json) {
    const ptr0 = passStringToWasm0(tree_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validate_process_tree(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute ETConformance precision for a stored EventLog and PetriNet.
 *
 * Takes two handles (event log and Petri net), plus an activity key, and
 * returns a JSON `PrecisionResult`.
 * @param {string} eventlog_handle
 * @param {string} petri_net_handle
 * @param {string} activity_key
 * @returns {string}
 */
export function wasm_compute_precision(eventlog_handle, petri_net_handle, activity_key) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasm_compute_precision(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {number} places
 * @param {number} transitions
 * @param {number} arcs
 * @returns {number}
 */
export function wasm_compute_simplicity(places, transitions, arcs) {
    const ret = wasm.wasm_compute_simplicity(places, transitions, arcs);
    return ret;
}

/**
 * Reduce a stored PetriNet in-place.
 *
 * Takes a PetriNet handle, applies all reduction rules, and returns
 * a JSON `ReductionResult` with before/after statistics.
 * @param {string} net_handle
 * @returns {string}
 */
export function wasm_reduce_petri_net(net_handle) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasm_reduce_petri_net(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse XES content and write it as a `.pm4bin` binary byte vector.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 * @param {string} xes_content
 * @returns {Uint8Array}
 */
export function write_pm4bin(xes_content) {
    const ptr0 = passStringToWasm0(xes_content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.write_pm4bin(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @returns {string}
 */
export function xes_format_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.xes_format_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
export function __wbg_Error_8c4e43fe74559d73(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
}
export function __wbg_Number_04624de7d0e8332d(arg0) {
    const ret = Number(arg0);
    return ret;
}
export function __wbg_String_8f0eb39a4a4c2f66(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_bigint_get_as_i64_8fcf4ce7f1ca72a2(arg0, arg1) {
    const v = arg1;
    const ret = typeof(v) === 'bigint' ? v : undefined;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}
export function __wbg___wbindgen_boolean_get_bbbb1c18aa2f5e25(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
}
export function __wbg___wbindgen_debug_string_0bc8482c6e3508ae(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_in_47fa6863be6f2f25(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
}
export function __wbg___wbindgen_is_bigint_31b12575b56f32fc(arg0) {
    const ret = typeof(arg0) === 'bigint';
    return ret;
}
export function __wbg___wbindgen_is_function_0095a73b8b156f76(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
}
export function __wbg___wbindgen_is_null_ac34f5003991759a(arg0) {
    const ret = arg0 === null;
    return ret;
}
export function __wbg___wbindgen_is_object_5ae8e5880f2c1fbd(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
}
export function __wbg___wbindgen_is_string_cd444516edc5b180(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
}
export function __wbg___wbindgen_is_undefined_9e4d92534c42d778(arg0) {
    const ret = arg0 === undefined;
    return ret;
}
export function __wbg___wbindgen_jsval_eq_11888390b0186270(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
}
export function __wbg___wbindgen_jsval_loose_eq_9dd77d8cd6671811(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
}
export function __wbg___wbindgen_number_get_8ff4255516ccad3e(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}
export function __wbg___wbindgen_string_get_72fb696202c56729(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_throw_be289d5034ed271b(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbg_call_389efe28435a9388() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments); }
export function __wbg_done_57b39ecd9addfe81(arg0) {
    const ret = arg0.done;
    return ret;
}
export function __wbg_entries_58c7934c745daac7(arg0) {
    const ret = Object.entries(arg0);
    return ret;
}
export function __wbg_error_7534b8e9a36f1ab4(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
    } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
}
export function __wbg_get_9b94d73e6221f75c(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
}
export function __wbg_get_b3ed3ad4be2bc8ac() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments); }
export function __wbg_get_with_ref_key_1dc361bd10053bfe(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
}
export function __wbg_instanceof_ArrayBuffer_c367199e2fa2aa04(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Map_53af74335dec57f4(arg0) {
    let result;
    try {
        result = arg0 instanceof Map;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Uint8Array_9b9075935c74707c(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_isArray_d314bb98fcf08331(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
}
export function __wbg_isSafeInteger_bfbc7332a9768d2a(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
}
export function __wbg_iterator_6ff6560ca1568e55() {
    const ret = Symbol.iterator;
    return ret;
}
export function __wbg_length_32ed9a279acd054c(arg0) {
    const ret = arg0.length;
    return ret;
}
export function __wbg_length_35a7bace40f36eac(arg0) {
    const ret = arg0.length;
    return ret;
}
export function __wbg_new_361308b2356cecd0() {
    const ret = new Object();
    return ret;
}
export function __wbg_new_3eb36ae241fe6f44() {
    const ret = new Array();
    return ret;
}
export function __wbg_new_8a6f238a6ece86ea() {
    const ret = new Error();
    return ret;
}
export function __wbg_new_dca287b076112a51() {
    const ret = new Map();
    return ret;
}
export function __wbg_new_dd2b680c8bf6ae29(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
}
export function __wbg_next_3482f54c49e8af19() { return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
}, arguments); }
export function __wbg_next_418f80d8f5303233(arg0) {
    const ret = arg0.next;
    return ret;
}
export function __wbg_prototypesetcall_bdcdcc5842e4d77d(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
}
export function __wbg_set_1eb0999cf5d27fc8(arg0, arg1, arg2) {
    const ret = arg0.set(arg1, arg2);
    return ret;
}
export function __wbg_set_3f1d0b984ed272ed(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
}
export function __wbg_set_f43e577aea94465b(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
}
export function __wbg_stack_0ed75d68575b0f3c(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_value_0546255b415e96c1(arg0) {
    const ret = arg0.value;
    return ret;
}
export function __wbindgen_cast_0000000000000001(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return ret;
}
export function __wbindgen_cast_0000000000000002(arg0) {
    // Cast intrinsic for `I64 -> Externref`.
    const ret = arg0;
    return ret;
}
export function __wbindgen_cast_0000000000000003(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
}
export function __wbindgen_cast_0000000000000004(arg0) {
    // Cast intrinsic for `U64 -> Externref`.
    const ret = BigInt.asUintN(64, arg0);
    return ret;
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
const OperationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_operationresult_free(ptr >>> 0, 1));
const RlStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rlstate_free(ptr >>> 0, 1));
const WasmEventLogFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmeventlog_free(ptr >>> 0, 1));
const WasmOCELFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmocel_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
