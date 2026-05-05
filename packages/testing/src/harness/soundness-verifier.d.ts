/**
 * Agent 4: Soundness Verifier
 *
 * Verifies van der Aalst soundness properties:
 * 1. Deadlock-free: No circular waits
 * 2. Liveness: All activities eventually complete
 * 3. Boundedness: Resource consumption is bounded
 */
import type { OcelEventLog } from './ocel-harvester';
export interface SoundnessResult {
  verdict: 'SOUND' | 'UNSOUND';
  deadlockFree: boolean;
  deadlockCycles: string[][];
  liveness: boolean;
  incompleteTasks: string[];
  bounded: boolean;
  maxQueueDepth: number;
  maxMemoryMb: number;
}
export declare class SoundnessVerifier {
  verify(ocel: OcelEventLog): Promise<SoundnessResult>;
  private checkDeadlockFree;
  private checkLiveness;
  private checkBoundedness;
}
//# sourceMappingURL=soundness-verifier.d.ts.map
