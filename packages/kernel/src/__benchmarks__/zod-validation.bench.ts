/**
 * zod-validation.bench.ts
 *
 * Measures the per-call overhead of Zod validation at WASM boundaries.
 * Run:  npx vitest bench --config vitest.config.ts
 *
 * Results should show <1ms overhead per 1000 calls for typical payloads.
 * If overhead is unacceptable set WASM4PM_SKIP_ZOD=1 in production.
 */

import { bench, describe } from 'vitest';
import { z } from 'zod';

// ── Realistic WASM output payloads ──────────────────────────────────────────

const DFG_PAYLOAD = {
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    { from: 'A', to: 'B', weight: 10 },
    { from: 'B', to: 'C', weight: 8 },
    { from: 'C', to: 'D', weight: 6 },
    { from: 'D', to: 'E', weight: 5 },
  ],
  start_activities: { A: 10 },
  end_activities: { E: 10 },
};

const PETRI_NET_PAYLOAD = {
  places: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `place_${i}` })),
  transitions: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, name: `trans_${i}`, label: `label_${i}` })),
  arcs: Array.from({ length: 35 }, (_, i) => ({ from: `p${i % 20}`, to: `t${i % 15}`, weight: 1 })),
  initial_marking: { p0: 1 },
  final_markings: [{ p19: 1 }],
};

const INDUCTIVE_MINER_PAYLOAD = {
  algorithm: 'inductive_miner' as const,
  root: {
    node_type: 'sequence' as const,
    children: [
      { node_type: 'leaf' as const, label: 'A', children: [] },
      {
        node_type: 'xor' as const,
        children: [
          { node_type: 'leaf' as const, label: 'B', children: [] },
          { node_type: 'leaf' as const, label: 'C', children: [] },
        ],
      },
      { node_type: 'leaf' as const, label: 'D', children: [] },
    ],
  },
  nodes: 5,
};

// ── Schemas (mirrors zod-validators.ts) ─────────────────────────────────────

const ArcSchema = z.object({ from: z.string(), to: z.string(), weight: z.number().optional() });
const PlaceSchema = z.object({ id: z.string(), name: z.string().optional() });
const TransitionSchema = z.object({ id: z.string(), name: z.string().optional(), label: z.string().optional() });

const DFGSchema = z.object({
  nodes: z.array(z.string()),
  edges: z.array(ArcSchema),
  start_activities: z.record(z.string(), z.number()),
  end_activities: z.record(z.string(), z.number()),
});

const PetriNetSchema = z.object({
  places: z.array(PlaceSchema),
  transitions: z.array(TransitionSchema),
  arcs: z.array(ArcSchema),
  initial_marking: z.record(z.string(), z.number()),
  final_markings: z.array(z.record(z.string(), z.number())),
});

const InductiveMinerNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    node_type: z.enum(['sequence', 'xor', 'parallel', 'loop', 'leaf']),
    label: z.string().optional(),
    children: z.array(InductiveMinerNodeSchema),
  }),
);

const InductiveMinerResultSchema = z.object({
  algorithm: z.literal('inductive_miner'),
  root: InductiveMinerNodeSchema,
  nodes: z.number().int().min(0),
});

// ── Benchmarks ───────────────────────────────────────────────────────────────

describe('Zod boundary validation overhead', () => {
  describe('DFG (flat payload)', () => {
    bench('with Zod validation', () => {
      DFGSchema.parse(DFG_PAYLOAD);
    });

    bench('safeParse (no throw)', () => {
      DFGSchema.safeParse(DFG_PAYLOAD);
    });

    bench('baseline: JSON.stringify roundtrip (no validation)', () => {
      JSON.parse(JSON.stringify(DFG_PAYLOAD));
    });

    bench('baseline: identity (zero work)', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      DFG_PAYLOAD as unknown;
    });
  });

  describe('Petri net (medium payload, 20 places)', () => {
    bench('with Zod validation', () => {
      PetriNetSchema.parse(PETRI_NET_PAYLOAD);
    });

    bench('baseline: identity', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      PETRI_NET_PAYLOAD as unknown;
    });
  });

  describe('Inductive miner (recursive tree, z.lazy)', () => {
    bench('with Zod validation', () => {
      InductiveMinerResultSchema.parse(INDUCTIVE_MINER_PAYLOAD);
    });

    bench('baseline: identity', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      INDUCTIVE_MINER_PAYLOAD as unknown;
    });
  });

  describe('safeParse failure path', () => {
    const BAD_PAYLOAD = { nodes: 'not-an-array', edges: null };

    bench('safeParse (validation fails)', () => {
      DFGSchema.safeParse(BAD_PAYLOAD);
    });
  });
});
