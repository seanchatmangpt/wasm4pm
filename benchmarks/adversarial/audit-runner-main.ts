#!/usr/bin/env node

/**
 * Adversarial Algorithm Audit — Main Entry Point
 *
 * Usage:
 *   npx ts-node audit-runner-main.ts
 *   npm run audit
 *
 * Steps:
 * 1. Generate synthetic 500K log (if not exists)
 * 2. Load WASM module
 * 3. Run audit against all 41 algorithms
 * 4. Generate 4D quality report
 * 5. Classify algorithms into tiers
 * 6. Output recommendations
 */

import * as fs from 'fs';
import * as path from 'path';

// Imports
import { generateScaleSeries, DEFAULT_CONFIG as SYNTHETIC_CONFIG } from './synthetic-log-gen';
import { runAdversarialAudit, DEFAULT_AUDIT_CONFIG } from './audit-runner';
import { printTierSummary } from './tier-classifier';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BENCHMARK_DIR = path.resolve(__dirname);
const RESULTS_DIR = path.join(BENCHMARK_DIR, 'results');

async function main() {
  console.log('');
  console.log('╔═════════════════════════════════════════════════════════════╗');
  console.log('║   Adversarial Van der Aalst Algorithm Audit (pictl v26.4)   ║');
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 0: Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    console.log(`📁 Created results directory: ${RESULTS_DIR}`);
  }

  // Step 1: Generate synthetic logs
  console.log('\n📝 Step 1: Generating synthetic XES logs...');
  const stats = generateScaleSeries(BENCHMARK_DIR);
  console.log(`✅ Generated ${stats.size} synthetic logs:`);
  for (const [scale, stat] of stats) {
    console.log(
      `   ${scale}: ${stat.totalCases} cases, ${stat.totalEvents} events, fitness=1.0`
    );
  }

  // Step 2: Load WASM
  console.log('\n⚙️  Step 2: Loading WASM module...');
  let wasm: any;
  try {
    // Try to load from npm package (post-build)
    wasm = require('pictl');
    console.log('✅ Loaded WASM from published npm package');
  } catch {
    try {
      // Try to load from local build
      wasm = require(path.join(REPO_ROOT, 'wasm4pm/pkg/pictl.js'));
      console.log('✅ Loaded WASM from local build (wasm4pm/pkg/)');
    } catch (e) {
      console.error('❌ Failed to load WASM module');
      console.error(
        'Please build WASM first: cd wasm4pm && npm run build'
      );
      process.exit(1);
    }
  }

  // Step 3: Run audit on normal (500K) dataset
  console.log('\n🔬 Step 3: Running audit on synthetic-normal-500k.xes (500K events)...');
  const normalLogPath = path.join(BENCHMARK_DIR, 'synthetic-normal-500k.xes');

  if (!fs.existsSync(normalLogPath)) {
    console.error(`❌ Log file not found: ${normalLogPath}`);
    process.exit(1);
  }

  let auditResult: any;
  try {
    auditResult = await runAdversarialAudit(wasm, {
      ...DEFAULT_AUDIT_CONFIG,
      logPath: normalLogPath,
      outputDir: RESULTS_DIR,
      verbose: true,
    });
  } catch (e) {
    console.error(`❌ Audit failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  // Step 4: Print summary
  console.log('\n📊 Step 4: Audit Summary');
  console.log(printTierSummary(auditResult.classifications.reduce((acc: any, c: any) => {
    if (c.tier === 0) acc.tier0.push(c.algorithm);
    if (c.tier === 1) acc.tier1.push(c.algorithm);
    if (c.tier === 2) acc.tier2.push(c.algorithm);
    if (c.tier === 3) acc.tier3.push(c.algorithm);
    acc.totalAlgorithms++;
    return acc;
  }, { tier0: [], tier1: [], tier2: [], tier3: [], totalAlgorithms: 0, productionReady: 0 })));

  // Step 5: Quality metrics
  console.log('\n📈 Step 5: Quality Metrics');
  const summary = auditResult.summary;
  console.log(`   Average Fitness: ${summary.avgFitness.toFixed(3)}`);
  console.log(`   Average Precision: ${summary.avgPrecision.toFixed(3)}`);
  console.log(`   Average Generalization: ${summary.avgGeneralization.toFixed(3)}`);
  console.log(`   Average Simplicity: ${summary.avgSimplicity.toFixed(3)}`);
  console.log(`   Algorithms with fitness ≥ 0.85: ${summary.algorithmsWithFitnessAbove85}`);
  console.log(`   Algorithms with precision implemented: ${summary.algorithmsWithPrecisionImplemented}`);

  // Step 6: Recommendations
  console.log('\n💡 Step 6: Recommendations');
  const tier3 = auditResult.classifications.filter((c: any) => c.tier === 3);
  if (tier3.length > 0) {
    console.log(`\n🔴 TIER 3 — REMOVE IMMEDIATELY (${tier3.length})`);
    for (const c of tier3) {
      console.log(`   ❌ ${c.algorithm}: ${c.reasons.join('; ')}`);
      console.log(`      → ${c.recommendation}`);
    }
  }

  const tier2 = auditResult.classifications.filter((c: any) => c.tier === 2);
  if (tier2.length > 0) {
    console.log(`\n❌ TIER 2 — FIX OR REMOVE (${tier2.length})`);
    for (const c of tier2) {
      console.log(`   ⚠️  ${c.algorithm}: ${c.reasons.join('; ')}`);
      console.log(`      → ${c.recommendation}`);
    }
  }

  const tier1 = auditResult.classifications.filter((c: any) => c.tier === 1);
  if (tier1.length > 0) {
    console.log(`\n⚠️  TIER 1 — EXPERIMENTAL (${tier1.length})`);
    for (const c of tier1) {
      console.log(`   🔧 ${c.algorithm}: ${c.reasons.join('; ')}`);
      console.log(`      → ${c.recommendation}`);
    }
  }

  const tier0 = auditResult.classifications.filter((c: any) => c.tier === 0);
  if (tier0.length > 0) {
    console.log(`\n✅ TIER 0 — PRODUCTION READY (${tier0.length})`);
    for (const c of tier0) {
      console.log(`   🚀 ${c.algorithm}`);
    }
  }

  // Final summary
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log(`║ Audit Complete — Results saved to: ${path.relative(REPO_ROOT, RESULTS_DIR)} │`);
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('');

  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
