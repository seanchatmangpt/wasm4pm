import { FileSubstrate } from './substrate.js';
import { anchorSubstrate } from './kgc-anchor.js';
import type { AnchorResult } from './kgc-anchor.js';
import type { AdmittedSubstrate } from './substrate.js';
import type {
  ContextPacketBase,
  PlanningContextPacket,
  ImplementationContextPacket,
  VerificationContextPacket,
  RepairContextPacket,
  OrchestratorContextPacket,
} from './types.js';

const CROWN_GATES = [
  { gate: 'paper-grounded', command: 'cargo test -p wasm4pm --test algorithm_paper_grounded', passCriteria: '60 passed, 0 failed' },
  { gate: 'receipt-fanout', command: 'pnpm --filter @wasm4pm/cli vitest run pi-receipt-fanout', passCriteria: '14 passed, 0 failed' },
  { gate: 'anticheat', command: 'cargo test -p wasm4pm-cognition --test universal_anticheat_generated', passCriteria: '13 passed, 0 failed' },
  { gate: 'cognition', command: 'cargo test -p wasm4pm-cognition', passCriteria: '483+ passed, 0 failed' },
  { gate: 'ggen', command: 'just ggen-gate-all', passCriteria: 'exits 0' },
  { gate: 'ts-build', command: 'pnpm --filter @wasm4pm/cli build', passCriteria: 'exits 0' },
  { gate: 'ocel-reports', command: 'ls ocel/reports/pi/ | wc -l', passCriteria: '60' },
];

const RECEIPT_SHAPE = ['algorithm', 'input_hash', 'output_hash', 'run_id', 'replay_pointer', 'timestamp'];

export class AgentContextBuilder {
  private readonly substrate: FileSubstrate;
  private cachedAnchor?: AnchorResult;
  private cachedSubstrate?: AdmittedSubstrate;

  constructor(repoRoot: string) {
    this.substrate = new FileSubstrate(repoRoot);
  }

  private async load(): Promise<{ substrate: AdmittedSubstrate; anchor: AnchorResult }> {
    if (!this.cachedSubstrate || !this.cachedAnchor) {
      this.cachedSubstrate = await this.substrate.load();
      this.cachedAnchor = await anchorSubstrate(this.cachedSubstrate);
    }
    return { substrate: this.cachedSubstrate, anchor: this.cachedAnchor };
  }

  private base(substrate: AdmittedSubstrate, anchor: AnchorResult): ContextPacketBase {
    return {
      snapshotHash: anchor.universe_hash,
      snapshotTimestamp: anchor.t_ns,
      admittedAlgorithms: substrate.admittedAlgorithms,
      recentResiduals: substrate.recentResiduals,
      receiptCount: substrate.receiptCount,
    };
  }

  async buildPlanningContext(): Promise<PlanningContextPacket> {
    const { substrate, anchor } = await this.load();
    return {
      ...this.base(substrate, anchor),
      priorityResiduals: substrate.recentResiduals.filter(r => r.status === 'open'),
      bottleneckAlgorithms: [], // v1: no substrate source — populated when PI bottleneck mining exists
      driftAlgorithms: [],      // v1: no substrate source — populated when drift detection feed exists
    };
  }

  async buildImplementationContext(): Promise<ImplementationContextPacket> {
    const { substrate, anchor } = await this.load();
    return {
      ...this.base(substrate, anchor),
      wasmExportMap: substrate.wasmExportMap,
      boundaryConditions: { fitnessThreshold: 0.8, admittedRequired: true },
      replayTemplates: substrate.replayTemplates,
    };
  }

  async buildVerificationContext(): Promise<VerificationContextPacket> {
    const { substrate, anchor } = await this.load();
    return {
      ...this.base(substrate, anchor),
      receiptTemplates: { shape: RECEIPT_SHAPE },
      crownGates: CROWN_GATES,
      antiCheatSignatures: substrate.antiCheatSignatures,
    };
  }

  async buildRepairContext(): Promise<RepairContextPacket> {
    const { substrate, anchor } = await this.load();
    return {
      ...this.base(substrate, anchor),
      activeFailures: [], // v1: no substrate source — populated when diagnostics feed exists
      priorRepairPatterns: substrate.priorRepairPatterns,
    };
  }

  async buildWaveOrchestratorContext(): Promise<OrchestratorContextPacket> {
    const { substrate, anchor } = await this.load();
    const discoveryAlgos = substrate.wasmExportMap
      .filter(e => e.rustExport.startsWith('discover_'))
      .map(e => e.algorithm);
    const conformanceAlgos = substrate.wasmExportMap
      .filter(e => e.rustExport.startsWith('compute_'))
      .map(e => e.algorithm);
    return {
      ...this.base(substrate, anchor),
      agentRouting: {
        planning: 'buildPlanningContext',
        implementation: 'buildImplementationContext',
        verification: 'buildVerificationContext',
        repair: 'buildRepairContext',
        orchestration: 'buildWaveOrchestratorContext',
      },
      waveSequencing: ['planning', 'implementation', 'verification', 'repair'],
      parallelizationSafe: discoveryAlgos,
      sequentialRequired: conformanceAlgos,
    };
  }

  /** Reset cached snapshot — call between runs if substrate may have changed */
  reset(): void {
    this.cachedAnchor = undefined;
    this.cachedSubstrate = undefined;
  }
}
