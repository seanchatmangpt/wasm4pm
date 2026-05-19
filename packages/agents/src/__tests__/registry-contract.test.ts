/**
 * Registry domain-contract tests.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * These tests verify behavioral properties of AgentRegistry that are
 * specified by the Van der Aalst agents domain, not by implementation
 * details. They encode invariants that must hold for any correct registry.
 */
import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../registry.js';
import { VAN_DERAALST_AGENTS } from '../types.js';

describe('AgentRegistry — initialization contract', () => {
  it('registers exactly the 8 Van der Aalst agents on construction', () => {
    const registry = new AgentRegistry();
    const names = registry.getAgentNames();
    expect(names).toHaveLength(VAN_DERAALST_AGENTS.length);
    for (const agentName of VAN_DERAALST_AGENTS) {
      expect(registry.hasAgent(agentName)).toBe(true);
    }
  });

  it('all 8 built-in agents start in active status', () => {
    const registry = new AgentRegistry();
    for (const agentName of VAN_DERAALST_AGENTS) {
      const state = registry.getAgent(agentName);
      expect(state).toBeDefined();
      expect(state!.status).toBe('active');
    }
  });

  it('all 8 built-in agents start with total_runs = 0', () => {
    const registry = new AgentRegistry();
    for (const agentName of VAN_DERAALST_AGENTS) {
      const state = registry.getAgent(agentName)!;
      expect(state.total_runs).toBe(0);
      expect(state.total_violations).toBe(0);
      expect(state.total_corrections).toBe(0);
      expect(state.last_run).toBeNull();
    }
  });

  it('getSummary reflects initial state: 8 total, 8 active, 0 disabled/error', () => {
    const registry = new AgentRegistry();
    const summary = registry.getSummary();
    expect(summary.total).toBe(8);
    expect(summary.active).toBe(8);
    expect(summary.disabled).toBe(0);
    expect(summary.error).toBe(0);
    expect(summary.degraded).toBe(0);
  });
});

describe('AgentRegistry — mode classification contract', () => {
  it('getContinuousAgents returns only active continuous agents', () => {
    const registry = new AgentRegistry();
    const continuous = registry.getContinuousAgents();

    for (const agent of continuous) {
      expect(agent.config.mode).toBe('continuous');
      expect(agent.status).toBe('active');
    }
  });

  it('continuous agents are a strict subset of all agents', () => {
    const registry = new AgentRegistry();
    const all = registry.listAgents();
    const continuous = registry.getContinuousAgents();

    expect(continuous.length).toBeGreaterThan(0);
    expect(continuous.length).toBeLessThan(all.length);
  });

  it('getOnDemandAgentsForGate returns only agents whose target_gates includes the gate', () => {
    const registry = new AgentRegistry();
    const gate = 'benchmark-passed';
    const agents = registry.getOnDemandAgentsForGate(gate);

    for (const agent of agents) {
      expect(agent.config.mode).toBe('on_demand');
      expect(agent.config.target_gates).toContain(gate);
    }
  });

  it('getOnDemandAgentsForGate returns empty array for unknown gate', () => {
    const registry = new AgentRegistry();
    const agents = registry.getOnDemandAgentsForGate('nonexistent-gate-xyz');
    expect(agents).toHaveLength(0);
  });

  it('listAgents with mode filter returns only agents of that mode', () => {
    const registry = new AgentRegistry();
    const continuous = registry.listAgents('continuous');
    const onDemand = registry.listAgents('on_demand');

    for (const a of continuous) {
      expect(a.config.mode).toBe('continuous');
    }
    for (const a of onDemand) {
      expect(a.config.mode).toBe('on_demand');
    }

    // Together they must account for all agents
    expect(continuous.length + onDemand.length).toBe(registry.listAgents().length);
  });
});

describe('AgentRegistry — enable/disable lifecycle contract', () => {
  it('disableAgent changes status to disabled and enabled to false', () => {
    const registry = new AgentRegistry();
    const result = registry.disableAgent('mock-interceptor');
    expect(result).toBe(true);

    const state = registry.getAgent('mock-interceptor')!;
    expect(state.status).toBe('disabled');
    expect(state.config.enabled).toBe(false);
  });

  it('disableAgent returns false for unknown agent', () => {
    const registry = new AgentRegistry();
    expect(registry.disableAgent('not-a-real-agent')).toBe(false);
  });

  it('enableAgent restores status to active after disable', () => {
    const registry = new AgentRegistry();
    registry.disableAgent('config-drift-guardian');
    expect(registry.getAgent('config-drift-guardian')!.status).toBe('disabled');

    const result = registry.enableAgent('config-drift-guardian');
    expect(result).toBe(true);
    expect(registry.getAgent('config-drift-guardian')!.status).toBe('active');
    expect(registry.getAgent('config-drift-guardian')!.config.enabled).toBe(true);
  });

  it('disabled agent is excluded from getContinuousAgents', () => {
    const registry = new AgentRegistry();
    // mock-interceptor is continuous
    const beforeDisable = registry.getContinuousAgents().some((a) => a.config.name === 'mock-interceptor');
    expect(beforeDisable).toBe(true);

    registry.disableAgent('mock-interceptor');
    const afterDisable = registry.getContinuousAgents().some((a) => a.config.name === 'mock-interceptor');
    expect(afterDisable).toBe(false);
  });

  it('getSummary reflects disable/enable transitions correctly', () => {
    const registry = new AgentRegistry();
    registry.disableAgent('theater-detector');
    registry.disableAgent('authority-escalation-watcher');

    const summary = registry.getSummary();
    expect(summary.disabled).toBe(2);
    expect(summary.active).toBe(6);
    expect(summary.total).toBe(8);
  });
});

