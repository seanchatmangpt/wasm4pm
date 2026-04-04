#!/usr/bin/env node

/**
 * wasm4pm CLI - Command-line interface for process mining
 *
 * Usage:
 *   wasm4pm load <file>               Load an event log
 *   wasm4pm discover <file> <algo>    Discover process model
 *   wasm4pm analyze <file>            Analyze event log
 *   wasm4pm export <file> <format>    Export results
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ProcessMiningClient, EventLogHandle } from '../src/client';

interface CLIConfig {
  activityKey: string;
  timestampKey: string;
  format: 'json' | 'xes' | 'xml';
  outputFile?: string;
  verbose: boolean;
}

const defaultConfig: CLIConfig = {
  activityKey: 'concept:name',
  timestampKey: 'time:timestamp',
  format: 'json',
  verbose: false,
};

class WASM4PMCLI {
  private client: ProcessMiningClient;
  private config: CLIConfig;

  constructor() {
    this.client = new ProcessMiningClient();
    this.config = { ...defaultConfig };
  }

  async init() {
    try {
      await this.client.init();
      console.log('✅ wasm4pm initialized');
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      process.exit(1);
    }
  }

  async load(filePath: string): Promise<EventLogHandle | null> {
    if (!existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const ext = filePath.split('.').pop()?.toLowerCase();

      let log: EventLogHandle;
      if (ext === 'xes') {
        log = this.client.loadEventLogFromXES(content);
      } else if (ext === 'json') {
        log = this.client.loadEventLogFromJSON(content);
      } else {
        console.error(`❌ Unsupported format: ${ext}`);
        return null;
      }

      console.log(`✅ Loaded ${filePath}`);
      return log;
    } catch (error) {
      console.error(`❌ Failed to load file:`, error);
      return null;
    }
  }

  async discover(filePath: string, algorithm: string): Promise<void> {
    const log = await this.load(filePath);
    if (!log) return;

    console.log(`\n🔬 Running ${algorithm} discovery...`);

    try {
      const startTime = Date.now();
      let result;

      switch (algorithm.toLowerCase()) {
        case 'dfg':
          result = log.discoverDFG({ minFrequency: 1 });
          break;
        case 'alpha':
        case 'alpha++':
          result = log.discoverAlphaPlusPlus();
          break;
        case 'declare':
          result = log.discoverDECLARE();
          break;
        case 'ilp':
          result = log.discoverILPPetriNet();
          break;
        case 'optimized':
          result = log.discoverOptimizedDFG({ fitnessWeight: 0.7, simplicityWeight: 0.3 });
          break;
        case 'genetic':
          console.log('🧬 Running genetic algorithm discovery...');
          result = log.discoverGeneticAlgorithm({ populationSize: 50, generations: 20 });
          break;
        case 'pso':
          console.log('🐝 Running particle swarm optimization...');
          result = log.discoverPSOAlgorithm({ swarmSize: 30, iterations: 50 });
          break;
        case 'heuristic':
          console.log('⚠️  Heuristic miner (use advanced_algorithms module)');
          return;
        default:
          console.error(`❌ Unknown algorithm: ${algorithm}`);
          return;
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Discovery completed in ${duration}s`);

      const json = result.toJSON();
      this.printResult(json, algorithm);

      if (this.config.outputFile) {
        this.saveResult(json);
      }
    } catch (error) {
      console.error(`❌ Discovery failed:`, error);
    }
  }

  async analyze(filePath: string): Promise<void> {
    const log = await this.load(filePath);
    if (!log) return;

    console.log(`\n📊 Analyzing event log...`);

    try {
      const stats = log.getStats();
      const traceLengthStats = log.getTraceLengthStats();
      const activityFreqs = log.getActivityFrequencies();

      console.log('\n📈 Statistics:');
      console.log(`  Cases: ${stats.total_cases.toLocaleString()}`);
      console.log(`  Events: ${stats.total_events.toLocaleString()}`);
      console.log(`  Avg Events/Case: ${stats.avg_events_per_case.toFixed(2)}`);

      console.log('\n📏 Case Length Distribution:');
      console.log(`  Min: ${traceLengthStats.min}`);
      console.log(`  Max: ${traceLengthStats.max}`);
      console.log(`  Avg: ${traceLengthStats.average.toFixed(2)}`);
      console.log(`  Median: ${traceLengthStats.median}`);

      console.log('\n🎯 Top 10 Activities:');
      activityFreqs.slice(0, 10).forEach(([activity, freq], idx) => {
        const pct = ((freq / stats.total_events) * 100).toFixed(1);
        console.log(`  ${idx + 1}. ${activity}: ${freq} (${pct}%)`);
      });

      if (this.config.outputFile) {
        const result = {
          statistics: stats,
          caseLengthStats: traceLengthStats,
          activityFrequencies: activityFreqs,
        };
        this.saveResult(result);
      }
    } catch (error) {
      console.error(`❌ Analysis failed:`, error);
    }
  }

  async export(filePath: string, format: string): Promise<void> {
    const log = await this.load(filePath);
    if (!log) return;

    console.log(`\n💾 Exporting to ${format.toUpperCase()}...`);

    try {
      let exported: string;

      switch (format.toLowerCase()) {
        case 'json':
          exported = log.toJSON();
          break;
        case 'xes':
          exported = log.toXES();
          break;
        default:
          console.error(`❌ Unsupported export format: ${format}`);
          return;
      }

      const outputFile =
        this.config.outputFile || filePath.replace(/\.[^.]+$/, `.exported.${format}`);
      writeFileSync(outputFile, exported);
      console.log(`✅ Exported to ${outputFile}`);
    } catch (error) {
      console.error(`❌ Export failed:`, error);
    }
  }

  private printResult(result: any, label: string): void {
    console.log(`\n🔍 ${label.toUpperCase()} Result:`);
    if (typeof result === 'object') {
      if ('nodes' in result && 'edges' in result) {
        console.log(`  Nodes: ${result.nodes}`);
        console.log(`  Edges: ${result.edges}`);
      } else if ('places' in result && 'transitions' in result) {
        console.log(`  Places: ${result.places}`);
        console.log(`  Transitions: ${result.transitions}`);
        console.log(`  Arcs: ${result.arcs}`);
      } else if ('constraints' in result) {
        console.log(`  Constraints: ${result.constraints.length}`);
      } else {
        console.log(JSON.stringify(result, null, 2).split('\n').slice(0, 10).join('\n'));
      }
    }
  }

  private saveResult(result: any): void {
    if (!this.config.outputFile) return;

    const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    writeFileSync(this.config.outputFile, content);
    console.log(`✅ Results saved to ${this.config.outputFile}`);
  }

  async run(args: string[]): Promise<void> {
    const [command, ...cmdArgs] = args.slice(2);

    // Parse global options
    for (let i = 0; i < cmdArgs.length; i++) {
      if (cmdArgs[i] === '-o' || cmdArgs[i] === '--output') {
        this.config.outputFile = cmdArgs[++i];
      } else if (cmdArgs[i] === '-v' || cmdArgs[i] === '--verbose') {
        this.config.verbose = true;
      } else if (cmdArgs[i] === '--activity-key') {
        this.config.activityKey = cmdArgs[++i];
      } else if (cmdArgs[i] === '--timestamp-key') {
        this.config.timestampKey = cmdArgs[++i];
      }
    }

    switch (command?.toLowerCase()) {
      case 'load':
        await this.load(cmdArgs[0]);
        break;
      case 'discover':
        await this.discover(cmdArgs[0], cmdArgs[1] || 'dfg');
        break;
      case 'analyze':
        await this.analyze(cmdArgs[0]);
        break;
      case 'export':
        await this.export(cmdArgs[0], cmdArgs[1] || 'json');
        break;
      case 'help':
      case '-h':
      case '--help':
        this.printHelp();
        break;
      case 'version':
      case '-v':
      case '--version':
        console.log('wasm4pm v0.1.0');
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        this.printHelp();
        process.exit(1);
    }
  }

  private printHelp(): void {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        wasm4pm v0.1.0                          ║
║            Process Mining in WebAssembly                       ║
╚════════════════════════════════════════════════════════════════╝

USAGE:
  wasm4pm <command> [options]

COMMANDS:
  load <file>              Load and validate an event log
  discover <file> <algo>   Discover process model
                           Algorithms: dfg, alpha, declare, ilp, optimized, genetic, pso
  analyze <file>           Analyze event log statistics
  export <file> <format>   Export results (json, xes)
  help                     Show this help message
  version                  Show version

OPTIONS:
  -o, --output <file>      Save results to file
  -v, --verbose            Enable verbose output
  --activity-key <key>     Activity attribute key (default: concept:name)
  --timestamp-key <key>    Timestamp attribute key (default: time:timestamp)

EXAMPLES:
  wasm4pm load data/log.xes
  wasm4pm discover data/log.xes dfg -o result.json
  wasm4pm discover data/log.xes alpha
  wasm4pm discover data/log.xes ilp -o petri_net.json
  wasm4pm discover data/log.xes genetic -o evolved_model.json
  wasm4pm discover data/log.xes pso -o swarm_model.json
  wasm4pm analyze data/log.xes --verbose
  wasm4pm export data/log.json xes -o log.xes

DOCUMENTATION:
  https://github.com/seanchatmangpt/wasm4pm
    `);
  }
}

// Main execution
const cli = new WASM4PMCLI();
cli.init().then(() => cli.run(process.argv));
