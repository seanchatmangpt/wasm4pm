/**
 * Agent Registry — Discovery and loading of Van der Aalst agents
 *
 * Loads agent configurations from agents.toml and maintains runtime state.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  AgentConfig,
  AgentMode,
  AgentRuntimeState,
  AgentStatus,
  AgentThresholds,
  CorrectionType,
  VanDerAalstAgentName,
} from './types.js';

/** Default thresholds for agent detection */
const DEFAULT_THRESHOLDS: AgentThresholds = {
  min_fitness: 0.95,
  min_precision: 0.8,
  max_deviations: 0,
  timeout_ms: 5000,
};

/** Built-in agent configurations for all 8 Van der Aalst agents */
const BUILTIN_AGENTS: AgentConfig[] = [
  {
    name: 'mock-interceptor',
    description: 'Detects mock/stub/fake patterns in OTel traces and source code',
    mode: 'continuous',
    target_gates: [],
    enabled: true,
    correction_type: 'code_refactoring',
    version: '1.0.0',
    tags: ['wvda', 'anti-cheating', 'mocking'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 500 },
  },
  {
    name: 'config-drift-guardian',
    description: 'Detects configuration drift that weakens enforcement settings',
    mode: 'continuous',
    target_gates: [],
    enabled: true,
    correction_type: 'config_restoration',
    version: '1.0.0',
    tags: ['wvda', 'governance', 'configuration'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 1000 },
  },
  {
    name: 'receipt-chain-attacker',
    description: 'Validates BLAKE3 receipt chain integrity and repairs breaks',
    mode: 'on_demand',
    target_gates: ['benchmark-passed', 'sustained-validation-complete'],
    enabled: true,
    correction_type: 'receipt_chain_repair',
    version: '1.0.0',
    tags: ['wvda', 'receipts', 'blake3'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 2000 },
  },
  {
    name: 'gate-independence-verifier',
    description: 'Verifies proof gates operate independently without circular dependencies',
    mode: 'on_demand',
    target_gates: ['cross-system-causality-proven', 'authority-chain-valid', 'process-conformance'],
    enabled: true,
    correction_type: 'process_correction',
    version: '1.0.0',
    tags: ['wvda', 'gates', 'independence'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 3000 },
  },
  {
    name: 'evidence-fabrication-detector',
    description: 'Detects fabricated telemetry evidence (spans, OCEL events, receipts)',
    mode: 'continuous',
    target_gates: [],
    enabled: true,
    correction_type: 'evidence_repair',
    version: '1.0.0',
    tags: ['wvda', 'anti-cheating', 'evidence'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 2000 },
  },
  {
    name: 'process-mining-skeptic',
    description: 'Validates process models using pm4py discovery and conformance checking',
    mode: 'on_demand',
    target_gates: ['process-conformance'],
    enabled: true,
    correction_type: 'process_correction',
    version: '1.0.0',
    tags: ['wvda', 'process-mining', 'pm4py', 'conformance'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 5000 },
  },
  {
    name: 'theater-detector',
    description: 'Identifies testing theater (assertions without real evidence)',
    mode: 'on_demand',
    target_gates: ['observability-present', 'benchmark-passed'],
    enabled: true,
    correction_type: 'stub_elimination',
    version: '1.0.0',
    tags: ['wvda', 'anti-cheating', 'theater'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 2000 },
  },
  {
    name: 'authority-escalation-watcher',
    description: 'Detects unauthorized privilege escalation and prevents it',
    mode: 'on_demand',
    target_gates: ['authority-chain-valid'],
    enabled: true,
    correction_type: 'authority_restoration',
    version: '1.0.0',
    tags: ['wvda', 'governance', 'authority'],
    thresholds: { ...DEFAULT_THRESHOLDS, timeout_ms: 1500 },
  },
];

/**
 * Agent Registry — manages agent lifecycle and runtime state
 */
export class AgentRegistry {
  private agents: Map<string, AgentRuntimeState> = new Map();
  private registryPath: string | null;

  constructor(registryPath?: string) {
    this.registryPath = registryPath || null;
    this._loadBuiltinAgents();
    if (this.registryPath && existsSync(this.registryPath)) {
      this._loadFromFile(this.registryPath);
    }
  }

