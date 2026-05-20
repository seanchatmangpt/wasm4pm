/**
 * example_agentic_analytics.ts
 *
 * Demonstrates the Wave 3 'Agentic' and Optimization-based algorithms.
 * These use metaheuristics and RL to find optimal models or detect complex patterns.
 *
 * Algorithms utilized:
 *  1. Genetic Algorithm (Evolutionary discovery)
 *  2. PSO (Particle Swarm Optimization)
 *  3. Ant Colony Optimization (ACO)
 *  4. Simulated Annealing (Metaheuristic refinement)
 *  5. Smart Engine (RL-driven Autopilot)
 *  6. Hybrid Drift Detection (Change point detection)
 *  7. ML Trace Clustering (K-Means/DBSCAN)
 *  8. Remaining Time Regression (Predictive analytics)
 */

import { Kernel } from '@wasm4pm/kernel';
import type { KernelWasmModule } from '@wasm4pm/kernel';

export async function runAgenticExample(wasm: KernelWasmModule, logHandle: string) {
  const kernel = new Kernel(wasm);
  const activityKey = 'concept:name';

  console.log('--- Agentic & Predictive Analytics Pipeline ---');

  // 1. Genetic Algorithm - High quality discovery
  const genetic = await kernel.run('genetic', { 
    logHandle, 
    activityKey, 
    populationSize: 50, 
    generations: 20 
  });
  console.log(`Genetic Miner result: ${genetic.places} places`);

  // 2. PSO - Particle Swarm optimization
  const pso = await kernel.run('pso', { logHandle, activityKey, iterations: 30 });
  console.log(`PSO discovered model handle: ${pso.handle}`);

  // 3. Ant Colony Optimization (ACO)
  const aco = await kernel.run('ant_colony', { logHandle, activityKey, numAnts: 25 });
  console.log(`ACO discovered model handle: ${aco.handle}`);

  // 4. Simulated Annealing
  const sa = await kernel.run('simulated_annealing', { logHandle, activityKey, temperature: 1.0 });
  console.log(`Simulated Annealing handle: ${sa.handle}`);

  // 5. Smart Engine - The RL Autopilot
  const autopilot = await kernel.run('smart_engine', { logHandle, activityKey, mode: 'quality' });
  console.log(`Smart Engine discovered tree root: ${autopilot.root}`);

  // 6. Hybrid Drift Detection
  const drift = await kernel.run('detect_drift', { logHandle, activityKey, windowSize: 10 });
  console.log(`Drift detected: ${drift.drifts_detected} change points found`);

  // 7. ML Trace Clustering
  const clusters = await kernel.run('ml_cluster', { 
    logHandle, 
    activityKey, 
    method: 'kmeans', 
    k: 3 
  });
  console.log(`Clustered traces into ${clusters.clusterCount} groups`);

  // 8. Remaining Time Regression
  const prediction = await kernel.run('ml_regress', { 
    logHandle, 
    activityKey, 
    method: 'linear' 
  });
  console.log(`Prediction Model R-squared: ${prediction.rSquared?.toFixed(4)}`);

  return { genetic, pso, aco, sa, autopilot, drift, clusters, prediction };
}
