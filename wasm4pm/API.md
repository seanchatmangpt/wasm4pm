# Process Mining WASM API Reference

Complete API documentation for the process_mining_wasm module. This document covers all available functions and their usage.

## Table of Contents

1. [Initialization](#initialization)
2. [Data Loading](#data-loading)
3. [Data Export](#data-export)
4. [Discovery Algorithms](#discovery-algorithms)
5. [Analysis Functions](#analysis-functions)
6. [State Management](#state-management)
7. [Error Handling](#error-handling)
8. [Type Definitions](#type-definitions)

## Initialization

### init()

Initializes the WASM module. Must be called once before using any other functions.

```javascript
pm.init();
```

**Returns:** `void`

**Example:**
```javascript
const pm = require('process_mining_wasm');
pm.init();
```

### get_version()

Returns the version string of the process_mining library.

```javascript
const version = pm.get_version();
```

**Returns:** `string` - Version identifier (e.g., "0.5.4")

**Example:**
```javascript
console.log(`Using process_mining version: ${pm.get_version()}`);
```

## Data Loading

All loading functions return a handle (string) that identifies the loaded object for subsequent operations.

### load_eventlog_from_xes(content)

Loads an EventLog from XES (eXtensible Event Stream) format.

```javascript
const handle = pm.load_eventlog_from_xes(xesContent);
```

**Parameters:**
- `content` (string): XES XML content as a string

**Returns:** `string` - Object handle for the loaded EventLog

**Throws:** Error if XES content is invalid

**Example:**
```javascript
const fs = require('fs');
const xesContent = fs.readFileSync('eventlog.xes', 'utf8');
const logHandle = pm.load_eventlog_from_xes(xesContent);
console.log(`Loaded log with handle: ${logHandle}`);
```

### load_ocel_from_json(content)

Loads an OCEL (Object-Centric Event Log) from JSON format.

```javascript
const handle = pm.load_ocel_from_json(jsonContent);
```

**Parameters:**
- `content` (string): JSON content as a string

**Returns:** `string` - Object handle for the loaded OCEL

**Throws:** Error if JSON content is invalid

**Example:**
```javascript
const fs = require('fs');
const jsonContent = fs.readFileSync('ocel.json', 'utf8');
const ocelHandle = pm.load_ocel_from_json(jsonContent);
```

### load_ocel_from_xml(content)

Loads an OCEL from XML format.

```javascript
const handle = pm.load_ocel_from_xml(xmlContent);
```

**Parameters:**
- `content` (string): XML content as a string

**Returns:** `string` - Object handle for the loaded OCEL

**Throws:** Error if XML content is invalid

## Data Export

All export functions require a valid object handle returned from a loading function.

### export_eventlog_to_xes(handle)

Exports an EventLog to XES format.

```javascript
const xesContent = pm.export_eventlog_to_xes(handle);
```

**Parameters:**
- `handle` (string): Object handle returned from a loading function

**Returns:** `string` - XES XML content

**Throws:** Error if handle is invalid

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(originalXes);
const exportedXes = pm.export_eventlog_to_xes(logHandle);
fs.writeFileSync('exported.xes', exportedXes);
```

### export_ocel_to_json(handle)

Exports an OCEL to JSON format.

```javascript
const jsonContent = pm.export_ocel_to_json(handle);
```

**Parameters:**
- `handle` (string): Object handle for an OCEL

**Returns:** `string` - JSON content

**Throws:** Error if handle is invalid

### export_ocel_to_xml(handle)

Exports an OCEL to XML format.

```javascript
const xmlContent = pm.export_ocel_to_xml(handle);
```

**Parameters:**
- `handle` (string): Object handle for an OCEL

**Returns:** `string` - XML content

**Throws:** Error if handle is invalid

## Discovery Algorithms

Discovery algorithms analyze event logs and return Petri nets, graphs, or other process models.

### discover_alpha_plus_plus(handle, threshold)

Discovers a Petri net using the Alpha++ algorithm.

```javascript
const petriNetHandle = pm.discover_alpha_plus_plus(logHandle, threshold);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog
- `threshold` (number): Threshold value for noise filtering (0.0 - 1.0)

**Returns:** `string` - Object handle for the discovered Petri net

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
// Use threshold of 0.1 to filter out activities with <10% frequency
const petriNet = pm.discover_alpha_plus_plus(logHandle, 0.1);
```

**Note:** Threshold values:
- 0.0: No filtering, include all activities
- 0.1: Filter out activities with <10% frequency
- 0.5: Filter out activities with <50% frequency

### discover_dfg(handle)

Discovers a Directly-Follows Graph (DFG) from an EventLog.

```javascript
const dfgHandle = pm.discover_dfg(logHandle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - Object handle for the discovered DFG

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
const dfg = pm.discover_dfg(logHandle);
const dfgJson = pm.eventlog_to_json(dfg);
console.log(JSON.parse(dfgJson));
```

### discover_oc_dfg(handle)

Discovers an Object-Centric DFG from an OCEL.

```javascript
const ocDfgHandle = pm.discover_oc_dfg(ocelHandle);
```

**Parameters:**
- `handle` (string): Object handle for an OCEL

**Returns:** `string` - Object handle for the discovered Object-Centric DFG

**Example:**
```javascript
const ocelHandle = pm.load_ocel_from_json(ocelContent);
const ocDfg = pm.discover_oc_dfg(ocelHandle);
```

### discover_declare(handle)

Discovers DECLARE constraints from an EventLog.

```javascript
const declareHandle = pm.discover_declare(logHandle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - Object handle for the discovered DECLARE constraints

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
const declareConstraints = pm.discover_declare(logHandle);
```

### available_discovery_algorithms()

Returns a list of all available discovery algorithms.

```javascript
const algorithms = pm.available_discovery_algorithms();
```

**Returns:** `string` - JSON array of algorithm names

**Example:**
```javascript
const algoJson = pm.available_discovery_algorithms();
const algorithms = JSON.parse(algoJson);
console.log('Available discovery algorithms:', algorithms);
// Output: ["alpha++", "dfg", "oc-dfg", "declare", ...]
```

## Analysis Functions

Analysis functions compute statistics and insights from event logs.

### analyze_dotted_chart(handle)

Performs dotted chart analysis on an EventLog.

```javascript
const analysisHandle = pm.analyze_dotted_chart(logHandle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - Object handle containing analysis results

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
const analysis = pm.analyze_dotted_chart(logHandle);
const results = JSON.parse(pm.object_to_json(analysis));
```

### analyze_event_statistics(handle)

Computes event frequency statistics for an EventLog.

```javascript
const statsHandle = pm.analyze_event_statistics(logHandle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - Object handle containing event statistics

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
const stats = pm.analyze_event_statistics(logHandle);
const statsJson = pm.object_to_json(stats);
console.log(JSON.parse(statsJson));
// Output might look like:
// {
//   "events": {
//     "Activity A": 150,
//     "Activity B": 200,
//     ...
//   }
// }
```

### analyze_ocel_statistics(handle)

Computes statistics for an OCEL.

```javascript
const statsHandle = pm.analyze_ocel_statistics(ocelHandle);
```

**Parameters:**
- `handle` (string): Object handle for an OCEL

**Returns:** `string` - Object handle containing OCEL statistics

### analyze_case_duration(handle)

Analyzes case durations in an EventLog.

```javascript
const durationHandle = pm.analyze_case_duration(logHandle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - Object handle containing duration analysis

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
const durations = pm.analyze_case_duration(logHandle);
const results = JSON.parse(pm.object_to_json(durations));
// Results might include min, max, average, median duration
```

### available_analysis_functions()

Returns a list of all available analysis functions.

```javascript
const functions = pm.available_analysis_functions();
```

**Returns:** `string` - JSON array of function names

**Example:**
```javascript
const functionsJson = pm.available_analysis_functions();
const functions = JSON.parse(functionsJson);
console.log('Available analysis functions:', functions);
```

## State Management

Functions for managing objects stored in the WASM module.

### object_count()

Returns the number of objects currently stored.

```javascript
const count = pm.object_count();
```

**Returns:** `number` - Number of stored objects

**Example:**
```javascript
console.log(`Objects stored: ${pm.object_count()}`);
```

### delete_object(handle)

Deletes a stored object by its handle.

```javascript
const success = pm.delete_object(handle);
```

**Parameters:**
- `handle` (string): Object handle to delete

**Returns:** `boolean` - true if successful, false otherwise

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
console.log(`Before deletion: ${pm.object_count()}`);
pm.delete_object(logHandle);
console.log(`After deletion: ${pm.object_count()}`);
```

### clear_all_objects()

Clears all stored objects.

```javascript
pm.clear_all_objects();
```

**Returns:** `void`

**Warning:** This operation cannot be undone. All handles become invalid.

**Example:**
```javascript
pm.clear_all_objects();
console.log(`Objects remaining: ${pm.object_count()}`); // Output: 0
```

### object_to_json(handle)

Converts a stored object to JSON representation.

```javascript
const jsonString = pm.object_to_json(handle);
```

**Parameters:**
- `handle` (string): Object handle to convert

**Returns:** `string` - JSON representation of the object

**Example:**
```javascript
const statsHandle = pm.analyze_event_statistics(logHandle);
const statsJson = pm.object_to_json(statsHandle);
const statsObj = JSON.parse(statsJson);
```

### eventlog_to_json(handle)

Converts an EventLog to JSON representation.

```javascript
const jsonString = pm.eventlog_to_json(handle);
```

**Parameters:**
- `handle` (string): Object handle for an EventLog

**Returns:** `string` - JSON representation of the EventLog

## Error Handling

The WASM module throws JavaScript errors for invalid operations:

```javascript
try {
  const result = pm.discover_alpha_plus_plus("invalid_handle", 0.1);
} catch (error) {
  console.error(`Error: ${error.message}`);
}
```

Common error scenarios:
- Invalid handle: "Object not found"
- Invalid threshold: "Threshold must be between 0.0 and 1.0"
- Corrupted data: "Failed to parse input data"
- Out of memory: "Memory allocation failed"

## Type Definitions

TypeScript type definitions are automatically generated and included in the package.

```typescript
interface ProcessMiningWasm {
  init(): void;
  get_version(): string;
  load_eventlog_from_xes(content: string): string;
  load_ocel_from_json(content: string): string;
  load_ocel_from_xml(content: string): string;
  export_eventlog_to_xes(handle: string): string;
  export_ocel_to_json(handle: string): string;
  export_ocel_to_xml(handle: string): string;
  discover_alpha_plus_plus(handle: string, threshold: number): string;
  discover_dfg(handle: string): string;
  discover_oc_dfg(handle: string): string;
  discover_declare(handle: string): string;
  available_discovery_algorithms(): string;
  analyze_dotted_chart(handle: string): string;
  analyze_event_statistics(handle: string): string;
  analyze_ocel_statistics(handle: string): string;
  analyze_case_duration(handle: string): string;
  available_analysis_functions(): string;
  object_count(): number;
  delete_object(handle: string): boolean;
  clear_all_objects(): void;
  object_to_json(handle: string): string;
  eventlog_to_json(handle: string): string;
}
```

## Notes

- All handles are strings and are unique identifiers for objects stored in the WASM runtime
- Objects must be manually deleted to free memory using `delete_object()` or `clear_all_objects()`
- JSON strings returned by functions must be parsed using `JSON.parse()` to access the actual data
- Threshold values in discovery algorithms are normalized between 0.0 and 1.0
- XES and OCEL formats are industry-standard formats for event log representation
