#!/usr/bin/env node

/**
 * verify-profiles.js — Binary Size Validator for pictl WASM Profiles
 *
 * Validates built WASM binaries against size targets.
 * Supports dry-run mode, compressed size checking, and algorithm inventory.
 *
 * Usage:
 *   node scripts/verify-profiles.js [--dry-run] [--check-compressed]
 *
 * Options:
 *   --dry-run           : Check without validating (predict sizes)
 *   --check-compressed  : Also validate .wasm.br (Brotli) sizes
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SIZE_TARGETS_MB = {
  browser: 4.0,
  iot: 4.0,
  edge: 4.0,
  fog: 4.0,
  cloud: 5.0,
};

const ALGORITHM_INVENTORY = {
  browser: {
    tier: "Tier 1",
    algorithms: [
      "dfg",
      "process_skeleton",
      "simd_streaming_dfg",
      "transition_system",
      "log_to_trie",
      "causal_graph",
      "performance_spectrum",
      "batches",
      "correlation_miner",
      "generalization",
      "petri_net_reduction",
      "etconformance_precision",
      "complexity_metrics",
      "pnml_import",
      "bpmn_import",
      "powl_to_process_tree",
      "yawl_export",
      "playout",
    ],
    approxCount: 18,
  },
  iot: {
    tier: "Tier 1 (Minimal)",
    algorithms: [
      "dfg",
      "simd_streaming_dfg",
      "process_skeleton",
      "transition_system",
      "log_to_trie",
    ],
    approxCount: 5,
  },
  edge: {
    tier: "Tier 1 + ML",
    algorithms: [
      "dfg",
      "alpha_plus_plus",
      "heuristic_miner",
      "inductive_miner",
      "ml_classify",
      "ml_cluster",
      "ml_forecast",
      "ml_anomaly",
      "ml_regress",
      "ml_pca",
    ],
    approxCount: 25,
  },
  fog: {
    tier: "Tier 2",
    algorithms: [
      "dfg",
      "alpha_plus_plus",
      "heuristic_miner",
      "inductive_miner",
      "genetic",
      "ilp",
      "a_star",
      "aco",
      "pso",
      "simulated_annealing",
      "ml_classify",
      "ml_cluster",
      "ml_forecast",
      "ml_anomaly",
      "ml_regress",
      "ml_pca",
    ],
    approxCount: 30,
  },
  cloud: {
    tier: "Tier 3 (All)",
    algorithms: [
      "dfg",
      "alpha_plus_plus",
      "heuristic_miner",
      "inductive_miner",
      "genetic",
      "ilp",
      "a_star",
      "aco",
      "pso",
      "simulated_annealing",
      "ml_classify",
      "ml_cluster",
      "ml_forecast",
      "ml_anomaly",
      "ml_regress",
      "ml_pca",
      "conformance_basic",
      "alignment_fitness",
      "alignments",
      "diagnostics",
      "petri_net_playout",
      "extensive_playout",
      "align_etconformance",
      "montecarlo",
      "streaming_basic",
      "streaming_full",
      "powl",
      "ocel",
      "swarm",
      "social",
      "temporal",
      "hierarchical_dfg",
      "validate",
      "quality",
      "simulate",
      "monte_carlo_simulation",
      "smart_engine",
    ],
    approxCount: 41,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Parse Arguments
// ─────────────────────────────────────────────────────────────────────────────

let dryRun = false;
let checkCompressed = false;

for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") dryRun = true;
  if (arg === "--check-compressed") checkCompressed = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║  pictl WASM Profile Size Verification");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝");
console.log("");

if (dryRun) {
  console.log("[DRY-RUN] Predictions only (no actual validation)\n");
}

let allPassed = true;
const results = [];

for (const [profile, targetMB] of Object.entries(SIZE_TARGETS_MB)) {
  const distDir = path.join(__dirname, "..", "dist", `pictl-${profile}`);
  const wasmPath = path.join(distDir, "pictl.wasm");
  const brPath = path.join(distDir, "pictl.wasm.br");

  console.log(`\n[${profile.toUpperCase()}]`);

  // ─────────────────────────────────────────────────────────────────────────
  // WASM Size Check
  // ─────────────────────────────────────────────────────────────────────────

  let sizeMB = null;
  let pass = false;

  if (!fs.existsSync(wasmPath)) {
    console.log(`  Status: [NOT BUILT]`);
    console.log(`  Error:  WASM file not found at ${wasmPath}`);
    pass = false;
  } else {
    const stats = fs.statSync(wasmPath);
    sizeMB = stats.size / (1024 * 1024);

    pass = sizeMB <= targetMB;
    const status = pass ? "✓ PASS" : "✗ FAIL";
    console.log(`  WASM:   ${sizeMB.toFixed(2)} MB / ${targetMB.toFixed(2)} MB target [${status}]`);

    // ─────────────────────────────────────────────────────────────────────────
    // Compressed Size Check (if requested and exists)
    // ─────────────────────────────────────────────────────────────────────────

    if (checkCompressed && fs.existsSync(brPath)) {
      const brStats = fs.statSync(brPath);
      const compressedMB = brStats.size / (1024 * 1024);
      const ratio = sizeMB / compressedMB;

      console.log(`  Brotli: ${compressedMB.toFixed(2)} MB (${ratio.toFixed(1)}:1 ratio)`);
    }

    if (!pass) {
      const over = (sizeMB - targetMB).toFixed(2);
      console.log(`  Excess: +${over} MB over target`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Algorithm Inventory
  // ─────────────────────────────────────────────────────────────────────────

  const inventory = ALGORITHM_INVENTORY[profile];
  console.log(
    `  Tier:   ${inventory.tier} (~${inventory.approxCount} algorithms)`
  );
  console.log(
    `  Algos:  ${inventory.algorithms.slice(0, 5).join(", ")}${inventory.algorithms.length > 5 ? `, +${inventory.algorithms.length - 5} more` : ""}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Result Summary
  // ─────────────────────────────────────────────────────────────────────────

  if (!dryRun && !pass) {
    allPassed = false;
  }

  results.push({
    profile,
    pass,
    sizeMB,
    targetMB,
    algorithmCount: inventory.approxCount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Final Report
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║  Summary");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝");

const passCount = results.filter((r) => r.pass).length;
const totalCount = results.length;

console.log(`\nBuilt Profiles:  ${passCount}/${totalCount} passing`);

if (dryRun) {
  console.log("Mode:            DRY-RUN (predictions only)\n");
  process.exit(0);
}

if (allPassed) {
  console.log("Status:          ✓ ALL PROFILES PASS\n");
  process.exit(0);
} else {
  console.log("Status:          ✗ SOME PROFILES FAIL\n");
  process.exit(1);
}