describe('AgentRegistry — updateAgentState runtime tracking contract', () => {
  it('updateAgentState increments total_runs on each call', () => {
    const registry = new AgentRegistry();
    const name = 'mock-interceptor';

    registry.updateAgentState(name, { violations: 0 });
    expect(registry.getAgent(name)!.total_runs).toBe(1);

    registry.updateAgentState(name, { violations: 0 });
    expect(registry.getAgent(name)!.total_runs).toBe(2);
  });

  it('updateAgentState accumulates total_violations across calls', () => {
    const registry = new AgentRegistry();
    const name = 'evidence-fabrication-detector';

    registry.updateAgentState(name, { violations: 3 });
    registry.updateAgentState(name, { violations: 2 });
    expect(registry.getAgent(name)!.total_violations).toBe(5);
  });

  it('updateAgentState accumulates total_corrections across calls', () => {
    const registry = new AgentRegistry();
    const name = 'receipt-chain-attacker';

    registry.updateAgentState(name, { corrections: 1 });
    registry.updateAgentState(name, { corrections: 2 });
    expect(registry.getAgent(name)!.total_corrections).toBe(3);
  });

  it('updateAgentState sets last_run to a recent ISO timestamp', () => {
    const registry = new AgentRegistry();
    const before = Date.now();

    registry.updateAgentState('gate-independence-verifier', { violations: 0 });
    const state = registry.getAgent('gate-independence-verifier')!;

    expect(state.last_run).not.toBeNull();
    const ts = new Date(state.last_run!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it('updateAgentState transitions status to error when error string is non-null', () => {
    const registry = new AgentRegistry();
    registry.updateAgentState('process-mining-skeptic', { error: 'something went wrong' });
    expect(registry.getAgent('process-mining-skeptic')!.status).toBe('error');
    expect(registry.getAgent('process-mining-skeptic')!.last_error).toBe('something went wrong');
  });

  it('updateAgentState clears error status when error is null', () => {
    const registry = new AgentRegistry();
    registry.updateAgentState('process-mining-skeptic', { error: 'transient' });
    registry.updateAgentState('process-mining-skeptic', { error: null, status: 'active' });
    expect(registry.getAgent('process-mining-skeptic')!.status).toBe('active');
    expect(registry.getAgent('process-mining-skeptic')!.last_error).toBeNull();
  });

  it('updateAgentState is a no-op for unknown agent names', () => {
    const registry = new AgentRegistry();
    // Must not throw
    expect(() =>
      registry.updateAgentState('nonexistent-agent', { violations: 5 })
    ).not.toThrow();
  });
});

describe('AgentRegistry — registerAgent contract', () => {
  it('registerAgent makes the new agent discoverable via getAgent', () => {
    const registry = new AgentRegistry();
    registry.registerAgent({
      name: 'custom-validator',
      description: 'Custom agent for testing',
      mode: 'on_demand',
      target_gates: ['custom-gate'],
      enabled: true,
      correction_type: 'process_correction',
      version: '0.1.0',
      tags: ['custom'],
      thresholds: {
        min_fitness: 0.9,
        min_precision: 0.8,
        max_deviations: 0,
        timeout_ms: 1000,
      },
    });

    expect(registry.hasAgent('custom-validator')).toBe(true);
    expect(registry.getAgent('custom-validator')!.config.mode).toBe('on_demand');
  });

  it('registerAgent with enabled=false starts as disabled status', () => {
    const registry = new AgentRegistry();
    registry.registerAgent({
      name: 'disabled-from-birth',
      description: 'Registered but disabled',
      mode: 'continuous',
      target_gates: [],
      enabled: false,
      correction_type: null,
      version: '1.0.0',
      tags: [],
      thresholds: {
        min_fitness: 0.95,
        min_precision: 0.8,
        max_deviations: 0,
        timeout_ms: 5000,
      },
    });

    const state = registry.getAgent('disabled-from-birth')!;
    expect(state.status).toBe('disabled');
    expect(state.config.enabled).toBe(false);
  });

  it('registerAgent increments total reported by getSummary', () => {
    const registry = new AgentRegistry();
    const before = registry.getSummary().total;

    registry.registerAgent({
      name: 'extra-agent',
      description: 'Extra agent for test',
      mode: 'on_demand',
      target_gates: [],
      enabled: true,
      correction_type: 'evidence_repair',
      version: '1.0.0',
      tags: [],
      thresholds: {
        min_fitness: 0.9,
        min_precision: 0.8,
        max_deviations: 0,
        timeout_ms: 2000,
      },
    });

    expect(registry.getSummary().total).toBe(before + 1);
  });
});
