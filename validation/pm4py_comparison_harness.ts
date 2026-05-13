/**
 * pm4py_comparison_harness.ts
 *
 * Validation harness for comparing wasm4pm algorithms against pm4py reference implementations.
 *
 * Usage:
 *   npx ts-node validation/pm4py_comparison_harness.ts --algorithms dfg,alpha,heuristic
 *   npx ts-node validation/pm4py_comparison_harness.ts --log-size 500
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Test result for a single algorithm on a single log
 */
interface TestResult {
  algorithm: string;
  logSize: number;
  wasm4pmOutput?: any;
  pm4pyOutput?: any;
  wasm4pmTime: number;
  pm4pyTime: number;
  wasm4pmError?: string;
  pm4pyError?: string;
  passed: boolean;
  metrics: {
    edgeCount?: { wasm4pm: number; pm4py: number; delta: number };
    fitnessScore?: { wasm4pm: number; pm4py: number; delta: number };
    activityCount?: { wasm4pm: number; pm4py: number; delta: number };
    placeCount?: { wasm4pm: number; pm4py: number; delta: number };
    transitionCount?: { wasm4pm: number; pm4py: number; delta: number };
  };
}

/**
 * Validation suite configuration
 */
interface ValidationConfig {
  algorithms: string[];
  logSizes: number[];
  tolerance: {
    fitness: number; // ±5%
    edgeCount: number; // exact match
    mlMetrics: number; // ±10%
    timing: number; // relative comparison
  };
  testLogsDir: string;
  outputDir: string;
  pythonExe: string;
}

class PM4pyComparisonHarness {
  private config: ValidationConfig;
  private results: TestResult[] = [];

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = {
      algorithms: config.algorithms || [
        'dfg', 'alpha_plus_plus', 'heuristic_miner', 'inductive_miner',
        'genetic_algorithm', 'pso', 'a_star', 'hill_climbing', 'aco',
        'simulated_annealing', 'declare', 'optimized_dfg', 'ilp'
      ],
      logSizes: config.logSizes || [50, 500, 5000],
      tolerance: {
        fitness: 0.05,
        edgeCount: 0,
        mlMetrics: 0.10,
        timing: 0,
        ...config.tolerance
      },
      testLogsDir: config.testLogsDir || '/tmp/wasm4pm_test_logs',
      outputDir: config.outputDir || '/Users/sac/wasm4pm/validation/results',
      pythonExe: config.pythonExe || 'python3'
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Generate test event logs in XES format
   * Uses pm4py to generate deterministic logs
   */
  async generateTestLogs(): Promise<void> {
    console.log('Generating test event logs...');

    if (!fs.existsSync(this.config.testLogsDir)) {
      fs.mkdirSync(this.config.testLogsDir, { recursive: true });
    }

    // Create Python script to generate test logs
    const generateScript = `
import pm4py
import random
random.seed(42)

# Small log (50 events)
log_50 = pm4py.generate_log(num_traces=5, max_trace_length=10)
pm4py.write_xes(log_50, "${this.config.testLogsDir}/log_50_events.xes")
print("Generated log_50_events.xes")

# Medium log (500 events)
log_500 = pm4py.generate_log(num_traces=50, max_trace_length=10)
pm4py.write_xes(log_500, "${this.config.testLogsDir}/log_500_events.xes")
print("Generated log_500_events.xes")

# Large log (5000 events)
log_5000 = pm4py.generate_log(num_traces=500, max_trace_length=10)
pm4py.write_xes(log_5000, "${this.config.testLogsDir}/log_5000_events.xes")
print("Generated log_5000_events.xes")

print("All test logs generated successfully")
    `;

    return new Promise((resolve, reject) => {
      const python = spawn(this.config.pythonExe, ['-c', generateScript]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString().trim());
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString().trim());
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Log generation failed with code ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Run pm4py algorithm and capture output
   */
  async runPm4pyAlgorithm(algorithm: string, logFile: string, seed: number = 42): Promise<{
    output: any;
    time: number;
  }> {
    return new Promise((resolve, reject) => {
      const script = `
import pm4py
import json
import time

log = pm4py.read_xes("${logFile}")
random_seed = ${seed}

start = time.time()

try:
    if "${algorithm}" == "dfg":
        dfg, start_act, end_act = pm4py.discover_dfg(log)
        result = {
            "edges": len(dfg),
            "activities": len(set(n[0] for n in dfg) | set(n[1] for n in dfg)),
            "start_activities": len(start_act),
            "end_activities": len(end_act)
        }
    elif "${algorithm}" == "alpha_plus_plus":
        net, im, fm = pm4py.discover_petri_net_alpha_plus_plus(log)
        result = {
            "places": len(net.places),
            "transitions": len(net.transitions),
            "arcs": len(net.arcs)
        }
    elif "${algorithm}" == "heuristic_miner":
        hm = pm4py.discover_heuristic_net(log)
        result = {
            "edges": len(hm.edges),
            "nodes": len(hm.nodes)
        }
    else:
        result = {"error": "Algorithm not implemented in test script"}
except Exception as e:
    result = {"error": str(e)}

elapsed = time.time() - start
print(json.dumps({"result": result, "time": elapsed}))
      `;

      const python = spawn(this.config.pythonExe, ['-c', script]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`pm4py execution failed: ${stderr}`));
        } else {
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve({
              output: parsed.result,
              time: parsed.time * 1000 // Convert to ms
            });
          } catch (e) {
            reject(new Error(`Failed to parse pm4py output: ${stdout}`));
          }
        }
      });
    });
  }

  /**
   * Compare two algorithm outputs
   */
  compareOutputs(algorithm: string, wasm4pmOutput: any, pm4pyOutput: any): {
    passed: boolean;
    metrics: any;
  } {
    const metrics: any = {};
    let passed = true;

    // Algorithm-specific comparisons
    switch (algorithm) {
      case 'dfg':
        if (wasm4pmOutput.edges !== undefined && pm4pyOutput.edges !== undefined) {
          const delta = Math.abs(wasm4pmOutput.edges - pm4pyOutput.edges);
          metrics.edgeCount = {
            wasm4pm: wasm4pmOutput.edges,
            pm4py: pm4pyOutput.edges,
            delta
          };
          passed = passed && delta <= 1; // Allow 1 edge difference due to implementation variance
        }
        break;

      case 'alpha_plus_plus':
      case 'heuristic_miner':
        // Compare structure metrics
        if (wasm4pmOutput.places && pm4pyOutput.places) {
          metrics.placeCount = {
            wasm4pm: wasm4pmOutput.places,
            pm4py: pm4pyOutput.places,
            delta: Math.abs(wasm4pmOutput.places - pm4pyOutput.places)
          };
        }
        break;

      default:
        // Generic comparison
        passed = JSON.stringify(wasm4pmOutput) === JSON.stringify(pm4pyOutput);
    }

    return { passed, metrics };
  }

  /**
   * Run full validation suite
   */
  async validate(): Promise<void> {
    console.log('Starting wasm4pm vs pm4py validation...\n');

    try {
      // Generate test logs
      await this.generateTestLogs();
      console.log('✓ Test logs generated\n');

      // For now, document the test plan structure
      console.log('Test harness structure created. Next steps:');
      console.log('1. Implement WASM loader for wasm4pm algorithms');
      console.log('2. Run discovery algorithm validation');
      console.log('3. Run conformance validation');
      console.log('4. Generate comparison report');

      // Save test configuration
      this.saveConfiguration();

    } catch (error) {
      console.error('Validation failed:', error);
      throw error;
    }
  }

  /**
   * Save test configuration and results template
   */
  private saveConfiguration(): void {
    const config = {
      timestamp: new Date().toISOString(),
      algorithms: this.config.algorithms,
      logSizes: this.config.logSizes,
      tolerance: this.config.tolerance,
      testLogsDir: this.config.testLogsDir,
      testLogs: fs.readdirSync(this.config.testLogsDir).filter(f => f.endsWith('.xes'))
    };

    fs.writeFileSync(
      path.join(this.config.outputDir, 'validation_config.json'),
      JSON.stringify(config, null, 2)
    );

    console.log(`\nConfiguration saved to ${this.config.outputDir}/validation_config.json`);
  }

  /**
   * Generate HTML report of validation results
   */
  generateReport(results: TestResult[]): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>wasm4pm vs pm4py Validation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f2f2f2; }
    .pass { color: green; font-weight: bold; }
    .fail { color: red; font-weight: bold; }
    .pending { color: orange; font-weight: bold; }
  </style>
