/**
 * Agent Registry — Discovery and loading of Van der Aalst agents
 *
 * Loads agent configurations from agents.toml and maintains runtime state.
 */
import type {
  AgentConfig,
  AgentMode,
  AgentRuntimeState,
  AgentStatus,
  VanDerAalstAgentName,
} from './types.js';
/**
 * Agent Registry — manages agent lifecycle and runtime state
 */
export declare class AgentRegistry {
  private agents;
  private registryPath;
  constructor(registryPath?: string);
  /** Load the 8 built-in Van der Aalst agent configurations */
  private _loadBuiltinAgents;
  /** Load additional agent configurations from a JSON file */
  private _loadFromFile;
  /** List all registered agents */
  listAgents(filter?: AgentMode): AgentRuntimeState[];
  /** Get a specific agent by name */
  getAgent(name: VanDerAalstAgentName | string): AgentRuntimeState | undefined;
  /** Check if an agent exists */
  hasAgent(name: string): boolean;
  /** Get all agent names */
  getAgentNames(): string[];
  /** Get agents that should run continuously */
  getContinuousAgents(): AgentRuntimeState[];
  /** Get agents that should run on-demand at a specific gate */
  getOnDemandAgentsForGate(gateName: string): AgentRuntimeState[];
  /** Update agent runtime state after execution */
  updateAgentState(
    name: string,
    update: {
      violations?: number;
      corrections?: number;
      error?: string | null;
      status?: AgentStatus;
    }
  ): void;
  /** Register a new agent */
  registerAgent(config: AgentConfig): void;
  /** Disable an agent */
  disableAgent(name: string): boolean;
  /** Enable an agent */
  enableAgent(name: string): boolean;
  /** Get registry summary */
  getSummary(): {
    total: number;
    active: number;
    disabled: number;
    error: number;
    degraded: number;
  };
}
//# sourceMappingURL=registry.d.ts.map
