/**
 * Enhanced Protection Layer with Per-Algorithm Circuit Breakers and Graceful Degradation
 */

import { z } from 'zod';

/**
 * Degradation levels from best to worst performance
 */
export enum DegradationLevel {
  NONE = 0,         // No degradation, full feature set
  QUALITY = 1,      // Reduce model quality (faster algorithms, less computation)
  PERFORMANCE = 2,  // Prioritize speed over accuracy
  AVAILABILITY = 3, // Only most critical operations
}

/**
 * Per-algorithm circuit breaker state
 */
export const AlgorithmCircuitBreakerSchema = z.object({
  algorithmName: z.string(),
  state: z.enum(['Closed', 'HalfOpen', 'Open']),
  successCount: z.number(),
  failureCount: z.number(),
  failureThreshold: z.number(),
  successThresholdForRecovery: z.number(),
  lastTransitionTime: z.number(),
});

export type AlgorithmCircuitBreaker = z.infer<typeof AlgorithmCircuitBreakerSchema>;

/**
 * Protection result indicating when to activate graceful degradation
 */
export interface ProtectionDecision {
  activeAlgorithms: Set<string>;  // Algorithms allowed to run
  degradationLevel: DegradationLevel;
  triggeredCircuitBreakers: AlgorithmCircuitBreaker[];
  triggers: {
    spcAlerts: boolean;
    circuitBreakerOpen: boolean;
    resourceConstraint: boolean;
    latencyViolation: boolean;
  };
  rationale: string;
}

/**
 * Manage per-algorithm circuit breakers
 */
export class ProtectionManager {
  private breakers: Map<string, AlgorithmCircuitBreaker> = new Map();
  private degradationLevel: DegradationLevel = DegradationLevel.NONE;

  /**
   * Register an algorithm for circuit breaking
   */
  registerAlgorithm(
    algorithmName: string,
    failureThreshold: number = 3,
    successThresholdForRecovery: number = 2,
  ): void {
    if (!this.breakers.has(algorithmName)) {
      this.breakers.set(algorithmName, {
        algorithmName,
        state: 'Closed',
        successCount: 0,
        failureCount: 0,
        failureThreshold,
        successThresholdForRecovery,
        lastTransitionTime: Date.now(),
      });
    }
  }

  /**
   * Record algorithm execution result
   * @returns true if algorithm should be allowed to run
   */
  recordAlgorithmResult(algorithmName: string, success: boolean): boolean {
    this.registerAlgorithm(algorithmName);
    const breaker = this.breakers.get(algorithmName)!;

    if (success) {
      breaker.successCount++;
      breaker.failureCount = 0;

      // HalfOpen → Closed transition
      if (
        breaker.state === 'HalfOpen' &&
        breaker.successCount > breaker.successThresholdForRecovery
      ) {
        breaker.state = 'Closed';
        breaker.successCount = 0;
        breaker.lastTransitionTime = Date.now();
      }
    } else {
      breaker.failureCount++;
      breaker.successCount = 0;

      // Closed → Open transition
      if (
        breaker.state === 'Closed' &&
        breaker.failureCount > breaker.failureThreshold
      ) {
        breaker.state = 'Open';
        breaker.lastTransitionTime = Date.now();
      }
    }

    return breaker.state !== 'Open';
  }

  /**
   * Try to advance a circuit breaker from Open → HalfOpen
   * @param algorithmName
   * @param timeoutMs How long before Open → HalfOpen transition allowed
   */
  tryAdvanceBreaker(algorithmName: string, timeoutMs: number = 10_000): void {
    const breaker = this.breakers.get(algorithmName);
    if (breaker && breaker.state === 'Open') {
      const elapsedMs = Date.now() - breaker.lastTransitionTime;
      if (elapsedMs > timeoutMs) {
        breaker.state = 'HalfOpen';
        breaker.successCount = 0;
        breaker.lastTransitionTime = Date.now();
      }
    }
  }

