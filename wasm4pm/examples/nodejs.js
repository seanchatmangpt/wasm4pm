#!/usr/bin/env node

/**
 * process_mining_wasm Node.js Example
 *
 * This example demonstrates complete workflows:
 * - Loading XES and OCEL files from disk
 * - Analyzing event logs
 * - Discovering process models
 * - Exporting results
 *
 * Run with: node examples/nodejs.js
 */

const pm = require('../pkg/process_mining_wasm');
const fs = require('fs');
const path = require('path');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

// Initialize the WASM module
section('Initialization');
log('Initializing Rust4PM WASM...', 'blue');

try {
  pm.init();
  log(`✓ WASM initialized`, 'green');
  log(`✓ Version: ${pm.get_version()}`, 'green');
} catch (error) {
  log(`✗ Failed to initialize: ${error.message}`, 'red');
  process.exit(1);
}

// Example 1: Load and analyze an XES file
section('Example 1: Load and Analyze XES');

const minimalXES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>

  <global scope="trace">
    <string key="concept:name" value="undefined"/>
  </global>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>
  </global>

  <classifier name="Event Name" keys="concept:name"/>

  <trace>
    <string key="concept:name" value="Case001"/>
    <event>
      <string key="concept:name" value="Request"/>
      <string key="org:resource" value="Alice"/>
      <date key="time:timestamp" value="2023-01-01T08:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <string key="org:resource" value="Bob"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <string key="org:resource" value="Charlie"/>
      <date key="time:timestamp" value="2023-01-01T12:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <string key="org:resource" value="Alice"/>
      <date key="time:timestamp" value="2023-01-01T14:00:00"/>
    </event>
  </trace>

  <trace>
    <string key="concept:name" value="Case002"/>
    <event>
      <string key="concept:name" value="Request"/>
      <string key="org:resource" value="Bob"/>
      <date key="time:timestamp" value="2023-01-02T08:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <string key="org:resource" value="Charlie"/>
      <date key="time:timestamp" value="2023-01-02T09:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <string key="org:resource" value="Alice"/>
      <date key="time:timestamp" value="2023-01-02T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <string key="org:resource" value="Bob"/>
      <date key="time:timestamp" value="2023-01-02T13:00:00"/>
    </event>
  </trace>
