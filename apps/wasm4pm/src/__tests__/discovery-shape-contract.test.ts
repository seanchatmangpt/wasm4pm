import { describe, expect, it } from 'vitest';
import { discriminate, DiscoveryShapeError } from '../discriminator.js';

/**
 * Regression: Kernel.runRaw('dfg') must produce shapes the CLI discriminator accepts.
 * Pre-fix output was `{ handle }` only → DISCOVERY_SHAPE_MISMATCH.
 */
describe('dfg discovery shape contract', () => {
  it('accepts DFG with nodes/edges arrays plus handle (post-fix kernel output)', () => {
    const raw = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ from: 'A', to: 'B', count: 1 }],
      handle: 'dfg_handle_1',
    };
    const shape = discriminate(raw, 'dfg');
    expect(shape.kind).toBe('dfg');
    if (shape.kind === 'dfg') {
      expect(shape.nodes).toBe(2);
      expect(shape.edges).toBe(1);
    }
  });

  it('accepts handle-based DFG summary with numeric nodes/edges counts', () => {
    const raw = { handle: 'dfg_handle_2', nodes: 3, edges: 2 };
    const shape = discriminate(raw, 'dfg');
    expect(shape.kind).toBe('dfg');
  });

  it('accepts handle-only payload as streaming DFG (simd_streaming_dfg shape)', () => {
    // simd_streaming_dfg returns { handle } only — the full graph lives in WASM memory.
    // The discriminator classifies this as a DFG with unknown (0) node/edge counts.
    const shape = discriminate({ handle: 'dfg_handle_only' }, 'simd_streaming_dfg');
    expect(shape.kind).toBe('dfg');
    if (shape.kind === 'dfg') {
      expect(shape.nodes).toBe(0);
      expect(shape.edges).toBe(0);
    }
  });

  it('accepts inductive tree at top level with handle', () => {
    const raw = {
      root: { type: 'sequence', children: [] },
      nodes: 4,
      handle: 'virtual_inductive_miner_abc',
    };
    const shape = discriminate(raw, 'inductive_miner');
    expect(shape.kind).toBe('tree');
  });
});
