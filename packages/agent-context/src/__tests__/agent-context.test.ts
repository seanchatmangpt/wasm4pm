import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { AgentContextBuilder } from '../builder.js';

// Resolve from test file: src/__tests__/ → src/ → agent-context/ → packages/ → repo root
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

describe('AgentContextBuilder', () => {
  it('throws when pointed at empty substrate (Law 8 fail-loud)', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ctx-'));
    // Create empty ocel/reports/pi/ directory
    await fs.mkdir(path.join(emptyDir, 'ocel', 'reports', 'pi'), { recursive: true });
    const builder = new AgentContextBuilder(emptyDir);
    await expect(builder.buildImplementationContext()).rejects.toThrow('Law 8 not satisfied');
    await fs.rm(emptyDir, { recursive: true });
  });

  it('buildImplementationContext on real repo: 60 admitted algorithms, ilp → discover_ilp_petri_net', async () => {
    const builder = new AgentContextBuilder(REPO_ROOT);
    const ctx = await builder.buildImplementationContext();
    expect(ctx.admittedAlgorithms.length).toBe(60);
    const ilp = ctx.wasmExportMap.find(e => e.algorithm === 'ilp');
    expect(ilp).toBeDefined();
    expect(ilp!.rustExport).toBe('discover_ilp_petri_net');
    expect(ilp!.verified).toBe(true);
  });

  it('every packet has non-empty snapshotHash (64-hex) and snapshotTimestamp > 0', async () => {
    const builder = new AgentContextBuilder(REPO_ROOT);
    const packets = await Promise.all([
      builder.buildPlanningContext(),
      builder.buildImplementationContext(),
      builder.buildVerificationContext(),
      builder.buildRepairContext(),
      builder.buildWaveOrchestratorContext(),
    ]);
    for (const pkt of packets) {
      expect(pkt.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
      expect(pkt.snapshotTimestamp).toBeGreaterThan(0n);
    }
  });

  it('role separation: planning packet has no wasmExportMap; repair packet has no crownGates', async () => {
    const builder = new AgentContextBuilder(REPO_ROOT);
    const [planning, repair] = await Promise.all([
      builder.buildPlanningContext(),
      builder.buildRepairContext(),
    ]);
    expect('wasmExportMap' in planning).toBe(false);
    expect('crownGates' in repair).toBe(false);
  });

  it('same substrate → same snapshotHash (determinism)', async () => {
    const b1 = new AgentContextBuilder(REPO_ROOT);
    const b2 = new AgentContextBuilder(REPO_ROOT);
    const [c1, c2] = await Promise.all([
      b1.buildVerificationContext(),
      b2.buildVerificationContext(),
    ]);
    expect(c1.snapshotHash).toBe(c2.snapshotHash);
  });
});
