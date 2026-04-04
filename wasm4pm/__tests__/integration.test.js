/**
 * Integration tests for process_mining_wasm
 * Tests the complete workflow of the WASM module
 */

const pm = require('../pkg/wasm4pm.js');

// Sample XES content for testing
const SAMPLE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="Case1"/>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
      <date key="time:timestamp" value="2023-01-01T10:05:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity C"/>
      <date key="time:timestamp" value="2023-01-01T10:10:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="Case2"/>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T11:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
      <date key="time:timestamp" value="2023-01-01T11:05:00.000+00:00"/>
    </event>
  </trace>
</log>`;

// OCEL sample for testing
const SAMPLE_OCEL = `{
  "ocel:version": "2.0",
  "ocel:objectTypes": ["Order"],
  "ocel:events": [
    {
      "ocel:eid": "e1",
      "ocel:type": "CreateOrder",
      "ocel:timestamp": "2023-01-01T10:00:00",
      "ocel:omap": ["o1"]
    },
    {
      "ocel:eid": "e2",
      "ocel:type": "ProcessOrder",
      "ocel:timestamp": "2023-01-01T10:05:00",
      "ocel:omap": ["o1"]
    }
  ],
  "ocel:objects": [
    {
      "ocel:oid": "o1",
      "ocel:type": "Order",
      "ocel:ovmap": {}
    }
  ]
}`;

console.log('=== process_mining_wasm Integration Tests ===\n');

try {
  // Test 1: Initialization
  console.log('Test 1: Initialization');
  pm.init();
  console.log('  [PASS] Module initialized\n');

  // Test 2: Get version
  console.log('Test 2: Get version');
  const version = pm.get_version();
  console.log(`  Version: ${version}`);
  console.log('  [PASS] Got version\n');

  // Test 3: Load EventLog from XES
  console.log('Test 3: Load EventLog from XES');
  const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
  console.log(`  Handle: ${logHandle}`);
  console.log('  [PASS] Loaded XES event log\n');

  // Test 4: Object count
  console.log('Test 4: Object count');
  const count = pm.object_count();
  console.log(`  Objects in memory: ${count}`);
  if (count > 0) {
    console.log('  [PASS] Objects are stored in memory\n');
  } else {
    throw new Error('Expected at least 1 object in memory');
  }

  // Test 5: Analyze event statistics
  console.log('Test 5: Analyze event statistics');
  const statsHandle = pm.analyze_event_statistics(logHandle);
  const statsJson = pm.object_to_json(statsHandle);
  const stats = JSON.parse(statsJson);
  console.log(`  Statistics: ${JSON.stringify(stats).substring(0, 100)}...`);
  console.log('  [PASS] Got event statistics\n');

  // Test 6: Analyze case duration
  console.log('Test 6: Analyze case duration');
  const durationHandle = pm.analyze_case_duration(logHandle);
  const durationJson = pm.object_to_json(durationHandle);
  const durations = JSON.parse(durationJson);
  console.log(`  Duration analysis: ${JSON.stringify(durations).substring(0, 100)}...`);
  console.log('  [PASS] Got case duration analysis\n');

  // Test 7: Discover DFG
  console.log('Test 7: Discover DFG (Directly-Follows Graph)');
  const dfgHandle = pm.discover_dfg(logHandle);
  const dfgJson = pm.object_to_json(dfgHandle);
  const dfg = JSON.parse(dfgJson);
  console.log(`  DFG: ${JSON.stringify(dfg).substring(0, 100)}...`);
  console.log('  [PASS] Discovered DFG\n');

  // Test 8: Export EventLog to XES
  console.log('Test 8: Export EventLog to XES');
  const exportedXes = pm.export_eventlog_to_xes(logHandle);
  if (exportedXes.includes('<?xml') && exportedXes.includes('</log>')) {
    console.log('  [PASS] Exported to XES format\n');
  } else {
    throw new Error('Invalid XES export format');
  }

  // Test 9: Load OCEL from JSON
  console.log('Test 9: Load OCEL from JSON');
  const ocelHandle = pm.load_ocel_from_json(SAMPLE_OCEL);
  console.log(`  Handle: ${ocelHandle}`);
  console.log('  [PASS] Loaded OCEL\n');

  // Test 10: Analyze OCEL statistics
  console.log('Test 10: Analyze OCEL statistics');
  const ocelStatsHandle = pm.analyze_ocel_statistics(ocelHandle);
  const ocelStatsJson = pm.object_to_json(ocelStatsHandle);
  const ocelStats = JSON.parse(ocelStatsJson);
  console.log(`  OCEL stats: ${JSON.stringify(ocelStats).substring(0, 100)}...`);
  console.log('  [PASS] Got OCEL statistics\n');

  // Test 11: Delete object
  console.log('Test 11: Delete object');
  const countBefore = pm.object_count();
  pm.delete_object(logHandle);
  const countAfter = pm.object_count();
  if (countAfter < countBefore) {
    console.log(`  Objects: ${countBefore} -> ${countAfter}`);
    console.log('  [PASS] Object deleted\n');
  } else {
    throw new Error('Object was not deleted');
  }

  // Test 12: Clear all objects
  console.log('Test 12: Clear all objects');
  pm.clear_all_objects();
  const finalCount = pm.object_count();
  if (finalCount === 0) {
    console.log(`  Final object count: ${finalCount}`);
    console.log('  [PASS] All objects cleared\n');
  } else {
    throw new Error(`Expected 0 objects, got ${finalCount}`);
  }

  // Test 13: Available discovery algorithms
  console.log('Test 13: List available discovery algorithms');
  const algosJson = pm.available_discovery_algorithms();
  const algos = JSON.parse(algosJson);
  console.log(`  Algorithms: ${algos.join(', ')}`);
  console.log('  [PASS] Listed algorithms\n');

  // Test 14: Available analysis functions
  console.log('Test 14: List available analysis functions');
  const funcsJson = pm.available_analysis_functions();
  const funcs = JSON.parse(funcsJson);
  console.log(`  Functions: ${funcs.join(', ')}`);
  console.log('  [PASS] Listed functions\n');

  console.log('\n=== All Integration Tests Passed ===');
  process.exit(0);
} catch (error) {
  console.error(`\n[FAIL] Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
