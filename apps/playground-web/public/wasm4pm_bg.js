let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


let WASM_VECTOR_LEN = 0;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

const lTextEncoder = typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

let cachedTextEncoder = new lTextEncoder('utf-8');

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

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
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_4.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function isLikeNone(x) {
    return x === undefined || x === null;
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

let cachedFloat64ArrayMemory0 = null;

function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

export function main() {
    wasm.main();
}

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
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

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_4.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}
/**
 * Reset the RL orchestrator to fresh state.
 * @returns {string}
 */
export function rl_orchestrator_reset() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.rl_orchestrator_reset();
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
 * Get the currently active RL agent type (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE).
 * @returns {number}
 */
export function rl_orchestrator_active_agent() {
    const ret = wasm.rl_orchestrator_active_agent();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Get circuit breaker state as JSON.
 * @returns {string}
 */
export function circuit_breaker_get_state() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.circuit_breaker_get_state();
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
 * Set circuit breaker state from JSON.
 * @param {string} json
 * @returns {string}
 */
export function circuit_breaker_set_state(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.circuit_breaker_set_state(ptr0, len0);
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
 * Configure the circuit breaker from a JSON config string.
 * @param {string} config_json
 * @returns {string}
 */
export function circuit_breaker_configure(config_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.circuit_breaker_configure(ptr0, len0);
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
 * Get current circuit breaker configuration as JSON.
 * @returns {string}
 */
export function circuit_breaker_get_config() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.circuit_breaker_get_config();
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
 * Reset the persistent circuit breaker.
 * @returns {string}
 */
export function circuit_breaker_reset() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.circuit_breaker_reset();
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
 * Run the full agentic pipeline for a task: role selection → topology selection →
 * evidence sufficiency → escalation check → prompt binding compilation.
 *
 * Input: JSON-encoded `TaskContext`
 * Output: JSON-encoded `{ bindings: PromptBindingSet, evidence_sufficient: bool,
 *         should_escalate: bool, escalation_target: AgentRole|null,
 *         gaps: string[] }`
 * @param {string} task_json
 * @returns {string}
 */
export function run_agentic_pipeline(task_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(task_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.run_agentic_pipeline(ptr0, len0);
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
 * Validate a handoff request between two agents.
 *
 * Input: JSON-encoded `HandoffRequest`
 * Output: JSON-encoded `HandoffDecision`
 * @param {string} request_json
 * @returns {string}
 */
export function validate_agentic_handoff(request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate_agentic_handoff(ptr0, len0);
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
 * Evaluate counterfactual action options for a task using the RL reward model.
 *
 * Input: JSON-encoded `TaskContext`
 * Output: JSON-encoded `CounterfactualResult` — ranked action options with
 *         estimated rewards from the RL orchestrator.
 * @param {string} task_json
 * @returns {string}
 */
export function evaluate_agentic_counterfactuals(task_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(task_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.evaluate_agentic_counterfactuals(ptr0, len0);
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
 * Run a JTBD (Jobs-to-be-Done) test suite against the agentic framework.
 *
 * Accepts a JSON array of `JtbdCase` objects and returns a JSON array of
 * `JtbdResult` objects, each containing per-assertion pass/fail details.
 *
 * Input: JSON-encoded `JtbdCase[]`
 * Output: JSON-encoded `{ passed: number, failed: number, results: JtbdResult[] }`
 * @param {string} cases_json
 * @returns {string}
 */
export function run_agentic_jtbd_suite(cases_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(cases_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.run_agentic_jtbd_suite(ptr0, len0);
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
 * Switch the active RL agent by type index.
 * @param {number} agent_type
 * @returns {string}
 */
export function rl_orchestrator_switch_agent(agent_type) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.rl_orchestrator_switch_agent(agent_type);
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
 * Enable or disable LinUCB-based agent selection.
 * @param {boolean} enabled
 * @returns {string}
 */
export function rl_orchestrator_set_linucb(enabled) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.rl_orchestrator_set_linucb(enabled);
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
 * Get RL orchestrator telemetry as JSON.
 * @returns {string}
 */
export function rl_orchestrator_telemetry() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.rl_orchestrator_telemetry();
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
 * Get RL orchestrator telemetry as a JavaScript object.
 *
 * Returns the 5 critical telemetry fields as a JsValue:
 * - cycle_count: number of autonomic cycles executed
 * - last_health_state: system health level (0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
 * - cumulative_reward: total reward accumulated across all cycles
 * - last_reward: reward from the most recent cycle
 * - last_spc_alert_count: number of SPC special causes in the last cycle
 * @returns {any}
 */
export function rl_orchestrator_get_telemetry() {
    const ret = wasm.rl_orchestrator_get_telemetry();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Serialize current RL orchestrator state to JSON for persistence.
 *
 * Returns a JSON string containing telemetry, active agent, and LinUCB state.
 * This can be stored and later restored via `restore_rl_state` to resume
 * RL learning progress across CLI sessions.
 *
 * # Returns
 *
 * * `Ok(String)` - JSON-serialized RL state
 * * `Err(JsValue)` - Serialization error
 * @returns {string}
 */
export function serialize_rl_state() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.serialize_rl_state();
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
 * Restore RL orchestrator state from JSON.
 *
 * Deserializes a previously-saved RL state and restores telemetry,
 * active agent, Q-tables from all agents, and LinUCB configuration.
 *
 * # Arguments
 *
 * * `json` - JSON string previously returned by `serialize_rl_state`
 *
 * # Returns
 *
 * * `Ok(String)` - Success message with restored cycle count
 * * `Err(JsValue)` - Invalid JSON or malformed state
 * @param {string} json
 * @returns {string}
 */
export function restore_rl_state(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.restore_rl_state(ptr0, len0);
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
 * Get SPC history as JSON.
 * @returns {string}
 */
export function get_spc_history() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.get_spc_history();
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
 * Set SPC history from JSON.
 * @param {string} json
 * @returns {string}
 */
export function set_spc_history(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.set_spc_history(ptr0, len0);
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
 * @param {string} envelope_json
 * @returns {string}
 */
export function truex_verify_receipt(envelope_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(envelope_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.truex_verify_receipt(ptr0, len0);
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
 * @param {string} ocel_json
 * @param {string} query_str
 * @returns {string}
 */
export function evaluate_ocpq(ocel_json, query_str) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(ocel_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(query_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.evaluate_ocpq(ptr0, len0, ptr1, len1);
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
 * Get the wasm4pm crate version string.
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
 * Get WASM module capabilities as a JavaScript object.
 *
 * Returns version and feature flags indicating which algorithms
 * and capabilities are available in this build.
 * Shape: `{version: string, features: {discovery: bool, conformance: bool, ...}}`
 * @returns {any}
 */
export function get_capabilities() {
    const ret = wasm.get_capabilities();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
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
 * Clear all caches (parse, columnar, interner).
 */
export function clear_all_caches() {
    wasm.clear_all_caches();
}

/**
 * Get cache statistics as a JavaScript object.
 *
 * Returns `{parse_hits, parse_misses, columnar_entries, interner_entries}`.
 * @returns {any}
 */
export function get_cache_stats() {
    const ret = wasm.get_cache_stats();
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
 * SIMD-accelerated token replay for conformance checking.
 *
 * Discovers a DFG from the log, builds a SimdPetriNet, then replays
 * every trace and returns a JSON string with `overall_fitness`, `precision`,
 * and per-case diagnostics (each trace has a `fitness` field).
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
 * AutoProcess: Run the complete 4-layer autonomic control loop.
 *
 * Layers:
 * 1. **Perception** — Build ExecutionContext from event log metrics
 * 2. **Decision** — Evaluate guards + dispatch workflow pattern
 * 3. **Protection** — Circuit breaker + Statistical Process Control (SPC)
 * 4. **Optimization** — Reinforcement learning (Q-Learning) action selection
 *
 * Returns JSON with cycle_result (all 4 layers) and nanosecond timing.
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} _config_json
 * @returns {string}
 */
export function autonomic_execute_cycle(log_handle, activity_key, _config_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(_config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.autonomic_execute_cycle(ptr0, len0, ptr1, len1, ptr2, len2);
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
 * Discover the Alpha-style footprint matrix from an event log.
 *
 * Returns `{activities: string[], matrix: FootprintRelation[][]}`.
 * **`matrix[i][j]` is indexed by position**, not by activity name.
 * Use `activities.indexOf(name)` to map activity names to matrix indices.
 *
 * `FootprintRelation` values: `"Causal"` (i→j), `"CausalInv"` (j→i),
 * `"Parallel"` (both directions), `"NeverFollows"` (no succession).
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_footprints(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_footprints(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a Petri net using the Alpha++ algorithm.
 *
 * Implements Alpha++ (de Medeiros et al.) extending Alpha Miner with:
 *   - L1L set: activities `a` where `(a,a)` is in directly-follows (length-1 loops)
 *   - L2L set: activity pairs `(a,b)` where both `(a,b)` and `(b,a)` are in DF (length-2 loops)
 *   - Short-loop-aware footprint matrix: reclassifies Parallel relations from length-1/2 loops as Causal
 *   - Place candidates `(A,B)` where A×B ⊆ causal relation (maximal pairs only)
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `min_support` — Minimum frequency threshold `[0.0, 1.0]` for directly-follows edges.
 *   `0.0` = no filtering (include all edges). Use `0.0` for small logs to avoid empty models.
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * { "handle": "...", "places": 5, "transitions": 4, "arcs": 12 }
 * ```
 * Use the returned `handle` with `export_petri_net_to_json` or conformance functions.
 *
 * # Note
 * Alpha++ handles length-1 and length-2 loops correctly. For heavily noisy logs,
 * prefer `discover_heuristic_miner` which is more tolerant of noise.
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
 *  function for baseline admissibility: DFG-based alignment (greedy).
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
 * Return JSON { hits, misses, evictions, total_bytes } with cache statistics.
 *
 * # Returns
 * ```json
 * {
 *   "hits": 42,
 *   "misses": 8,
 *   "evictions": 2,
 *   "total_bytes": 65536,
 *   "parse_entries": 3,
 *   "columnar_entries": 5,
 *   "interner_entries": 1
 * }
 * ```
 * @returns {any}
 */
export function cache_stats() {
    const ret = wasm.cache_stats();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return BLAKE3 (FNV-1a) hex hash of XES content string.
 *
 * # Arguments
 * * `xes_content` — XES event log as string
 *
 * # Returns
 * 16-character lowercase hex string
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::hash_xes_content;
 * let hash = hash_xes_content("<log></log>");
 * assert_eq!(hash.len(), 16);
 * ```
 * @param {string} xes_content
 * @returns {string}
 */
export function hash_xes_content(xes_content) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(xes_content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hash_xes_content(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Compute Jaccard distance between two JSON-serialized activity sets.
 *
 * # Arguments
 * * `set1_json` — JSON string: `["A", "B", "C"]`
 * * `set2_json` — JSON string: `["B", "C", "D"]`
 *
 * # Returns
 * Distance in [0.0, 1.0]:
 * - `0.0` = identical or both empty
 * - `1.0` = completely disjoint
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::jaccard_distance;
 * let dist = jaccard_distance(r#"["A", "B"]"#, r#"["B", "C"]"#).unwrap();
 * assert!((dist - 0.6666666666666667).abs() < 1e-10);
 * ```
 * @param {string} set1_json
 * @param {string} set2_json
 * @returns {number}
 */
export function jaccard_distance(set1_json, set2_json) {
    const ptr0 = passStringToWasm0(set1_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(set2_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.jaccard_distance(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Compute exponential weighted moving average over a numeric series.
 *
 * # Arguments
 * * `values_json` — JSON string: `[1.0, 2.0, 3.0, ...]`
 * * `alpha` — Smoothing factor in (0.0, 1.0]; clamped if out of range
 *
 * # Returns
 * JSON string: `[1.0, 1.5, 2.25, ...]` (EWMA series)
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::ewma_series;
 * let smoothed = ewma_series(r#"[1.0, 2.0, 3.0, 4.0, 5.0]"#, 0.5).unwrap();
 * ```
 *
 * # Theory
 * `s[i] = α · x[i] + (1 - α) · s[i-1]` with `s[0] = x[0]`
 * @param {string} values_json
 * @param {number} alpha
 * @returns {any}
 */
export function ewma_series(values_json, alpha) {
    const ptr0 = passStringToWasm0(values_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ewma_series(ptr0, len0, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Identify activities with high variance (low frequency consistency).
 *
 * Scans the event log and flags activities where:
 * - Occurrence count per trace varies widely (variance > threshold)
 * - Activity is sparse or bursty
 *
 * # Arguments
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes()`
 * * `activity_key` — Activity attribute name (e.g., "concept:name")
 * * `threshold` — Variance threshold; activities with variance > threshold are returned
 *
 * # Returns
 * ```json
 * {
 *   "high_variance_activities": [
 *     {
 *       "activity": "Inspect",
 *       "variance": 2.45,
 *       "min_per_trace": 0,
 *       "max_per_trace": 5,
 *       "mean_per_trace": 1.2,
 *       "occurrence_count": 48
 *     }
 *   ],
 *   "total_activities": 15
 * }
 * ```
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @param {number} threshold
 * @returns {any}
 */
export function identify_high_variance_activities(eventlog_handle, activity_key, threshold) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.identify_high_variance_activities(ptr0, len0, ptr1, len1, threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * WASM export: convert a stored Petri-net handle into a POWL 2.0 model
 * (Section 4 of arXiv:2602.15739v3). Returns a JSON summary
 * `{ is_wf_net, converted, powl, repr, reason }` as a `JsValue` string.
 * @param {string} petri_net_handle
 * @returns {any}
 */
export function wf_net_to_powl(petri_net_handle) {
    const ptr0 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wf_net_to_powl(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * Accept raw bytes, auto-detect gzip (magic bytes 0x1f 0x8b), decompress if
 * needed, then delegate to the string-based `load_eventlog_from_xes` parser.
 *
 * This allows callers to pass either a plain `.xes` file or a `.xes.gz` file
 * without knowing ahead of time which format it is.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function load_eventlog_from_xes_gz(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_eventlog_from_xes_gz(ptr0, len0);
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
 * Load a POWL v1 model string and return a JSON object with handle, node_count, repr, version.
 * @param {string} powl_str
 * @returns {any}
 */
export function load_powl_from_string(powl_str) {
    const ptr0 = passStringToWasm0(powl_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_powl_from_string(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Load a POWL v2 DSL string and return a JSON object with handle, node_count, repr, version.
 * @param {string} dsl
 * @returns {any}
 */
export function load_powl_v2_from_string(dsl) {
    const ptr0 = passStringToWasm0(dsl, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_powl_v2_from_string(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Classify a `RequestMotion` JSON string through all five membrane layers and
 * return a `VerdictReceipt` JSON string.
 *
 * ## Arguments
 * - `motion_json` — JSON serialisation of a `RequestMotion`.
 *
 * ## Returns
 * JSON string (`VerdictReceipt`). JS callers must call `JSON.parse()`.
 *
 * ## Errors
 * Returns a structured error JSON if `motion_json` is not valid JSON or does
 * not conform to the `RequestMotion` schema.
 * @param {string} motion_json
 * @returns {any}
 */
export function classify_motion(motion_json) {
    const ptr0 = passStringToWasm0(motion_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.classify_motion(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Render a human-readable explanation of a `VerdictReceipt`.
 *
 * ## Arguments
 * - `verdict_json` — JSON serialisation of a `VerdictReceipt` (as returned by
 *   `classify_motion`).
 *
 * ## Returns
 * A plain-text string. JS callers receive a JSON-encoded string (via
 * `to_js_str`) and should call `JSON.parse()` then use the result directly.
 * @param {string} verdict_json
 * @returns {any}
 */
export function get_verdict_explanation(verdict_json) {
    const ptr0 = passStringToWasm0(verdict_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_verdict_explanation(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Build a `RequestMotion` from the last event of a stored event log trace.
 *
 * This function bridges the discovery/conformance plane and the membrane plane:
 * given a log handle and a trace index, it constructs a motion that represents
 * the most recent activity in the trace, extracting actor, action, timestamp,
 * and object scope from event attributes.
 *
 * ## Arguments
 * - `log_handle`   — Handle returned by `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * - `trace_index`  — Zero-based index into the log's trace list.
 * - `activity_key` — Attribute key for the activity name (XES: `concept:name`).
 * - `actor_key`    — Attribute key for the actor/resource (XES: `org:resource`).
 *
 * ## Returns
 * JSON string (`RequestMotion`). JS callers must call `JSON.parse()`.
 * @param {string} log_handle
 * @param {number} trace_index
 * @param {string} activity_key
 * @param {string} actor_key
 * @returns {any}
 */
export function build_motion_from_log_trace(log_handle, trace_index, activity_key, actor_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(actor_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.build_motion_from_log_trace(ptr0, len0, trace_index, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Classify a `RequestMotion` through all six membrane layers using optional
 * trained envelope handles.
 *
 * ## Arguments
 * - `motion_json`          — JSON serialisation of a `RequestMotion`.
 * - `envelope_handles_json`— JSON serialisation of an `EnvelopeHandles`; any
 *                            `null` field causes that layer to use the
 *                            stateless fallback evaluator.
 *
 * ## Returns
 * JSON string (`VerdictReceipt`). JS callers must call `JSON.parse()`.
 *
 * ## Errors
 * Returns a structured error JSON if either argument is invalid JSON.
 * @param {string} motion_json
 * @param {string} envelope_handles_json
 * @returns {any}
 */
export function classify_motion_with_envelopes(motion_json, envelope_handles_json) {
    const ptr0 = passStringToWasm0(motion_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(envelope_handles_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.classify_motion_with_envelopes(ptr0, len0, ptr1, len1);
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
 * Get information about OC Petri Net discovery
 * @returns {any}
 */
export function oc_petri_net_info() {
    const ret = wasm.oc_petri_net_info();
    return ret;
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
 * Measure information loss when flattening an OCEL to a case-centric event log.
 *
 * Returns a JSON object with a `flattening_loss` array — one entry per object type —
 * each containing the `FlatteningLossReport` fields plus a derived
 * `duplicate_event_ratio` (event_duplication_count / unique_ocel_events_referenced).
 * @param {string} ocel_handle
 * @returns {any}
 */
export function measure_ocel_flattening_loss(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.measure_ocel_flattening_loss(ptr0, len0);
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
 * Discover a simple process tree from an event log using frequency-based heuristics.
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

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
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
 * Train a Random Forest next-activity predictor from an event log.
 *
 * Returns a handle string pointing to the stored `RfPredictorSnapshot`.
 * Pass the handle to `predict_next_activity_rf` or `predict_next_activity_unified`.
 *
 * # Parameters
 * * `log_handle`    — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
 * * `activity_key`  — attribute key for activity names (e.g. `"concept:name"`)
 * * `timestamp_key` — attribute key for timestamps; pass `""` to disable temporal features
 * * `n_trees`       — number of decision trees (suggest 10–50 for WASM)
 * * `max_depth`     — maximum tree depth (suggest 5–10)
 *
 * # Errors
 * Returns `{error: "Need at least 5 traces for RF predictor"}` when the log
 * provides fewer than 5 training samples (prefix positions).
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} timestamp_key
 * @param {number} n_trees
 * @param {number} max_depth
 * @returns {any}
 */
export function build_rf_predictor(log_handle, activity_key, timestamp_key, n_trees, max_depth) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.build_rf_predictor(ptr0, len0, ptr1, len1, ptr2, len2, n_trees, max_depth);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Predict the most likely next activities given a prefix and an RF model handle.
 *
 * Returns a JSON string (same format as `predict_next_activity`):
 * ```json
 * [{"activity": "Approve", "probability": 1.0}]
 * ```
 *
 * # Notes
 * The RF model is re-fitted from stored training data on each call.  This is
 * intentional — `RandomForestModel` is not serialisable.  For latency-sensitive
 * workloads, cache the fitted model on the JS side.
 *
 * Probabilities are per-tree vote fractions: each tree votes for one class and the
 * fraction of trees voting for each class is returned as its probability.  Results
 * are sorted by probability descending so the top prediction is first in the array.
 * @param {string} model_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function predict_next_activity_rf(model_handle, prefix_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_next_activity_rf(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Unified dispatcher: routes to n-gram or RF predictor based on handle type.
 *
 * * If the handle holds an `NGramPredictor` → delegates to `predict_next_activity`
 * * If the handle holds a `JsonString` whose `type` field is `"rf_predictor"` →
 *   delegates to `predict_next_activity_rf`
 * * Otherwise returns an error
 *
 * This lets callers switch between models without changing call sites.
 * @param {string} model_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function predict_next_activity_unified(model_handle, prefix_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.predict_next_activity_unified(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Convert a DFG to human-readable English text
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
 * Train temporal statistics from a stored event log and return an opaque handle.
 *
 * # Parameters
 * * `log_handle`          — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
 * * `timestamp_key`       — event attribute for timestamps (`time:timestamp`)
 * * `freshness_window_ms` — how many milliseconds after the last training event a motion
 *                           timestamp is still considered fresh; typically 24h = 86_400_000
 *
 * # Errors
 * Returns a structured error JSON when fewer than 5 traces are present.
 * @param {string} log_handle
 * @param {string} timestamp_key
 * @param {number} freshness_window_ms
 * @returns {any}
 */
export function build_time_envelope(log_handle, timestamp_key, freshness_window_ms) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.build_time_envelope(ptr0, len0, ptr1, len1, freshness_window_ms);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score a candidate motion against the trained time envelope.
 *
 * # Parameters
 * * `envelope_handle` — handle returned by `build_time_envelope`
 * * `timestamp_ms`    — wall-clock time of the motion in milliseconds since Unix epoch
 *
 * # Returns
 * JSON string (`LayerVerdict`). JS callers must call `JSON.parse()`.
 * @param {string} envelope_handle
 * @param {number} timestamp_ms
 * @returns {any}
 */
export function score_time_motion(envelope_handle, timestamp_ms) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.score_time_motion(ptr0, len0, timestamp_ms);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return the full `TimeEnvelope` struct as a JSON string.
 *
 * # Parameters
 * * `envelope_handle` — handle returned by `build_time_envelope`
 * @param {string} envelope_handle
 * @returns {any}
 */
export function get_time_envelope_stats(envelope_handle) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_time_envelope_stats(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Train actor profiles from a stored event log and return an opaque handle.
 *
 * # Parameters
 * * `log_handle`    — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
 * * `activity_key`  — event attribute for the activity name (`concept:name`)
 * * `actor_key`     — event attribute for the actor/resource (`org:resource`)
 * * `timestamp_key` — event attribute for timestamps (`time:timestamp`);
 *                     pass `""` to skip hour-of-day learning
 *
 * # Errors
 * Returns a structured error JSON when fewer than 3 distinct actors are found.
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} actor_key
 * @param {string} timestamp_key
 * @returns {any}
 */
export function build_actor_envelope(log_handle, activity_key, actor_key, timestamp_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(actor_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.build_actor_envelope(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score a candidate motion against the trained actor envelope.
 *
 * # Parameters
 * * `envelope_handle`  — handle returned by `build_actor_envelope`
 * * `actor`            — actor identity string to look up
 * * `requested_action` — action the actor is attempting
 * * `hour_of_day`      — hour in [0, 23]; pass 255 to skip hour scoring
 *
 * # Returns
 * JSON string with verdict, scores, and rationale.
 * @param {string} envelope_handle
 * @param {string} actor
 * @param {string} requested_action
 * @param {number} hour_of_day
 * @returns {any}
 */
export function score_actor_motion(envelope_handle, actor, requested_action, hour_of_day) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(actor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(requested_action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.score_actor_motion(ptr0, len0, ptr1, len1, ptr2, len2, hour_of_day);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return all trained actor profiles from the envelope as a JSON array.
 *
 * Useful for the AutoML inspector UX to display who is in the envelope and
 * what their behavioural baseline looks like.
 * @param {string} envelope_handle
 * @returns {any}
 */
export function get_actor_profiles(envelope_handle) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_actor_profiles(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a process model using A* informed search.
 *
 * Iteratively expands DFG edge candidates using a fitness-minus-penalty heuristic.
 * Returns `{handle, algorithm, nodes, edges, iterations_used: usize}`.
 *
 * **IMPORTANT:** The `iterations_used` field in the result is a search step count,
 * **not a fitness score**. Do not interpret it as model quality.
 *
 * # Parameters
 * * `max_iterations` — Maximum A* expansion steps. Use 500–2000 for real logs.
 *   Higher values allow more thorough search but take longer.
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
 * @param {string} envelope_json
 * @returns {string}
 */
export function register_model(envelope_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(envelope_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.register_model(ptr0, len0);
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
 * @param {string} model_id
 * @returns {string}
 */
export function get_model(model_id) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(model_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.get_model(ptr0, len0);
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
 * Discover a process tree using the Inductive Miner algorithm.
 *
 * Guarantees a **sound** process model (no deadlocks, always-terminates). The output
 * is a recursive process tree rather than a DFG or Petri net.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute to use as activity label (e.g. `"concept:name"`).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * {
 *   "algorithm": "inductive_miner",
 *   "root": { "node_type": "sequence" | "xor" | "parallel" | "loop" | "leaf", "label": "...", "children": [...] },
 *   "nodes": 7
 * }
 * ```
 *
 * # Note
 * Activities are sorted deterministically before splitting. The tree structure is always
 * deterministic for the same input log. Use this instead of `discover_dfg` when you need
 * soundness guarantees.
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
 * Learn trace variants from a stored event log and return an opaque handle.
 *
 * Variants are sorted by count descending and pruned to those whose cumulative
 * frequency reaches `coverage_threshold` of all traces.
 *
 * # Parameters
 * * `log_handle`          — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
 * * `activity_key`        — event attribute for activity names (`concept:name`)
 * * `coverage_threshold`  — fraction [0.0, 1.0] of traces the kept variants must cover;
 *                           pass `0.0` to use the default of `0.8`
 *
 * # Errors
 * Returns a structured error JSON when the log has fewer than `MIN_TRACES` (5) traces.
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} coverage_threshold
 * @returns {any}
 */
export function build_route_envelope(log_handle, activity_key, coverage_threshold) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.build_route_envelope(ptr0, len0, ptr1, len1, coverage_threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score a trace prefix against the known route families.
 *
 * # Parameters
 * * `envelope_handle` — handle returned by `build_route_envelope`
 * * `prefix_json`     — JSON array of activity strings, e.g. `["Register","Approve"]`
 *
 * # Returns
 * JSON string with verdict, match rate, and candidate continuations.
 * @param {string} envelope_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function score_route_motion(envelope_handle, prefix_json) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.score_route_motion(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return all stored variants as a JSON array, sorted by frequency descending.
 *
 * Each element has `{activities, count, frequency}`.
 * @param {string} envelope_handle
 * @returns {any}
 */
export function get_route_variants(envelope_handle) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_route_variants(ptr0, len0);
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
 * Discover a working-together network.
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
 * Compute network centrality metrics (degree, betweenness, closeness).
 *
 * Returns JSON with keys: `degree`, `betweenness`, `closeness`, all as maps
 * from resource ID to centrality score (0-1).
 * @param {string} log_handle
 * @param {string} resource_key
 * @returns {any}
 */
export function compute_network_metrics(log_handle, resource_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_network_metrics(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute clustering coefficient (local and global).
 * @param {string} log_handle
 * @param {string} resource_key
 * @returns {any}
 */
export function compute_clustering_coefficient(log_handle, resource_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_clustering_coefficient(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Detect communities in the network using Louvain algorithm.
 * @param {string} log_handle
 * @param {string} resource_key
 * @returns {any}
 */
export function detect_communities(log_handle, resource_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_communities(ptr0, len0, ptr1, len1);
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
 * Take a non-destructive Heuristic snapshot.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
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
 * Take a non-destructive DFG snapshot.
 *
 * Returns a JSON string (not a JS object) — callers must `JSON.parse()` the result.
 * This uses `serde_json::to_string` + `JsValue::from_str` to avoid the known
 * `serde_wasm_bindgen::to_value` bug that silently returns `{}` on wasm32 for
 * `serde_json::Value` payloads.
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
 * Report memory/progress statistics.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
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
 * Take a non-destructive Skeleton snapshot.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
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
 * Train an AutoML classification model from a stored event log.
 *
 * Extracts 5 process-mining features per trace, labels the bottom 15% by
 * variant frequency as anomalous (1.0), and runs miniml's `auto_fit_classification`
 * to select the best algorithm. Returns an opaque handle.
 *
 * ## Arguments
 * - `log_handle`   — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
 * - `activity_key` — event attribute for activity names (`concept:name`)
 *
 * ## Errors
 * Returns structured error JSON when fewer than `MIN_TRACES` (10) traces are present.
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function build_automl_envelope(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.build_automl_envelope(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Score a motion feature vector against a trained AutoML envelope.
 *
 * ## Arguments
 * - `envelope_handle`       — handle returned by `build_automl_envelope`
 * - `motion_features_json`  — JSON object whose keys match `feature_names`;
 *                             missing keys default to `0.0`
 *
 * ## Returns
 * JSON string:
 * ```json
 * {
 *   "verdict": "allow" | "warn" | "escalate" | "quarantine",
 *   "confidence": 0.0,
 *   "drift_score": 0.0,
 *   "model_algorithm": "...",
 *   "model_score": 0.0,
 *   "feature_values": [...],
 *   "validity_status": "..."
 * }
 * ```
 *
 * Thresholds: model anomaly score > 0.9 → "escalate"; > 0.7 → "warn"; else "allow".
 * A quarantined envelope always returns `verdict: "quarantine"`.
 * @param {string} envelope_handle
 * @param {string} motion_features_json
 * @returns {any}
 */
export function score_motion_automl(envelope_handle, motion_features_json) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(motion_features_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.score_motion_automl(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return the full `AutomlEnvelopeModel` metadata as a JSON string, plus a
 * human-readable `"summary"` field suitable for display in the AutoML inspector UX.
 *
 * ## Arguments
 * - `envelope_handle` — handle returned by `build_automl_envelope`
 *
 * ## Returns
 * JSON string containing every field of `AutomlEnvelopeModel` plus:
 * ```json
 * { "summary": "Algorithm: <alg>, Score: <pct>%, Samples: <n>, Status: <status>" }
 * ```
 * @param {string} envelope_handle
 * @returns {any}
 */
export function inspect_automl_envelope(envelope_handle) {
    const ptr0 = passStringToWasm0(envelope_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.inspect_automl_envelope(ptr0, len0);
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
 * Get information about the recommendations module.
 * @returns {any}
 */
export function recommendations_info() {
    const ret = wasm.recommendations_info();
    return ret;
}

/**
 * Run a single benchmark trace JSON through the AutoMembrane and return a
 * `BenchmarkResult` JSON string.
 *
 * ## Arguments
 * - `trace_json` — JSON serialisation of a `BenchmarkTrace`.
 *
 * ## Returns
 * JSON string (`BenchmarkResult`). JS callers must call `JSON.parse()`.
 * @param {string} trace_json
 * @returns {any}
 */
export function run_benchmark_trace(trace_json) {
    const ptr0 = passStringToWasm0(trace_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.run_benchmark_trace(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return the eight built-in benchmark traces as a JSON array string.
 *
 * ## Returns
 * JSON string (array of `BenchmarkTrace`). JS callers must call `JSON.parse()`.
 * @returns {any}
 */
export function get_builtin_benchmarks() {
    const ret = wasm.get_builtin_benchmarks();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Run all eight built-in benchmark traces and return an aggregate result JSON string.
 *
 * ## Returns
 * JSON string (`AllBenchmarksResult`). JS callers must call `JSON.parse()`.
 * @returns {any}
 */
export function run_all_benchmarks() {
    const ret = wasm.run_all_benchmarks();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Detect concept drift over an event log using a sliding-window Jaccard
 * distance over the per-window activity vocabulary.
 *
 * A drift point is recorded whenever the Jaccard distance between the
 * activity sets of two consecutive windows exceeds
 * [`DEFAULT_DRIFT_THRESHOLD`].
 *
 * # Parameters
 *
 * * `log_handle` — handle of an `EventLog` previously stored via
 *   `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — event-attribute key holding the activity name
 *   (commonly `"concept:name"`).
 * * `window_size` — number of traces per window. Must be `>= 1`; a value of
 *   `0` is silently treated as `1`.
 *
 * # Returns
 *
 * A JSON-serialised JS string of the form:
 *
 * ```json
 * {
 *   "drifts_detected": 2,
 *   "drifts": [
 *     { "position": 10, "distance": 0.45, "type": "concept_drift" }
 *   ],
 *   "window_size": 5,
 *   "method": "jaccard_window",
 *   "threshold": 0.3
 * }
 * ```
 *
 * # Errors
 *
 * Returns a `JsValue` error if the handle is missing or refers to a
 * non-`EventLog` object.
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
 * Compute an exponentially weighted moving average (EWMA) over a JSON
 * numeric series, plus a coarse trend classification.
 *
 * # Parameters
 *
 * * `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
 * * `alpha` — smoothing factor; clamped into `(0.0, 1.0]`. Higher values
 *   weight recent samples more heavily.
 *
 * # Returns
 *
 * A JSON-serialised JS string of the form:
 *
 * ```json
 * {
 *   "smoothed": [1.0, 1.3, 1.96],
 *   "trend": "rising",
 *   "last_value": 1.96,
 *   "alpha": 0.3
 * }
 * ```
 *
 * On empty input, `smoothed` is `[]`, `trend` is `"stable"`, and
 * `last_value` is `null`.
 *
 * # Errors
 *
 * Returns a `JsValue` error if `values_json` is not a valid JSON array of
 * numbers.
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
 * Project trace variants into a reduced-dimension PCA space.
 *
 * Each trace becomes a bag-of-activities vector over the vocabulary, then
 * PCA reduces that to `n_components` dimensions.
 *
 * # Arguments
 * * `log_handle`   — Handle returned by `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — Event attribute name for activity labels (e.g. `"concept:name"`).
 * * `n_components` — Number of PCA dimensions (capped at min(vocab_size, n_traces-1)).
 *
 * # Returns
 * JSON string:
 * ```json
 * {
 *   "n_traces": 42,
 *   "n_components": 2,
 *   "vocab_size": 8,
 *   "explained_variance_ratio": [0.62, 0.21],
 *   "points": [
 *     { "trace_index": 0, "coords": [1.2, -0.3], "trace_length": 5 },
 *     ...
 *   ]
 * }
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} n_components
 * @returns {any}
 */
export function project_trace_variants(log_handle, activity_key, n_components) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.project_trace_variants(ptr0, len0, ptr1, len1, n_components);
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
 * Discover a process model using a Genetic Algorithm.
 *
 * Evolves a population of edge sets (DFG edge subsets) over multiple generations,
 * selecting for high fitness (coverage of log traces). Uses a fixed random seed (42)
 * for deterministic output.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `population_size` — Number of candidate models per generation (e.g. `50`–`200`).
 * * `generations` — Number of evolution cycles (e.g. `50`–`200`; more = higher quality but slower).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * { "handle": "...", "algorithm": "genetic_algorithm", "nodes": 8, "edges": 12, "final_fitness": 0.87 }
 * ```
 * Returns `Err("no_edges")` if the log has no directly-follows edges (e.g. all single-activity traces).
 *
 * # Note
 * Deterministic: seed 42 is hardcoded. Same log + same parameters → same output.
 * For high-quality models, use `population_size=100, generations=100`.
 * For faster results at lower quality, reduce both to `50`.
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
 * Discover a process model using Particle Swarm Optimization (PSO).
 *
 * Uses swarm intelligence to explore DFG edge subsets. Underlying function returns
 * `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
 * - `swarm_size < 1`
 * - `iterations == 0`
 * - log has no directly-follows edges (e.g. all single-activity traces)
 *
 * On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
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
 * Discover a process model using Ant Colony Optimization (ACO).
 *
 * Uses pheromone trails and frequency heuristics to construct DFG edge sets.
 * Underlying function returns `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
 * - `ant_count < 1`
 * - `iterations == 0`
 * - log has no directly-follows edges (e.g. all single-activity traces)
 *
 * On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
 * Pheromone is bounded (MMAS-style) to prevent NaN from unbounded deposit accumulation.
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
 * Score a trace for anomaly against a reference DFG model.
 *
 * Returns `{ score, is_anomalous, threshold, raw_cost, missing_edge_ratio,
 * edge_coverage, steps, scale }`. `score = 1 - exp(-raw_cost / scale)`
 * where `raw_cost` is the mean per-step Shannon self-information
 * `-log2(p)` in bits, and absent edges are charged a fixed 10-bit
 * penalty. `missing_edge_ratio` is the additive data-drift signal:
 * callers should monitor it independently of `score`.
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
 * JSON `DFG` with nodes, edges, start_activities, end_activities.
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
 * Get info about the SIMD streaming DFG implementation.
 * @returns {any}
 */
export function simd_streaming_dfg_info() {
    const ret = wasm.simd_streaming_dfg_info();
    return ret;
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
 * Measure trace determinism by running the same algorithm 3 times and comparing hashes.
 *
 * # Purpose
 * Automated determinism verification for CI. Proves that an algorithm is deterministic
 * (same input → same BLAKE3 hash across runs).
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "log_size": 1500,
 *   "run_count": 3,
 *   "hashes": ["abc123...", "abc123...", "abc123..."],
 *   "stable": true,
 *   "all_identical": true
 * }
 * ```
 * @param {string} handle
 * @param {string} activity_key
 * @param {string} algorithm
 * @returns {any}
 */
export function measure_trace_determinism(handle, activity_key, algorithm) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.measure_trace_determinism(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Measure algorithm quality baseline (fitness and precision metrics).
 *
 * # Purpose
 * Populate baseline fixture files for regression testing. Captures fitness/precision
 * for use in regression gates.
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "genetic",
 *   "log_size": 2000,
 *   "fitness": 0.87,
 *   "precision": 0.92,
 *   "quality_score": 0.895,
 *   "model_size": { "places": 12, "transitions": 18 }
 * }
 * ```
 * @param {string} handle
 * @param {string} activity_key
 * @param {string} algorithm
 * @returns {any}
 */
export function measure_algorithm_quality_baseline(handle, activity_key, algorithm) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.measure_algorithm_quality_baseline(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Benchmark algorithm performance: run N times and measure latency percentiles.
 *
 * # Purpose
 * Performance regression detection. Captures p50, p95, p99 latency across iterations.
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "iterations": 10,
 *   "log_size": 5000,
 *   "p50_ms": 1.2,
 *   "p95_ms": 2.1,
 *   "p99_ms": 3.8,
 *   "mean_ms": 1.5,
 *   "min_ms": 1.1,
 *   "max_ms": 4.2
 * }
 * ```
 * @param {string} handle
 * @param {string} activity_key
 * @param {string} algorithm
 * @param {number} iterations
 * @returns {any}
 */
export function benchmark_algorithm(handle, activity_key, algorithm, iterations) {
    const ptr0 = passStringToWasm0(handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.benchmark_algorithm(ptr0, len0, ptr1, len1, ptr2, len2, iterations);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate output format matches algorithm schema.
 *
 * # Purpose
 * Schema conformance validation. Ensures output has required fields (e.g., DFG must have
 * nodes and edges).
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "valid": true,
 *   "missing_fields": [],
 *   "extra_fields": [],
 *   "schema_errors": []
 * }
 * ```
 * @param {string} output_json
 * @param {string} algorithm
 * @returns {any}
 */
export function validate_output_format(output_json, algorithm) {
    const ptr0 = passStringToWasm0(output_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_output_format(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get algorithm metadata (inputs, outputs, time complexity, feature flags).
 *
 * # Purpose
 * Introspection for CLI help and algorithm selection. Returns algorithm characteristics.
 *
 * # Example Output
 * ```json
 * {
 *   "name": "dfg",
 *   "display_name": "Directly-Follows Graph",
 *   "category": "discovery",
 *   "time_complexity": "O(n log n)",
 *   "space_complexity": "O(m)",
 *   "speed_score": 5,
 *   "quality_score": 30,
 *   "supports_ocel": false,
 *   "supports_streaming": false,
 *   "required_inputs": ["log_handle", "activity_key"],
 *   "output_type": "dfg"
 * }
 * ```
 * @param {string} algorithm
 * @returns {any}
 */
export function get_algorithm_metadata(algorithm) {
    const ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_algorithm_metadata(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Discover a process model using the Heuristic Miner algorithm.
 *
 * More robust than Alpha++ for noisy, real-world logs. Filters low-frequency
 * directly-follows relations based on a dependency threshold.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `dependency_threshold` — Minimum dependency score `[0.0, 1.0]` for an edge to be included.
 *   Use `0.2`–`0.4` for real-world logs; `0.8` filters out most edges.
 *   **Do not use `0.8` on small logs** — it will produce empty or near-empty models.
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success, a DFG JSON with `{nodes, edges}`.
 *
 * # Note
 * The function uses a dependency measure rather than raw frequency. An edge `A→B` is
 * kept if `(freq(A,B) - freq(B,A)) / (freq(A,B) + freq(B,A) + 1) >= dependency_threshold`.
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
 * Get the complete capability registry of all wasm4pm functions
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
 * @param {string} net_handle
 * @returns {any}
 */
export function reduce_petri_net(net_handle) {
    const ptr0 = passStringToWasm0(net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.reduce_petri_net(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
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
 * Compare case-duration distributions between two cohorts using a two-sample t-test.
 *
 * `cohort_attribute` — name of the trace (or first-event) attribute that defines
 * the cohort label. The two alphabetically-first cohorts are compared for
 * determinism.
 * @param {string} log_handle
 * @param {string} timestamp_key
 * @param {string} cohort_attribute
 * @param {number} alpha
 * @returns {any}
 */
export function compare_cohort_durations(log_handle, timestamp_key, cohort_attribute, alpha) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(cohort_attribute, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.compare_cohort_durations(ptr0, len0, ptr1, len1, ptr2, len2, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compare processing durations across resources using one-way ANOVA.
 *
 * `resource_key` — event attribute identifying the resource (e.g. `org:resource`).
 * Groups with fewer than 2 observations are excluded before testing.
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {string} resource_key
 * @param {string} timestamp_key
 * @param {number} alpha
 * @returns {any}
 */
export function compare_resource_performance(log_handle, activity_key, resource_key, timestamp_key, alpha) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(resource_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(timestamp_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.compare_resource_performance(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute descriptive statistics for a numeric attribute across all traces or events.
 *
 * `scope` — `"trace"` to read from trace-level attributes, `"event"` to read from
 * individual event attributes.
 * @param {string} log_handle
 * @param {string} attribute_key
 * @param {string} scope
 * @returns {any}
 */
export function describe_attribute(log_handle, attribute_key, scope) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(attribute_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(scope, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.describe_attribute(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Store a DFG from its JSON representation and return a handle.
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
 * Store a Petri Net from its JSON representation and return a handle.
 * @param {string} pn_json
 * @returns {any}
 */
export function store_petri_net_from_json(pn_json) {
    const ptr0 = passStringToWasm0(pn_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.store_petri_net_from_json(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Begin a new streaming conformance session against a reference Petri Net or Directly-Follows Graph.
 *
 * `model_handle` — handle to a stored PetriNet or DFG.
 *
 * Returns an opaque session handle string.
 * @param {string} model_handle
 * @returns {any}
 */
export function streaming_conformance_begin(model_handle) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.streaming_conformance_begin(ptr0, len0);
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
 * Check prefix conformance for a given sequence of activities against a model.
 *
 * `model_handle` - handle to a stored PetriNet or DFG.
 * `prefix_json` - a JSON array of activity names.
 *
 * Returns a JSON string conforming to PrefixConformancePayload.
 * @param {string} model_handle
 * @param {string} prefix_json
 * @returns {any}
 */
export function check_prefix_conformance(model_handle, prefix_json) {
    const ptr0 = passStringToWasm0(model_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prefix_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.check_prefix_conformance(ptr0, len0, ptr1, len1);
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
 * Build a remaining-time prediction model from a completed event log.
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
 * Predict remaining time for a running case given its activity prefix.
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
 * JS-accessible function to delete a stored object by handle.
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
 * JS-accessible function to check if a stored object exists by handle.
 * @param {string} id
 * @returns {boolean}
 */
export function object_exists(id) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.object_exists(ptr0, len0);
    return ret !== 0;
}

/**
 * JS-accessible function to get the current number of stored objects.
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
 * JS-accessible function to clear all stored objects.
 */
export function clear_all_objects() {
    const ret = wasm.clear_all_objects();
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Parse a pm4py `.dfg` text string, store the DFG in state, and return a
 * handle JSON object:
 * `{ handle, activity_count, edge_count, start_count, end_count }`
 *
 * # Errors
 * Returns a `JsValue` error on malformed input or state failures.
 * @param {string} content
 * @returns {any}
 */
export function load_dfg_from_text(content) {
    const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_dfg_from_text(ptr0, len0);
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
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_anomaly(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_anomaly(ptr0, len0, ptr1, len1);
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
 * @param {string} ocel_handle
 * @param {string} query_json
 * @returns {string}
 */
export function query_provenance_traversal(ocel_handle, query_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(query_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.query_provenance_traversal(ptr0, len0, ptr1, len1);
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
 * Load an OCEL 2.0 from NDJSON string
 * @param {string} ndjson
 * @returns {string}
 */
export function load_ocel2_from_ndjson(ndjson) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(ndjson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_ocel2_from_ndjson(ptr0, len0);
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
 * Parse and normalize an OCEL-v2 log. Validates JSON structure (events,
 * objects, types, qualified refs) and returns the canonical re-serialized
 * form. Errors (as a `JsValue` string) if the JSON is not a valid OCEL-v2 log.
 * @param {string} json
 * @returns {any}
 */
export function load_ocel_v2(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_ocel_v2(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate an OCEL-v2 log against the OCEDO/OCPQ invariants and optional
 * object-type cardinality.
 *
 * `cardinality_json` is a JSON object keyed by object-type name, each value a
 * `{ created_by?, terminated_by?, schema?, min_count?, max_count? }` record
 * (the route `object_types` shape). Pass `""` or `"{}"` for no cardinality.
 *
 * Returns a `ValidationReport` `{ valid: bool, errors: [{code, message}] }`.
 * @param {string} json
 * @param {string} cardinality_json
 * @returns {any}
 */
export function validate_ocel_v2(json, cardinality_json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(cardinality_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_ocel_v2(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Flatten (project) an OCEL-v2 log onto a single object type, producing one
 * deterministic case per object of that type. Returns a `FlatLog`
 * `{ object_type, cases: [{ case_id, trace, event_ids }] }`.
 * Errors if `object_type` is not declared in the log.
 * @param {string} json
 * @param {string} object_type
 * @returns {any}
 */
export function flatten_ocel_v2(json, object_type) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(object_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.flatten_ocel_v2(ptr0, len0, ptr1, len1);
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
 * @param {string} receipts_dir
 * @returns {string}
 */
export function wasm_verify_receipt_chain(receipts_dir) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(receipts_dir, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasm_verify_receipt_chain(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} log_handle
 * @param {string} activity_key
 * @param {number} absolute_df_clean_thresh
 * @param {number} causal_threshold
 * @returns {any}
 */
export function discover_alpha_ppp_wasm(log_handle, activity_key, absolute_df_clean_thresh, causal_threshold) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_alpha_ppp_wasm(ptr0, len0, ptr1, len1, absolute_df_clean_thresh, causal_threshold);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} ocel_handle
 * @returns {any}
 */
export function discover_ocdfg_wasm(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ocdfg_wasm(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} ocel_handle
 * @returns {any}
 */
export function discover_ocla_wasm(ocel_handle) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ocla_wasm(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} ocel_handle
 * @param {number} noise_threshold
 * @returns {any}
 */
export function discover_oc_declare_wasm(ocel_handle, noise_threshold) {
    const ptr0 = passStringToWasm0(ocel_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_oc_declare_wasm(ptr0, len0, noise_threshold);
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
 * Run ensemble discovery: discover DFG from log, compute self-fitness,
 * measure complexity metrics, and return a ranked quality assessment.
 *
 * This is a lightweight ensemble that evaluates the DFG model (which is
 * the universal representation all algorithms converge to) rather than
 * running N separate expensive algorithms.
 *
 * ```javascript
 * const result = JSON.parse(pm.dfg_threshold_sweep(handle, 'concept:name'));
 * // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
 * ```
 * @param {string} log_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function dfg_threshold_sweep(log_handle, activity_key) {
    const ptr0 = passStringToWasm0(log_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.dfg_threshold_sweep(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Load an OCEL 2.0 from a flat CSV string.
 *
 * Parses the CSV, builds an OCEL in-memory, stores it in AppState, and returns
 * an opaque handle string for use with other `wasm4pm` OCEL functions.
 *
 * # Errors
 * Returns a JS error value with a JSON `{code, message}` payload on failure.
 * @param {string} csv_string
 * @returns {string}
 */
export function load_ocel_from_csv(csv_string) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(csv_string, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.load_ocel_from_csv(ptr0, len0);
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
 * Analyse frequency ranges of all FrequentTransition nodes in a POWL model.
 *
 * Internally runs `simplify_using_frequent_transitions` first, so XOR/LOOP patterns
 * that imply frequency semantics (e.g. `X(A, tau)` → skippable A) are recognised
 * even when the input model has not been explicitly simplified.
 *
 * Mirrors `TaggedPOWL.freq_range()` / `is_skippable()` / `is_repeatable()` / `is_unbounded()`
 * from `vendors/POWL/powl/objects/tagged_powl/base.py`.
 *
 * Returns JSON:
 * ```json
 * {
 *   "total_frequent_transitions": 3,
 *   "skippable_count": 1,
 *   "repeatable_count": 2,
 *   "unbounded_count": 1,
 *   "freq_min_min": 0,
 *   "freq_max_max": null,
 *   "nodes": [
 *     { "activity": "A", "min_freq": 0, "max_freq": 1,
 *       "is_skippable": true, "is_repeatable": false, "is_unbounded": false }
 *   ]
 * }
 * ```
 * @param {string} s
 * @returns {string}
 */
export function powl_freq_analysis(s) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_freq_analysis(ptr0, len0);
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
 * @returns {string}
 */
export function wasm_mint_challenge_nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.wasm_mint_challenge_nonce();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} candidate_json_str
 * @param {string} ledger_path
 * @param {string} policy_path
 * @param {string} boundary_map_path
 * @param {string} revocation_path
 * @returns {string}
 */
export function wasm_admit_change(candidate_json_str, ledger_path, policy_path, boundary_map_path, revocation_path) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(candidate_json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(ledger_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(policy_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(boundary_map_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(revocation_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasm_admit_change(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        deferred6_0 = ret[0];
        deferred6_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * @param {string} candidate_json_str
 * @param {string} ledger_contents
 * @param {string} policy_contents
 * @param {string} boundary_contents
 * @param {string} revoked_contents
 * @returns {string}
 */
export function wasm_admit_change_inline(candidate_json_str, ledger_contents, policy_contents, boundary_contents, revoked_contents) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(candidate_json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(ledger_contents, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(policy_contents, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(boundary_contents, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(revoked_contents, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasm_admit_change_inline(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        deferred6_0 = ret[0];
        deferred6_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * Discover a Directly-Follows Graph (DFG) from an event log.
 *
 * # Parameters
 * * `eventlog_handle` — Handle string returned by `load_eventlog_from_xes` or `load_eventlog_from_json`.
 * * `activity_key` — XES attribute name to use as activity label (e.g. `"concept:name"`).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success, a JS value (parse with `JSON.parse` if it is a
 * string) containing:
 * ```json
 * {
 *   "nodes": [{"id": "...", "label": "...", "frequency": 42}],
 *   "edges": [{"from": "A", "to": "B", "frequency": 17}],
 *   "start_activities": {"A": 10},
 *   "end_activities":   {"C": 5}
 * }
 * ```
 *
 * # Note
 * DFG construction is always successful for any valid event log (empty or otherwise).
 * The function never returns `None` and never panics.
 * For a sound process tree, use `discover_inductive_miner` instead.
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
 * Get list of available discovery algorithms
 * @returns {any}
 */
export function available_discovery_algorithms() {
    const ret = wasm.available_discovery_algorithms();
    return ret;
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
 * WASM export: analyse a stored Petri net handle for soundness (Def 3.5),
 * safeness, free-choice (Def 3.4), state-machine (Def 3.10) and marked-graph
 * (Def 3.11) structure. Returns the JSON summary as a `JsValue` string.
 * @param {string} petri_net_handle
 * @returns {any}
 */
export function check_wf_net_soundness(petri_net_handle) {
    const ptr0 = passStringToWasm0(petri_net_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.check_wf_net_soundness(ptr0, len0);
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
 * Get all traces from EventLog as a list of activity sequences
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function get_traces(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.get_traces(ptr0, len0, ptr1, len1);
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
 * Estimate the DFG from the StreamingLog and return it as a JSON string.
 *
 * Returns a `DFG` serialized as JSON.
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
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_ml_cluster(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_cluster(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} _activity_key
 * @returns {any}
 */
export function discover_ml_regress(eventlog_handle, _activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_regress(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {number} k_folds
 * @returns {any}
 */
export function discover_ml_regress_automl(eventlog_handle, k_folds) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.discover_ml_regress_automl(ptr0, len0, k_folds);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} eventlog_handle
 * @param {string} _activity_key
 * @returns {any}
 */
export function discover_ml_forecast(eventlog_handle, _activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
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
 * Automated smoothing factor selection for Forecasting.
 *
 * Performs a 5-fold cross-validation sweep across alpha [0.05, 0.95].
 * For each fold, EWMA is fit on the training complement (windows outside
 * the test fold), then RMSE is computed on the held-out test fold using
 * the fitted smoothed level as the initial state.
 * @param {string} eventlog_handle
 * @param {string} _activity_key
 * @returns {any}
 */
export function discover_automl_forecast(eventlog_handle, _activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_automl_forecast(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Automated hyperparameter tuning for k-NN Classification.
 *
 * Performs a 5-fold cross-validation sweep across K [1, 15].
 * @param {string} eventlog_handle
 * @param {string} activity_key
 * @returns {any}
 */
export function discover_automl_classify(eventlog_handle, activity_key) {
    const ptr0 = passStringToWasm0(eventlog_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(activity_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.discover_automl_classify(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
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
 * @param {string} powl_string
 * @returns {string}
 */
export function powl_to_yawl_string(powl_string) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(powl_string, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powl_to_yawl_string(ptr0, len0);
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

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} train_ratio
 * @param {bigint | null} [seed]
 * @returns {Float64Array}
 */
export function trainTestSplit(data, n_features, labels, train_ratio, seed) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.trainTestSplit(ptr0, len0, n_features, ptr1, len1, train_ratio, !isLikeNone(seed), isLikeNone(seed) ? BigInt(0) : seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * @param {number} n_features
 * @param {string} norm
 * @returns {Normalizer}
 */
export function normalizer(n_features, norm) {
    const ptr0 = passStringToWasm0(norm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.normalizer(n_features, ptr0, len0);
    return Normalizer.__wrap(ret);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} lr
 * @param {number} max_iter
 * @returns {PerceptronModel}
 */
export function perceptron(data, n_features, labels, lr, max_iter) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.perceptron(ptr0, len0, n_features, ptr1, len1, lr, max_iter);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PerceptronModel.__wrap(ret[0]);
}

/**
 * Fit a polynomial regression model using the normal equations
 * Solves: (X^T X) β = X^T y where X is the Vandermonde matrix
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} degree
 * @returns {PolynomialModel}
 */
export function polynomialRegression(x, y, degree) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.polynomialRegression(ptr0, len0, ptr1, len1, degree);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PolynomialModel.__wrap(ret[0]);
}

/**
 * Polynomial regression with auto-generated x values (0, 1, 2, ...)
 * @param {Float64Array} y
 * @param {number} degree
 * @returns {PolynomialModel}
 */
export function polynomialRegressionSimple(y, degree) {
    const ptr0 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.polynomialRegressionSimple(ptr0, len0, degree);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PolynomialModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @returns {number}
 */
export function silhouetteScore(data, n_features, labels) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.silhouetteScore(ptr0, len0, n_features, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Calculate a moving average
 * @param {Float64Array} data
 * @param {number} window
 * @param {MovingAverageType} ma_type
 * @returns {Float64Array}
 */
export function movingAverage(data, window, ma_type) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.movingAverage(ptr0, len0, window, ma_type);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Calculate SMA (convenience function)
 * @param {Float64Array} data
 * @param {number} window
 * @returns {Float64Array}
 */
export function sma(data, window) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sma(ptr0, len0, window);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Calculate EMA (convenience function)
 * @param {Float64Array} data
 * @param {number} window
 * @returns {Float64Array}
 */
export function ema(data, window) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ema(ptr0, len0, window);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} data
 * @param {number} period
 * @returns {SeasonalDecomposition}
 */
export function seasonalDecompose(data, period) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.seasonalDecompose(ptr0, len0, period);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return SeasonalDecomposition.__wrap(ret[0]);
}

/**
 * Compute autocorrelation at each lag from 0 to max_lag
 * @param {Float64Array} data
 * @param {number} max_lag
 * @returns {Float64Array}
 */
export function autocorrelation(data, max_lag) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.autocorrelation(ptr0, len0, max_lag);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Auto-detect seasonality period by finding peak autocorrelation
 * @param {Float64Array} data
 * @returns {SeasonalityInfo}
 */
export function detectSeasonality(data) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.detectSeasonality(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return SeasonalityInfo.__wrap(ret[0]);
}

/**
 * Calculate WMA (convenience function)
 * @param {Float64Array} data
 * @param {number} window
 * @returns {Float64Array}
 */
export function wma(data, window) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wma(ptr0, len0, window);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Analyze trend and forecast future values
 * @param {Float64Array} data
 * @param {number} periods
 * @returns {TrendAnalysis}
 */
export function trendForecast(data, periods) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.trendForecast(ptr0, len0, periods);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TrendAnalysis.__wrap(ret[0]);
}

/**
 * Calculate the rate of change (ROC) as percentage
 * @param {Float64Array} data
 * @param {number} periods
 * @returns {Float64Array}
 */
export function rateOfChange(data, periods) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.rateOfChange(ptr0, len0, periods);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Calculate momentum (difference from n periods ago)
 * @param {Float64Array} data
 * @param {number} periods
 * @returns {Float64Array}
 */
export function momentum(data, periods) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.momentum(ptr0, len0, periods);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} data
 * @param {number} alpha
 * @returns {Float64Array}
 */
export function exponentialSmoothing(data, alpha) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exponentialSmoothing(ptr0, len0, alpha);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * Detect peaks in data (local maxima)
 * @param {Float64Array} data
 * @returns {Uint32Array}
 */
export function findPeaks(data) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.findPeaks(ptr0, len0);
    var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Detect troughs in data (local minima)
 * @param {Float64Array} data
 * @returns {Uint32Array}
 */
export function findTroughs(data) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.findTroughs(ptr0, len0);
    var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Stratified K-Fold cross-validation
 *
 * Preserves class distribution in each fold.
 *
 * # Arguments
 * * `y` - Labels (n_samples)
 * * `n_folds` - Number of folds
 * * `shuffle` - Whether to shuffle data before splitting
 * * `seed` - Random seed for shuffling
 * @param {Float64Array} y
 * @param {number} n_folds
 * @param {boolean} shuffle
 * @param {number | null} [seed]
 * @returns {Array<any>}
 */
export function stratified_k_fold(y, n_folds, shuffle, seed) {
    const ptr0 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.stratified_k_fold(ptr0, len0, n_folds, shuffle, !isLikeNone(seed), isLikeNone(seed) ? 0 : seed);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Group K-Fold cross-validation
 *
 * Ensures same group is not in both training and validation.
 *
 * # Arguments
 * * `groups` - Group labels for each sample (n_samples)
 * * `n_folds` - Number of folds
 * * `n_samples` - Total number of samples
 * @param {Float64Array} groups
 * @param {number} n_folds
 * @param {number} n_samples
 * @returns {Array<any>}
 */
export function group_k_fold(groups, n_folds, n_samples) {
    const ptr0 = passArrayF64ToWasm0(groups, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.group_k_fold(ptr0, len0, n_folds, n_samples);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Time series cross-validation
 *
 * Forward chaining: Train on [0, t], validate on [t+1, t+test_size].
 *
 * # Arguments
 * * `n_samples` - Total number of samples
 * * `n_folds` - Number of folds
 * * `test_size` - Size of test set for each fold
 * * `gap` - Gap between train and test (number of samples to skip)
 * @param {number} n_samples
 * @param {number} n_folds
 * @param {number} test_size
 * @param {number} gap
 * @returns {Array<any>}
 */
export function time_series_cv(n_samples, n_folds, test_size, gap) {
    const ret = wasm.time_series_cv(n_samples, n_folds, test_size, gap);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Nested cross-validation
 *
 * Outer loop for model evaluation, inner loop for hyperparameter tuning.
 *
 * # Arguments
 * * `n_samples` - Total number of samples
 * * `outer_folds` - Number of outer folds
 * * `inner_folds` - Number of inner folds
 * @param {number} n_samples
 * @param {number} outer_folds
 * @param {number} inner_folds
 * @returns {Array<any>}
 */
export function nested_cv(n_samples, outer_folds, inner_folds) {
    const ret = wasm.nested_cv(n_samples, outer_folds, inner_folds);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Leave-One-Out cross-validation
 *
 * Each sample is used once as validation.
 *
 * # Arguments
 * * `n_samples` - Total number of samples
 * @param {number} n_samples
 * @returns {Array<any>}
 */
export function leave_one_out_cv(n_samples) {
    const ret = wasm.leave_one_out_cv(n_samples);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Bootstrapping
 *
 * Resample with replacement to estimate confidence intervals.
 *
 * # Arguments
 * * `n_samples` - Total number of samples
 * * `n_iterations` - Number of bootstrap iterations
 * * `seed` - Random seed
 * @param {number} n_samples
 * @param {number} n_iterations
 * @param {number | null} [seed]
 * @returns {Array<any>}
 */
export function bootstrap(n_samples, n_iterations, seed) {
    const ret = wasm.bootstrap(n_samples, n_iterations, !isLikeNone(seed), isLikeNone(seed) ? 0 : seed);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute cross-validation result from scores
 *
 * # Arguments
 * * `scores` - Scores from each fold
 * @param {Float64Array} scores
 * @returns {any}
 */
export function compute_cv_result(scores) {
    const ptr0 = passArrayF64ToWasm0(scores, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_cv_result(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute bootstrap result from scores
 *
 * # Arguments
 * * `scores` - Scores from each bootstrap iteration
 * * `confidence_level` - Confidence level (e.g., 0.95 for 95% CI)
 * @param {Float64Array} scores
 * @param {number} confidence_level
 * @returns {any}
 */
export function compute_bootstrap_result(scores, confidence_level) {
    const ptr0 = passArrayF64ToWasm0(scores, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_bootstrap_result(ptr0, len0, confidence_level);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @param {Float64Array} transactions
 * @param {Uint32Array} transaction_lengths
 * @param {number} min_support
 * @param {number} min_confidence
 * @returns {AssociationResult}
 */
export function apriori(transactions, transaction_lengths, min_support, min_confidence) {
    const ptr0 = passArrayF64ToWasm0(transactions, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(transaction_lengths, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.apriori(ptr0, len0, ptr1, len1, min_support, min_confidence);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AssociationResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} alpha
 * @param {number} l1_ratio
 * @param {number} max_iter
 * @param {number} tol
 * @returns {ElasticNetModel}
 */
export function elasticNet(data, n_features, targets, alpha, l1_ratio, max_iter, tol) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.elasticNet(ptr0, len0, n_features, ptr1, len1, alpha, l1_ratio, max_iter, tol);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ElasticNetModel.__wrap(ret[0]);
}

/**
 * Fit an exponential regression model: y = a * e^(bx)
 * Uses linearization: ln(y) = ln(a) + bx
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @returns {ExponentialModel}
 */
export function exponentialRegression(x, y) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.exponentialRegression(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ExponentialModel.__wrap(ret[0]);
}

/**
 * Exponential regression with auto-generated x values (0, 1, 2, ...)
 * @param {Float64Array} y
 * @returns {ExponentialModel}
 */
export function exponentialRegressionSimple(y) {
    const ptr0 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exponentialRegressionSimple(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ExponentialModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @returns {LogarithmicModel}
 */
export function logarithmicRegression(x, y) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.logarithmicRegression(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LogarithmicModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @returns {PowerModel}
 */
export function powerRegression(x, y) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.powerRegression(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PowerModel.__wrap(ret[0]);
}

/**
 * K-Means++ Clustering (improved initialization)
 * Returns cluster assignments and final centroids
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {number} n_clusters
 * @param {number} max_iter
 * @returns {Float64Array}
 */
export function kmeansPlus(data, n_features, n_clusters, max_iter) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kmeansPlus(ptr0, len0, n_features, n_clusters, max_iter);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Monte Carlo estimation of pi.
 * @param {number} n_samples
 * @param {bigint} seed
 * @returns {MonteCarloResult}
 */
export function mcEstimatePi(n_samples, seed) {
    const ret = wasm.mcEstimatePi(n_samples, seed);
    return MonteCarloResult.__wrap(ret);
}

/**
 * Monte Carlo integration of a JS function over [a, b].
 * @param {Function} _f
 * @param {number} _a
 * @param {number} _b
 * @param {number} _n_samples
 * @param {bigint} _seed
 * @returns {any}
 */
export function mcIntegrate(_f, _a, _b, _n_samples, _seed) {
    const ret = wasm.mcIntegrate(_f, _a, _b, _n_samples, _seed);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Bootstrap estimation of a statistic with confidence interval.
 * @param {Float64Array} data
 * @param {number} n_bootstrap
 * @param {string} statistic
 * @param {number} confidence
 * @param {bigint} seed
 * @returns {MonteCarloBootstrapResult}
 */
export function mcBootstrap(data, n_bootstrap, statistic, confidence, seed) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(statistic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.mcBootstrap(ptr0, len0, n_bootstrap, ptr1, len1, confidence, seed);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return MonteCarloBootstrapResult.__wrap(ret[0]);
}

/**
 * Expected value of a function using Monte Carlo sampling.
 * @param {number} a
 * @param {number} b
 * @param {number} n_samples
 * @param {bigint} seed
 * @returns {MonteCarloResult}
 */
export function mcExpectedValue(a, b, n_samples, seed) {
    const ret = wasm.mcExpectedValue(a, b, n_samples, seed);
    return MonteCarloResult.__wrap(ret);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @returns {NaiveBayesModel}
 */
export function naiveBayesFit(data, n_features, labels) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.naiveBayesFit(ptr0, len0, n_features, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return NaiveBayesModel.__wrap(ret[0]);
}

/**
 * Save model to JSON format (human-readable)
 * @param {any} model
 * @returns {string}
 */
export function save_model_json(model) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.save_model_json(model);
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
 * Save model to binary format (compact)
 * @param {any} model
 * @returns {Uint8Array}
 */
export function save_model_binary(model) {
    const ret = wasm.save_model_binary(model);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Load model from JSON
 * @param {string} json
 * @returns {any}
 */
export function load_model_json(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_model_json(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Load model from binary
 * @param {Uint8Array} bytes
 * @returns {any}
 */
export function load_model_binary(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_model_binary(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Encode binary model to base64 (for storage in IndexedDB, localStorage, etc.)
 * @param {Uint8Array} binary
 * @returns {string}
 */
export function encode_model_base64(binary) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(binary, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_model_base64(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Decode base64 to binary model
 * @param {string} encoded
 * @returns {Uint8Array}
 */
export function decode_model_base64(encoded) {
    const ptr0 = passStringToWasm0(encoded, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decode_model_base64(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Compute data hash for integrity checking
 * @param {Float64Array} data
 * @returns {string}
 */
export function compute_data_hash(data) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.compute_data_hash(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * SMOTE (Synthetic Minority Over-sampling Technique)
 *
 * # Arguments
 * * `x` - Feature matrix (n_samples × n_features)
 * * `y` - Labels (n_samples)
 * * `k` - Number of neighbors for SMOTE
 * * `sampling_rate` - Desired ratio of minority to majority samples
 * * `n_samples` - Total number of samples
 * * `n_features` - Number of features
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} k
 * @param {number} sampling_rate
 * @param {number} _n_samples
 * @param {number} n_features
 * @returns {Array<any>}
 */
export function smote(x, y, k, sampling_rate, _n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.smote(ptr0, len0, ptr1, len1, k, sampling_rate, _n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Random oversampling
 *
 * # Arguments
 * * `x` - Feature matrix (n_samples × n_features)
 * * `y` - Labels (n_samples)
 * * `target_ratio` - Desired ratio of minority to majority samples
 * * `n_samples` - Total number of samples
 * * `n_features` - Number of features
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} target_ratio
 * @param {number} _n_samples
 * @param {number} n_features
 * @returns {Array<any>}
 */
export function random_oversample(x, y, target_ratio, _n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.random_oversample(ptr0, len0, ptr1, len1, target_ratio, _n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} x
 * @param {number} noise_level
 * @param {string} distribution
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {Float64Array}
 */
export function inject_noise(x, noise_level, distribution, n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(distribution, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.inject_noise(ptr0, len0, noise_level, ptr1, len1, n_samples, n_features);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Mixup augmentation
 *
 * # Arguments
 * * `x1` - First dataset (n_samples1 × n_features)
 * * `y1` - First dataset labels
 * * `x2` - Second dataset (n_samples2 × n_features)
 * * `y2` - Second dataset labels
 * * `config` - Mixup configuration
 * @param {Float64Array} x1
 * @param {Float64Array} y1
 * @param {Float64Array} x2
 * @param {Float64Array} y2
 * @param {MixupConfig} config
 * @returns {Array<any>}
 */
export function mixup(x1, y1, x2, y2, config) {
    const ptr0 = passArrayF64ToWasm0(x1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y1, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(x2, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(y2, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    _assertClass(config, MixupConfig);
    const ret = wasm.mixup(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, config.__wbg_ptr);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Time series warping
 *
 * # Arguments
 * * `series` - Time series data
 * * `warp_factor` - Warping factor (>1 stretches, <1 compresses)
 * * `n_samples` - Length of series
 * @param {Float64Array} series
 * @param {number} warp_factor
 * @param {number} n_samples
 * @returns {Float64Array}
 */
export function time_series_warp(series, warp_factor, n_samples) {
    const ptr0 = passArrayF64ToWasm0(series, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.time_series_warp(ptr0, len0, warp_factor, n_samples);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Time series shifting
 *
 * # Arguments
 * * `series` - Time series data
 * * `shift_range_min` - Minimum shift amount
 * * `shift_range_max` - Maximum shift amount
 * * `n_samples` - Length of series
 * @param {Float64Array} series
 * @param {number} shift_range_min
 * @param {number} shift_range_max
 * @param {number} n_samples
 * @returns {Float64Array}
 */
export function time_series_shift(series, shift_range_min, shift_range_max, n_samples) {
    const ptr0 = passArrayF64ToWasm0(series, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.time_series_shift(ptr0, len0, shift_range_min, shift_range_max, n_samples);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Hierarchical Clustering (Agglomerative)
 * Returns cluster assignments for specified number of clusters
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {number} n_clusters
 * @returns {Float64Array}
 */
export function hierarchicalClustering(data, n_features, n_clusters) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.hierarchicalClustering(ptr0, len0, n_features, n_clusters);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} max_depth
 * @param {number} min_samples_split
 * @returns {DecisionTreeModel}
 */
export function decisionTreeClassify(data, n_features, labels, max_depth, min_samples_split) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.decisionTreeClassify(ptr0, len0, n_features, ptr1, len1, max_depth, min_samples_split);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DecisionTreeModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} max_depth
 * @param {number} min_samples_split
 * @returns {DecisionTreeModel}
 */
export function decisionTreeRegress(data, n_features, targets, max_depth, min_samples_split) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.decisionTreeRegress(ptr0, len0, n_features, ptr1, len1, max_depth, min_samples_split);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DecisionTreeModel.__wrap(ret[0]);
}

/**
 * @param {number} x
 * @returns {number}
 */
export function gammaFunction(x) {
    const ret = wasm.gammaFunction(x);
    return ret;
}

/**
 * @param {number} x
 * @param {number} df
 * @returns {number}
 */
export function tCdf(x, df) {
    const ret = wasm.tCdf(x, df);
    return ret;
}

/**
 * @param {number} p
 * @param {number} df
 * @returns {number}
 */
export function tPpf(p, df) {
    const ret = wasm.tPpf(p, df);
    return ret;
}

/**
 * @param {number} x
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export function fPdf(x, d1, d2) {
    const ret = wasm.fPdf(x, d1, d2);
    return ret;
}

/**
 * @param {number} x
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export function fCdf(x, d1, d2) {
    const ret = wasm.fCdf(x, d1, d2);
    return ret;
}

/**
 * @param {number} x
 * @returns {number}
 */
export function logGamma(x) {
    const ret = wasm.logGamma(x);
    return ret;
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function betaFunction(a, b) {
    const ret = wasm.betaFunction(a, b);
    return ret;
}

/**
 * @param {number} x
 * @returns {number}
 */
export function erf(x) {
    const ret = wasm.erf(x);
    return ret;
}

/**
 * @param {bigint} k
 * @param {number} lambda
 * @returns {number}
 */
export function poissonCdf(k, lambda) {
    const ret = wasm.poissonCdf(k, lambda);
    return ret;
}

/**
 * @param {number} n_samples
 * @param {number} lambda
 * @param {bigint} seed
 * @returns {Float64Array}
 */
export function poissonSample(n_samples, lambda, seed) {
    const ret = wasm.poissonSample(n_samples, lambda, seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {number} x
 * @param {number} lambda
 * @returns {number}
 */
export function exponentialPdf(x, lambda) {
    const ret = wasm.exponentialPdf(x, lambda);
    return ret;
}

/**
 * @param {number} x
 * @param {number} lambda
 * @returns {number}
 */
export function exponentialCdf(x, lambda) {
    const ret = wasm.exponentialCdf(x, lambda);
    return ret;
}

/**
 * @param {number} n
 * @param {number} lambda
 * @param {bigint} seed
 * @returns {Float64Array}
 */
export function exponentialSample(n, lambda, seed) {
    const ret = wasm.exponentialSample(n, lambda, seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {number} x
 * @param {number} k
 * @returns {number}
 */
export function chiSquaredPdf(x, k) {
    const ret = wasm.chiSquaredPdf(x, k);
    return ret;
}

/**
 * @param {number} x
 * @param {number} k
 * @returns {number}
 */
export function chiSquaredCdf(x, k) {
    const ret = wasm.chiSquaredCdf(x, k);
    return ret;
}

/**
 * @param {number} n
 * @param {number} k
 * @param {bigint} seed
 * @returns {Float64Array}
 */
export function chiSquaredSample(n, k, seed) {
    const ret = wasm.chiSquaredSample(n, k, seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {number} x
 * @param {number} df
 * @returns {number}
 */
export function tPdf(x, df) {
    const ret = wasm.tPdf(x, df);
    return ret;
}

/**
 * @param {number} x
 * @param {number} mean
 * @param {number} std
 * @returns {number}
 */
export function normalPdf(x, mean, std) {
    const ret = wasm.normalPdf(x, mean, std);
    return ret;
}

/**
 * @param {number} x
 * @param {number} mean
 * @param {number} std
 * @returns {number}
 */
export function normalCdf(x, mean, std) {
    const ret = wasm.normalCdf(x, mean, std);
    return ret;
}

/**
 * @param {number} p
 * @param {number} mean
 * @param {number} std
 * @returns {number}
 */
export function normalPpf(p, mean, std) {
    const ret = wasm.normalPpf(p, mean, std);
    return ret;
}

/**
 * @param {number} n
 * @param {number} mean
 * @param {number} std
 * @param {bigint} seed
 * @returns {Float64Array}
 */
export function normalSample(n, mean, std, seed) {
    const ret = wasm.normalSample(n, mean, std, seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {bigint} k
 * @param {bigint} n
 * @param {number} p
 * @returns {number}
 */
export function binomialPmf(k, n, p) {
    const ret = wasm.binomialPmf(k, n, p);
    return ret;
}

/**
 * @param {bigint} k
 * @param {bigint} n
 * @param {number} p
 * @returns {number}
 */
export function binomialCdf(k, n, p) {
    const ret = wasm.binomialCdf(k, n, p);
    return ret;
}

/**
 * @param {number} n
 * @param {bigint} n_trials
 * @param {number} p
 * @param {bigint} seed
 * @returns {Float64Array}
 */
export function binomialSample(n, n_trials, p, seed) {
    const ret = wasm.binomialSample(n, n_trials, p, seed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {bigint} k
 * @param {number} lambda
 * @returns {number}
 */
export function poissonPmf(k, lambda) {
    const ret = wasm.poissonPmf(k, lambda);
    return ret;
}

/**
 * @returns {LabelEncoder}
 */
export function labelEncoder() {
    const ret = wasm.labelEncoder();
    return LabelEncoder.__wrap(ret);
}

/**
 * @param {number} n_features
 * @returns {MinMaxScaler}
 */
export function minMaxScaler(n_features) {
    const ret = wasm.minMaxScaler(n_features);
    return MinMaxScaler.__wrap(ret);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} n_trees
 * @param {number} max_depth
 * @param {number} min_samples_split
 * @returns {RandomForestModel}
 */
export function randomForestClassify(data, n_features, labels, n_trees, max_depth, min_samples_split) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.randomForestClassify(ptr0, len0, n_features, ptr1, len1, n_trees, max_depth, min_samples_split);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RandomForestModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} n_trees
 * @param {number} max_depth
 * @param {number} min_samples_split
 * @returns {RandomForestModel}
 */
export function randomForestRegress(data, n_features, targets, n_trees, max_depth, min_samples_split) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.randomForestRegress(ptr0, len0, n_features, ptr1, len1, n_trees, max_depth, min_samples_split);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RandomForestModel.__wrap(ret[0]);
}

/**
 * @param {number} n_features
 * @returns {RobustScaler}
 */
export function robustScaler(n_features) {
    const ret = wasm.minMaxScaler(n_features);
    return RobustScaler.__wrap(ret);
}

/**
 * Compute SHAP-like feature attribution using Kernel SHAP approximation
 *
 * # Arguments
 * * `model` - Model prediction function
 * * `X` - Background dataset (for reference)
 * * `x` - Instance to explain
 * * `n_samples` - Number of samples for approximation
 * @param {Float64Array} x_background
 * @param {Float64Array} x
 * @param {number} n_samples
 * @param {number} n_features
 * @param {Function} predict_fn
 * @returns {Float64Array}
 */
export function shap_values(x_background, x, n_samples, n_features, predict_fn) {
    const ptr0 = passArrayF64ToWasm0(x_background, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.shap_values(ptr0, len0, ptr1, len1, n_samples, n_features, predict_fn);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Compute LIME-like local explanation
 *
 * # Arguments
 * * `model` - Model prediction function
 * * `x` - Instance to explain
 * * `n_samples` - Number of perturbed samples
 * @param {Float64Array} x
 * @param {number} n_samples
 * @param {number} n_features
 * @param {Function} predict_fn
 * @param {number} kernel_width
 * @returns {any}
 */
export function lime_explain(x, n_samples, n_features, predict_fn, kernel_width) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lime_explain(ptr0, len0, n_samples, n_features, predict_fn, kernel_width);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Get decision path for a tree-based model
 *
 * # Arguments
 * * `x` - Instance to trace (length must be `n_features`)
 * * `n_features` - Number of features
 * @param {Float64Array} x
 * @param {number} n_features
 * @returns {any}
 */
export function decision_path(x, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decision_path(ptr0, len0, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute prediction interval using bootstrap method
 *
 * # Arguments
 * * `predictions` - Collection of predictions (e.g., from bootstrap)
 * * `confidence` - Confidence level (0-1)
 * @param {Float64Array} predictions
 * @param {number} confidence
 * @returns {Array<any>}
 */
export function prediction_interval(predictions, confidence) {
    const ptr0 = passArrayF64ToWasm0(predictions, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.prediction_interval(ptr0, len0, confidence);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}
/**
 * Generate counterfactual explanation
 *
 * # Arguments
 * * `x` - Original instance
 * * `prediction` - Original prediction
 * * `feature_names` - Optional feature names
 * @param {Float64Array} x
 * @param {number} prediction
 * @param {string[] | null} [feature_names]
 * @returns {any}
 */
export function generate_counterfactual(x, prediction, feature_names) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(feature_names) ? 0 : passArrayJsValueToWasm0(feature_names, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.generate_counterfactual(ptr0, len0, prediction, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} ratings
 * @param {MatrixFactorizationConfig} config
 * @returns {any}
 */
export function matrixFactorization(ratings, config) {
    const ptr0 = passArrayF64ToWasm0(ratings, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(config, MatrixFactorizationConfig);
    const ret = wasm.matrixFactorization(ptr0, len0, config.__wbg_ptr);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} model
 * @param {number} user_id
 * @param {Float64Array} item_ids
 * @returns {Float64Array}
 */
export function matrixFactorizationPredict(model, user_id, item_ids) {
    const ptr0 = passArrayF64ToWasm0(model, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(item_ids, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.matrixFactorizationPredict(ptr0, len0, user_id, ptr1, len1);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * @param {Float64Array} ratings
 * @param {number} n_users
 * @param {number} n_items
 * @param {number} user_id
 * @param {number} k_neighbors
 * @returns {Float64Array}
 */
export function userUserCollaborative(ratings, n_users, n_items, user_id, k_neighbors) {
    const ptr0 = passArrayF64ToWasm0(ratings, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.userUserCollaborative(ptr0, len0, n_users, n_items, user_id, k_neighbors);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * ROC AUC (Area Under ROC Curve) for binary classification
 * Returns AUC score in [0, 1] where 1 = perfect classifier
 * @param {Float64Array} y_true
 * @param {Float64Array} y_scores
 * @returns {number}
 */
export function rocAucScore(y_true, y_scores) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_scores, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.rocAucScore(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Log Loss (Cross-Entropy) for probabilistic classification
 * @param {Float64Array} y_true
 * @param {Float64Array} y_proba
 * @param {number} n_classes
 * @returns {number}
 */
export function logLoss(y_true, y_proba, n_classes) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_proba, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.logLoss(ptr0, len0, ptr1, len1, n_classes);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {number} n_features
 * @returns {OneHotEncoder}
 */
export function oneHotEncoder(n_features) {
    const ret = wasm.oneHotEncoder(n_features);
    return OneHotEncoder.__wrap(ret);
}

/**
 * @param {number} n_features
 * @returns {OrdinalEncoder}
 */
export function ordinalEncoder(n_features) {
    const ret = wasm.oneHotEncoder(n_features);
    return OrdinalEncoder.__wrap(ret);
}

/**
 * Create a new StandardScaler for the given number of features
 * @param {number} n_features
 * @returns {StandardScaler}
 */
export function standardScaler(n_features) {
    const ret = wasm.minMaxScaler(n_features);
    return StandardScaler.__wrap(ret);
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {Float64Array}
 */
export function confusionMatrix(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.confusionMatrix(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Classification accuracy: (TP + TN) / total
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function accuracy(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.accuracy(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Macro-averaged F1 score across all classes
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function f1Score(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.f1Score(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Precision for a specific class (positive class index)
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @param {number} positive_class
 * @returns {number}
 */
export function precision(y_true, y_pred, positive_class) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.precision(ptr0, len0, ptr1, len1, positive_class);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Recall for a specific class (positive class index)
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @param {number} positive_class
 * @returns {number}
 */
export function recall(y_true, y_pred, positive_class) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.recall(ptr0, len0, ptr1, len1, positive_class);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} k_folds
 * @param {string} model_type
 * @param {Float64Array} model_params
 * @returns {Float64Array}
 */
export function crossValidateScore(data, n_features, labels, k_folds, model_type, model_params) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(model_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(model_params, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.crossValidateScore(ptr0, len0, n_features, ptr1, len1, k_folds, ptr2, len2, ptr3, len3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v5;
}

/**
 * Fit a Gaussian Process model.
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {string} kernel_type
 * @param {Float64Array} kernel_params
 * @param {number} noise
 * @returns {GPModel}
 */
export function gpFit(data, n_features, targets, kernel_type, kernel_params, noise) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(kernel_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(kernel_params, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.gpFit(ptr0, len0, n_features, ptr1, len1, ptr2, len2, ptr3, len3, noise);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GPModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} n_trees
 * @param {number} max_depth
 * @param {number} learning_rate
 * @returns {GradientBoostingClassifier}
 */
export function gradientBoostingClassify(data, n_features, labels, n_trees, max_depth, learning_rate) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.gradientBoostingClassify(ptr0, len0, n_features, ptr1, len1, n_trees, max_depth, learning_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GradientBoostingClassifier.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} alpha
 * @returns {RidgeRegression}
 */
export function ridgeRegression(data, n_features, targets, alpha) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ridgeRegression(ptr0, len0, n_features, ptr1, len1, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RidgeRegression.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} alpha
 * @param {number} max_iter
 * @param {number} tol
 * @returns {LassoRegression}
 */
export function lassoRegression(data, n_features, targets, alpha, max_iter, tol) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lassoRegression(ptr0, len0, n_features, ptr1, len1, alpha, max_iter, tol);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LassoRegression.__wrap(ret[0]);
}

/**
 * Davies-Bouldin Index - lower is better (cluster separation vs compactness)
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @returns {number}
 */
export function daviesBouldinScore(data, n_features, labels) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.daviesBouldinScore(ptr0, len0, n_features, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Calinski-Harabasz Index (Variance Ratio Criterion) - higher is better
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @returns {number}
 */
export function calinskiHarabaszScore(data, n_features, labels) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.calinskiHarabaszScore(ptr0, len0, n_features, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {DecisionTreeModel} tree
 * @returns {Float64Array}
 */
export function featureImportance(tree) {
    _assertClass(tree, DecisionTreeModel);
    const ret = wasm.featureImportance(tree.__wbg_ptr);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * Compute feature importance for a random forest by averaging importances across all trees.
 * @param {Float64Array} tree_flat
 * @param {number} n_trees
 * @param {number} n_features
 * @returns {Float64Array}
 */
export function featureImportanceForest(tree_flat, n_trees, n_features) {
    const ptr0 = passArrayF64ToWasm0(tree_flat, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.featureImportanceForest(ptr0, len0, n_trees, n_features);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function r2Score(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.r2Score(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function meanSquaredError(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.meanSquaredError(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function rootMeanSquaredError(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.rootMeanSquaredError(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function meanAbsoluteError(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.meanAbsoluteError(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Median Absolute Error (robust to outliers)
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function medianAbsoluteError(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.medianAbsoluteError(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * Mean Absolute Percentage Error (with epsilon for division by zero)
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @param {number} epsilon
 * @returns {number}
 */
export function meanAbsolutePercentageError(y_true, y_pred, epsilon) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.meanAbsolutePercentageError(ptr0, len0, ptr1, len1, epsilon);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} quantile
 * @param {number} max_iter
 * @param {number} lr
 * @param {number} tol
 * @returns {QuantileRegressionModel}
 */
export function quantileRegressionFit(data, n_features, targets, quantile, max_iter, lr, tol) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.quantileRegressionFit(ptr0, len0, n_features, ptr1, len1, quantile, max_iter, lr, tol);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return QuantileRegressionModel.__wrap(ret[0]);
}

/**
 * @param {QuantileRegressionModel} model
 * @param {Float64Array} data
 * @returns {Float64Array}
 */
export function quantileRegressionPredict(model, data) {
    _assertClass(model, QuantileRegressionModel);
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.quantileRegressionPredict(model.__wbg_ptr, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function matthewsCorrcoef(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.matthewsCorrcoef(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function cohensKappa(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.cohensKappa(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} y_true
 * @param {Float64Array} y_pred
 * @returns {number}
 */
export function balancedAccuracy(y_true, y_pred) {
    const ptr0 = passArrayF64ToWasm0(y_true, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y_pred, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.balancedAccuracy(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} k
 * @returns {KnnModel}
 */
export function knnFit(data, n_features, labels, k) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.knnFit(ptr0, len0, n_features, ptr1, len1, k);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return KnnModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {number} n_components
 * @returns {PcaResult}
 */
export function pca(data, n_features, n_components) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pca(ptr0, len0, n_features, n_components);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PcaResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} lambda
 * @param {number} max_iter
 * @param {number} learning_rate
 * @returns {LinearSVM}
 */
export function linearSVM(data, n_features, labels, lambda, max_iter, learning_rate) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.linearSVM(ptr0, len0, n_features, ptr1, len1, lambda, max_iter, learning_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LinearSVM.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {SVRConfig} config
 * @returns {SVRModel}
 */
export function svrFit(data, n_features, targets, config) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    _assertClass(config, SVRConfig);
    var ptr2 = config.__destroy_into_raw();
    const ret = wasm.svrFit(ptr0, len0, n_features, ptr1, len1, ptr2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return SVRModel.__wrap(ret[0]);
}

/**
 * @param {SVRModel} model
 * @param {Float64Array} data
 * @returns {Float64Array}
 */
export function svrPredict(model, data) {
    _assertClass(model, SVRModel);
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.svrPredict(model.__wbg_ptr, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} adjacency
 * @param {number} n_nodes
 * @param {number} damping
 * @param {number} max_iter
 * @param {number} tol
 * @returns {any}
 */
export function pageRank(adjacency, n_nodes, damping, max_iter, tol) {
    const ptr0 = passArrayF64ToWasm0(adjacency, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pageRank(ptr0, len0, n_nodes, damping, max_iter, tol);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} adjacency
 * @param {number} n_nodes
 * @param {number} source
 * @returns {any}
 */
export function shortestPath(adjacency, n_nodes, source) {
    const ptr0 = passArrayF64ToWasm0(adjacency, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.shortestPath(ptr0, len0, n_nodes, source);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} adjacency
 * @param {number} n_nodes
 * @param {number} max_iter
 * @returns {any}
 */
export function communityDetection(adjacency, n_nodes, max_iter) {
    const ptr0 = passArrayF64ToWasm0(adjacency, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.communityDetection(ptr0, len0, n_nodes, max_iter);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} data1
 * @param {Float64Array} data2
 * @returns {MannWhitneyResult}
 */
export function wilcoxonSignedRank(data1, data2) {
    const ptr0 = passArrayF64ToWasm0(data1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(data2, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.wilcoxonSignedRank(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return MannWhitneyResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @returns {KSTestResult}
 */
export function ksTest(data) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ksTest(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return KSTestResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} observed
 * @param {Float64Array} expected
 * @returns {ChiSquareResult}
 */
export function chiSquareTest(observed, expected) {
    const ptr0 = passArrayF64ToWasm0(observed, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(expected, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.chiSquareTest(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ChiSquareResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} contingency
 * @param {number} n_rows
 * @param {number} n_cols
 * @returns {ChiSquareResult}
 */
export function chiSquareIndependence(contingency, n_rows, n_cols) {
    const ptr0 = passArrayF64ToWasm0(contingency, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.chiSquareIndependence(ptr0, len0, n_rows, n_cols);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ChiSquareResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} groups
 * @param {Uint32Array} group_sizes
 * @returns {AnovaResult}
 */
export function oneWayAnova(groups, group_sizes) {
    const ptr0 = passArrayF64ToWasm0(groups, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(group_sizes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.oneWayAnova(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AnovaResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} alpha
 * @returns {ConfidenceInterval}
 */
export function confidenceIntervalMean(data, alpha) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.confidenceIntervalMean(ptr0, len0, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ConfidenceInterval.__wrap(ret[0]);
}

/**
 * @param {bigint} successes
 * @param {bigint} total
 * @param {number} alpha
 * @returns {ConfidenceInterval}
 */
export function confidenceIntervalProportion(successes, total, alpha) {
    const ret = wasm.confidenceIntervalProportion(successes, total, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ConfidenceInterval.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @returns {DescriptiveStats}
 */
export function describe(data) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.describe(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DescriptiveStats.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} hypothesized_mean
 * @param {number} alpha
 * @returns {TTestResult}
 */
export function tTestOneSample(data, hypothesized_mean, alpha) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.tTestOneSample(ptr0, len0, hypothesized_mean, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TTestResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data1
 * @param {Float64Array} data2
 * @param {number} alpha
 * @returns {TTestResult}
 */
export function tTestTwoSample(data1, data2, alpha) {
    const ptr0 = passArrayF64ToWasm0(data1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(data2, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.tTestTwoSample(ptr0, len0, ptr1, len1, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TTestResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data1
 * @param {Float64Array} data2
 * @param {number} alpha
 * @returns {TTestResult}
 */
export function tTestPaired(data1, data2, alpha) {
    const ptr0 = passArrayF64ToWasm0(data1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(data2, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.tTestPaired(ptr0, len0, ptr1, len1, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TTestResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data1
 * @param {Float64Array} data2
 * @param {number} alpha
 * @returns {TTestResult}
 */
export function welchTTest(data1, data2, alpha) {
    const ptr0 = passArrayF64ToWasm0(data1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(data2, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.welchTTest(ptr0, len0, ptr1, len1, alpha);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TTestResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data1
 * @param {Float64Array} data2
 * @returns {MannWhitneyResult}
 */
export function mannWhitneyU(data1, data2) {
    const ptr0 = passArrayF64ToWasm0(data1, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(data2, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.mannWhitneyU(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return MannWhitneyResult.__wrap(ret[0]);
}

/**
 * Convenience function: automated classification
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {AutoMLResult}
 */
export function auto_fit_classification(x, y, n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.auto_fit_classification(ptr0, len0, ptr1, len1, n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AutoMLResult.__wrap(ret[0]);
}

/**
 * Get algorithm recommendation based on data characteristics
 * @param {number} n_samples
 * @param {number} n_features
 * @param {number} n_classes
 * @param {boolean} is_sparse
 * @returns {string}
 */
export function recommend_algorithm(n_samples, n_features, n_classes, is_sparse) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.recommend_algorithm(n_samples, n_features, n_classes, is_sparse);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_export_4.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}
/**
 * One-liner AutoML: The simplest way to get started.
 * x_json: JSON array of arrays (Vec<Vec<f64>>), y_json: JSON array of f64
 * @param {string} x_json
 * @param {string} y_json
 * @returns {AutoMLResult}
 */
export function auto_fit(x_json, y_json) {
    const ptr0 = passStringToWasm0(x_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.auto_fit(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AutoMLResult.__wrap(ret[0]);
}

/**
 * Convenience function: automated regression
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {AutoMLResult}
 */
export function auto_fit_regression(x, y, n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.auto_fit_regression(ptr0, len0, ptr1, len1, n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AutoMLResult.__wrap(ret[0]);
}

/**
 * Uplift forest (uplift modeling)
 *
 * # Arguments
 * * `features` - Feature matrix (n_samples × n_features)
 * * `treatment` - Treatment assignment (0 = control, 1 = treated)
 * * `outcome` - Outcome variable
 * * `n_samples` - Number of samples
 * * `n_features` - Number of features
 * @param {Float64Array} features
 * @param {Float64Array} treatment
 * @param {Float64Array} outcome
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {UpliftModel}
 */
export function uplift_forest(features, treatment, outcome, n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(features, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(treatment, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(outcome, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.uplift_forest(ptr0, len0, ptr1, len1, ptr2, len2, n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return UpliftModel.__wrap(ret[0]);
}

/**
 * @param {Float64Array} treatment
 * @param {Float64Array} covariates
 * @param {Float64Array} outcome
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {CausalEffect}
 */
export function propensity_score_matching(treatment, covariates, outcome, n_samples, n_features) {
    const ptr0 = passArrayF64ToWasm0(treatment, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(covariates, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(outcome, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.propensity_score_matching(ptr0, len0, ptr1, len1, ptr2, len2, n_samples, n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return CausalEffect.__wrap(ret[0]);
}

/**
 * @param {Float64Array} outcome
 * @param {Float64Array} treatment
 * @param {Float64Array} instrument
 * @param {number} n_samples
 * @returns {CausalEffect}
 */
export function instrumental_variables(outcome, treatment, instrument, n_samples) {
    const ptr0 = passArrayF64ToWasm0(outcome, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(treatment, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(instrument, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.instrumental_variables(ptr0, len0, ptr1, len1, ptr2, len2, n_samples);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return CausalEffect.__wrap(ret[0]);
}

/**
 * @param {Float64Array} treated_pre
 * @param {Float64Array} treated_post
 * @param {Float64Array} control_pre
 * @param {Float64Array} control_post
 * @returns {CausalEffect}
 */
export function difference_in_differences(treated_pre, treated_post, control_pre, control_post) {
    const ptr0 = passArrayF64ToWasm0(treated_pre, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(treated_post, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(control_pre, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(control_post, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.difference_in_differences(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return CausalEffect.__wrap(ret[0]);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {number} eps
 * @param {number} min_points
 * @returns {DbscanResult}
 */
export function dbscan(data, n_features, eps, min_points) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.dbscan(ptr0, len0, n_features, eps, min_points);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DbscanResult.__wrap(ret[0]);
}

/**
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} gamma
 * @returns {number}
 */
export function rbfKernel(x, y, gamma) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.rbfKernel(ptr0, len0, ptr1, len1, gamma);
    return ret;
}

/**
 * @param {Float64Array} data
 * @param {number} n_samples
 * @param {number} n_features
 * @param {number} gamma
 * @returns {Float64Array}
 */
export function rbfKernelMatrix(data, n_samples, n_features, gamma) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.rbfKernelMatrix(ptr0, len0, n_samples, n_features, gamma);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} degree
 * @param {number} coef0
 * @returns {number}
 */
export function polynomialKernel(x, y, degree, coef0) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.polynomialKernel(ptr0, len0, ptr1, len1, degree, coef0);
    return ret;
}

/**
 * @param {Float64Array} data
 * @param {number} n_samples
 * @param {number} n_features
 * @param {number} degree
 * @param {number} gamma
 * @param {number} coef0
 * @returns {Float64Array}
 */
export function polynomialKernelMatrix(data, n_samples, n_features, degree, gamma, coef0) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.polynomialKernelMatrix(ptr0, len0, n_samples, n_features, degree, gamma, coef0);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} gamma
 * @param {number} coef0
 * @returns {number}
 */
export function sigmoidKernel(x, y, gamma, coef0) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.sigmoidKernel(ptr0, len0, ptr1, len1, gamma, coef0);
    return ret;
}

/**
 * @param {Float64Array} data
 * @param {number} n_samples
 * @param {number} n_features
 * @param {number} gamma
 * @param {number} coef0
 * @returns {Float64Array}
 */
export function sigmoidKernelMatrix(data, n_samples, n_features, gamma, coef0) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sigmoidKernelMatrix(ptr0, len0, n_samples, n_features, gamma, coef0);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * K-Means clustering algorithm
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {number} k
 * @param {number} max_iter
 * @returns {KMeansModel}
 */
export function kmeans(data, n_features, k, max_iter) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kmeans(ptr0, len0, n_features, k, max_iter);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return KMeansModel.__wrap(ret[0]);
}

/**
 * Fit a linear regression model using ordinary least squares
 * Uses the formula: slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @returns {LinearModel}
 */
export function linearRegression(x, y) {
    const ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.linearRegression(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LinearModel.__wrap(ret[0]);
}

/**
 * Simple linear regression with auto-generated x values (0, 1, 2, ...)
 * Optimized: uses closed-form formulas for sequential x values (no allocation)
 * @param {Float64Array} y
 * @returns {LinearModel}
 */
export function linearRegressionSimple(y) {
    const ptr0 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linearRegressionSimple(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LinearModel.__wrap(ret[0]);
}

/**
 * @param {number} n_features
 * @param {string} strategy
 * @param {number} fill_value
 * @returns {SimpleImputer}
 */
export function simpleImputer(n_features, strategy, fill_value) {
    const ptr0 = passStringToWasm0(strategy, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.simpleImputer(n_features, ptr0, len0, fill_value);
    return SimpleImputer.__wrap(ret);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} n_estimators
 * @param {number} learning_rate
 * @returns {AdaBoostClassifier}
 */
export function adaboostClassify(data, n_features, labels, n_estimators, learning_rate) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.adaboostClassify(ptr0, len0, n_features, ptr1, len1, n_estimators, learning_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AdaBoostClassifier.__wrap(ret[0]);
}

/**
 * Bayesian parameter estimation via MCMC.
 * @param {number} n_samples
 * @param {number} burn_in
 * @param {bigint} seed
 * @param {number} initial
 * @param {number} proposal_sd
 * @returns {BayesianResult}
 */
export function bayesianEstimate(n_samples, burn_in, seed, initial, proposal_sd) {
    const ret = wasm.bayesianEstimate(n_samples, burn_in, seed, initial, proposal_sd);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return BayesianResult.__wrap(ret[0]);
}

/**
 * Bayesian linear regression with conjugate prior.
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} targets
 * @param {number} prior_precision
 * @param {number} prior_alpha
 * @param {number} prior_beta
 * @returns {BayesianLinearModel}
 */
export function bayesianLinearRegression(data, n_features, targets, prior_precision, prior_alpha, prior_beta) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.bayesianLinearRegression(ptr0, len0, n_features, ptr1, len1, prior_precision, prior_alpha, prior_beta);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return BayesianLinearModel.__wrap(ret[0]);
}

/**
 * Interpret a Bayes factor.
 * @param {number} bf10
 * @returns {BayesFactorResult}
 */
export function interpretBayesFactor(bf10) {
    const ret = wasm.interpretBayesFactor(bf10);
    return BayesFactorResult.__wrap(ret);
}

/**
 * @param {Float64Array} data
 * @param {number} n_features
 * @param {Float64Array} labels
 * @param {number} lr
 * @param {number} max_iter
 * @param {number} lambda
 * @returns {LogisticModel}
 */
export function logisticRegression(data, n_features, labels, lr, max_iter, lambda) {
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.logisticRegression(ptr0, len0, n_features, ptr1, len1, lr, max_iter, lambda);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return LogisticModel.__wrap(ret[0]);
}

/**
 * Create a stacked ensemble
 *
 * # Arguments
 * * `base_models` - List of base model names
 * * `meta_model` - Meta-model name
 * * `X` - Training data (n_samples × n_features)
 * * `y` - Training labels
 * * `cv_folds` - Number of cross-validation folds
 * * `n_samples` - Number of samples
 * * `n_features` - Number of features
 * @param {string[]} base_models
 * @param {string} meta_model
 * @param {Float64Array} _x
 * @param {Float64Array} y
 * @param {number} cv_folds
 * @param {number} n_samples
 * @param {number} _n_features
 * @returns {any}
 */
export function stacked_ensemble(base_models, meta_model, _x, y, cv_folds, n_samples, _n_features) {
    const ptr0 = passArrayJsValueToWasm0(base_models, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(meta_model, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(_x, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(y, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.stacked_ensemble(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, cv_folds, n_samples, _n_features);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Create a blended ensemble
 *
 * # Arguments
 * * `models` - List of model names
 * * `weights` - Model weights (must sum to 1.0)
 * @param {string[]} models
 * @param {Float64Array} weights
 * @returns {any}
 */
export function blend_ensemble(models, weights) {
    const ptr0 = passArrayJsValueToWasm0(models, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(weights, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.blend_ensemble(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Create a voting ensemble
 *
 * # Arguments
 * * `models` - List of model names
 * * `voting` - Voting type
 * * `weights` - Optional weights (for Weighted voting)
 * @param {string[]} models
 * @param {VotingType} voting
 * @param {Float64Array | null} [weights]
 * @returns {any}
 */
export function voting_ensemble(models, voting, weights) {
    const ptr0 = passArrayJsValueToWasm0(models, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(weights) ? 0 : passArrayF64ToWasm0(weights, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.voting_ensemble(ptr0, len0, voting, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Compute ensemble weights based on validation performance
 *
 * # Arguments
 * * `validation_scores` - Validation scores for each model
 * * `weighting_method` - Method for computing weights
 * @param {Float64Array} validation_scores
 * @param {string} weighting_method
 * @returns {Float64Array}
 */
export function compute_ensemble_weights(validation_scores, weighting_method) {
    const ptr0 = passArrayF64ToWasm0(validation_scores, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(weighting_method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_ensemble_weights(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * @param {Float64Array} times
 * @param {Float64Array} events
 * @returns {any}
 */
export function kaplanMeier(times, events) {
    const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(events, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.kaplanMeier(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Float64Array} features
 * @param {number} n_features
 * @param {Float64Array} times
 * @param {Float64Array} events
 * @param {number} max_iter
 * @param {number} lr
 * @returns {any}
 */
export function coxProportionalHazards(features, n_features, times, events, max_iter, lr) {
    const ptr0 = passArrayF64ToWasm0(features, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(times, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(events, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.coxProportionalHazards(ptr0, len0, n_features, ptr1, len1, ptr2, len2, max_iter, lr);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Export model to ONNX format
 * @param {any} model
 * @returns {Uint8Array}
 */
export function export_onnx(model) {
    const ret = wasm.export_onnx(model);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Import model from ONNX format
 * @param {Uint8Array} bytes
 * @returns {any}
 */
export function import_onnx(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.import_onnx(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Fine-tune a pretrained model
 *
 * # Arguments
 * * `pretrained_model` - Pretrained model weights
 * * `x_new` - New training data
 * * `y_new` - New training labels
 * * `layers_to_freeze` - Which layers to freeze (don't update)
 * * `config` - Fine-tuning configuration (learning rate, epochs, etc.)
 * @param {Uint8Array} pretrained_model
 * @param {Float64Array} x_new
 * @param {Float64Array} y_new
 * @param {Uint32Array} layers_to_freeze
 * @param {FineTuneConfig} config
 * @returns {Uint8Array}
 */
export function fine_tune(pretrained_model, x_new, y_new, layers_to_freeze, config) {
    const ptr0 = passArray8ToWasm0(pretrained_model, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(x_new, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(y_new, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray32ToWasm0(layers_to_freeze, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    _assertClass(config, FineTuneConfig);
    const ret = wasm.fine_tune(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, config.__wbg_ptr);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * Extract features from intermediate layer
 *
 * # Arguments
 * * `model` - Trained model
 * * `x` - Input data
 * * `layer_index` - Which layer to extract from (0 = first hidden layer)
 * * `n_samples` - Number of samples
 * * `n_features` - Number of input features
 *
 * # Serialization format
 * `model` must be serialized with `serde_json::to_vec` (not `bincode::serialize`),
 * because `PersistentModel.parameters` is a `serde_json::Value` which bincode
 * cannot deserialize without explicit length hints (`SequenceMustHaveLength`).
 * @param {Uint8Array} model
 * @param {Float64Array} x
 * @param {number} layer_index
 * @param {number} n_samples
 * @param {number} n_features
 * @returns {Float64Array}
 */
export function extract_features(model, x, layer_index, n_samples, n_features) {
    const ptr0 = passArray8ToWasm0(model, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.extract_features(ptr0, len0, ptr1, len1, layer_index, n_samples, n_features);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Join two DataFrames
 * @param {any} left
 * @param {any} right
 * @param {string} on
 * @param {JoinType} how
 * @returns {any}
 */
export function join_dataframes(left, right, on, how) {
    const ptr0 = passStringToWasm0(on, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.join_dataframes(left, right, ptr0, len0, how);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

let cachedInt32ArrayMemory0 = null;

function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * Cooling schedule for simulated annealing
 * @enum {0 | 1 | 2}
 */
export const CoolingSchedule = Object.freeze({
    /**
     * Exponential cooling: T = T * cooling_rate
     */
    Exponential: 0, "0": "Exponential",
    /**
     * Linear cooling: T = T - cooling_rate
     */
    Linear: 1, "1": "Linear",
    /**
     * Adaptive cooling based on acceptance rate
     */
    Adaptive: 2, "2": "Adaptive",
});
/**
 * Crossover operator for genetic algorithms
 * @enum {0 | 1 | 2}
 */
export const CrossoverMethod = Object.freeze({
    /**
     * Single-point crossover
     */
    SinglePoint: 0, "0": "SinglePoint",
    /**
     * Two-point crossover
     */
    TwoPoint: 1, "1": "TwoPoint",
    /**
     * Uniform crossover (each gene from random parent)
     */
    Uniform: 2, "2": "Uniform",
});
/**
 * Data type for DataFrame columns
 * @enum {0 | 1 | 2 | 3}
 */
export const DataType = Object.freeze({
    Numeric: 0, "0": "Numeric",
    Categorical: 1, "1": "Categorical",
    Boolean: 2, "2": "Boolean",
    Temporal: 3, "3": "Temporal",
});
/**
 * Join type
 * @enum {0 | 1 | 2 | 3}
 */
export const JoinType = Object.freeze({
    Inner: 0, "0": "Inner",
    Left: 1, "1": "Left",
    Right: 2, "2": "Right",
    Outer: 3, "3": "Outer",
});
/**
 * Type of moving average
 * @enum {0 | 1 | 2}
 */
export const MovingAverageType = Object.freeze({
    /**
     * Simple Moving Average - equal weight to all periods
     */
    SMA: 0, "0": "SMA",
    /**
     * Exponential Moving Average - more weight to recent values
     */
    EMA: 1, "1": "EMA",
    /**
     * Weighted Moving Average - linearly decreasing weights
     */
    WMA: 2, "2": "WMA",
});
/**
 * Progress stage for AutoML operations
 * @enum {0 | 1 | 2 | 3 | 4}
 */
export const ProgressStage = Object.freeze({
    Initializing: 0, "0": "Initializing",
    FeatureSelection: 1, "1": "FeatureSelection",
    AlgorithmEvaluation: 2, "2": "AlgorithmEvaluation",
    PipelineOptimization: 3, "3": "PipelineOptimization",
    Complete: 4, "4": "Complete",
});
/**
 * Selection method for genetic algorithms
 * @enum {0 | 1 | 2}
 */
export const SelectionMethod = Object.freeze({
    /**
     * Tournament selection: select k individuals at random, choose best
     */
    Tournament: 0, "0": "Tournament",
    /**
     * Roulette wheel selection: probability proportional to fitness
     */
    Roulette: 1, "1": "Roulette",
    /**
     * Rank-based selection: probability based on fitness rank
     */
    Rank: 2, "2": "Rank",
});
/**
 * Trend direction
 * @enum {0 | 1 | 2}
 */
export const TrendDirection = Object.freeze({
    Up: 0, "0": "Up",
    Down: 1, "1": "Down",
    Flat: 2, "2": "Flat",
});
/**
 * EWMA trend classification
 * @enum {0 | 1 | 2}
 */
export const TrendType = Object.freeze({
    /**
     * No significant change
     */
    Stable: 0, "0": "Stable",
    /**
     * Values increasing
     */
    Rising: 1, "1": "Rising",
    /**
     * Values decreasing
     */
    Falling: 2, "2": "Falling",
});
/**
 * Voting type for ensemble
 * @enum {0 | 1 | 2}
 */
export const VotingType = Object.freeze({
    /**
     * Majority vote (hard voting)
     */
    Hard: 0, "0": "Hard",
    /**
     * Weighted probability average (soft voting)
     */
    Soft: 1, "1": "Soft",
    /**
     * User-specified weights
     */
    Weighted: 2, "2": "Weighted",
});

const AdaBoostClassifierFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_adaboostclassifier_free(ptr >>> 0, 1));
/**
 * AdaBoost Classifier - Adaptive Boosting
 * Ensemble of weighted weak learners (decision stumps)
 */
export class AdaBoostClassifier {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AdaBoostClassifier.prototype);
        obj.__wbg_ptr = ptr;
        AdaBoostClassifierFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AdaBoostClassifierFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_adaboostclassifier_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.adaboostclassifier_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get nEstimators() {
        const ret = wasm.adaboostclassifier_nEstimators(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.adaboostclassifier_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Predict probabilities (sigmoid of weighted vote)
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predictProba(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.adaboostclassifier_predictProba(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Predict class labels
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.adaboostclassifier_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const AnnealingOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_annealingoptions_free(ptr >>> 0, 1));
/**
 * Simulated Annealing options
 */
export class AnnealingOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnnealingOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_annealingoptions_free(ptr, 0);
    }
    /**
     * Initial temperature (default: 1000.0)
     * @returns {number}
     */
    get initial_temp() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Initial temperature (default: 1000.0)
     * @param {number} arg0
     */
    set initial_temp(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Cooling rate (default: 0.95)
     * @returns {number}
     */
    get cooling_rate() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Cooling rate (default: 0.95)
     * @param {number} arg0
     */
    set cooling_rate(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Minimum temperature (default: 1e-10)
     * @returns {number}
     */
    get min_temp() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Minimum temperature (default: 1e-10)
     * @param {number} arg0
     */
    set min_temp(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Cooling schedule (default: Exponential)
     * @returns {CoolingSchedule}
     */
    get cooling_schedule() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_schedule(this.__wbg_ptr);
        return ret;
    }
    /**
     * Cooling schedule (default: Exponential)
     * @param {CoolingSchedule} arg0
     */
    set cooling_schedule(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_schedule(this.__wbg_ptr, arg0);
    }
    /**
     * Iterations per temperature (default: 100)
     * @returns {number}
     */
    get iterations_per_temp() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Iterations per temperature (default: 100)
     * @param {number} arg0
     */
    set iterations_per_temp(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
}

const AnomalyBatchResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_anomalybatchresult_free(ptr >>> 0, 1));
/**
 * Anomaly detection result for multiple sequences
 */
export class AnomalyBatchResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnomalyBatchResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_anomalybatchresult_free(ptr, 0);
    }
    /**
     * Individual anomaly scores for each sequence
     * @returns {SequenceAnomaly[]}
     */
    get results() {
        const ret = wasm.__wbg_get_anomalybatchresult_results(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Individual anomaly scores for each sequence
     * @param {SequenceAnomaly[]} arg0
     */
    set results(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_anomalybatchresult_results(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Mean anomaly score across all sequences
     * @returns {number}
     */
    get mean_score() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Mean anomaly score across all sequences
     * @param {number} arg0
     */
    set mean_score(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Standard deviation of anomaly scores
     * @returns {number}
     */
    get std_dev() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Standard deviation of anomaly scores
     * @param {number} arg0
     */
    set std_dev(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Threshold for "highly anomalous" (mean + 2*std_dev)
     * @returns {number}
     */
    get anomaly_threshold() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Threshold for "highly anomalous" (mean + 2*std_dev)
     * @param {number} arg0
     */
    set anomaly_threshold(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
}

const AnovaResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_anovaresult_free(ptr >>> 0, 1));

export class AnovaResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AnovaResult.prototype);
        obj.__wbg_ptr = ptr;
        AnovaResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnovaResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_anovaresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get f_statistic() {
        const ret = wasm.anovaresult_f_statistic(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get within_groups_df() {
        const ret = wasm.anovaresult_within_groups_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get within_groups_ss() {
        const ret = wasm.anovaresult_within_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get between_groups_df() {
        const ret = wasm.anovaresult_between_groups_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get between_groups_ss() {
        const ret = wasm.anovaresult_between_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.anovaresult_p_value(this.__wbg_ptr);
        return ret;
    }
}

const AssociationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_associationresult_free(ptr >>> 0, 1));
/**
 * Result of Apriori frequent itemset mining.
 */
export class AssociationResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AssociationResult.prototype);
        obj.__wbg_ptr = ptr;
        AssociationResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AssociationResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_associationresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nTransactions() {
        const ret = wasm.associationresult_nTransactions(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get frequent itemsets as a JS array of arrays.
     * @returns {Array<any>}
     */
    get frequentItemsets() {
        const ret = wasm.associationresult_frequentItemsets(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get association rules.
     * @returns {AssociationRule[]}
     */
    get rules() {
        const ret = wasm.associationresult_rules(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}

const AssociationRuleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_associationrule_free(ptr >>> 0, 1));
/**
 * A single association rule: antecedent -> consequent with quality metrics.
 */
export class AssociationRule {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AssociationRule.prototype);
        obj.__wbg_ptr = ptr;
        AssociationRuleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AssociationRuleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_associationrule_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get antecedent() {
        const ret = wasm.associationrule_antecedent(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get confidence() {
        const ret = wasm.associationrule_confidence(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get consequent() {
        const ret = wasm.associationrule_consequent(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get lift() {
        const ret = wasm.associationrule_lift(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get support() {
        const ret = wasm.associationrule_support(this.__wbg_ptr);
        return ret;
    }
}

const AutoMLResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_automlresult_free(ptr >>> 0, 1));
/**
 * AutoML result with enhanced DX/QoL methods
 */
export class AutoMLResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AutoMLResult.prototype);
        obj.__wbg_ptr = ptr;
        AutoMLResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AutoMLResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_automlresult_free(ptr, 0);
    }
    /**
     * Best algorithm found
     * @returns {string}
     */
    get best_algorithm() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_automlresult_best_algorithm(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Best algorithm found
     * @param {string} arg0
     */
    set best_algorithm(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_best_algorithm(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Best validation score
     * @returns {number}
     */
    get best_score() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Best validation score
     * @param {number} arg0
     */
    set best_score(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Number of evaluations performed
     * @returns {number}
     */
    get evaluations() {
        const ret = wasm.__wbg_get_automlresult_evaluations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of evaluations performed
     * @param {number} arg0
     */
    set evaluations(arg0) {
        wasm.__wbg_set_automlresult_evaluations(this.__wbg_ptr, arg0);
    }
    /**
     * Selected feature indices
     * @returns {Uint32Array}
     */
    get selected_features() {
        const ret = wasm.__wbg_get_automlresult_selected_features(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Selected feature indices
     * @param {Uint32Array} arg0
     */
    set selected_features(arg0) {
        const ptr0 = passArray32ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_selected_features(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Algorithm scores (algorithm name, score)
     * @returns {string[]}
     */
    get algorithm_scores() {
        const ret = wasm.__wbg_get_automlresult_algorithm_scores(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Algorithm scores (algorithm name, score)
     * @param {string[]} arg0
     */
    set algorithm_scores(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_algorithm_scores(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Why this algorithm was chosen (DX feature)
     * @returns {string}
     */
    get rationale() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_automlresult_rationale(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Why this algorithm was chosen (DX feature)
     * @param {string} arg0
     */
    set rationale(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_rationale(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Total features before selection
     * @returns {number}
     */
    get original_features() {
        const ret = wasm.__wbg_get_automlresult_original_features(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Total features before selection
     * @param {number} arg0
     */
    set original_features(arg0) {
        wasm.__wbg_set_automlresult_original_features(this.__wbg_ptr, arg0);
    }
    /**
     * Whether feature selection was performed
     * @returns {boolean}
     */
    get feature_selection_performed() {
        const ret = wasm.__wbg_get_automlresult_feature_selection_performed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether feature selection was performed
     * @param {boolean} arg0
     */
    set feature_selection_performed(arg0) {
        wasm.__wbg_set_automlresult_feature_selection_performed(this.__wbg_ptr, arg0);
    }
    /**
     * Problem type detected
     * @returns {string}
     */
    get problem_type() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_automlresult_problem_type(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Problem type detected
     * @param {string} arg0
     */
    set problem_type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_problem_type(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Compare this result with another
     * @param {AutoMLResult} other
     * @returns {boolean}
     */
    is_better_than(other) {
        _assertClass(other, AutoMLResult);
        const ret = wasm.automlresult_is_better_than(this.__wbg_ptr, other.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get the score of a specific algorithm
     * @param {string} algorithm_name
     * @returns {number | undefined}
     */
    algorithm_score(algorithm_name) {
        const ptr0 = passStringToWasm0(algorithm_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.automlresult_algorithm_score(this.__wbg_ptr, ptr0, len0);
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * Get a human-readable summary of the AutoML result
     * @returns {string}
     */
    summary() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.automlresult_summary(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}

const BanditArmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_banditarm_free(ptr >>> 0, 1));
/**
 * Bandit arm (action option)
 */
export class BanditArm {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BanditArm.prototype);
        obj.__wbg_ptr = ptr;
        BanditArmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof BanditArm)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BanditArmFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_banditarm_free(ptr, 0);
    }
    /**
     * Arm name/identifier
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_banditarm_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Arm name/identifier
     * @param {string} arg0
     */
    set name(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_best_algorithm(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Total accumulated reward
     * @returns {number}
     */
    get total_reward() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Total accumulated reward
     * @param {number} arg0
     */
    set total_reward(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Number of times this arm was pulled
     * @returns {number}
     */
    get pull_count() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of times this arm was pulled
     * @param {number} arg0
     */
    set pull_count(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
}

const BanditStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_banditstate_free(ptr >>> 0, 1));
/**
 * Bandit state for tracking multiple arms
 */
export class BanditState {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BanditStateFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_banditstate_free(ptr, 0);
    }
    /**
     * All available arms
     * @returns {BanditArm[]}
     */
    get arms() {
        const ret = wasm.__wbg_get_banditstate_arms(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * All available arms
     * @param {BanditArm[]} arg0
     */
    set arms(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_banditstate_arms(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Total number of pulls across all arms
     * @returns {number}
     */
    get total_pulls() {
        const ret = wasm.__wbg_get_banditstate_total_pulls(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Total number of pulls across all arms
     * @param {number} arg0
     */
    set total_pulls(arg0) {
        wasm.__wbg_set_banditstate_total_pulls(this.__wbg_ptr, arg0);
    }
}

const BayesFactorResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bayesfactorresult_free(ptr >>> 0, 1));
/**
 * Bayes factor interpretation
 */
export class BayesFactorResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BayesFactorResult.prototype);
        obj.__wbg_ptr = ptr;
        BayesFactorResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BayesFactorResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bayesfactorresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get bayesFactor() {
        const ret = wasm.bayesfactorresult_bayesFactor(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get interpretation() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.bayesfactorresult_interpretation(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}

const BayesianLinearModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bayesianlinearmodel_free(ptr >>> 0, 1));
/**
 * Bayesian linear regression with conjugate normal-inverse-gamma prior
 */
export class BayesianLinearModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BayesianLinearModel.prototype);
        obj.__wbg_ptr = ptr;
        BayesianLinearModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BayesianLinearModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bayesianlinearmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.bayesianlinearmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float64Array}
     */
    get coefficients() {
        const ret = wasm.bayesianlinearmodel_coefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get interceptStd() {
        const ret = wasm.bayesianlinearmodel_interceptStd(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get coefficientStd() {
        const ret = wasm.bayesianlinearmodel_coefficientStd(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Predict for a single feature vector.
     * @param {Float64Array} features
     * @returns {number}
     */
    predict(features) {
        const ptr0 = passArrayF64ToWasm0(features, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.bayesianlinearmodel_predict(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.bayesianlinearmodel_intercept(this.__wbg_ptr);
        return ret;
    }
}

const BayesianResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bayesianresult_free(ptr >>> 0, 1));
/**
 * Result of Bayesian parameter estimation via MCMC
 */
export class BayesianResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BayesianResult.prototype);
        obj.__wbg_ptr = ptr;
        BayesianResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BayesianResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bayesianresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get posteriorStd() {
        const ret = wasm.anovaresult_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get posteriorMean() {
        const ret = wasm.anovaresult_f_statistic(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get posteriorMedian() {
        const ret = wasm.anovaresult_between_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ciLower() {
        const ret = wasm.anovaresult_within_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ciUpper() {
        const ret = wasm.anovaresult_between_groups_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.bayesianresult_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const BeamPathFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_beampath_free(ptr >>> 0, 1));
/**
 * Beam search path result
 */
export class BeamPath {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BeamPathFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_beampath_free(ptr, 0);
    }
    /**
     * Predicted sequence
     * @returns {string[]}
     */
    get sequence() {
        const ret = wasm.__wbg_get_beampath_sequence(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Predicted sequence
     * @param {string[]} arg0
     */
    set sequence(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_beampath_sequence(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Probability of this path
     * @returns {number}
     */
    get probability() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Probability of this path
     * @param {number} arg0
     */
    set probability(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Length of path
     * @returns {number}
     */
    get length() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Length of path
     * @param {number} arg0
     */
    set length(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
}

const CausalEffectFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_causaleffect_free(ptr >>> 0, 1));
/**
 * Causal effect estimation result
 */
export class CausalEffect {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CausalEffect.prototype);
        obj.__wbg_ptr = ptr;
        CausalEffectFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CausalEffectFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_causaleffect_free(ptr, 0);
    }
    /**
     * Average treatment effect (ATE)
     * @returns {number}
     */
    get ate() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Average treatment effect (ATE)
     * @param {number} arg0
     */
    set ate(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Confidence interval lower bound
     * @returns {number}
     */
    get ci_lower() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Confidence interval lower bound
     * @param {number} arg0
     */
    set ci_lower(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Confidence interval upper bound
     * @returns {number}
     */
    get ci_upper() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Confidence interval upper bound
     * @param {number} arg0
     */
    set ci_upper(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
    /**
     * P-value for significance test
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.__wbg_get_causaleffect_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * P-value for significance test
     * @param {number} arg0
     */
    set p_value(arg0) {
        wasm.__wbg_set_causaleffect_p_value(this.__wbg_ptr, arg0);
    }
    /**
     * Whether the effect is statistically significant
     * @returns {boolean}
     */
    get is_significant() {
        const ret = wasm.__wbg_get_causaleffect_is_significant(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether the effect is statistically significant
     * @param {boolean} arg0
     */
    set is_significant(arg0) {
        wasm.__wbg_set_causaleffect_is_significant(this.__wbg_ptr, arg0);
    }
    /**
     * Sample size (treated + control)
     * @returns {number}
     */
    get sample_size() {
        const ret = wasm.__wbg_get_causaleffect_sample_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Sample size (treated + control)
     * @param {number} arg0
     */
    set sample_size(arg0) {
        wasm.__wbg_set_causaleffect_sample_size(this.__wbg_ptr, arg0);
    }
    /**
     * Number of treated units
     * @returns {number}
     */
    get n_treated() {
        const ret = wasm.__wbg_get_causaleffect_n_treated(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of treated units
     * @param {number} arg0
     */
    set n_treated(arg0) {
        wasm.__wbg_set_causaleffect_n_treated(this.__wbg_ptr, arg0);
    }
    /**
     * Number of control units
     * @returns {number}
     */
    get n_control() {
        const ret = wasm.__wbg_get_causaleffect_n_control(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of control units
     * @param {number} arg0
     */
    set n_control(arg0) {
        wasm.__wbg_set_causaleffect_n_control(this.__wbg_ptr, arg0);
    }
}

const ChiSquareResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_chisquareresult_free(ptr >>> 0, 1));

export class ChiSquareResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ChiSquareResult.prototype);
        obj.__wbg_ptr = ptr;
        ChiSquareResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ChiSquareResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_chisquareresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get df() {
        const ret = wasm.chisquareresult_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.chisquareresult_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get statistic() {
        const ret = wasm.chisquareresult_statistic(this.__wbg_ptr);
        return ret;
    }
}

const ConfidenceIntervalFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_confidenceinterval_free(ptr >>> 0, 1));

export class ConfidenceInterval {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ConfidenceInterval.prototype);
        obj.__wbg_ptr = ptr;
        ConfidenceIntervalFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConfidenceIntervalFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_confidenceinterval_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get point_estimate() {
        const ret = wasm.confidenceinterval_point_estimate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get lower() {
        const ret = wasm.confidenceinterval_lower(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get upper() {
        const ret = wasm.confidenceinterval_upper(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get std_error() {
        const ret = wasm.confidenceinterval_std_error(this.__wbg_ptr);
        return ret;
    }
}

const DbscanResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dbscanresult_free(ptr >>> 0, 1));

export class DbscanResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DbscanResult.prototype);
        obj.__wbg_ptr = ptr;
        DbscanResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DbscanResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_dbscanresult_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    getLabels() {
        const ret = wasm.dbscanresult_getLabels(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    get nClusters() {
        const ret = wasm.dbscanresult_nClusters(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.dbscanresult_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get nNoise() {
        const ret = wasm.dbscanresult_nNoise(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const DecisionTreeModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decisiontreemodel_free(ptr >>> 0, 1));

export class DecisionTreeModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DecisionTreeModel.prototype);
        obj.__wbg_ptr = ptr;
        DecisionTreeModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecisionTreeModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decisiontreemodel_free(ptr, 0);
    }
    /**
     * Number of features (public for use by other algorithms like feature importance)
     * @returns {number}
     */
    n_features_val() {
        const ret = wasm.decisiontreemodel_n_features_val(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict single value without allocation (for ensemble use)
     * @param {Float64Array} features
     * @returns {number}
     */
    predict_single(features) {
        const ptr0 = passArrayF64ToWasm0(features, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.decisiontreemodel_predict_single(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {number}
     */
    get depth() {
        const ret = wasm.decisiontreemodel_depth(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get nNodes() {
        const ret = wasm.decisiontreemodel_nNodes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.decisiontreemodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.decisiontreemodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Return flat tree: [feature, threshold, left, right, prediction, is_leaf] per node
     * @returns {Float64Array}
     */
    getTree() {
        const ret = wasm.decisiontreemodel_getTree(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}

const DescriptiveStatsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_descriptivestats_free(ptr >>> 0, 1));

export class DescriptiveStats {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DescriptiveStats.prototype);
        obj.__wbg_ptr = ptr;
        DescriptiveStatsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DescriptiveStatsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_descriptivestats_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get n() {
        const ret = wasm.descriptivestats_n(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get max() {
        const ret = wasm.descriptivestats_max(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get min() {
        const ret = wasm.descriptivestats_min(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get std() {
        const ret = wasm.descriptivestats_std(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get mean() {
        const ret = wasm.descriptivestats_mean(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get median() {
        const ret = wasm.descriptivestats_median(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get kurtosis() {
        const ret = wasm.descriptivestats_kurtosis(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get skewness() {
        const ret = wasm.descriptivestats_skewness(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get variance() {
        const ret = wasm.descriptivestats_variance(this.__wbg_ptr);
        return ret;
    }
}

const DriftDetectionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_driftdetectionresult_free(ptr >>> 0, 1));
/**
 * Drift detection result
 */
export class DriftDetectionResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DriftDetectionResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_driftdetectionresult_free(ptr, 0);
    }
    /**
     * Detected drift points
     * @returns {DriftPoint[]}
     */
    get drifts() {
        const ret = wasm.__wbg_get_driftdetectionresult_drifts(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Detected drift points
     * @param {DriftPoint[]} arg0
     */
    set drifts(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_driftdetectionresult_drifts(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Number of drifts detected
     * @returns {number}
     */
    get drifts_detected() {
        const ret = wasm.__wbg_get_driftdetectionresult_drifts_detected(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of drifts detected
     * @param {number} arg0
     */
    set drifts_detected(arg0) {
        wasm.__wbg_set_driftdetectionresult_drifts_detected(this.__wbg_ptr, arg0);
    }
    /**
     * Window size used for detection
     * @returns {number}
     */
    get window_size() {
        const ret = wasm.__wbg_get_driftdetectionresult_window_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Window size used for detection
     * @param {number} arg0
     */
    set window_size(arg0) {
        wasm.__wbg_set_driftdetectionresult_window_size(this.__wbg_ptr, arg0);
    }
    /**
     * Method used
     * @returns {string}
     */
    get method() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_driftdetectionresult_method(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Method used
     * @param {string} arg0
     */
    set method(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_driftdetectionresult_method(this.__wbg_ptr, ptr0, len0);
    }
}

const DriftPointFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_driftpoint_free(ptr >>> 0, 1));
/**
 * Drift point detected in a sequence
 */
export class DriftPoint {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DriftPoint.prototype);
        obj.__wbg_ptr = ptr;
        DriftPointFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof DriftPoint)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DriftPointFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_driftpoint_free(ptr, 0);
    }
    /**
     * Position/index where drift was detected
     * @returns {number}
     */
    get position() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Position/index where drift was detected
     * @param {number} arg0
     */
    set position(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
    /**
     * Jaccard distance score (0-1, higher = more drift)
     * @returns {number}
     */
    get distance() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Jaccard distance score (0-1, higher = more drift)
     * @param {number} arg0
     */
    set distance(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Type of drift detected
     * @returns {string}
     */
    get drift_type() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_driftpoint_drift_type(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Type of drift detected
     * @param {string} arg0
     */
    set drift_type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_best_algorithm(this.__wbg_ptr, ptr0, len0);
    }
}

const EWMAResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ewmaresult_free(ptr >>> 0, 1));
/**
 * EWMA smoothing result
 */
export class EWMAResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EWMAResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ewmaresult_free(ptr, 0);
    }
    /**
     * Smoothed values
     * @returns {Float64Array}
     */
    get smoothed() {
        const ret = wasm.__wbg_get_ewmaresult_smoothed(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Smoothed values
     * @param {Float64Array} arg0
     */
    set smoothed(arg0) {
        const ptr0 = passArrayF64ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ewmaresult_smoothed(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Trend classification
     * @returns {string}
     */
    get trend() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_ewmaresult_trend(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Trend classification
     * @param {string} arg0
     */
    set trend(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ewmaresult_trend(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Last smoothed value
     * @returns {number}
     */
    get last_value() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Last smoothed value
     * @param {number} arg0
     */
    set last_value(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
}

const ElasticNetModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_elasticnetmodel_free(ptr >>> 0, 1));
/**
 * Elastic Net Regression - Combined L1 (Lasso) and L2 (Ridge) regularization
 * Loss: (1/(2n)) * ||y - Xw||^2 + alpha * l1_ratio * ||w||_1 + 0.5 * alpha * (1-l1_ratio) * ||w||_2^2
 */
export class ElasticNetModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ElasticNetModel.prototype);
        obj.__wbg_ptr = ptr;
        ElasticNetModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ElasticNetModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_elasticnetmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.elasticnetmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get l1Ratio() {
        const ret = wasm.elasticnetmodel_l1Ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.elasticnetmodel_intercept(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.elasticnetmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get coefficients() {
        const ret = wasm.elasticnetmodel_coefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Predict target values
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.elasticnetmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {number}
     */
    get alpha() {
        const ret = wasm.elasticnetmodel_alpha(this.__wbg_ptr);
        return ret;
    }
}

const ExponentialModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_exponentialmodel_free(ptr >>> 0, 1));
/**
 * Result of an exponential regression fit: y = a * e^(b*x)
 */
export class ExponentialModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ExponentialModel.prototype);
        obj.__wbg_ptr = ptr;
        ExponentialModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ExponentialModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_exponentialmodel_free(ptr, 0);
    }
    /**
     * Predict a single value
     * @param {number} x
     * @returns {number}
     */
    predict_one(x) {
        const ret = wasm.exponentialmodel_predict_one(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * Get the equation as a string
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.exponentialmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Calculate the doubling time (if b > 0) or half-life (if b < 0)
     * @returns {number}
     */
    doublingTime() {
        const ret = wasm.exponentialmodel_doublingTime(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the amplitude (a in y = a * e^(bx))
     * @returns {number}
     */
    get a() {
        const ret = wasm.confidenceinterval_lower(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the growth rate (b in y = a * e^(bx))
     * @returns {number}
     */
    get b() {
        const ret = wasm.confidenceinterval_upper(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the number of data points used in fitting
     * @returns {number}
     */
    get n() {
        const ret = wasm.exponentialmodel_n(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict multiple values
     * @param {Float64Array} x_values
     * @returns {Float64Array}
     */
    predict(x_values) {
        const ptr0 = passArrayF64ToWasm0(x_values, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.exponentialmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Get the R-squared (coefficient of determination)
     * @returns {number}
     */
    get rSquared() {
        const ret = wasm.confidenceinterval_point_estimate(this.__wbg_ptr);
        return ret;
    }
}

const FeatureImportanceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_featureimportance_free(ptr >>> 0, 1));
/**
 * Feature importance result for a single feature
 */
export class FeatureImportance {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(FeatureImportance.prototype);
        obj.__wbg_ptr = ptr;
        FeatureImportanceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof FeatureImportance)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FeatureImportanceFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_featureimportance_free(ptr, 0);
    }
    /**
     * Feature index or name
     * @returns {number}
     */
    get feature() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Feature index or name
     * @param {number} arg0
     */
    set feature(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Position in the original feature vector
     * @returns {number}
     */
    get position() {
        const ret = wasm.__wbg_get_featureimportance_position(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Position in the original feature vector
     * @param {number} arg0
     */
    set position(arg0) {
        wasm.__wbg_set_featureimportance_position(this.__wbg_ptr, arg0);
    }
    /**
     * Baseline confidence without this feature
     * @returns {number}
     */
    get confidence_without() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Baseline confidence without this feature
     * @param {number} arg0
     */
    set confidence_without(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Delta in confidence when feature is removed
     * @returns {number}
     */
    get delta() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Delta in confidence when feature is removed
     * @param {number} arg0
     */
    set delta(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Normalized importance (0-1, sums to 1 across all features)
     * @returns {number}
     */
    get importance() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Normalized importance (0-1, sums to 1 across all features)
     * @param {number} arg0
     */
    set importance(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
}

const FeatureImportanceResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_featureimportanceresult_free(ptr >>> 0, 1));
/**
 * Feature importance analysis result
 */
export class FeatureImportanceResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FeatureImportanceResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_featureimportanceresult_free(ptr, 0);
    }
    /**
     * Baseline confidence (with all features)
     * @returns {number}
     */
    get baseline() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Baseline confidence (with all features)
     * @param {number} arg0
     */
    set baseline(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Individual feature importances
     * @returns {FeatureImportance[]}
     */
    get importances() {
        const ret = wasm.__wbg_get_featureimportanceresult_importances(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Individual feature importances
     * @param {FeatureImportance[]} arg0
     */
    set importances(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_featureimportanceresult_importances(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Method used for importance computation
     * @returns {string}
     */
    get method() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_featureimportanceresult_method(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Method used for importance computation
     * @param {string} arg0
     */
    set method(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ewmaresult_trend(this.__wbg_ptr, ptr0, len0);
    }
}

const FineTuneConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_finetuneconfig_free(ptr >>> 0, 1));
/**
 * Configuration for fine-tuning a model
 */
export class FineTuneConfig {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FineTuneConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_finetuneconfig_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get learning_rate() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set learning_rate(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get epochs() {
        const ret = wasm.__wbg_get_finetuneconfig_epochs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set epochs(arg0) {
        wasm.__wbg_set_finetuneconfig_epochs(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_samples() {
        const ret = wasm.__wbg_get_finetuneconfig_n_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_samples(arg0) {
        wasm.__wbg_set_finetuneconfig_n_samples(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_features() {
        const ret = wasm.__wbg_get_finetuneconfig_n_features(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_features(arg0) {
        wasm.__wbg_set_finetuneconfig_n_features(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} learning_rate
     * @param {number} epochs
     * @param {number} n_samples
     * @param {number} n_features
     */
    constructor(learning_rate, epochs, n_samples, n_features) {
        const ret = wasm.finetuneconfig_new(learning_rate, epochs, n_samples, n_features);
        this.__wbg_ptr = ret >>> 0;
        FineTuneConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const GPModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gpmodel_free(ptr >>> 0, 1));
/**
 * Gaussian Process regression model
 */
export class GPModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GPModel.prototype);
        obj.__wbg_ptr = ptr;
        GPModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GPModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gpmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.gpmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get kernelType() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gpmodel_kernelType(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get nTrain() {
        const ret = wasm.gpmodel_nTrain(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict using the GP model. Returns mean, std, lower CI, upper CI.
     * @param {Float64Array} x_test
     * @returns {GPPrediction}
     */
    predict(x_test) {
        const ptr0 = passArrayF64ToWasm0(x_test, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gpmodel_predict(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return GPPrediction.__wrap(ret[0]);
    }
}

const GPPredictionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gpprediction_free(ptr >>> 0, 1));
/**
 * GP prediction result with uncertainty estimates
 */
export class GPPrediction {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GPPrediction.prototype);
        obj.__wbg_ptr = ptr;
        GPPredictionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GPPredictionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gpprediction_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get std() {
        const ret = wasm.gpprediction_std(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get mean() {
        const ret = wasm.gpprediction_mean(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get lower() {
        const ret = wasm.gpprediction_lower(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get upper() {
        const ret = wasm.gpprediction_upper(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get n_test() {
        const ret = wasm.gpprediction_n_test(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const GeneticOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_geneticoptions_free(ptr >>> 0, 1));
/**
 * Genetic Algorithm options
 */
export class GeneticOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GeneticOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_geneticoptions_free(ptr, 0);
    }
    /**
     * Population size (default: 50)
     * @returns {number}
     */
    get population_size() {
        const ret = wasm.__wbg_get_finetuneconfig_n_features(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Population size (default: 50)
     * @param {number} arg0
     */
    set population_size(arg0) {
        wasm.__wbg_set_finetuneconfig_n_features(this.__wbg_ptr, arg0);
    }
    /**
     * Number of generations (default: 100)
     * @returns {number}
     */
    get generations() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of generations (default: 100)
     * @param {number} arg0
     */
    set generations(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
    /**
     * Crossover rate (default: 0.8)
     * @returns {number}
     */
    get crossover_rate() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Crossover rate (default: 0.8)
     * @param {number} arg0
     */
    set crossover_rate(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Mutation rate (default: 0.1)
     * @returns {number}
     */
    get mutation_rate() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Mutation rate (default: 0.1)
     * @param {number} arg0
     */
    set mutation_rate(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Number of elite individuals to preserve (default: 1)
     * @returns {number}
     */
    get elitism_count() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of elite individuals to preserve (default: 1)
     * @param {number} arg0
     */
    set elitism_count(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Selection method (default: Tournament)
     * @returns {SelectionMethod}
     */
    get selection_method() {
        const ret = wasm.__wbg_get_geneticoptions_selection_method(this.__wbg_ptr);
        return ret;
    }
    /**
     * Selection method (default: Tournament)
     * @param {SelectionMethod} arg0
     */
    set selection_method(arg0) {
        wasm.__wbg_set_geneticoptions_selection_method(this.__wbg_ptr, arg0);
    }
    /**
     * Crossover method (default: SinglePoint)
     * @returns {CrossoverMethod}
     */
    get crossover_method() {
        const ret = wasm.__wbg_get_geneticoptions_crossover_method(this.__wbg_ptr);
        return ret;
    }
    /**
     * Crossover method (default: SinglePoint)
     * @param {CrossoverMethod} arg0
     */
    set crossover_method(arg0) {
        wasm.__wbg_set_geneticoptions_crossover_method(this.__wbg_ptr, arg0);
    }
    /**
     * Multi-point crossover points (used if crossover_method is TwoPoint, default: 2)
     * @returns {number}
     */
    get crossover_points() {
        const ret = wasm.__wbg_get_featureimportance_position(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Multi-point crossover points (used if crossover_method is TwoPoint, default: 2)
     * @param {number} arg0
     */
    set crossover_points(arg0) {
        wasm.__wbg_set_featureimportance_position(this.__wbg_ptr, arg0);
    }
    /**
     * Tournament size for tournament selection (default: 3)
     * @returns {number}
     */
    get tournament_size() {
        const ret = wasm.__wbg_get_causaleffect_sample_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Tournament size for tournament selection (default: 3)
     * @param {number} arg0
     */
    set tournament_size(arg0) {
        wasm.__wbg_set_causaleffect_sample_size(this.__wbg_ptr, arg0);
    }
}

const GradientBoostingClassifierFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gradientboostingclassifier_free(ptr >>> 0, 1));
/**
 * Gradient Boosting Classifier (XGBoost/LightGBM-style)
 * Sequential ensemble of weak learners (decision stumps) correcting previous errors
 */
export class GradientBoostingClassifier {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GradientBoostingClassifier.prototype);
        obj.__wbg_ptr = ptr;
        GradientBoostingClassifierFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GradientBoostingClassifierFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gradientboostingclassifier_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.gradientboostingclassifier_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gradientboostingclassifier_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get learningRate() {
        const ret = wasm.gradientboostingclassifier_learningRate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predictProba(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gradientboostingclassifier_predictProba(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {number}
     */
    get nTrees() {
        const ret = wasm.gradientboostingclassifier_nTrees(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gradientboostingclassifier_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const HMMFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hmm_free(ptr >>> 0, 1));
/**
 * Hidden Markov Model
 */
export class HMM {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(HMM.prototype);
        obj.__wbg_ptr = ptr;
        HMMFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HMMFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hmm_free(ptr, 0);
    }
    /**
     * Create an HMM from parameters.
     * @param {Float64Array} initial_probs
     * @param {Float64Array} transition_probs
     * @param {Float64Array} emission_probs
     * @param {number} n_states
     * @param {number} n_observations
     * @returns {HMM}
     */
    static fromParams(initial_probs, transition_probs, emission_probs, n_states, n_observations) {
        const ptr0 = passArrayF64ToWasm0(initial_probs, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(transition_probs, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(emission_probs, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.hmm_fromParams(ptr0, len0, ptr1, len1, ptr2, len2, n_states, n_observations);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return HMM.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    get nObservations() {
        const ret = wasm.hmm_nObservations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Train HMM using Baum-Welch (EM algorithm).
     * @param {Uint32Array} observations
     * @param {number} n_states
     * @param {number} n_obs_symbols
     * @param {number} max_iter
     * @param {number} tol
     * @param {bigint} seed
     * @returns {HMM}
     */
    static train(observations, n_states, n_obs_symbols, max_iter, tol, seed) {
        const ptr0 = passArray32ToWasm0(observations, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hmm_train(ptr0, len0, n_states, n_obs_symbols, max_iter, tol, seed);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return HMM.__wrap(ret[0]);
    }
    /**
     * Forward algorithm — compute P(observations | model).
     * @param {Uint32Array} observations
     * @returns {number}
     */
    forward(observations) {
        const ptr0 = passArray32ToWasm0(observations, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hmm_forward(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Viterbi algorithm — find most likely state sequence.
     * @param {Uint32Array} observations
     * @returns {Uint32Array}
     */
    viterbi(observations) {
        const ptr0 = passArray32ToWasm0(observations, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hmm_viterbi(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @returns {number}
     */
    get nStates() {
        const ret = wasm.hmm_nStates(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const KMeansModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kmeansmodel_free(ptr >>> 0, 1));
/**
 * Model for K-Means clustering.
 */
export class KMeansModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KMeansModel.prototype);
        obj.__wbg_ptr = ptr;
        KMeansModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KMeansModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kmeansmodel_free(ptr, 0);
    }
    /**
     * Get the number of iterations performed
     * @returns {number}
     */
    get iterations() {
        const ret = wasm.kmeansmodel_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Return a string representation of the model
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.kmeansmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the centroids as a flat array
     * @returns {Float64Array}
     */
    getCentroids() {
        const ret = wasm.kmeansmodel_getCentroids(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Get the number of features
     * @returns {number}
     */
    getNFeatures() {
        const ret = wasm.kmeansmodel_getNFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the cluster assignments for each training sample
     * @returns {Uint32Array}
     */
    getAssignments() {
        const ret = wasm.kmeansmodel_getAssignments(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get the number of clusters
     * @returns {number}
     */
    get k() {
        const ret = wasm.kmeansmodel_k(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the final inertia (sum of squared distances to nearest centroid)
     * @returns {number}
     */
    get inertia() {
        const ret = wasm.kmeansmodel_inertia(this.__wbg_ptr);
        return ret;
    }
    /**
     * Assign new data points to nearest centroid
     * @param {Float64Array} data
     * @returns {Uint32Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.kmeansmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
}

const KSTestResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kstestresult_free(ptr >>> 0, 1));

export class KSTestResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KSTestResult.prototype);
        obj.__wbg_ptr = ptr;
        KSTestResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KSTestResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kstestresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.kstestresult_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get statistic() {
        const ret = wasm.kstestresult_statistic(this.__wbg_ptr);
        return ret;
    }
}

const KnnModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_knnmodel_free(ptr >>> 0, 1));

export class KnnModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KnnModel.prototype);
        obj.__wbg_ptr = ptr;
        KnnModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KnnModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_knnmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.knnmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.knnmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predictProba(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.knnmodel_predictProba(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {number}
     */
    get k() {
        const ret = wasm.knnmodel_k(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Float64Array} data
     * @returns {Uint32Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.knnmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.knnmodel_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const LabelEncoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_labelencoder_free(ptr >>> 0, 1));
/**
 * Label Encoder - Encode categorical labels as integers
 */
export class LabelEncoder {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LabelEncoder.prototype);
        obj.__wbg_ptr = ptr;
        LabelEncoderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LabelEncoderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_labelencoder_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get classes() {
        const ret = wasm.labelencoder_classes(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.labelencoder_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} labels
     * @returns {Float64Array}
     */
    fitTransform(labels) {
        const ptr0 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.labelencoder_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Inverse transform encoded integers back to labels
     * @param {Float64Array} encoded
     * @returns {Float64Array}
     */
    inverseTransform(encoded) {
        const ptr0 = passArrayF64ToWasm0(encoded, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.labelencoder_inverseTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit encoder to labels (discover unique classes)
     * @param {Float64Array} labels
     */
    fit(labels) {
        const ptr0 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.labelencoder_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    get nClasses() {
        const ret = wasm.labelencoder_nClasses(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Transform labels to encoded integers
     * @param {Float64Array} labels
     * @returns {Float64Array}
     */
    transform(labels) {
        const ptr0 = passArrayF64ToWasm0(labels, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.labelencoder_transform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const LassoRegressionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_lassoregression_free(ptr >>> 0, 1));
/**
 * Lasso Regression - L1 regularized linear regression (using coordinate descent)
 */
export class LassoRegression {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LassoRegression.prototype);
        obj.__wbg_ptr = ptr;
        LassoRegressionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LassoRegressionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_lassoregression_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.lassoregression_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.lassoregression_intercept(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.lassoregression_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get coefficients() {
        const ret = wasm.lassoregression_coefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Predict target values
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.lassoregression_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const LinearModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_linearmodel_free(ptr >>> 0, 1));
/**
 * Result of a linear regression fit: y = slope * x + intercept
 */
export class LinearModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LinearModel.prototype);
        obj.__wbg_ptr = ptr;
        LinearModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LinearModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_linearmodel_free(ptr, 0);
    }
    /**
     * Predict a single value
     * @param {number} x
     * @returns {number}
     */
    predict_one(x) {
        const ret = wasm.linearmodel_predict_one(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * Get the equation as a string
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.linearmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the number of data points used in fitting
     * @returns {number}
     */
    get n() {
        const ret = wasm.exponentialmodel_n(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the slope (m in y = mx + b)
     * @returns {number}
     */
    get slope() {
        const ret = wasm.confidenceinterval_lower(this.__wbg_ptr);
        return ret;
    }
    /**
     * Predict multiple values
     * @param {Float64Array} x_values
     * @returns {Float64Array}
     */
    predict(x_values) {
        const ptr0 = passArrayF64ToWasm0(x_values, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.linearmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Get the intercept (b in y = mx + b)
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.confidenceinterval_upper(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the R-squared (coefficient of determination)
     * @returns {number}
     */
    get rSquared() {
        const ret = wasm.confidenceinterval_point_estimate(this.__wbg_ptr);
        return ret;
    }
}

const LinearSVMFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_linearsvm_free(ptr >>> 0, 1));
/**
 * Linear SVM Classifier (using PEGASOS algorithm for WASM compatibility)
 * Subgradient descent with hinge loss
 */
export class LinearSVM {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LinearSVM.prototype);
        obj.__wbg_ptr = ptr;
        LinearSVMFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LinearSVMFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_linearsvm_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.lassoregression_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.linearsvm_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Predict decision function (raw scores)
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    decisionFunction(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.linearsvm_decisionFunction(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Predict class labels
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.linearsvm_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const LogarithmicModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_logarithmicmodel_free(ptr >>> 0, 1));
/**
 * Result of a logarithmic regression fit: y = a + b * ln(x)
 */
export class LogarithmicModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LogarithmicModel.prototype);
        obj.__wbg_ptr = ptr;
        LogarithmicModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LogarithmicModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_logarithmicmodel_free(ptr, 0);
    }
    /**
     * Predict a single value
     * @param {number} x
     * @returns {number}
     */
    predict_one(x) {
        const ret = wasm.logarithmicmodel_predict_one(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * Get the equation as a string
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.logarithmicmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the intercept (a in y = a + b*ln(x))
     * @returns {number}
     */
    get a() {
        const ret = wasm.confidenceinterval_lower(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the coefficient (b in y = a + b*ln(x))
     * @returns {number}
     */
    get b() {
        const ret = wasm.confidenceinterval_upper(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the number of data points used in fitting
     * @returns {number}
     */
    get n() {
        const ret = wasm.exponentialmodel_n(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict multiple values
     * @param {Float64Array} x_values
     * @returns {Float64Array}
     */
    predict(x_values) {
        const ptr0 = passArrayF64ToWasm0(x_values, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.logarithmicmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Get the R-squared (coefficient of determination)
     * @returns {number}
     */
    get rSquared() {
        const ret = wasm.confidenceinterval_point_estimate(this.__wbg_ptr);
        return ret;
    }
}

const LogisticModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_logisticmodel_free(ptr >>> 0, 1));

export class LogisticModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LogisticModel.prototype);
        obj.__wbg_ptr = ptr;
        LogisticModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LogisticModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_logisticmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get iterations() {
        const ret = wasm.logisticmodel_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float64Array}
     */
    getWeights() {
        const ret = wasm.logisticmodel_getWeights(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.logisticmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predictProba(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.logisticmodel_predictProba(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {number}
     */
    get bias() {
        const ret = wasm.logisticmodel_bias(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get loss() {
        const ret = wasm.logisticmodel_loss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Float64Array} data
     * @returns {Uint32Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.logisticmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
}

const MCMCResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mcmcresult_free(ptr >>> 0, 1));
/**
 * Result of MCMC sampling (Metropolis-Hastings)
 */
export class MCMCResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MCMCResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mcmcresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get posteriorStd() {
        const ret = wasm.mcmcresult_posteriorStd(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get posteriorMean() {
        const ret = wasm.mcmcresult_posteriorMean(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get acceptanceRate() {
        const ret = wasm.mcmcresult_acceptanceRate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get samples() {
        const ret = wasm.mcmcresult_samples(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get ciLower() {
        const ret = wasm.mcmcresult_ciLower(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ciUpper() {
        const ret = wasm.mcmcresult_ciUpper(this.__wbg_ptr);
        return ret;
    }
}

const MannWhitneyResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mannwhitneyresult_free(ptr >>> 0, 1));

export class MannWhitneyResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MannWhitneyResult.prototype);
        obj.__wbg_ptr = ptr;
        MannWhitneyResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MannWhitneyResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mannwhitneyresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get u_statistic() {
        const ret = wasm.chisquareresult_statistic(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.chisquareresult_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get z_approx() {
        const ret = wasm.chisquareresult_df(this.__wbg_ptr);
        return ret;
    }
}

const MarkovChainFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_markovchain_free(ptr >>> 0, 1));
/**
 * A discrete Markov chain with transition matrix and initial distribution
 */
export class MarkovChain {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MarkovChain.prototype);
        obj.__wbg_ptr = ptr;
        MarkovChainFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MarkovChainFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_markovchain_free(ptr, 0);
    }
    /**
     * Create a Markov chain from a flat row-major transition matrix and initial distribution.
     * @param {Float64Array} transition_matrix
     * @param {number} n_states
     * @param {Float64Array} initial_distribution
     * @returns {MarkovChain}
     */
    static fromMatrix(transition_matrix, n_states, initial_distribution) {
        const ptr0 = passArrayF64ToWasm0(transition_matrix, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(initial_distribution, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.markovchain_fromMatrix(ptr0, len0, n_states, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MarkovChain.__wrap(ret[0]);
    }
    /**
     * Compute the steady-state distribution (power iteration).
     * @param {number} max_iter
     * @param {number} tol
     * @returns {Float64Array}
     */
    steadyState(max_iter, tol) {
        const ret = wasm.markovchain_steadyState(this.__wbg_ptr, max_iter, tol);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Compute the n-step transition probability matrix.
     * @param {number} n_steps
     * @returns {Float64Array}
     */
    nStepProbability(n_steps) {
        const ret = wasm.markovchain_nStepProbability(this.__wbg_ptr, n_steps);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get nStates() {
        const ret = wasm.markovchain_nStates(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Simulate a trajectory of the chain.
     * @param {number} initial_state
     * @param {number} n_steps
     * @param {bigint} seed
     * @returns {Uint32Array}
     */
    simulate(initial_state, n_steps, seed) {
        const ret = wasm.markovchain_simulate(this.__wbg_ptr, initial_state, n_steps, seed);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}

const MatrixFactorizationConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_matrixfactorizationconfig_free(ptr >>> 0, 1));
/**
 * Matrix factorization configuration
 */
export class MatrixFactorizationConfig {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MatrixFactorizationConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_matrixfactorizationconfig_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get n_users() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_users(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_items() {
        const ret = wasm.__wbg_get_featureimportance_position(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_items(arg0) {
        wasm.__wbg_set_featureimportance_position(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_factors() {
        const ret = wasm.__wbg_get_causaleffect_sample_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_factors(arg0) {
        wasm.__wbg_set_causaleffect_sample_size(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get max_iter() {
        const ret = wasm.__wbg_get_causaleffect_n_treated(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set max_iter(arg0) {
        wasm.__wbg_set_causaleffect_n_treated(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get lr() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set lr(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get reg() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set reg(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {bigint}
     */
    get seed() {
        const ret = wasm.__wbg_get_matrixfactorizationconfig_seed(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {bigint} arg0
     */
    set seed(arg0) {
        wasm.__wbg_set_matrixfactorizationconfig_seed(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} n_users
     * @param {number} n_items
     * @param {number} n_factors
     * @param {number} max_iter
     * @param {number} lr
     * @param {number} reg
     * @param {bigint} seed
     */
    constructor(n_users, n_items, n_factors, max_iter, lr, reg, seed) {
        const ret = wasm.matrixfactorizationconfig_new(n_users, n_items, n_factors, max_iter, lr, reg, seed);
        this.__wbg_ptr = ret >>> 0;
        MatrixFactorizationConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const MinMaxScalerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_minmaxscaler_free(ptr >>> 0, 1));
/**
 * MinMax Scaler - Transform features to [0, 1] range
 */
export class MinMaxScaler {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MinMaxScaler.prototype);
        obj.__wbg_ptr = ptr;
        MinMaxScalerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MinMaxScalerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_minmaxscaler_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.minmaxscaler_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.minmaxscaler_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.minmaxscaler_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Inverse transform scaled data back to original
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    inverseTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.minmaxscaler_inverseTransform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit scaler to data (compute min and scale per feature)
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.minmaxscaler_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.minmaxscaler_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Transform data using fitted parameters
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.minmaxscaler_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const MixupConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mixupconfig_free(ptr >>> 0, 1));
/**
 * Mixup configuration
 */
export class MixupConfig {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MixupConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mixupconfig_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get alpha() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set alpha(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_samples1() {
        const ret = wasm.__wbg_get_finetuneconfig_epochs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_samples1(arg0) {
        wasm.__wbg_set_finetuneconfig_epochs(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_samples2() {
        const ret = wasm.__wbg_get_finetuneconfig_n_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_samples2(arg0) {
        wasm.__wbg_set_finetuneconfig_n_samples(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get n_features() {
        const ret = wasm.__wbg_get_finetuneconfig_n_features(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set n_features(arg0) {
        wasm.__wbg_set_finetuneconfig_n_features(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} alpha
     * @param {number} n_samples1
     * @param {number} n_samples2
     * @param {number} n_features
     */
    constructor(alpha, n_samples1, n_samples2, n_features) {
        const ret = wasm.finetuneconfig_new(alpha, n_samples1, n_samples2, n_features);
        this.__wbg_ptr = ret >>> 0;
        MixupConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const MonteCarloBootstrapResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_montecarlobootstrapresult_free(ptr >>> 0, 1));
/**
 * Result of bootstrap estimation
 */
export class MonteCarloBootstrapResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MonteCarloBootstrapResult.prototype);
        obj.__wbg_ptr = ptr;
        MonteCarloBootstrapResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MonteCarloBootstrapResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_montecarlobootstrapresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nBootstrap() {
        const ret = wasm.montecarlobootstrapresult_nBootstrap(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get statisticName() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.montecarlobootstrapresult_statisticName(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get ciLower() {
        const ret = wasm.montecarlobootstrapresult_ciLower(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ciUpper() {
        const ret = wasm.montecarlobootstrapresult_ciUpper(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get estimate() {
        const ret = wasm.montecarlobootstrapresult_estimate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get stdError() {
        const ret = wasm.montecarlobootstrapresult_stdError(this.__wbg_ptr);
        return ret;
    }
}

const MonteCarloResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_montecarloresult_free(ptr >>> 0, 1));
/**
 * Result of a Monte Carlo estimation
 */
export class MonteCarloResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MonteCarloResult.prototype);
        obj.__wbg_ptr = ptr;
        MonteCarloResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MonteCarloResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_montecarloresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get ciLower() {
        const ret = wasm.montecarloresult_ciLower(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ciUpper() {
        const ret = wasm.montecarloresult_ciUpper(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get estimate() {
        const ret = wasm.montecarloresult_estimate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get converged() {
        const ret = wasm.montecarloresult_converged(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.montecarloresult_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get stdError() {
        const ret = wasm.montecarloresult_stdError(this.__wbg_ptr);
        return ret;
    }
}

const NaiveBayesModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_naivebayesmodel_free(ptr >>> 0, 1));

export class NaiveBayesModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(NaiveBayesModel.prototype);
        obj.__wbg_ptr = ptr;
        NaiveBayesModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NaiveBayesModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_naivebayesmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.naivebayesmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.naivebayesmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predictProba(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.naivebayesmodel_predictProba(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @param {Float64Array} data
     * @returns {Uint32Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.naivebayesmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @returns {number}
     */
    get nClasses() {
        const ret = wasm.naivebayesmodel_nClasses(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const NormalizerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_normalizer_free(ptr >>> 0, 1));
/**
 * Normalizer - Scale samples to unit norm (L1, L2, or Max)
 */
export class Normalizer {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Normalizer.prototype);
        obj.__wbg_ptr = ptr;
        NormalizerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NormalizerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_normalizer_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.normalizer_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.normalizer_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform (normalizer is stateless, so fit does nothing)
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.normalizer_fitTransform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {string}
     */
    get norm() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.normalizer_norm(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Transform data to unit norm
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.normalizer_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const OneHotEncoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_onehotencoder_free(ptr >>> 0, 1));
/**
 * One-Hot Encoder - Encode categorical features as binary vectors
 */
export class OneHotEncoder {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OneHotEncoder.prototype);
        obj.__wbg_ptr = ptr;
        OneHotEncoderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OneHotEncoderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_onehotencoder_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.onehotencoder_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get nCategories() {
        const ret = wasm.onehotencoder_nCategories(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.onehotencoder_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.onehotencoder_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit encoder to data (discover unique categories per feature)
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.onehotencoder_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Transform data to one-hot encoding
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.onehotencoder_transform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const OperationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_operationresult_free(ptr >>> 0, 1));
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
     * @returns {boolean}
     */
    is_success() {
        const ret = wasm.operationresult_is_success(this.__wbg_ptr);
        return ret !== 0;
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

const OrdinalEncoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ordinalencoder_free(ptr >>> 0, 1));
/**
 * Ordinal Encoder - Encode categorical features as ordered integers
 */
export class OrdinalEncoder {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OrdinalEncoder.prototype);
        obj.__wbg_ptr = ptr;
        OrdinalEncoderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OrdinalEncoderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ordinalencoder_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.onehotencoder_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.ordinalencoder_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ordinalencoder_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit encoder to data (discover unique categories per feature)
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ordinalencoder_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Transform data to ordinal encoding
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ordinalencoder_transform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const PSOOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psooptions_free(ptr >>> 0, 1));
/**
 * PSO options
 */
export class PSOOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PSOOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psooptions_free(ptr, 0);
    }
    /**
     * Swarm size (default: 30)
     * @returns {number}
     */
    get swarm_size() {
        const ret = wasm.__wbg_get_psooptions_swarm_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Swarm size (default: 30)
     * @param {number} arg0
     */
    set swarm_size(arg0) {
        wasm.__wbg_set_psooptions_swarm_size(this.__wbg_ptr, arg0);
    }
    /**
     * Number of iterations (default: 100)
     * @returns {number}
     */
    get iterations() {
        const ret = wasm.__wbg_get_psooptions_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of iterations (default: 100)
     * @param {number} arg0
     */
    set iterations(arg0) {
        wasm.__wbg_set_psooptions_iterations(this.__wbg_ptr, arg0);
    }
    /**
     * Inertia weight (default: 0.7)
     * @returns {number}
     */
    get w() {
        const ret = wasm.__wbg_get_causaleffect_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * Inertia weight (default: 0.7)
     * @param {number} arg0
     */
    set w(arg0) {
        wasm.__wbg_set_causaleffect_p_value(this.__wbg_ptr, arg0);
    }
    /**
     * Cognitive coefficient (default: 1.5)
     * @returns {number}
     */
    get c1() {
        const ret = wasm.__wbg_get_psooptions_c1(this.__wbg_ptr);
        return ret;
    }
    /**
     * Cognitive coefficient (default: 1.5)
     * @param {number} arg0
     */
    set c1(arg0) {
        wasm.__wbg_set_psooptions_c1(this.__wbg_ptr, arg0);
    }
    /**
     * Social coefficient (default: 1.5)
     * @returns {number}
     */
    get c2() {
        const ret = wasm.__wbg_get_psooptions_c2(this.__wbg_ptr);
        return ret;
    }
    /**
     * Social coefficient (default: 1.5)
     * @param {number} arg0
     */
    set c2(arg0) {
        wasm.__wbg_set_psooptions_c2(this.__wbg_ptr, arg0);
    }
}

const PcaResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pcaresult_free(ptr >>> 0, 1));

export class PcaResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PcaResult.prototype);
        obj.__wbg_ptr = ptr;
        PcaResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PcaResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pcaresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.pcaresult_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get nComponents() {
        const ret = wasm.pcaresult_nComponents(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.pcaresult_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    getComponents() {
        const ret = wasm.pcaresult_getComponents(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    getTransformed() {
        const ret = wasm.pcaresult_getTransformed(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    getExplainedVariance() {
        const ret = wasm.pcaresult_getExplainedVariance(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    getExplainedVarianceRatio() {
        const ret = wasm.pcaresult_getExplainedVarianceRatio(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    getMean() {
        const ret = wasm.pcaresult_getMean(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Project new data onto principal components
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pcaresult_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const PerceptronModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_perceptronmodel_free(ptr >>> 0, 1));

export class PerceptronModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PerceptronModel.prototype);
        obj.__wbg_ptr = ptr;
        PerceptronModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PerceptronModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_perceptronmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get iterations() {
        const ret = wasm.perceptronmodel_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float64Array}
     */
    getWeights() {
        const ret = wasm.perceptronmodel_getWeights(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.perceptronmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get bias() {
        const ret = wasm.perceptronmodel_bias(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Float64Array} data
     * @returns {Uint32Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.perceptronmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @returns {boolean}
     */
    get converged() {
        const ret = wasm.perceptronmodel_converged(this.__wbg_ptr);
        return ret !== 0;
    }
}

const PolynomialModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_polynomialmodel_free(ptr >>> 0, 1));
/**
 * Result of a polynomial regression fit: y = c0 + c1*x + c2*x² + ...
 */
export class PolynomialModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PolynomialModel.prototype);
        obj.__wbg_ptr = ptr;
        PolynomialModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PolynomialModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_polynomialmodel_free(ptr, 0);
    }
    /**
     * Predict a single value using Horner's method for numerical stability
     * @param {number} x
     * @returns {number}
     */
    predict_one(x) {
        const ret = wasm.polynomialmodel_predict_one(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * Get the equation as a string
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.polynomialmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the coefficients as an array [c0, c1, c2, ...]
     * @returns {Float64Array}
     */
    getCoefficients() {
        const ret = wasm.polynomialmodel_getCoefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Get the number of data points used in fitting
     * @returns {number}
     */
    get n() {
        const ret = wasm.perceptronmodel_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the polynomial degree
     * @returns {number}
     */
    get degree() {
        const ret = wasm.polynomialmodel_degree(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict multiple values
     * @param {Float64Array} x_values
     * @returns {Float64Array}
     */
    predict(x_values) {
        const ptr0 = passArrayF64ToWasm0(x_values, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.polynomialmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Get the R-squared (coefficient of determination)
     * @returns {number}
     */
    get rSquared() {
        const ret = wasm.perceptronmodel_bias(this.__wbg_ptr);
        return ret;
    }
}

const PowerModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_powermodel_free(ptr >>> 0, 1));
/**
 * Result of a power regression fit: y = a * x^b
 */
export class PowerModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PowerModel.prototype);
        obj.__wbg_ptr = ptr;
        PowerModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PowerModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_powermodel_free(ptr, 0);
    }
    /**
     * Predict a single value
     * @param {number} x
     * @returns {number}
     */
    predict_one(x) {
        const ret = wasm.powermodel_predict_one(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * Get the equation as a string
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.powermodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the coefficient (a in y = a * x^b)
     * @returns {number}
     */
    get a() {
        const ret = wasm.confidenceinterval_lower(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the exponent (b in y = a * x^b)
     * @returns {number}
     */
    get b() {
        const ret = wasm.confidenceinterval_upper(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the number of data points used in fitting
     * @returns {number}
     */
    get n() {
        const ret = wasm.exponentialmodel_n(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict multiple values
     * @param {Float64Array} x_values
     * @returns {Float64Array}
     */
    predict(x_values) {
        const ptr0 = passArrayF64ToWasm0(x_values, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.powermodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Get the R-squared (coefficient of determination)
     * @returns {number}
     */
    get rSquared() {
        const ret = wasm.confidenceinterval_point_estimate(this.__wbg_ptr);
        return ret;
    }
}

const PrefixFeaturesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_prefixfeatures_free(ptr >>> 0, 1));
/**
 * Prefix features for sequence analysis
 */
export class PrefixFeatures {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PrefixFeaturesFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_prefixfeatures_free(ptr, 0);
    }
    /**
     * Length of prefix
     * @returns {number}
     */
    get length() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Length of prefix
     * @param {number} arg0
     */
    set length(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
    /**
     * Last item in prefix
     * @returns {string}
     */
    get last_item() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_prefixfeatures_last_item(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Last item in prefix
     * @param {string} arg0
     */
    set last_item(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_best_algorithm(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Number of unique items
     * @returns {number}
     */
    get unique_items() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of unique items
     * @param {number} arg0
     */
    set unique_items(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Number of repeated consecutive items
     * @returns {number}
     */
    get rework_count() {
        const ret = wasm.__wbg_get_featureimportance_position(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of repeated consecutive items
     * @param {number} arg0
     */
    set rework_count(arg0) {
        wasm.__wbg_set_featureimportance_position(this.__wbg_ptr, arg0);
    }
    /**
     * Normalized entropy of item frequencies [0, 1]
     * @returns {number}
     */
    get frequency_entropy() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Normalized entropy of item frequencies [0, 1]
     * @param {number} arg0
     */
    set frequency_entropy(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
}

const QuantileRegressionModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_quantileregressionmodel_free(ptr >>> 0, 1));
/**
 * Quantile Regression - Predicts conditional quantiles via pinball loss.
 *
 * Pinball loss: L(y, f) = quantile * max(y - f, 0) + (1 - quantile) * max(f - y, 0)
 * - quantile = 0.5: median regression (least absolute deviations)
 * - quantile = 0.25: 25th percentile
 * - quantile = 0.75: 75th percentile
 */
export class QuantileRegressionModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(QuantileRegressionModel.prototype);
        obj.__wbg_ptr = ptr;
        QuantileRegressionModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QuantileRegressionModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_quantileregressionmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.lassoregression_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get quantile() {
        const ret = wasm.quantileregressionmodel_quantile(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.lassoregression_intercept(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.quantileregressionmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get coefficients() {
        const ret = wasm.quantileregressionmodel_coefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Predict target values at the fitted quantile.
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.quantileregressionmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const QueueDelayResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_queuedelayresult_free(ptr >>> 0, 1));
/**
 * Queue delay estimation result
 */
export class QueueDelayResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QueueDelayResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_queuedelayresult_free(ptr, 0);
    }
    /**
     * Expected wait time
     * @returns {number}
     */
    get wait_time() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Expected wait time
     * @param {number} arg0
     */
    set wait_time(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Server utilization (0-1)
     * @returns {number}
     */
    get utilization() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Server utilization (0-1)
     * @param {number} arg0
     */
    set utilization(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Whether system is stable (utilization < 1)
     * @returns {boolean}
     */
    get is_stable() {
        const ret = wasm.__wbg_get_queuedelayresult_is_stable(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether system is stable (utilization < 1)
     * @param {boolean} arg0
     */
    set is_stable(arg0) {
        wasm.__wbg_set_queuedelayresult_is_stable(this.__wbg_ptr, arg0);
    }
}

const RandomForestModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_randomforestmodel_free(ptr >>> 0, 1));

export class RandomForestModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RandomForestModel.prototype);
        obj.__wbg_ptr = ptr;
        RandomForestModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RandomForestModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_randomforestmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.randomforestmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.randomforestmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Predict class probabilities from per-tree vote fractions for a single sample.
     *
     * Returns a flat `[class_id, vote_fraction, class_id, vote_fraction, ...]` array
     * sorted by class_id ascending.  Only meaningful for classifiers; returns an
     * empty vector for regressors.
     * @param {Float64Array} sample
     * @returns {Float64Array}
     */
    predict_proba_single(sample) {
        const ptr0 = passArrayF64ToWasm0(sample, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.randomforestmodel_predict_proba_single(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * @returns {number}
     */
    get nTrees() {
        const ret = wasm.randomforestmodel_nTrees(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Predict using majority vote (classification) or averaging (regression)
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.randomforestmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const RidgeRegressionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ridgeregression_free(ptr >>> 0, 1));
/**
 * Ridge Regression - L2 regularized linear regression
 */
export class RidgeRegression {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RidgeRegression.prototype);
        obj.__wbg_ptr = ptr;
        RidgeRegressionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RidgeRegressionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ridgeregression_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.lassoregression_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get intercept() {
        const ret = wasm.lassoregression_intercept(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.ridgeregression_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get coefficients() {
        const ret = wasm.ridgeregression_coefficients(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Predict target values
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ridgeregression_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const RlStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rlstate_free(ptr >>> 0, 1));
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
    get health_level() {
        const ret = wasm.__wbg_get_rlstate_health_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set health_level(arg0) {
        wasm.__wbg_set_rlstate_health_level(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get event_rate_q() {
        const ret = wasm.__wbg_get_rlstate_event_rate_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set event_rate_q(arg0) {
        wasm.__wbg_set_rlstate_event_rate_q(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get activity_count_q() {
        const ret = wasm.__wbg_get_rlstate_activity_count_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set activity_count_q(arg0) {
        wasm.__wbg_set_rlstate_activity_count_q(this.__wbg_ptr, arg0);
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
    set spc_alert_level(arg0) {
        wasm.__wbg_set_rlstate_spc_alert_level(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get drift_status() {
        const ret = wasm.__wbg_get_rlstate_drift_status(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set drift_status(arg0) {
        wasm.__wbg_set_rlstate_drift_status(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get rework_ratio_q() {
        const ret = wasm.__wbg_get_rlstate_rework_ratio_q(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set rework_ratio_q(arg0) {
        wasm.__wbg_set_rlstate_rework_ratio_q(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get circuit_state() {
        const ret = wasm.__wbg_get_rlstate_circuit_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set circuit_state(arg0) {
        wasm.__wbg_set_rlstate_circuit_state(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get cycle_phase() {
        const ret = wasm.__wbg_get_rlstate_cycle_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set cycle_phase(arg0) {
        wasm.__wbg_set_rlstate_cycle_phase(this.__wbg_ptr, arg0);
    }
}

const RobustScalerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_robustscaler_free(ptr >>> 0, 1));
/**
 * Robust Scaler - Scale features using median and IQR (robust to outliers)
 */
export class RobustScaler {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RobustScaler.prototype);
        obj.__wbg_ptr = ptr;
        RobustScalerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RobustScalerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_robustscaler_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.minmaxscaler_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.robustscaler_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.robustscaler_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit scaler to data (compute median and IQR per feature)
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.robustscaler_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.minmaxscaler_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Transform data using fitted parameters
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.robustscaler_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const SVRConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_svrconfig_free(ptr >>> 0, 1));

export class SVRConfig {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SVRConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_svrconfig_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get epsilon() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set epsilon(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get c() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set c(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get max_iter() {
        const ret = wasm.__wbg_get_causaleffect_sample_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set max_iter(arg0) {
        wasm.__wbg_set_causaleffect_sample_size(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get lr() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set lr(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {bigint}
     */
    get seed() {
        const ret = wasm.__wbg_get_svrconfig_seed(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {bigint} arg0
     */
    set seed(arg0) {
        wasm.__wbg_set_svrconfig_seed(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} epsilon
     * @param {number} c
     * @param {number} max_iter
     * @param {number} lr
     * @param {bigint} seed
     */
    constructor(epsilon, c, max_iter, lr, seed) {
        const ret = wasm.svrconfig_new(epsilon, c, max_iter, lr, seed);
        this.__wbg_ptr = ret >>> 0;
        SVRConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const SVRModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_svrmodel_free(ptr >>> 0, 1));
/**
 * Epsilon-Support Vector Regression using PEGASOS-style subgradient descent.
 *
 * Uses epsilon-insensitive loss:
 * L(y, f(x)) = 0                        if |y - f(x)| <= epsilon
 * L(y, f(x)) = |y - f(x)| - epsilon     otherwise
 */
export class SVRModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SVRModel.prototype);
        obj.__wbg_ptr = ptr;
        SVRModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SVRModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_svrmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get epsilon() {
        const ret = wasm.svrmodel_epsilon(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.svrmodel_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float64Array}
     */
    get weights() {
        const ret = wasm.svrmodel_weights(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.svrmodel_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get supportAlphas() {
        const ret = wasm.svrmodel_supportAlphas(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get supportLabels() {
        const ret = wasm.svrmodel_supportLabels(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get supportVectors() {
        const ret = wasm.svrmodel_supportVectors(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get c() {
        const ret = wasm.svrmodel_c(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get bias() {
        const ret = wasm.svrmodel_bias(this.__wbg_ptr);
        return ret;
    }
    /**
     * Predict target values using the learned weight vector.
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    predict(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.svrmodel_predict(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const SeasonalDecompositionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_seasonaldecomposition_free(ptr >>> 0, 1));
/**
 * Seasonal decomposition result
 */
export class SeasonalDecomposition {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SeasonalDecomposition.prototype);
        obj.__wbg_ptr = ptr;
        SeasonalDecompositionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SeasonalDecompositionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_seasonaldecomposition_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    getResidual() {
        const ret = wasm.seasonaldecomposition_getResidual(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    getSeasonal() {
        const ret = wasm.seasonaldecomposition_getSeasonal(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get period() {
        const ret = wasm.seasonaldecomposition_period(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float64Array}
     */
    getTrend() {
        const ret = wasm.seasonaldecomposition_getTrend(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}

const SeasonalityInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_seasonalityinfo_free(ptr >>> 0, 1));
/**
 * Seasonality detection result
 */
export class SeasonalityInfo {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SeasonalityInfo.prototype);
        obj.__wbg_ptr = ptr;
        SeasonalityInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SeasonalityInfoFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_seasonalityinfo_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get period() {
        const ret = wasm.seasonalityinfo_period(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get strength() {
        const ret = wasm.kstestresult_statistic(this.__wbg_ptr);
        return ret;
    }
}

const SequenceAnomalyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sequenceanomaly_free(ptr >>> 0, 1));
/**
 * Anomaly score for a single sequence
 */
export class SequenceAnomaly {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SequenceAnomaly.prototype);
        obj.__wbg_ptr = ptr;
        SequenceAnomalyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof SequenceAnomaly)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SequenceAnomalyFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sequenceanomaly_free(ptr, 0);
    }
    /**
     * Mean anomaly score (0 = normal, higher = more anomalous)
     * @returns {number}
     */
    get score() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Mean anomaly score (0 = normal, higher = more anomalous)
     * @param {number} arg0
     */
    set score(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Number of steps/transitions evaluated
     * @returns {number}
     */
    get steps() {
        const ret = wasm.__wbg_get_finetuneconfig_n_features(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of steps/transitions evaluated
     * @param {number} arg0
     */
    set steps(arg0) {
        wasm.__wbg_set_finetuneconfig_n_features(this.__wbg_ptr, arg0);
    }
    /**
     * Maximum single-step anomaly score
     * @returns {number}
     */
    get max_step_score() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Maximum single-step anomaly score
     * @param {number} arg0
     */
    set max_step_score(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
}

const SimpleImputerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_simpleimputer_free(ptr >>> 0, 1));
/**
 * Simple Imputer - Missing value imputation
 * Uses NaN as missing value indicator
 */
export class SimpleImputer {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SimpleImputer.prototype);
        obj.__wbg_ptr = ptr;
        SimpleImputerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SimpleImputerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_simpleimputer_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.simpleimputer_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get strategy() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.simpleimputer_strategy(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.simpleimputer_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one operation
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.simpleimputer_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Fit imputer to data (compute imputation values per feature)
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.simpleimputer_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Transform data by imputing missing values
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.simpleimputer_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const StandardScalerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_standardscaler_free(ptr >>> 0, 1));

export class StandardScaler {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(StandardScaler.prototype);
        obj.__wbg_ptr = ptr;
        StandardScalerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StandardScalerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_standardscaler_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get nFeatures() {
        const ret = wasm.minmaxscaler_nFeatures(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.standardscaler_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fit and transform in one step
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    fitTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.standardscaler_fitTransform(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Inverse transform: x * std + mean
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    inverseTransform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.standardscaler_inverseTransform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Compute mean and std per feature from data
     * @param {Float64Array} data
     */
    fit(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.standardscaler_fit(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    get nSamples() {
        const ret = wasm.minmaxscaler_nSamples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Apply z-score normalization: (x - mean) / std
     * @param {Float64Array} data
     * @returns {Float64Array}
     */
    transform(data) {
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.standardscaler_transform(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
}

const TTestResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ttestresult_free(ptr >>> 0, 1));

export class TTestResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TTestResult.prototype);
        obj.__wbg_ptr = ptr;
        TTestResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TTestResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ttestresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get df() {
        const ret = wasm.anovaresult_between_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.anovaresult_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ci_lower() {
        const ret = wasm.anovaresult_between_groups_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ci_upper() {
        const ret = wasm.anovaresult_within_groups_df(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get mean_diff() {
        const ret = wasm.anovaresult_within_groups_ss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get statistic() {
        const ret = wasm.anovaresult_f_statistic(this.__wbg_ptr);
        return ret;
    }
}

const TopKPredictionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_topkprediction_free(ptr >>> 0, 1));
/**
 * Top-k prediction result
 */
export class TopKPrediction {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TopKPredictionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_topkprediction_free(ptr, 0);
    }
    /**
     * Predicted next items/states
     * @returns {string[]}
     */
    get items() {
        const ret = wasm.__wbg_get_topkprediction_items(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Predicted next items/states
     * @param {string[]} arg0
     */
    set items(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_topkprediction_items(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Probability for each predicted item
     * @returns {Float64Array}
     */
    get probabilities() {
        const ret = wasm.__wbg_get_topkprediction_probabilities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Probability for each predicted item
     * @param {Float64Array} arg0
     */
    set probabilities(arg0) {
        const ptr0 = passArrayF64ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_topkprediction_probabilities(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Confidence (max probability)
     * @returns {number}
     */
    get confidence() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Confidence (max probability)
     * @param {number} arg0
     */
    set confidence(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Normalized entropy [0, 1] (0 = certain, 1 = uncertain)
     * @returns {number}
     */
    get entropy() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Normalized entropy [0, 1] (0 = certain, 1 = uncertain)
     * @param {number} arg0
     */
    set entropy(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
}

const TransitionEdgeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transitionedge_free(ptr >>> 0, 1));
/**
 * Transition graph edge
 */
export class TransitionEdge {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TransitionEdge.prototype);
        obj.__wbg_ptr = ptr;
        TransitionEdgeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof TransitionEdge)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransitionEdgeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transitionedge_free(ptr, 0);
    }
    /**
     * Source state
     * @returns {string}
     */
    get from() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_transitionedge_from(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Source state
     * @param {string} arg0
     */
    set from(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_automlresult_best_algorithm(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Destination state
     * @returns {string}
     */
    get to() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_transitionedge_to(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Destination state
     * @param {string} arg0
     */
    set to(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ewmaresult_trend(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Transition probability
     * @returns {number}
     */
    get probability() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Transition probability
     * @param {number} arg0
     */
    set probability(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
}

const TransitionGraphFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transitiongraph_free(ptr >>> 0, 1));
/**
 * Transition graph result
 */
export class TransitionGraph {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransitionGraphFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transitiongraph_free(ptr, 0);
    }
    /**
     * All edges with probabilities
     * @returns {TransitionEdge[]}
     */
    get edges() {
        const ret = wasm.__wbg_get_transitiongraph_edges(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * All edges with probabilities
     * @param {TransitionEdge[]} arg0
     */
    set edges(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transitiongraph_edges(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * All unique states/activities
     * @returns {string[]}
     */
    get states() {
        const ret = wasm.__wbg_get_transitiongraph_states(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * All unique states/activities
     * @param {string[]} arg0
     */
    set states(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transitiongraph_states(this.__wbg_ptr, ptr0, len0);
    }
}

const TrendAnalysisFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_trendanalysis_free(ptr >>> 0, 1));
/**
 * Trend analysis result
 */
export class TrendAnalysis {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TrendAnalysis.prototype);
        obj.__wbg_ptr = ptr;
        TrendAnalysisFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TrendAnalysisFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_trendanalysis_free(ptr, 0);
    }
    /**
     * Get the forecasted values
     * @returns {Float64Array}
     */
    getForecast() {
        const ret = wasm.trendanalysis_getForecast(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Get the slope (rate of change per period)
     * @returns {number}
     */
    get slope() {
        const ret = wasm.trendanalysis_slope(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the trend strength (0-1, based on R²)
     * @returns {number}
     */
    get strength() {
        const ret = wasm.trendanalysis_strength(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the trend direction
     * @returns {TrendDirection}
     */
    get direction() {
        const ret = wasm.trendanalysis_direction(this.__wbg_ptr);
        return ret;
    }
}

const UCB1SelectionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ucb1selection_free(ptr >>> 0, 1));
/**
 * UCB1 selection result
 */
export class UCB1Selection {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        UCB1SelectionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ucb1selection_free(ptr, 0);
    }
    /**
     * Selected arm name
     * @returns {string}
     */
    get selected() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_ucb1selection_selected(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Selected arm name
     * @param {string} arg0
     */
    set selected(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ucb1selection_selected(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Index of selected arm
     * @returns {number}
     */
    get arm_index() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Index of selected arm
     * @param {number} arg0
     */
    set arm_index(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
    /**
     * UCB score (mean + exploration bonus)
     * @returns {number}
     */
    get ucb_score() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * UCB score (mean + exploration bonus)
     * @param {number} arg0
     */
    set ucb_score(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Mean reward of selected arm
     * @returns {number}
     */
    get mean_reward() {
        const ret = wasm.__wbg_get_annealingoptions_cooling_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Mean reward of selected arm
     * @param {number} arg0
     */
    set mean_reward(arg0) {
        wasm.__wbg_set_annealingoptions_cooling_rate(this.__wbg_ptr, arg0);
    }
    /**
     * Exploration bonus component
     * @returns {number}
     */
    get exploration_bonus() {
        const ret = wasm.__wbg_get_annealingoptions_min_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Exploration bonus component
     * @param {number} arg0
     */
    set exploration_bonus(arg0) {
        wasm.__wbg_set_annealingoptions_min_temp(this.__wbg_ptr, arg0);
    }
}

const UpliftModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_upliftmodel_free(ptr >>> 0, 1));
/**
 * Uplift model result
 */
export class UpliftModel {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(UpliftModel.prototype);
        obj.__wbg_ptr = ptr;
        UpliftModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        UpliftModelFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_upliftmodel_free(ptr, 0);
    }
    /**
     * Uplift scores for each sample
     * @returns {Float64Array}
     */
    get uplift_scores() {
        const ret = wasm.__wbg_get_upliftmodel_uplift_scores(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Uplift scores for each sample
     * @param {Float64Array} arg0
     */
    set uplift_scores(arg0) {
        const ptr0 = passArrayF64ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_ewmaresult_smoothed(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Average uplift
     * @returns {number}
     */
    get average_uplift() {
        const ret = wasm.__wbg_get_annealingoptions_initial_temp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Average uplift
     * @param {number} arg0
     */
    set average_uplift(arg0) {
        wasm.__wbg_set_annealingoptions_initial_temp(this.__wbg_ptr, arg0);
    }
    /**
     * Number of samples with positive uplift
     * @returns {number}
     */
    get n_positive() {
        const ret = wasm.__wbg_get_banditarm_pull_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of samples with positive uplift
     * @param {number} arg0
     */
    set n_positive(arg0) {
        wasm.__wbg_set_banditarm_pull_count(this.__wbg_ptr, arg0);
    }
    /**
     * Number of samples with negative uplift
     * @returns {number}
     */
    get n_negative() {
        const ret = wasm.__wbg_get_annealingoptions_iterations_per_temp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of samples with negative uplift
     * @param {number} arg0
     */
    set n_negative(arg0) {
        wasm.__wbg_set_annealingoptions_iterations_per_temp(this.__wbg_ptr, arg0);
    }
}

const WasmEventLogFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmeventlog_free(ptr >>> 0, 1));
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
}

const WasmOCELFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmocel_free(ptr >>> 0, 1));
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
}

export function __wbg_String_8f0eb39a4a4c2f66(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_associationrule_new(arg0) {
    const ret = AssociationRule.__wrap(arg0);
    return ret;
};

export function __wbg_banditarm_new(arg0) {
    const ret = BanditArm.__wrap(arg0);
    return ret;
};

export function __wbg_banditarm_unwrap(arg0) {
    const ret = BanditArm.__unwrap(arg0);
    return ret;
};

export function __wbg_buffer_609cc3eee51ed158(arg0) {
    const ret = arg0.buffer;
    return ret;
};

export function __wbg_call_672a4d21634d4a24() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_call_7cccdd69e0791ae2() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_done_769e5ede4b31c67b(arg0) {
    const ret = arg0.done;
    return ret;
};

export function __wbg_driftpoint_new(arg0) {
    const ret = DriftPoint.__wrap(arg0);
    return ret;
};

export function __wbg_driftpoint_unwrap(arg0) {
    const ret = DriftPoint.__unwrap(arg0);
    return ret;
};

export function __wbg_entries_3265d4158b33e5dc(arg0) {
    const ret = Object.entries(arg0);
    return ret;
};

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
};

export function __wbg_featureimportance_new(arg0) {
    const ret = FeatureImportance.__wrap(arg0);
    return ret;
};

export function __wbg_featureimportance_unwrap(arg0) {
    const ret = FeatureImportance.__unwrap(arg0);
    return ret;
};

export function __wbg_get_67b2ba62fc30de12() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments) };

export function __wbg_get_b9b93047fe3cf45b(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
};

export function __wbg_getwithrefkey_1dc361bd10053bfe(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
};

export function __wbg_instanceof_ArrayBuffer_e14585432e3737fc(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Map_f3469ce2244d2430(arg0) {
    let result;
    try {
        result = arg0 instanceof Map;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Uint8Array_17156bcf118086a9(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_isArray_a1eab7e0d067391b(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
};

export function __wbg_isSafeInteger_343e2beeeece1bb0(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
};

export function __wbg_iterator_9a24c88df860dc65() {
    const ret = Symbol.iterator;
    return ret;
};

export function __wbg_length_a446193dc22c12f8(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_length_c67d5e5c3b83737f(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_length_e2d2a49132c1b256(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_new_405e22f390576ce2() {
    const ret = new Object();
    return ret;
};

export function __wbg_new_5e0be73521bc8c17() {
    const ret = new Map();
    return ret;
};

export function __wbg_new_78feb108b6472713() {
    const ret = new Array();
    return ret;
};

export function __wbg_new_8a6f238a6ece86ea() {
    const ret = new Error();
    return ret;
};

export function __wbg_new_a12002a7f91c75be(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
};

export function __wbg_newwithbyteoffsetandlength_93c8e0c1a479fa1a(arg0, arg1, arg2) {
    const ret = new Float64Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbg_newwithlength_5ebc38e611488614(arg0) {
    const ret = new Float64Array(arg0 >>> 0);
    return ret;
};

export function __wbg_newwithlength_c4c419ef0bc8a1f8(arg0) {
    const ret = new Array(arg0 >>> 0);
    return ret;
};

export function __wbg_next_25feadfc0913fea9(arg0) {
    const ret = arg0.next;
    return ret;
};

export function __wbg_next_6574e1a8a62d1055() { return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
}, arguments) };

export function __wbg_now_807e54c39636c349() {
    const ret = Date.now();
    return ret;
};

export function __wbg_push_737cfc8c1432c2c6(arg0, arg1) {
    const ret = arg0.push(arg1);
    return ret;
};

export function __wbg_random_3ad904d98382defe() {
    const ret = Math.random();
    return ret;
};

export function __wbg_sequenceanomaly_new(arg0) {
    const ret = SequenceAnomaly.__wrap(arg0);
    return ret;
};

export function __wbg_sequenceanomaly_unwrap(arg0) {
    const ret = SequenceAnomaly.__unwrap(arg0);
    return ret;
};

export function __wbg_set_29b6f95e6adb667e(arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
};

export function __wbg_set_37837023f3d740e8(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
};

export function __wbg_set_3f1d0b984ed272ed(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
};

export function __wbg_set_65595bdd868b3009(arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
};

export function __wbg_set_8fc6bf8a5b1071d1(arg0, arg1, arg2) {
    const ret = arg0.set(arg1, arg2);
    return ret;
};

export function __wbg_set_bb8cecf6a62b9f46() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_stack_0ed75d68575b0f3c(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_transitionedge_new(arg0) {
    const ret = TransitionEdge.__wrap(arg0);
    return ret;
};

export function __wbg_transitionedge_unwrap(arg0) {
    const ret = TransitionEdge.__unwrap(arg0);
    return ret;
};

export function __wbg_value_cd1ffa7b1ab794f1(arg0) {
    const ret = arg0.value;
    return ret;
};

export function __wbindgen_as_number(arg0) {
    const ret = +arg0;
    return ret;
};

export function __wbindgen_bigint_from_i64(arg0) {
    const ret = arg0;
    return ret;
};

export function __wbindgen_bigint_from_u64(arg0) {
    const ret = BigInt.asUintN(64, arg0);
    return ret;
};

export function __wbindgen_bigint_get_as_i64(arg0, arg1) {
    const v = arg1;
    const ret = typeof(v) === 'bigint' ? v : undefined;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
};

export function __wbindgen_boolean_get(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
    return ret;
};

export function __wbindgen_debug_string(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbindgen_error_new(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbindgen_float64_array_new(arg0, arg1) {
    var v0 = getArrayF64FromWasm0(arg0, arg1).slice();
    wasm.__wbindgen_free(arg0, arg1 * 8, 8);
    const ret = v0;
    return ret;
};

export function __wbindgen_in(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
};

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_export_4;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

export function __wbindgen_is_bigint(arg0) {
    const ret = typeof(arg0) === 'bigint';
    return ret;
};

export function __wbindgen_is_function(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
};

export function __wbindgen_is_null(arg0) {
    const ret = arg0 === null;
    return ret;
};

export function __wbindgen_is_object(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

export function __wbindgen_is_string(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
};

export function __wbindgen_is_undefined(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

export function __wbindgen_jsval_eq(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
};

export function __wbindgen_jsval_loose_eq(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
};

export function __wbindgen_memory() {
    const ret = wasm.memory;
    return ret;
};

export function __wbindgen_number_get(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
};

export function __wbindgen_number_new(arg0) {
    const ret = arg0;
    return ret;
};

export function __wbindgen_string_get(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

