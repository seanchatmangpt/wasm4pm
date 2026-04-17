/**
 * 4D Quality Report Generator — Human & Machine Formats
 *
 * Generates reports from audit results in multiple formats:
 * - Human: Markdown with tables and color indicators
 * - Machine: JSON (already saved by audit-runner)
 */

import { AlgorithmResult } from './quality-pipeline';
import { TierClassification, TierSummary } from './tier-classifier';

export interface ReportConfig {
  title: string;
  timestamp: string;
  logFile: string;
  format: 'markdown' | 'json' | 'html';
}

/**
 * Generate markdown report (human-readable).
 */
export function generateMarkdownReport(
  config: ReportConfig,
  results: AlgorithmResult[],
  classifications: TierClassification[],
  summary: TierSummary
): string {
  const lines: string[] = [];

  lines.push(`# ${config.title}`);
  lines.push('');
  lines.push(`Generated: ${config.timestamp}`);
  lines.push(`Log File: ${config.logFile}`);
  lines.push('');

  // Summary section
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Algorithms | ${summary.totalAlgorithms} |`);
  lines.push(`| Tier 0 (Production) | ${summary.tier0.length} |`);
  lines.push(`| Tier 1 (Experimental) | ${summary.tier1.length} |`);
  lines.push(`| Tier 2 (Wrong) | ${summary.tier2.length} |`);
  lines.push(`| Tier 3 (Lie) | ${summary.tier3.length} |`);
  lines.push('');

  // Quality metrics
  lines.push('## Quality Metrics (4D)');
  lines.push('');

  const validFitness = results.filter((r) => r.quality.fitness > 0);
  const avgFitness =
    validFitness.length > 0
      ? validFitness.reduce((a, b) => a + b.quality.fitness, 0) / validFitness.length
      : 0;

  const validPrecision = results.filter((r) => r.quality.precision > 0);
  const avgPrecision =
    validPrecision.length > 0
      ? validPrecision.reduce((a, b) => a + b.quality.precision, 0) / validPrecision.length
      : 0;

  lines.push(`- **Fitness**: ${avgFitness.toFixed(3)} (${validFitness.length}/${summary.totalAlgorithms} measured)`);
  lines.push(`- **Precision**: ${avgPrecision.toFixed(3)} (${validPrecision.length}/${summary.totalAlgorithms} implemented)`);
  lines.push(`- **Generalization**: N/A (not yet implemented)`);
  lines.push(`- **Simplicity**: N/A (model structure analysis)`);
  lines.push('');

  // Tier 0 section
  if (summary.tier0.length > 0) {
    lines.push('## Tier 0 — Production Ready ✅');
    lines.push('');
    lines.push('These algorithms are correct, fast, and production-ready.');
    lines.push('');
    lines.push(`| Algorithm | Fitness | Latency (ms) | Notes |`);
    lines.push(`|-----------|---------|--------------|-------|`);

    for (const algo of summary.tier0) {
      const result = results.find((r) => r.algorithm === algo);
      if (result) {
        lines.push(
          `| ${algo} | ${result.quality.fitness.toFixed(3)} | ${result.latencyMs.toFixed(1)} | ✅ |`
        );
      }
    }
    lines.push('');
  }

  // Tier 1 section
  if (summary.tier1.length > 0) {
    lines.push('## Tier 1 — Experimental ⚠️');
    lines.push('');
    lines.push('These algorithms work but are slow or have low precision.');
    lines.push('');
    lines.push(`| Algorithm | Fitness | Latency (ms) | Reason |`);
    lines.push(`|-----------|---------|--------------|--------|`);

    for (const algo of summary.tier1) {
      const result = results.find((r) => r.algorithm === algo);
      const classification = classifications.find((c) => c.algorithm === algo);
      if (result) {
        const reason = classification?.reasons.join('; ') || 'Unknown';
        lines.push(
          `| ${algo} | ${result.quality.fitness.toFixed(3)} | ${result.latencyMs.toFixed(1)} | ${reason} |`
        );
      }
    }
    lines.push('');
  }

  // Tier 2 section
  if (summary.tier2.length > 0) {
    lines.push('## Tier 2 — Wrong ❌');
    lines.push('');
    lines.push('These algorithms produce wrong outputs or fail to execute.');
    lines.push('Action: Fix or remove from registry.');
    lines.push('');
    lines.push(`| Algorithm | Issue | Recommendation |`);
    lines.push(`|-----------|-------|-----------------|`);

    for (const algo of summary.tier2) {
      const classification = classifications.find((c) => c.algorithm === algo);
      if (classification) {
        lines.push(`| ${algo} | ${classification.reasons.join('; ')} | ${classification.recommendation} |`);
      }
    }
    lines.push('');
  }

  // Tier 3 section
  if (summary.tier3.length > 0) {
    lines.push('## Tier 3 — Lie 🔴');
    lines.push('');
    lines.push('These algorithms claim to exist but have no WASM implementation.');
    lines.push('Action: Remove from registry immediately.');
    lines.push('');
    lines.push(`| Algorithm | Reason |`);
    lines.push(`|-----------|--------|`);

    for (const algo of summary.tier3) {
      const classification = classifications.find((c) => c.algorithm === algo);
      if (classification) {
        lines.push(`| ${algo} | ${classification.reasons.join('; ')} |`);
      }
    }
    lines.push('');
  }

  // Detailed results
  lines.push('## Detailed Algorithm Results');
  lines.push('');
  lines.push(`| Algorithm | Type | Fitness | Precision | Latency (ms) | Crashed | Tier |`);
  lines.push(`|-----------|------|---------|-----------|--------------|---------|------|`);

  for (const result of results) {
    const classification = classifications.find((c) => c.algorithm === result.algorithm);
    const tier = classification?.tier ?? 'N/A';
    const fitness =
      result.quality.fitness > 0 ? result.quality.fitness.toFixed(3) : 'N/A';
    const precision =
      result.quality.precision > 0 ? result.quality.precision.toFixed(3) : 'N/A';
    const latency = result.latencyMs.toFixed(1);
    const crashed = result.crashed ? '❌' : '✅';

    lines.push(
      `| ${result.algorithm} | ${result.outputType} | ${fitness} | ${precision} | ${latency} | ${crashed} | ${tier} |`
    );
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('### Van der Aalst Doctrine');
  lines.push('');
  lines.push(
    'If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.'
  );
  lines.push('');
  lines.push('Fitness formula (Rank-1 Mathematical Oracle):');
  lines.push('```');
  lines.push('fitness = 1 - (missing + remaining) / (consumed + produced)');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate HTML report (for web viewing).
 */
export function generateHtmlReport(
  config: ReportConfig,
  results: AlgorithmResult[],
  classifications: TierClassification[],
  summary: TierSummary
): string {
  const markdown = generateMarkdownReport(config, results, classifications, summary);

  // Simple HTML wrapper (would use markdown-to-html library in production)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { margin-top: 30px; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th { background: #f8f9fa; padding: 10px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
    td { padding: 10px; border: 1px solid #ddd; }
    tr:nth-child(even) { background: #f8f9fa; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    .pass { color: #28a745; }
    .warn { color: #ffc107; }
    .fail { color: #dc3545; }
    .info { background: #e7f3ff; padding: 15px; border-left: 4px solid #007bff; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${config.title}</h1>
  <div class="info">
    <strong>Generated:</strong> ${config.timestamp}<br>
    <strong>Log:</strong> ${config.logFile}
  </div>
  <pre>${markdown}</pre>
</body>
</html>`;

  return html;
}
