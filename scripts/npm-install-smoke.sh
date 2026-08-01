#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

packages_dir="$(mktemp -d)"
consumer_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$packages_dir" "$consumer_dir"
}
trap cleanup EXIT

# Build every runtime package that participates in the published core contract.
pnpm --dir packages/ml build
npm --prefix wasm4pm run build:nodejs
rm -f wasm4pm/pkg/.gitignore

# pnpm pack is the publication projection: it resolves workspace:* to the
# concrete package version written into the tarball manifest.
pnpm --dir packages/ml pack --pack-destination "$packages_dir"
pnpm --dir wasm4pm pack --pack-destination "$packages_dir"

mapfile -t ml_tarballs < <(find "$packages_dir" -maxdepth 1 -type f -name 'wasm4pm-ml-*.tgz' -print)
mapfile -t core_tarballs < <(find "$packages_dir" -maxdepth 1 -type f -name 'wasm4pm-core-*.tgz' -print)

if [[ ${#ml_tarballs[@]} -ne 1 ]]; then
  printf 'Expected exactly one @wasm4pm/ml tarball, found %s\n' "${#ml_tarballs[@]}" >&2
  printf '%s\n' "${ml_tarballs[@]:-}" >&2
  exit 1
fi
if [[ ${#core_tarballs[@]} -ne 1 ]]; then
  printf 'Expected exactly one @wasm4pm/core tarball, found %s\n' "${#core_tarballs[@]}" >&2
  printf '%s\n' "${core_tarballs[@]:-}" >&2
  exit 1
fi

cd "$consumer_dir"
npm init -y >/dev/null
npm install "${ml_tarballs[0]}" "${core_tarballs[0]}"

node <<'NODE'
const pm = require('@wasm4pm/core');

const requiredClasses = ['WasmEventLog', 'WasmOCEL', 'OperationResult'];
const requiredFunctions = [
  'discover_dfg',
  'discover_alpha_plus_plus',
  'discover_heuristic_miner',
  'discover_inductive_miner',
  'discover_genetic_algorithm',
  'analyze_trace_variants',
  'analyze_case_duration',
  'analyze_event_statistics',
  'load_eventlog_from_json',
  'load_eventlog_from_xes',
  'export_eventlog_to_json',
  'get_version',
  'clear_all_objects',
];

for (const name of requiredClasses) {
  if (!pm[name]) throw new Error(`${name} is not exported by @wasm4pm/core`);
}
for (const name of requiredFunctions) {
  if (typeof pm[name] !== 'function') {
    throw new Error(`${name} is not exported by @wasm4pm/core`);
  }
}

const sv = (value) => ({ tag: 'String', value });
const sampleLog = JSON.stringify({
  attributes: {},
  traces: [
    {
      attributes: {},
      events: [
        { attributes: { 'concept:name': sv('A') } },
        { attributes: { 'concept:name': sv('B') } },
        { attributes: { 'concept:name': sv('C') } },
      ],
    },
    {
      attributes: {},
      events: [
        { attributes: { 'concept:name': sv('A') } },
        { attributes: { 'concept:name': sv('C') } },
      ],
    },
  ],
});

const handle = pm.load_eventlog_from_json(sampleLog);
pm.discover_dfg(handle, 'concept:name');
pm.clear_all_objects();

console.log(JSON.stringify({
  status: 'ok',
  package: '@wasm4pm/core',
  version: pm.get_version(),
  dependency: '@wasm4pm/ml',
}));
NODE
