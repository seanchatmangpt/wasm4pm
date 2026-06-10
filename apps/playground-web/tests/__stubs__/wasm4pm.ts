// Stub for the wasm4pm WASM module — used in unit/component tests only.
// All functions return minimal valid JSON so callers don't throw.
export default async () => {}

export const load_eventlog_from_xes = (_xes: string): number => 1
export const discover_dfg = (_handle: number, _key: string): string =>
  JSON.stringify({ nodes: [], edges: [], receipt: { input_hash: 'aabbcc', output_hash: 'ddeeff', run_id: 'test-run-1', algorithm: 'discover_dfg' } })
export const discover_inductive_miner = (_handle: number, _key: string): string =>
  JSON.stringify({ net: { places: [], transitions: [], arcs: [] }, receipt: { input_hash: 'aabbcc', output_hash: 'ddeeff', run_id: 'test-run-2', algorithm: 'inductive_miner' } })
export const discover_heuristic_miner = (_handle: number, _key: string, _threshold: number): string =>
  JSON.stringify({ net: { places: [], transitions: [], arcs: [] }, receipt: { input_hash: 'aabbcc', output_hash: 'ddeeff', run_id: 'test-run-3', algorithm: 'heuristic_miner' } })
export const simd_streaming_dfg = (_handle: number, _key: string): string =>
  JSON.stringify({ nodes: [], edges: [], receipt: { input_hash: 'aabbcc', output_hash: 'ddeeff', run_id: 'test-run-4', algorithm: 'simd_streaming_dfg' } })
export const token_replay_conformance = (_handle: number, _key: string): string =>
  JSON.stringify({ fitness: 1.0, receipt: { input_hash: 'aabbcc', output_hash: 'ddeeff', run_id: 'test-run-5', algorithm: 'token_replay_conformance' } })
export const load_ocel_from_json = (_json: string): number => 2
export const get_algorithm_list = (): string =>
  JSON.stringify(['discover_dfg', 'inductive_miner', 'heuristic_miner', 'simd_streaming_dfg', 'token_replay_conformance'])
