import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ResidualEntry, WasmExportEntry, ReplayTemplate } from './types.js';

export interface AdmittedSubstrate {
  admittedAlgorithms: string[];
  wasmExportMap: WasmExportEntry[];
  recentResiduals: ResidualEntry[];
  receiptCount: number;
  replayTemplates: ReplayTemplate[];
  priorRepairPatterns: string[];
  antiCheatSignatures: string[];
}

export interface SubstrateSource {
  load(): Promise<AdmittedSubstrate>;
}

export class FileSubstrate implements SubstrateSource {
  constructor(private readonly repoRoot: string) {}

  async load(): Promise<AdmittedSubstrate> {
    const piDir = path.join(this.repoRoot, 'ocel', 'reports', 'pi');
    const registryPath = path.join(this.repoRoot, 'wasm4pm', 'algorithms', 'registry.json');

    // Fail-loud: Law 8 requires admitted substrate
    let piFiles: string[];
    try {
      piFiles = await fs.readdir(piDir);
    } catch {
      throw new Error('No admitted substrate exists — Law 8 not satisfied');
    }
    const jsonFiles = piFiles.filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
      throw new Error('No admitted substrate exists — Law 8 not satisfied');
    }

    // Load admitted algorithms from ocel/reports/pi/
    const admittedAlgorithms: string[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(piDir, file), 'utf8');
        const report = JSON.parse(raw) as { algorithm?: string; admitted?: boolean; fitness?: number };
        if (report.admitted === true && report.algorithm) {
          admittedAlgorithms.push(report.algorithm);
        }
      } catch { /* skip malformed */ }
    }
    admittedAlgorithms.sort();

    // Load wasmExportMap from ggen-rendered registry.json
    let wasmExportMap: WasmExportEntry[] = [];
    try {
      const regRaw = await fs.readFile(registryPath, 'utf8');
      const registry = JSON.parse(regRaw) as Array<{
        algorithm_id?: string;
        wasm_export?: string;
        status?: string;
      }>;
      if (Array.isArray(registry)) {
        wasmExportMap = registry
          .filter(e => e.algorithm_id && e.wasm_export)
          .map(e => ({
            algorithm: e.algorithm_id!,
            ttlDeclaration: `pi:Algo_${e.algorithm_id}`,
            rustExport: e.wasm_export!,
            verified: e.status === 'CERTIFIED',
          }));
      }
    } catch { /* registry absent — wasmExportMap empty */ }

    // Load receipt corpus count + replay pointers
    const receiptsDir = path.join(this.repoRoot, '.wasm4pm', 'receipts');
    let receiptCount = 0;
    const replayTemplates: ReplayTemplate[] = [];
    try {
      const receiptFiles = await fs.readdir(receiptsDir);
      const piReceipts = receiptFiles.filter(f => f.startsWith('pi-') && f.endsWith('-latest.json'));
      receiptCount = piReceipts.length;
      for (const file of piReceipts) {
        try {
          const raw = await fs.readFile(path.join(receiptsDir, file), 'utf8');
          const r = JSON.parse(raw) as { algorithm?: string; replay_pointer?: string };
          if (r.algorithm && r.replay_pointer) {
            replayTemplates.push({ algorithm: r.algorithm, replay_pointer: r.replay_pointer });
          }
        } catch { /* skip */ }
      }
    } catch { /* no receipts dir yet */ }

    // Load residuals from crown report
    const recentResiduals = await this.loadResiduals();
    const priorRepairPatterns = await this.loadRepairPatterns();
    const antiCheatSignatures = await this.loadAntiCheatSignatures();

    return {
      admittedAlgorithms,
      wasmExportMap,
      recentResiduals,
      receiptCount,
      replayTemplates,
      priorRepairPatterns,
      antiCheatSignatures,
    };
  }

  private async loadResiduals(): Promise<ResidualEntry[]> {
    const crownReport = path.join(this.repoRoot, 'docs', 'reports', 'pi-crown-complete.md');
    try {
      const text = await fs.readFile(crownReport, 'utf8');
      const residuals: ResidualEntry[] = [];
      for (const line of text.split('\n')) {
        const m = line.match(/^[-*]\s+\*\*(.*?)\*\*.*?[:—]\s*(.*)/);
        if (m) {
          const isOpen = line.includes('⚠️') || line.toLowerCase().includes('open');
          residuals.push({ gate: m[1].trim(), description: m[2].trim(), status: isOpen ? 'open' : 'closed' });
        }
      }
      return residuals;
    } catch { return []; }
  }

  private async loadRepairPatterns(): Promise<string[]> {
    const crownReport = path.join(this.repoRoot, 'docs', 'reports', 'pi-crown-complete.md');
    try {
      const text = await fs.readFile(crownReport, 'utf8');
      const patterns: string[] = [];
      let inErrors = false;
      for (const line of text.split('\n')) {
        if (line.includes('Errors') || line.includes('Fixes') || line.includes('Repair')) inErrors = true;
        if (inErrors && line.startsWith('- ')) patterns.push(line.slice(2).trim());
        if (inErrors && line.startsWith('#') && !line.includes('Error') && !line.includes('Fix')) inErrors = false;
      }
      return patterns;
    } catch { return []; }
  }

  private async loadAntiCheatSignatures(): Promise<string[]> {
    const antiCheatDir = path.join(this.repoRoot, 'crates', 'wasm4pm-cognition', 'tests');
    try {
      const files = await fs.readdir(antiCheatDir);
      return files
        .filter(f => f.includes('anticheat') || f.includes('anti_cheat'))
        .map(f => f.replace(/\.rs$/, ''));
    } catch { return []; }
  }
}
