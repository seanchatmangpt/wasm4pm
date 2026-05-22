/**
 * example_classic_mining.ts
 *
 * Demonstrates the Wave 1 and Wave 2 'Classic' Process Mining algorithms.
 * These form the backbone of process discovery, conformance, and performance analysis.
 *
 * Algorithms utilized:
 *  1. DFG (Directly-Follows Graph)
 *  2. Alpha Miner (Petri Net discovery)
 *  3. Inductive Miner (Block-based sound Process Tree)
 *  4. Heuristic Miner (Noise-tolerant causal graph)
 *  5. Transition System (Low-level state transition mining)
 *  6. Token Replay (Conformance checking)
 *  7. Activity Transition Matrix (Performance bottleneck analysis)
 *  8. Process Skeleton (High-level structural extraction)
 */

import { Kernel } from 'wasm4pm';
import type { KernelWasmModule } from 'wasm4pm';

// This example assumes a loaded WASM module and an event log handle.
export async function runClassicExample(wasm: KernelWasmModule, logHandle: string) {
  const kernel = new Kernel(wasm);
  const activityKey = 'concept:name';

  console.log('--- Classic Process Mining Pipeline ---');

  // 1. DFG - Fast structural overview
  const dfg = await kernel.run('dfg', { logHandle, activityKey });
  console.log(`DFG discovered: ${dfg.nodes} nodes, ${dfg.edges} edges`);

  // 2. Alpha Miner - Basic Petri Net
  const alpha = await kernel.run('alpha', { logHandle, activityKey });
  console.log(`Alpha Miner discovered Petri net: ${alpha.places} places, ${alpha.transitions} transitions`);

  // 3. Inductive Miner - Guaranteed Soundness
  const inductive = await kernel.run('inductive', { logHandle, activityKey });
  console.log(`Inductive Miner discovered Process Tree: root operator ${inductive.root}`);

  // 4. Heuristic Miner - Dealing with Noise
  const heuristic = await kernel.run('heuristic', { logHandle, activityKey, dependencyThreshold: 0.8 });
  console.log(`Heuristic Miner discovered Causal Graph with handle: ${heuristic.handle}`);

  // 5. Transition System - Detailed State Space
  const ts = await kernel.run('transition_system', { logHandle, activityKey, windowSize: 2 });
  console.log(`Transition System mined with state handle: ${ts.handle}`);

  // 6. Conformance Checking - Token Replay
  // Note: Conformance requires both a log and a discovered Petri net (alpha.handle)
  const conformance = await kernel.run('conformance', { 
    logHandle, 
    modelHandle: alpha.handle,
    activityKey 
  });
  console.log(`Fitness: ${conformance.fitness.toFixed(4)}`);

  // 7. Activity Transition Matrix - Bottleneck Analysis
  // Directly returns a virtual handle for matrix analytics
  const matrix = await kernel.run('activity_transition_matrix', { logHandle, activityKey });
  console.log(`Performance matrix handle: ${matrix.handle}`);

  // 8. Process Skeleton - Abstraction
  const skeleton = await kernel.run('skeleton', { logHandle, activityKey });
  console.log(`Skeleton nodes: ${skeleton.nodes}`);

  return { dfg, alpha, inductive, heuristic, ts, conformance, matrix, skeleton };
}
