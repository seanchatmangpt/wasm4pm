#!/usr/bin/env node

/**
 * Example: Process Mining Conformance Audit
 *
 * This example demonstrates how to:
 * 1. Capture OTEL spans from pictl execution
 * 2. Run conformance audit against declared process
 * 3. Generate audit report with van der Aalst verdict
 * 4. Interpret results
 *
 * Usage:
 *   node examples/conformance-audit-example.mjs
 *   node examples/conformance-audit-example.mjs --spans=spans.json
 *   node examples/conformance-audit-example.mjs --jaeger-url=http://localhost:16686 --service=pictl
 */

import {
  auditPictlProcess,
  OCELEventLog,
  PictlAuditor,
  loadSpansFromFile,
  loadSpansFromJaeger,
} from '../semconv/conformance-audit.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Parse command-line arguments
const args = process.argv.slice(2);
let spansSource = 'memory'; // memory, file, jaeger
let spansFile = null;
let jaegerUrl = null;
let serviceName = 'pictl';

for (const arg of args) {
  if (arg.startsWith('--spans=')) {
    spansFile = arg.split('=')[1];
    spansSource = 'file';
  } else if (arg.startsWith('--jaeger-url=')) {
    jaegerUrl = arg.split('=')[1];
    spansSource = 'jaeger';
  } else if (arg.startsWith('--service=')) {
    serviceName = arg.split('=')[1];
  }
}

console.log('🔍 Process Mining Conformance Auditor');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

/**
 * Example 1: Memory-based audit (synthetic spans)
 */
async function auditMemorySpans() {
  console.log('📊 Scenario 1: Truthful Process (Full Conformance)\n');

  const truthfulSpans = [
    {
      span_id: 'discovery-1',
      trace_id: 'trace-main',
      name: 'pm.discovery',
      start_time: new Date('2026-04-10T10:00:00Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:05Z').toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_discovery_algorithm: 'dfg',
        pm_discovery_input_format: 'ocel',
        pm_discovery_model_type: 'dfg',
        pm_discovery_trace_count: 10,
      },
    },
    {
      span_id: 'conformance-1',
      trace_id: 'trace-main',
      name: 'pm.conformance',
      start_time: new Date('2026-04-10T10:00:06Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:10Z').toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_conformance_fitness: 0.97,
        pm_conformance_precision: 0.95,
        pm_conformance_conforms: true,
      },
    },
    {
      span_id: 'analysis-1',
      trace_id: 'trace-main',
      name: 'pm.analysis',
      start_time: new Date('2026-04-10T10:00:11Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:15Z').toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_analysis_type: 'variant',
        pm_analysis_metric_value: 3,
      },
    },
  ];

  const report = await auditPictlProcess(truthfulSpans);

  console.log(`✓ Audit completed in ${report.duration_ms}ms\n`);
  console.log(`Verdict: ${report.verdict.status}`);
  console.log(`Confidence: ${(report.verdict.confidence * 100).toFixed(1)}%\n`);

  console.log('Metrics:');
  console.log(`  Fitness:       ${report.metrics.fitness.toFixed(2)} (how well behavior fits model)`);
  console.log(
    `  Precision:     ${report.metrics.precision.toFixed(2)} (no over-generalization)`
  );
  console.log(
    `  Generalization: ${report.metrics.generalization.toFixed(2)} (captures variant behavior)`
  );
  console.log(
    `  Simplicity:    ${report.metrics.simplicity.toFixed(2)} (few deviations)\n`
  );

  console.log('Event Log:');
  console.log(`  Events:  ${report.ocel_summary.event_count}`);
  console.log(`  Objects: ${report.ocel_summary.object_count}`);
  console.log(`  Types:   ${report.ocel_summary.object_types.join(', ')}\n`);

  if (report.comparison.deviations && report.comparison.deviations.length > 0) {
    console.log('Deviations:');
    for (const dev of report.comparison.deviations) {
      console.log(`  • [${dev.severity}] ${dev.message}`);
    }
  } else {
    console.log('✓ No deviations detected\n');
  }

  console.log('Evidence:');
  console.log(`  Variants: ${report.evidence.variant_count}`);
  console.log(`  Most common: ${report.evidence.most_common_variant}\n`);

  console.log('Interpretation:');
  console.log(
    '  The process executed exactly as declared. All steps completed in order,'
  );
  console.log('  no undeclared paths, perfect conformance. Ready for production.\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Scenario 2: Variant Process (Undocumented Branch)\n');

  const variantSpans = [
    ...truthfulSpans.slice(0, 1),
    {
      span_id: 'discovery-retry',
      trace_id: 'trace-main',
      name: 'pm.discovery.retry',
      start_time: new Date('2026-04-10T10:00:02Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:04Z').toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        error_recovery: true,
        retry_attempt: 1,
      },
    },
    ...truthfulSpans.slice(1),
  ];

  const variantReport = await auditPictlProcess(variantSpans);

  console.log(`Verdict: ${variantReport.verdict.status}`);
  console.log(`Confidence: ${(variantReport.verdict.confidence * 100).toFixed(1)}%\n`);

  console.log('Metrics:');
  console.log(`  Fitness: ${variantReport.metrics.fitness.toFixed(2)}`);
  console.log(`  Deviations: ${variantReport.comparison.total_deviations}\n`);

  if (variantReport.comparison.deviations.length > 0) {
    console.log('Deviations:');
    for (const dev of variantReport.comparison.deviations.slice(0, 3)) {
      console.log(`  • [${dev.severity}] ${dev.message}`);
    }
    console.log();
  }

  console.log('Interpretation:');
  console.log(
    '  The process mostly conforms (fitness 0.70-0.95) but has undeclared'
  );
  console.log(
    '  execution paths. A retry loop was detected. Update the declared process'
  );
  console.log('  model to document this variance, then re-audit.\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Scenario 3: Deceptive Process (Steps Out of Order)\n');

  const deceptiveSpans = [
    {
      span_id: 'conformance-first',
      trace_id: 'trace-bad',
      name: 'pm.conformance',
      start_time: new Date('2026-04-10T10:00:00Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:03Z').toISOString(),
      status: { code: 'OK' },
      attributes: { service_name: 'pictl', pm_conformance_fitness: 0.8 },
    },
    {
      span_id: 'discovery-late',
      trace_id: 'trace-bad',
      name: 'pm.discovery',
      start_time: new Date('2026-04-10T10:00:04Z').toISOString(),
      end_time: new Date('2026-04-10T10:00:08Z').toISOString(),
      status: { code: 'OK' },
      attributes: { service_name: 'pictl', pm_discovery_algorithm: 'dfg' },
    },
  ];

  const deceptiveReport = await auditPictlProcess(deceptiveSpans);

  console.log(`Verdict: ${deceptiveReport.verdict.status}`);
  console.log(`Confidence: ${(deceptiveReport.verdict.confidence * 100).toFixed(1)}%\n`);

  console.log('Metrics:');
  console.log(`  Fitness: ${deceptiveReport.metrics.fitness.toFixed(2)}`);
  console.log(`  Deviations: ${deceptiveReport.comparison.total_deviations}\n`);

  if (deceptiveReport.comparison.deviations.length > 0) {
    console.log('Deviations (first 3):');
    for (const dev of deceptiveReport.comparison.deviations.slice(0, 3)) {
      console.log(`  • [${dev.severity}] ${dev.message}`);
    }
    console.log();
  }

  console.log('Interpretation:');
  console.log('  🚨 CRITICAL: The process contradicts the declared model.');
  console.log(
    '  pm.conformance executed BEFORE pm.discovery, which is impossible.'
  );
  console.log(
    '  This indicates a serious bug or potential security issue. Investigation'
  );
  console.log('  required before deployment.\n');

  // Save example report
  const reportPath = resolve('results/audit-example.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Full report saved to ${reportPath}\n`);
}

