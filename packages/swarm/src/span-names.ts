/**
 * span-names — Typed constants for all swarm×mcpp correlation span names.
 *
 * mcpp LIVE-09 rule correlates on these exact values — any rename
 * must be coordinated across both repos.
 *
 * These constants replace the plain string literals that were previously
 * inlined in gap-events.ts (GAP-3 remediation).
 */

export const SWARM_SPAN_NAMES = {
  GAP_DETECTED: 'powl.gap.detected',
  GAP_CLOSED: 'powl.gap.closed',
  GAP_EXHAUSTED: 'powl.gap.exhausted',
  GAP_ALTERNATE_EVIDENCE: 'powl.gap.alternate_evidence_received',
} as const;

export type SwarmSpanName = typeof SWARM_SPAN_NAMES[keyof typeof SWARM_SPAN_NAMES];

// TypeScript compile-time guard: assigning an arbitrary string to SwarmSpanName
// is a type error. Example (would not compile):
//
//   const bad: SwarmSpanName = 'powl.gap.unknown'; // Error: not assignable
//
// This means a rename in gap-events.ts that forgets to update SWARM_SPAN_NAMES
// produces a compiler error rather than a silent protocol divergence.
