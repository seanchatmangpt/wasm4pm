// Example usage of process_mining_wasm in Node.js

const pm = require('../pkg/process_mining_wasm');
const fs = require('fs');

// Initialize the WASM module
console.log('Initializing Rust4PM WASM...');
pm.init();
console.log('Version:', pm.get_version());

// Example 1: Load and analyze an XES file
console.log('\n=== Example 1: Load and Analyze XES ===');

// For this example, we'll create a minimal XES content
const minimalXES = `<?xml version="1.0" encoding="UTF-8"?>
<log>
  <trace>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
      <date key="time:timestamp" value="2023-01-01T10:30:00"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity C"/>
      <date key="time:timestamp" value="2023-01-01T11:45:00"/>
    </event>
  </trace>
</log>`;

try {
  const logHandle = pm.load_eventlog_from_xes(minimalXES);
  console.log('EventLog loaded with handle:', logHandle);

  // Get statistics
  const stats = JSON.parse(pm.analyze_event_statistics(logHandle));
  console.log('Event Statistics:', JSON.stringify(stats, null, 2));

  // Try to get basic info
  const count = pm.object_count();
  console.log('Objects stored:', count);
} catch (error) {
  console.error('Error loading XES:', error.message);
}

// Example 2: OCEL handling
console.log('\n=== Example 2: Load and Analyze OCEL ===');

const minimalOCEL = {
  "ocel:global-event": {
    "ocel:attribute": []
  },
  "ocel:global-object": {
    "ocel:object-type": [
      {
        "ocel:name": "Order"
      },
      {
        "ocel:name": "Item"
      }
    ]
  },
  "ocel:events": {
    "ocel:event": [
      {
        "ocel:id": "e1",
        "ocel:type": "Create Order",
        "ocel:timestamp": "2023-01-01T10:00:00",
        "ocel:omap": {
          "ocel:o": [
            {
              "ocel:id": "o1"
            }
          ]
        }
      }
    ]
  },
  "ocel:objects": {
    "ocel:object": [
      {
        "ocel:id": "o1",
        "ocel:type": "Order"
      }
    ]
  }
};

try {
  const ocelHandle = pm.load_ocel_from_json(JSON.stringify(minimalOCEL));
  console.log('OCEL loaded with handle:', ocelHandle);

  // Get OCEL statistics
  const stats = JSON.parse(pm.analyze_ocel_statistics(ocelHandle));
  console.log('OCEL Statistics:', JSON.stringify(stats, null, 2));
} catch (error) {
  console.error('Error loading OCEL:', error.message);
}

// Example 3: Discovery algorithms
console.log('\n=== Example 3: Process Discovery ===');

try {
  const logHandle = pm.load_eventlog_from_xes(minimalXES);

  // Discover DFG
  console.log('Discovering DFG...');
  const dfg = JSON.parse(pm.discover_dfg(logHandle));
  console.log('DFG discovered');

  // Try Alpha++ discovery
  console.log('Discovering with Alpha++...');
  const petriNet = JSON.parse(pm.discover_alpha_plus_plus(logHandle, 0));
  console.log('Petri Net discovered');
} catch (error) {
  console.error('Error in discovery:', error.message);
}

// Example 4: Available algorithms
console.log('\n=== Example 4: Available Algorithms ===');

try {
  const algorithms = JSON.parse(pm.available_discovery_algorithms());
  console.log('Discovery Algorithms:');
  algorithms.algorithms.forEach(algo => {
    console.log(`- ${algo.name}: ${algo.description}`);
  });
} catch (error) {
  console.error('Error getting algorithms:', error.message);
}

// Example 5: State management
console.log('\n=== Example 5: State Management ===');

try {
  console.log('Current objects:', pm.object_count());

  // Clear all objects
  pm.clear_all_objects();
  console.log('After clear:', pm.object_count());
} catch (error) {
  console.error('Error managing state:', error.message);
}

console.log('\n=== Examples completed ===');
