import { initBoundary, runAlgorithmPositive } from '../scripts/release/algorithm-behavior/boundary.js';

async function test() {
  try {
    console.log("Initializing boundary...");
    const ctx = await initBoundary();
    console.log("Boundary initialized. Running positive case for a_star...");
    const res = await runAlgorithmPositive(ctx, 'a_star');
    console.log("Result:", res);
  } catch (err) {
    console.error("Caught error:", err);
  }
}

test();
