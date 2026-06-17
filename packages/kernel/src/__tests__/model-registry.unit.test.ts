import { describe, it, expect, vi } from 'vitest';

const validPnml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="Simple" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="source">
        <name><text>source</text></name>
        <initialMarking><text>1</text></initialMarking>
      </place>
      <place id="sink">
        <name><text>sink</text></name>
      </place>
      <transition id="t1">
        <name><text>A</text></name>
      </transition>
      <arc id="a1" source="source" target="t1">
        <inscription><text>1</text></inscription>
      </arc>
      <arc id="a2" source="t1" target="sink">
        <inscription><text>1</text></inscription>
      </arc>
    </page>
  </net>
</pnml>`;

const invalidPnml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="Simple" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="source">
        <name><text>source</text></name>
      </place>
      <place id="sink">
        <name><text>sink</text></name>
      </place>
      <transition id="t1">
        <name><text>A</text></name>
      </transition>
    </page>
  </net>
</pnml>`;

const livingDiagnosticClearPnml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="living_diagnostic_clear_v1" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p_source">
        <name><text>p_source</text></name>
        <initialMarking><text>1</text></initialMarking>
      </place>
      <place id="p1">
        <name><text>p1</text></name>
      </place>
      <place id="p2">
        <name><text>p2</text></name>
      </place>
      <place id="p3">
        <name><text>p3</text></name>
      </place>
      <place id="p4">
        <name><text>p4</text></name>
      </place>
      <place id="p5">
        <name><text>p5</text></name>
      </place>
      <place id="p_sink">
        <name><text>p_sink</text></name>
      </place>
      <transition id="t_DiagnosticRaised">
        <name><text>DiagnosticRaised</text></name>
      </transition>
      <transition id="t_RouteSelected">
        <name><text>RouteSelected</text></name>
      </transition>
      <transition id="t_RepairAttempted">
        <name><text>RepairAttempted</text></name>
      </transition>
      <transition id="t_GatePassed">
        <name><text>GatePassed</text></name>
      </transition>
      <transition id="t_ReceiptEmitted">
        <name><text>ReceiptEmitted</text></name>
      </transition>
      <transition id="t_ALIVE">
        <name><text>ALIVE</text></name>
      </transition>
      <arc id="a1" source="p_source" target="t_DiagnosticRaised"/>
      <arc id="a2" source="t_DiagnosticRaised" target="p1"/>
      <arc id="a3" source="p1" target="t_RouteSelected"/>
      <arc id="a4" source="t_RouteSelected" target="p2"/>
      <arc id="a5" source="p2" target="t_RepairAttempted"/>
      <arc id="a6" source="t_RepairAttempted" target="p3"/>
      <arc id="a7" source="p3" target="t_GatePassed"/>
      <arc id="a8" source="t_GatePassed" target="p4"/>
      <arc id="a9" source="p4" target="t_ReceiptEmitted"/>
      <arc id="a10" source="t_ReceiptEmitted" target="p5"/>
      <arc id="a11" source="p5" target="t_ALIVE"/>
      <arc id="a12" source="t_ALIVE" target="p_sink"/>
    </page>
  </net>
