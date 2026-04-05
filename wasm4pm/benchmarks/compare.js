/**
 * Benchmark Comparison Tool
 *
 * Compares Node.js and Browser WASM benchmark results.
 * Displays side-by-side performance metrics and identifies performance differences.
 *
 * Usage:
 *   node benchmarks/compare.js <nodejs-json> <browser-json>
 *   node benchmarks/compare.js results/nodejs.json results/browser.json
 */

const fs = require('fs');
const path = require('path');

function loadResults(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Error loading ${filePath}:`, e.message);
    process.exit(1);
  }
}

function compareResults(nodeResults, browserResults) {
  // Index results by algorithm + size for easy lookup
  const nodeMap = new Map();
  const browserMap = new Map();

  for (const r of nodeResults.results || nodeResults) {
    const key = `${r.algorithm}:${r.size}`;
    nodeMap.set(key, r);
  }

  for (const r of browserResults.results || browserResults) {
    const key = `${r.algorithm}:${r.size}`;
    browserMap.set(key, r);
  }

  // Collect all unique algorithm:size combinations
  const allKeys = new Set([...nodeMap.keys(), ...browserMap.keys()]);
  const comparisons = [];

  for (const key of allKeys) {
    const [algo, size] = key.split(':');
    const node = nodeMap.get(key);
    const browser = browserMap.get(key);

    if (node && browser) {
      const speedup = node.medianMs / browser.medianMs;
      const percentDiff = ((browser.medianMs - node.medianMs) / node.medianMs) * 100;

      comparisons.push({
        algorithm: algo,
        size: parseInt(size),
        nodeMedian: node.medianMs,
        browserMedian: browser.medianMs,
        speedup,
        percentDiff,
        status: speedup > 1.2 ? 'Browser slower' : speedup < 0.8 ? 'Browser faster' : 'Similar',
      });
    } else if (node) {
      comparisons.push({
        algorithm: algo,
        size: parseInt(size),
        nodeMedian: node.medianMs,
        browserMedian: null,
        speedup: null,
        percentDiff: null,
        status: 'Browser missing',
      });
    } else {
      comparisons.push({
        algorithm: algo,
        size: parseInt(size),
        nodeMedian: null,
        browserMedian: browser.medianMs,
        speedup: null,
        percentDiff: null,
        status: 'Node missing',
      });
    }
  }

  return comparisons.sort((a, b) => a.algorithm.localeCompare(b.algorithm) || a.size - b.size);
}

function printComparisonTable(comparisons) {
  const COL = {
    algo: 30,
    size: 8,
    node: 12,
    browser: 12,
    speedup: 10,
    status: 20,
  };

  const header = [
    'Algorithm'.padEnd(COL.algo),
    'Cases'.padEnd(COL.size),
    'Node ms'.padEnd(COL.node),
    'Browser ms'.padEnd(COL.browser),
    'Speedup'.padEnd(COL.speedup),
    'Status',
  ].join('');

  console.log('\n' + header);
  console.log('-'.repeat(header.length));

  for (const c of comparisons) {
    const nodeStr = c.nodeMedian ? c.nodeMedian.toFixed(2) : 'N/A';
    const browserStr = c.browserMedian ? c.browserMedian.toFixed(2) : 'N/A';
    const speedupStr = c.speedup ? `${c.speedup.toFixed(2)}x` : 'N/A';

    console.log(
      [
        c.algorithm.padEnd(COL.algo),
        String(c.size).padEnd(COL.size),
        nodeStr.padEnd(COL.node),
        browserStr.padEnd(COL.browser),
        speedupStr.padEnd(COL.speedup),
        c.status,
      ].join('')
    );
  }
  console.log('-'.repeat(header.length));
}

function printStatistics(comparisons) {
  const validComparisons = comparisons.filter((c) => c.speedup !== null);

  if (validComparisons.length === 0) {
    console.log('No comparable results found.');
    return;
  }

  const speedups = validComparisons.map((c) => c.speedup);
  const avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
  const minSpeedup = Math.min(...speedups);
  const maxSpeedup = Math.max(...speedups);

  const slower = validComparisons.filter((c) => c.speedup > 1.1).length;
  const faster = validComparisons.filter((c) => c.speedup < 0.9).length;
  const similar = validComparisons.length - slower - faster;

  console.log('\n📊 STATISTICS');
  console.log('─'.repeat(50));
  console.log(`Total comparisons: ${validComparisons.length}`);
  console.log(`Average speedup:   ${avgSpeedup.toFixed(2)}x`);
  console.log(`Speedup range:     ${minSpeedup.toFixed(2)}x - ${maxSpeedup.toFixed(2)}x`);
  console.log(`\nDistribution:`);
  console.log(`  Browser slower (>10% slower): ${slower}`);
  console.log(`  Similar (±10%):              ${similar}`);
  console.log(`  Browser faster (>10% faster): ${faster}`);

  const overallImpression =
    avgSpeedup > 1.1
      ? '⚠️  Browser is consistently slower'
      : avgSpeedup < 0.95
        ? '✓ Browser is consistently faster'
        : '≈ Performance is similar';

  console.log(`\nOverall: ${overallImpression}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Benchmark Comparison Tool');
    console.log('Usage: node compare.js <nodejs-json> <browser-json>');
    console.log('\nExample:');
    console.log(
      '  node benchmarks/compare.js results/nodejs_result.json results/browser_result.json'
    );
    process.exit(1);
  }

  const [nodeFile, browserFile] = args;

  console.log('Benchmark Comparison Tool');
  console.log('═'.repeat(70));
  console.log(`Loading Node.js results from: ${nodeFile}`);
  console.log(`Loading Browser results from: ${browserFile}`);

  const nodeResults = loadResults(nodeFile);
  const browserResults = loadResults(browserFile);

  console.log(`✓ Loaded ${(nodeResults.results || nodeResults).length} Node.js measurements`);
  console.log(
    `✓ Loaded ${(browserResults.results || browserResults).length} Browser measurements\n`
  );

  const comparisons = compareResults(nodeResults, browserResults);

  printComparisonTable(comparisons);
  printStatistics(comparisons);

  console.log('\n═'.repeat(70));
  console.log('Tip: Use these results to optimize browser performance and identify bottlenecks.');
}

main();