  /** Load the 8 built-in Van der Aalst agent configurations */
  private _loadBuiltinAgents(): void {
    for (const config of BUILTIN_AGENTS) {
      this.agents.set(config.name, {
        config,
        status: 'active',
        total_runs: 0,
        total_violations: 0,
        total_corrections: 0,
        last_run: null,
        last_error: null,
      });
    }
  }

  /** Load additional agent configurations from a JSON file */
  private _loadFromFile(path: string): void {
    try {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);

      const configs: AgentConfig[] = Array.isArray(data) ? data : data.agents || [];

      for (const config of configs) {
        if (config.name && config.description) {
          this.agents.set(config.name, {
            config: {
              name: config.name,
              description: config.description,
              mode: config.mode || 'on_demand',
              target_gates: config.target_gates || [],
              enabled: config.enabled ?? true,
              correction_type: config.correction_type || null,
              version: config.version || '0.0.0',
              tags: config.tags || [],
              thresholds: {
                ...DEFAULT_THRESHOLDS,
                ...config.thresholds,
              },
            },
            status: config.enabled ? 'active' : 'disabled',
            total_runs: 0,
            total_violations: 0,
            total_corrections: 0,
            last_run: null,
            last_error: null,
          });
        }
      }
    } catch {
      // File not found or invalid JSON — use built-in agents only
    }
  }

  /** List all registered agents */
  listAgents(filter?: AgentMode): AgentRuntimeState[] {
    const agents = Array.from(this.agents.values());

    if (filter) {
      return agents.filter((a) => a.config.mode === filter);
    }

    return agents;
  }

  /** Get a specific agent by name */
  getAgent(name: VanDerAalstAgentName | string): AgentRuntimeState | undefined {
    return this.agents.get(name);
  }

  /** Check if an agent exists */
  hasAgent(name: string): boolean {
    return this.agents.has(name);
  }

  /** Get all agent names */
  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /** Get agents that should run continuously */
  getContinuousAgents(): AgentRuntimeState[] {
    return this.listAgents('continuous').filter((a) => a.status === 'active');
  }

  /** Get agents that should run on-demand at a specific gate */
  getOnDemandAgentsForGate(gateName: string): AgentRuntimeState[] {
    return this.listAgents('on_demand').filter(
      (a) => a.status === 'active' && a.config.target_gates.includes(gateName)
    );
  }

  /** Update agent runtime state after execution */
  updateAgentState(
    name: string,
    update: {
      violations?: number;
      corrections?: number;
      error?: string | null;
      status?: AgentStatus;
    }
  ): void {
    const agent = this.agents.get(name);
    if (!agent) return;

    agent.last_run = new Date().toISOString();
    agent.total_runs++;

    if (update.violations !== undefined) {
      agent.total_violations += update.violations;
    }
    if (update.corrections !== undefined) {
      agent.total_corrections += update.corrections;
    }
    if (update.error !== undefined) {
      agent.last_error = update.error;
      if (update.error) {
        agent.status = 'error';
      }
    }
    if (update.status !== undefined) {
      agent.status = update.status;
    }
  }

  /** Register a new agent */
  registerAgent(config: AgentConfig): void {
    this.agents.set(config.name, {
      config,
      status: config.enabled ? 'active' : 'disabled',
      total_runs: 0,
      total_violations: 0,
      total_corrections: 0,
      last_run: null,
      last_error: null,
    });
  }

  /** Disable an agent */
  disableAgent(name: string): boolean {
    const agent = this.agents.get(name);
    if (!agent) return false;
    agent.status = 'disabled';
    agent.config.enabled = false;
    return true;
  }

  /** Enable an agent */
  enableAgent(name: string): boolean {
    const agent = this.agents.get(name);
    if (!agent) return false;
    agent.status = 'active';
    agent.config.enabled = true;
    return true;
  }

  /** Get registry summary */
  getSummary(): {
    total: number;
    active: number;
    disabled: number;
    error: number;
    degraded: number;
  } {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      active: agents.filter((a) => a.status === 'active').length,
      disabled: agents.filter((a) => a.status === 'disabled').length,
      error: agents.filter((a) => a.status === 'error').length,
      degraded: agents.filter((a) => a.status === 'degraded').length,
    };
  }
}