/**
 * Example 2: File-based audit
 */
async function auditFileSpans() {
  if (!spansFile) return;

  console.log(`📂 Loading spans from ${spansFile}...\n`);

  const spans = loadSpansFromFile(spansFile);
  if (spans.length === 0) {
    console.log('❌ No spans loaded from file\n');
    return;
  }

  console.log(`✓ Loaded ${spans.length} spans\n`);

  const report = await auditPictlProcess(spans);
  console.log(`\nVerdict: ${report.verdict.status}`);
  console.log(`Fitness: ${report.metrics.fitness.toFixed(2)}\n`);

  // Save report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = resolve(`results/audit-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report saved to ${reportPath}\n`);
}

/**
 * Example 3: Jaeger-based audit
 */
async function auditJaegerSpans() {
  if (!jaegerUrl) return;

  console.log(`🔗 Connecting to Jaeger at ${jaegerUrl}...\n`);

  const spans = await loadSpansFromJaeger(jaegerUrl, serviceName);
  if (spans.length === 0) {
    console.log(`❌ No spans found for service "${serviceName}"\n`);
    return;
  }

  console.log(`✓ Loaded ${spans.length} spans from Jaeger\n`);

  const report = await auditPictlProcess(spans);
  console.log(`\nVerdict: ${report.verdict.status}`);
  console.log(`Fitness: ${report.metrics.fitness.toFixed(2)}\n`);

  // Save report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = resolve(`results/audit-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report saved to ${reportPath}\n`);
}

/**
 * Usage guide
 */
function printUsage() {
  console.log('Usage:');
  console.log('  node examples/conformance-audit-example.mjs');
  console.log('  node examples/conformance-audit-example.mjs --spans=spans.json');
  console.log(
    '  node examples/conformance-audit-example.mjs --jaeger-url=http://localhost:16686 --service=pictl\n'
  );

  console.log('Options:');
  console.log('  --spans=<file>           Load spans from JSON file (OTEL format)');
  console.log('  --jaeger-url=<url>       Load spans from Jaeger API');
  console.log('  --service=<name>         Service name for Jaeger query (default: pictl)\n');

  console.log('Examples:');
  console.log('  # Run with synthetic data (demonstrating all verdicts)');
  console.log('  node examples/conformance-audit-example.mjs\n');

  console.log('  # Audit real spans from file');
  console.log('  node examples/conformance-audit-example.mjs --spans=/tmp/spans.json\n');

  console.log('  # Audit pictl service from running Jaeger');
  console.log(
    '  node examples/conformance-audit-example.mjs --jaeger-url=http://localhost:16686 --service=pictl\n'
  );
}

/**
 * Main
 */
async function main() {
  try {
    if (spansSource === 'memory') {
      printUsage();
      await auditMemorySpans();
    } else if (spansSource === 'file') {
      await auditFileSpans();
    } else if (spansSource === 'jaeger') {
      await auditJaegerSpans();
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
