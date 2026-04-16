/**
 * process_mining TypeScript API
 *
 * This file defines the complete TypeScript interface that mirrors the Rust library API exactly.
 * It serves as the API specification for JavaScript/WASM bindings.
 */
// ============================================================================
// CORE MODULE - Data Structures
// ============================================================================
/**
 * XES Attribute Value types
 */
export var AttributeValueType;
(function (AttributeValueType) {
    AttributeValueType["String"] = "string";
    AttributeValueType["Int"] = "int";
    AttributeValueType["Float"] = "float";
    AttributeValueType["Date"] = "date";
    AttributeValueType["Boolean"] = "boolean";
    AttributeValueType["List"] = "list";
    AttributeValueType["Container"] = "container";
})(AttributeValueType || (AttributeValueType = {}));
/**
 * OCEL Attribute value types
 */
export var OCELAttributeType;
(function (OCELAttributeType) {
    OCELAttributeType["String"] = "string";
    OCELAttributeType["Int"] = "int";
    OCELAttributeType["Float"] = "float";
    OCELAttributeType["Boolean"] = "boolean";
    OCELAttributeType["Timestamp"] = "timestamp";
    OCELAttributeType["Json"] = "json";
})(OCELAttributeType || (OCELAttributeType = {}));
/**
 * OC-DECLARE modes
 */
export var O2OMode;
(function (O2OMode) {
    O2OMode["Basic"] = "basic";
    O2OMode["Extended"] = "extended";
})(O2OMode || (O2OMode = {}));
/**
 * OC-DECLARE reduction modes
 */
export var OCDeclareReductionMode;
(function (OCDeclareReductionMode) {
    OCDeclareReductionMode["Union"] = "union";
    OCDeclareReductionMode["Intersection"] = "intersection";
})(OCDeclareReductionMode || (OCDeclareReductionMode = {}));
// ============================================================================
// ANALYSIS MODULE - Event Data Analysis
// ============================================================================
/**
 * Dotted Chart axis options
 */
export var DottedChartXAxis;
(function (DottedChartXAxis) {
    DottedChartXAxis["CaseId"] = "case_id";
    DottedChartXAxis["EventSequence"] = "event_sequence";
    DottedChartXAxis["EventTimestamp"] = "timestamp";
    DottedChartXAxis["CustomAttribute"] = "custom_attribute";
})(DottedChartXAxis || (DottedChartXAxis = {}));
export var DottedChartYAxis;
(function (DottedChartYAxis) {
    DottedChartYAxis["CaseId"] = "case_id";
    DottedChartYAxis["Duration"] = "duration";
    DottedChartYAxis["CustomAttribute"] = "custom_attribute";
})(DottedChartYAxis || (DottedChartYAxis = {}));
export var DottedChartColorAxis;
(function (DottedChartColorAxis) {
    DottedChartColorAxis["Activity"] = "activity";
    DottedChartColorAxis["Resource"] = "resource";
    DottedChartColorAxis["CustomAttribute"] = "custom_attribute";
})(DottedChartColorAxis || (DottedChartColorAxis = {}));
// ============================================================================
// I/O TRAITS - Import/Export
// ============================================================================
/**
 * Supported file formats
 */
export var FileFormat;
(function (FileFormat) {
    FileFormat["XES"] = "xes";
    FileFormat["XES_GZ"] = "xes.gz";
    FileFormat["JSON"] = "json";
    FileFormat["JSON_GZ"] = "json.gz";
    FileFormat["XML"] = "xml";
    FileFormat["XML_GZ"] = "xml.gz";
    FileFormat["CSV"] = "csv";
    FileFormat["SQLite"] = "sqlite";
    FileFormat["DuckDB"] = "duckdb";
})(FileFormat || (FileFormat = {}));
// ============================================================================
// ERROR TYPES
// ============================================================================
export var EventLogIOErrorType;
(function (EventLogIOErrorType) {
    EventLogIOErrorType["IOError"] = "io_error";
    EventLogIOErrorType["ParseError"] = "parse_error";
    EventLogIOErrorType["SerializationError"] = "serialization_error";
})(EventLogIOErrorType || (EventLogIOErrorType = {}));
export var OCELIOErrorType;
(function (OCELIOErrorType) {
    OCELIOErrorType["IOError"] = "io_error";
    OCELIOErrorType["ParseError"] = "parse_error";
    OCELIOErrorType["SerializationError"] = "serialization_error";
    OCELIOErrorType["ValidationError"] = "validation_error";
})(OCELIOErrorType || (OCELIOErrorType = {}));
//# sourceMappingURL=api.js.map