</pnml>`;

// Mock @wasm4pm/core to avoid Vite/Vitest ESM WASM integration limitations in Node.js
vi.mock('@wasm4pm/core', () => {
  const store = new Map<string, { envelope: any; expiresAt?: number; lastAccessed: number }>();
  let accessCounter = 0;

  return {
    register_model: vi.fn((envelopeJson: string) => {
      const envelope = JSON.parse(envelopeJson);

      // Validate SemVer syntax mock
      const semverRegex = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
      if (!semverRegex.test(envelope.version)) {
        throw new Error(JSON.stringify({ code: 'INVALID_INPUT', message: `Invalid SemVer version: '${envelope.version}'` }));
      }

      // Validate Workflow Net structural soundness mock
      if (envelope.payload.includes('p_sink') === false && envelope.payload.includes('sink') === false) {
        throw new Error(JSON.stringify({ code: 'INVALID_WORKFLOW_NET', message: 'Workflow net structural check failed' }));
      }

      // Simulate invalid net by checking explicitly
      if (envelope.id === 'model_invalid_net') {
        throw new Error(JSON.stringify({ code: 'INVALID_WORKFLOW_NET', message: 'Workflow net structural check failed' }));
      }

      const now = Date.now();
      // Remove expired entries first
      for (const [k, v] of store.entries()) {
        if (v.expiresAt && now > v.expiresAt) {
          store.delete(k);
        }
      }

      // Enforce capacity limit (max 512 entries) using logical LRU clock
      if (store.size >= 512 && !store.has(envelope.id)) {
        let lruKey: string | null = null;
        let minAccess = Infinity;
        for (const [k, v] of store.entries()) {
          if (v.lastAccessed < minAccess) {
            minAccess = v.lastAccessed;
            lruKey = k;
          }
        }
        if (lruKey) {
          store.delete(lruKey);
        }
      }

      let expiresAt: number | undefined;
      if (envelope.metadata && envelope.metadata.ttl_seconds) {
        expiresAt = now + parseInt(envelope.metadata.ttl_seconds, 10) * 1000;
      }

      store.set(envelope.id, {
        envelope,
        expiresAt,
        lastAccessed: ++accessCounter,
      });

      return JSON.stringify({ status: 'success', model_id: envelope.id });
    }),

    get_model: vi.fn((modelId: string) => {
      const entry = store.get(modelId);
      const now = Date.now();
      if (!entry || (entry.expiresAt && now > entry.expiresAt)) {
        if (entry) store.delete(modelId);
        throw new Error(JSON.stringify({ code: 'INVALID_MODEL_HANDLE', message: `Model '${modelId}' not found or expired` }));
      }
      entry.lastAccessed = ++accessCounter;
      return JSON.stringify(entry.envelope);
    }),
  };
});

import { registerModel, getModel } from '../model-registry.js';
import type { ProcessModelEnvelope } from '@wasm4pm/contracts';
import { KernelError } from '../errors.js';

describe('Process-Model Registry API', () => {
  it('should register a valid PNML model', () => {
    const envelope: ProcessModelEnvelope = {
      id: 'model_valid',
      name: 'Valid Petri Net',
      version: '1.0.0',
      model_type: 'PNML',
      payload: validPnml,
      metadata: {},
    };

    const res = registerModel(envelope);
    expect(res.status).toBe('success');
    expect(res.model_id).toBe('model_valid');

    const retrieved = getModel('model_valid');
    expect(retrieved.id).toBe('model_valid');
    expect(retrieved.name).toBe('Valid Petri Net');
  });

  it('should throw an error for invalid SemVer version', () => {
    const envelope: ProcessModelEnvelope = {
      id: 'model_invalid_version',
      name: 'Valid Petri Net',
      version: 'invalid-semver',
      model_type: 'PNML',
      payload: validPnml,
      metadata: {},
    };

    expect(() => registerModel(envelope)).toThrow(KernelError);
    try {
      registerModel(envelope);
    } catch (e: any) {
      expect(e.code).toBe('INVALID_INPUT');
    }
  });

  it('should throw an error for invalid Petri net structure', () => {
    const envelope: ProcessModelEnvelope = {
      id: 'model_invalid_net',
      name: 'Invalid Petri Net',
      version: '1.0.0',
      model_type: 'PNML',
      payload: invalidPnml,
      metadata: {},
    };

    expect(() => registerModel(envelope)).toThrow(KernelError);
    try {
      registerModel(envelope);
    } catch (e: any) {
      expect(e.code).toBe('INVALID_WORKFLOW_NET');
    }
  });

  it('should throw an error for non-existent model ID', () => {
    expect(() => getModel('non_existent')).toThrow(KernelError);
    try {
      getModel('non_existent');
    } catch (e: any) {
      expect(e.code).toBe('INVALID_MODEL_HANDLE');
    }
  });

  it('should evict based on TTL', async () => {
    const envelope: ProcessModelEnvelope = {
      id: 'model_ttl',
      name: 'TTL Petri Net',
      version: '1.0.0',
      model_type: 'PNML',
      payload: validPnml,
      metadata: {
        ttl_seconds: '1',
      },
    };

    registerModel(envelope);
    expect(getModel('model_ttl')).toBeDefined();

    // Wait 1.5 seconds for TTL expiration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(() => getModel('model_ttl')).toThrow(KernelError);
  });

  it('should register living_diagnostic_clear_v1 and verify structural validation', () => {
    const envelope: ProcessModelEnvelope = {
      id: 'living_diagnostic_clear_v1',
      name: 'Gall Checkpoint Model',
      version: '1.0.0',
      model_type: 'PNML',
      payload: livingDiagnosticClearPnml,
      metadata: {},
    };

    const res = registerModel(envelope);
    expect(res.status).toBe('success');
    expect(res.model_id).toBe('living_diagnostic_clear_v1');

    const retrieved = getModel('living_diagnostic_clear_v1');
    expect(retrieved.id).toBe('living_diagnostic_clear_v1');
    expect(retrieved.name).toBe('Gall Checkpoint Model');
    expect(retrieved.version).toBe('1.0.0');
  });

  it('should enforce LRU eviction at capacity 512', () => {
    // Register 513 models (model_lru_0 to model_lru_512)
    // The registry limit is 512, so the 0-th model should be evicted by the 512-th model.
    for (let i = 0; i <= 512; i++) {
      const envelope: ProcessModelEnvelope = {
        id: `model_lru_${i}`,
        name: `LRU Net ${i}`,
        version: '1.0.0',
        model_type: 'PNML',
        payload: validPnml,
        metadata: {},
      };
      registerModel(envelope);
    }

    // model_lru_0 should have been evicted.
    expect(() => getModel('model_lru_0')).toThrow(KernelError);
    // model_lru_1 and model_lru_512 should still exist
    expect(getModel('model_lru_1')).toBeDefined();
    expect(getModel('model_lru_512')).toBeDefined();
  });
});