</log>`;

try {
  log('Loading XES content...', 'blue');
  const logHandle = pm.load_eventlog_from_xes(minimalXES);
  log(`✓ EventLog loaded with handle: ${logHandle}`, 'green');

  // Get statistics
  log('Analyzing event statistics...', 'blue');
  const statsJson = pm.analyze_event_statistics(logHandle);
  const stats = JSON.parse(statsJson);
  log('✓ Event Statistics:', 'green');
  console.log(JSON.stringify(stats, null, 2));

  // Store handle for later use
  const xesHandle = logHandle;

  // Example analysis
  log('Analyzing case durations...', 'blue');
  const durationJson = pm.analyze_case_duration(logHandle);
  const durations = JSON.parse(durationJson);
  log('✓ Case Durations:', 'green');
  console.log(JSON.stringify(durations, null, 2));
} catch (error) {
  log(`✗ Error loading XES: ${error.message}`, 'red');
}

// Example 2: OCEL handling
section('Example 2: Load and Analyze OCEL');

const minimalOCEL = {
  'ocel:global-event': {
    'ocel:attribute': [
      {
        'ocel:name': 'concept:name',
        'ocel:type': 'string',
      },
    ],
  },
  'ocel:global-object': {
    'ocel:object-type': [
      {
        'ocel:name': 'Order',
      },
      {
        'ocel:name': 'Item',
      },
    ],
  },
  'ocel:events': {
    'ocel:event': [
      {
        'ocel:id': 'e1',
        'ocel:type': 'Create Order',
        'ocel:timestamp': '2023-01-01T10:00:00',
        'ocel:omap': {
          'ocel:o': [
            {
              'ocel:id': 'o1',
            },
          ],
        },
      },
      {
        'ocel:id': 'e2',
        'ocel:type': 'Add Item',
        'ocel:timestamp': '2023-01-01T10:30:00',
        'ocel:omap': {
          'ocel:o': [
            {
              'ocel:id': 'o1',
            },
            {
              'ocel:id': 'i1',
            },
          ],
        },
      },
      {
        'ocel:id': 'e3',
        'ocel:type': 'Ship Order',
        'ocel:timestamp': '2023-01-01T14:00:00',
        'ocel:omap': {
          'ocel:o': [
            {
              'ocel:id': 'o1',
            },
          ],
        },
      },
    ],
  },
  'ocel:objects': {
    'ocel:object': [
      {
        'ocel:id': 'o1',
        'ocel:type': 'Order',
      },
      {
        'ocel:id': 'i1',
        'ocel:type': 'Item',
      },
    ],
  },
};

try {
  log('Loading OCEL JSON...', 'blue');
  const ocelHandle = pm.load_ocel_from_json(JSON.stringify(minimalOCEL));
  log(`✓ OCEL loaded with handle: ${ocelHandle}`, 'green');

  // Get OCEL statistics
  log('Analyzing OCEL statistics...', 'blue');
  const ocelStatsJson = pm.analyze_ocel_statistics(ocelHandle);
  const ocelStats = JSON.parse(ocelStatsJson);
  log('✓ OCEL Statistics:', 'green');
  console.log(JSON.stringify(ocelStats, null, 2));
} catch (error) {
  log(`✗ Error loading OCEL: ${error.message}`, 'red');
}

// Example 3: Discovery algorithms
section('Example 3: Process Discovery');

try {
  log('Loading XES for discovery...', 'blue');
  const logHandle = pm.load_eventlog_from_xes(minimalXES);

  // Discover DFG
  log('Discovering Directly-Follows Graph (DFG)...', 'blue');
  const dfgJson = pm.discover_dfg(logHandle);
  const dfg = JSON.parse(dfgJson);
  log('✓ DFG discovered', 'green');
  log(`  Nodes: ${dfg.nodes ? dfg.nodes.length : 0}`, 'green');
  log(`  Edges: ${dfg.edges ? dfg.edges.length : 0}`, 'green');
  if (dfg.edges && dfg.edges.length <= 10) {
    console.log(JSON.stringify(dfg, null, 2));
  }

  // Discover Petri Net with Alpha++
  log('Discovering with Alpha++ algorithm...', 'blue');
  const threshold = 0.0;
  const petriNetJson = pm.discover_alpha_plus_plus(logHandle, threshold);
  const petriNet = JSON.parse(petriNetJson);
  log('✓ Petri Net discovered', 'green');
  log(`  Places: ${petriNet.places ? petriNet.places.length : 0}`, 'green');
  log(`  Transitions: ${petriNet.transitions ? petriNet.transitions.length : 0}`, 'green');

  // Try DECLARE discovery
  log('Discovering DECLARE constraints...', 'blue');
  const declareJson = pm.discover_declare(logHandle);
  const declare = JSON.parse(declareJson);
  log('✓ DECLARE constraints discovered', 'green');
  log(`  Constraints: ${declare.constraints ? declare.constraints.length : 0}`, 'green');
} catch (error) {
  log(`✗ Error in discovery: ${error.message}`, 'red');
}

// Example 4: Available algorithms and functions
section('Example 4: Available Algorithms & Functions');

try {
  log('Available Discovery Algorithms:', 'blue');
  const algorithmsJson = pm.available_discovery_algorithms();
  const algorithms = JSON.parse(algorithmsJson);
  if (algorithms.algorithms) {
    algorithms.algorithms.forEach((algo) => {
      log(`  - ${algo.name}: ${algo.description}`, 'green');
    });
  }

  log('\nAvailable Analysis Functions:', 'blue');
  const functionsJson = pm.available_analysis_functions();
  const functions = JSON.parse(functionsJson);
  if (functions.functions) {
    functions.functions.forEach((func) => {
      log(`  - ${func.name}: ${func.description}`, 'green');
    });
  }
} catch (error) {
  log(`✗ Error getting algorithm list: ${error.message}`, 'red');
}

// Example 5: State management
section('Example 5: State Management');

try {
  log('Current object count:', 'blue');
  const count = pm.object_count();
  log(`✓ Objects stored: ${count}`, 'green');

  // Clear all objects
  log('Clearing all objects...', 'blue');
  pm.clear_all_objects();
  const newCount = pm.object_count();
  log(`✓ After clear: ${newCount} objects`, 'green');
} catch (error) {
  log(`✗ Error managing state: ${error.message}`, 'red');
}

// Example 6: Complete workflow
section('Example 6: Complete Workflow');

try {
  log('Step 1: Load event log', 'blue');
  const handle = pm.load_eventlog_from_xes(minimalXES);
  log('✓ EventLog loaded', 'green');

  log('Step 2: Analyze events', 'blue');
  const stats = JSON.parse(pm.analyze_event_statistics(handle));
  log(`✓ Found ${stats.num_events} events in ${stats.num_traces} traces`, 'green');

  log('Step 3: Discover process model', 'blue');
  const model = JSON.parse(pm.discover_dfg(handle));
  log(`✓ Discovered ${model.nodes.length} activities`, 'green');

  log('Step 4: Analyze durations', 'blue');
  const durationStats = JSON.parse(pm.analyze_case_duration(handle));
  log(`✓ Average duration: ${Math.round(durationStats.mean_duration / 60000)} minutes`, 'green');

  log('\n✓ Complete workflow finished successfully!', 'green');
} catch (error) {
  log(`✗ Error in workflow: ${error.message}`, 'red');
}

section('Examples completed');
log('All examples finished. Check output above for results.', 'bright');
