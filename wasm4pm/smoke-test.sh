#!/bin/bash
# Standalone npm install smoke test
# Catches packaging failures before they reach npm publish.
# Run from wasm4pm/ subdirectory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SMOKE_DIR="/tmp/smoke-test-$$"

cleanup() {
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT

echo "=== Building nodejs target ==="
cd "$SCRIPT_DIR"
npm run build:nodejs

echo ""
echo "=== Removing wasm-pack generated pkg/.gitignore (breaks npm pack) ==="
rm -f pkg/.gitignore

echo ""
echo "=== Packing tarball ==="
npm pack
TARBALL=$(ls -t wasm4pm-*.tgz | head -1)
echo "Tarball: $TARBALL"

echo ""
echo "=== Installing in clean directory ==="
mkdir -p "$SMOKE_DIR"
cp "$TARBALL" "$SMOKE_DIR/"
cd "$SMOKE_DIR"
npm init -y > /dev/null 2>&1
npm install "./$TARBALL"

echo ""
echo "=== Running smoke tests ==="
node -e "
  const pm = require('wasm4pm');

  // 1. Classes
  if (!pm.WasmEventLog) throw new Error('WasmEventLog missing');
  if (!pm.WasmOCEL) throw new Error('WasmOCEL missing');
  if (!pm.OperationResult) throw new Error('OperationResult missing');
  console.log('OK classes: WasmEventLog, WasmOCEL, OperationResult');

  // 2. Discovery
  const disc = ['discover_dfg','discover_alpha_plus_plus','discover_heuristic_miner','discover_inductive_miner','discover_genetic_algorithm'];
  for (const fn of disc) { if (typeof pm[fn] !== 'function') throw new Error(fn + ' missing'); }
  console.log('OK discovery:', disc.join(', '));

  // 3. Analysis
  const anal = ['analyze_trace_variants','analyze_case_duration','analyze_event_statistics'];
  for (const fn of anal) { if (typeof pm[fn] !== 'function') throw new Error(fn + ' missing'); }
  console.log('OK analysis:', anal.join(', '));

  // 4. I/O
  const io = ['load_eventlog_from_json','load_eventlog_from_xes','export_eventlog_to_json'];
  for (const fn of io) { if (typeof pm[fn] !== 'function') throw new Error(fn + ' missing'); }
  console.log('OK I/O:', io.join(', '));

  // 5. Utility
  if (typeof pm.get_version !== 'function') throw new Error('get_version missing');
  if (typeof pm.clear_all_objects !== 'function') throw new Error('clear_all_objects missing');
  console.log('OK utility: get_version, clear_all_objects');

  // 6. WASM execution
  const version = pm.get_version();
  console.log('OK get_version():', version);

  const sv = (s) => ({ tag: 'String', value: s });
  const log = JSON.stringify({
    attributes: {},
    traces: [
      { attributes: {}, events: [{ attributes: { 'concept:name': sv('A') } }, { attributes: { 'concept:name': sv('B') } }, { attributes: { 'concept:name': sv('C') } }] },
      { attributes: {}, events: [{ attributes: { 'concept:name': sv('A') } }, { attributes: { 'concept:name': sv('B') } }, { attributes: { 'concept:name': sv('C') } }] },
      { attributes: {}, events: [{ attributes: { 'concept:name': sv('A') } }, { attributes: { 'concept:name': sv('C') } }] },
    ]
  });
  const handle = pm.load_eventlog_from_json(log);
  console.log('OK load_eventlog_from_json() handle:', handle);

  const dfg = pm.discover_dfg(handle, 'concept:name');
  console.log('OK discover_dfg() returned result');

  pm.clear_all_objects();
  console.log('OK clear_all_objects()');

  console.log('');
  console.log('=== ALL SMOKE TESTS PASSED ===');
"

# Clean up tarball from wasm4pm dir
rm -f "$SCRIPT_DIR/$TARBALL"