  /**
   * Determine active algorithms based on circuit breaker states
   */
  getActiveAlgorithms(): Set<string> {
    const active = new Set<string>();
    for (const [name, breaker] of this.breakers) {
      if (breaker.state !== 'Open') {
        active.add(name);
      }
    }
    return active;
  }

  /**
   * Get circuits that are currently open
   */
  getOpenCircuitBreakers(): AlgorithmCircuitBreaker[] {
    return Array.from(this.breakers.values()).filter((b) => b.state === 'Open');
  }

  /**
   * Apply graceful degradation based on failures
   * @param spcAlerts Number of SPC alerts
   * @param failedAlgorithmCount Number of algorithms with open circuits
   * @returns Protection decision with degradation level
   */
  makeProtectionDecision(spcAlerts: number, _failedAlgorithmCount: number): ProtectionDecision {
    const openBreakers = this.getOpenCircuitBreakers();
    let newDegradationLevel = DegradationLevel.NONE;

    const triggers = {
      spcAlerts: spcAlerts > 0,
      circuitBreakerOpen: openBreakers.length > 0,
      resourceConstraint: false,
      latencyViolation: false,
    };

    // Escalate degradation based on failure count
    if (openBreakers.length >= 1) {
      newDegradationLevel = Math.max(newDegradationLevel, DegradationLevel.QUALITY);
    }
    if (openBreakers.length >= 3) {
      newDegradationLevel = Math.max(newDegradationLevel, DegradationLevel.PERFORMANCE);
    }
    if (openBreakers.length >= 5) {
      newDegradationLevel = Math.max(newDegradationLevel, DegradationLevel.AVAILABILITY);
    }

    // SPC alerts also escalate degradation
    if (spcAlerts >= 2) {
      newDegradationLevel = Math.max(newDegradationLevel, DegradationLevel.QUALITY);
    }
    if (spcAlerts >= 4) {
      newDegradationLevel = Math.max(newDegradationLevel, DegradationLevel.PERFORMANCE);
    }

    this.degradationLevel = newDegradationLevel;

    const rationale =
      `open_circuits=${openBreakers.length}, ` +
      `spc_alerts=${spcAlerts}, ` +
      `degradation_level=${DegradationLevel[newDegradationLevel]}`;

    return {
      activeAlgorithms: this.getActiveAlgorithms(),
      degradationLevel: newDegradationLevel,
      triggeredCircuitBreakers: openBreakers,
      triggers,
      rationale,
    };
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return this.degradationLevel;
  }

  /**
   * Select an algorithm for execution given current degradation level
   * When degrading: prefer simpler algorithms (lower quality but faster)
   */
  selectAlgorithm(
    availableAlgorithms: string[],
    algorithmQualities: Map<string, number>, // 0-1 quality score
  ): string | null {
    const active = this.getActiveAlgorithms();
    // If no algorithms registered, all are considered active
    const candidates =
      active.size === 0
        ? availableAlgorithms
        : availableAlgorithms.filter((a) => active.has(a));

    if (candidates.length === 0) return null;

    if (this.degradationLevel === DegradationLevel.NONE) {
      // Prefer highest quality
      return candidates.reduce((best, algo) => {
        const bestQuality = algorithmQualities.get(best) ?? 0.5;
        const algoQuality = algorithmQualities.get(algo) ?? 0.5;
        return algoQuality > bestQuality ? algo : best;
      });
    }

    if (this.degradationLevel === DegradationLevel.QUALITY) {
      // Prefer moderate speed/quality trade-off
      return candidates[Math.floor(candidates.length / 2)];
    }

    // PERFORMANCE or AVAILABILITY: prefer fastest (lowest quality)
    return candidates.reduce((best, algo) => {
      const bestQuality = algorithmQualities.get(best) ?? 0.5;
      const algoQuality = algorithmQualities.get(algo) ?? 0.5;
      return algoQuality < bestQuality ? algo : best;
    });
  }
}