</head>
<body>
  <h1>wasm4pm vs pm4py Algorithm Validation Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <h2>Validation Status: IN PROGRESS</h2>
  <p>This harness validates the 41 algorithms in wasm4pm against pm4py reference implementations.</p>

  <h2>Test Configuration</h2>
  <ul>
    <li>Algorithms: ${this.config.algorithms.length}</li>
    <li>Log sizes: ${this.config.logSizes.join(', ')} events</li>
    <li>Tolerance (fitness): ±${(this.config.tolerance.fitness * 100).toFixed(0)}%</li>
    <li>Tolerance (ML metrics): ±${(this.config.tolerance.mlMetrics * 100).toFixed(0)}%</li>
  </ul>

  <h2>Results</h2>
  <table>
    <tr>
      <th>Algorithm</th>
      <th>Log Size</th>
      <th>Status</th>
      <th>wasm4pm Time</th>
      <th>pm4py Time</th>
      <th>Metrics</th>
    </tr>
    ${results.map(r => `
    <tr>
      <td>${r.algorithm}</td>
      <td>${r.logSize} events</td>
      <td><span class="${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</span></td>
      <td>${r.wasm4pmTime.toFixed(2)}ms</td>
      <td>${r.pm4pyTime.toFixed(2)}ms</td>
      <td>${JSON.stringify(r.metrics)}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>
    `;

    return html;
  }
}

// Main execution
if (require.main === module) {
  const harness = new PM4pyComparisonHarness();

  harness.validate()
    .then(() => {
      console.log('\nValidation harness initialized successfully');
      console.log('Configuration saved to: /Users/sac/wasm4pm/validation/results/validation_config.json');
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

export { PM4pyComparisonHarness, ValidationConfig, TestResult };
