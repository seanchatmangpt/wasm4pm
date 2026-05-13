/**
 * model-ir-converter.test.ts
 *
 * Unit tests for ModelIR ↔ Process Model format conversions.
 */

import { describe, it, expect } from 'vitest';
import type { ModelIR } from '@wasm4pm/contracts';
import {
  inferStartActivities,
  inferEndActivities,
  modelIrToDfg,
  modelIrToPetriNet,
  modelIrToPowlModel,
  dfgToModelIr,
  petriNetToModelIr,
  powlModelToModelIr,
} from '../src/converters/model-ir-converter.js';

describe('model-ir-converter', () => {
  const simpleDfgModel: ModelIR = {
    format_version: "1.0",
    model_type: "dfg",
    algorithm_id: "dfg",
    capabilities: {
      online_safe: true, offline_only: false, replay_ready: true, alignment_ready: false,
      streaming_compatible: true, exportable_to_pnml: false, exportable_to_bpmn: false,
    },
    nodes: [
      { id: "a", label: "Register", type: "transition" },
      { id: "b", label: "Review", type: "transition" },
      { id: "c", label: "Approve", type: "transition" },
    ],
    edges: [
      { from: "a", to: "b", weight: 100 },
      { from: "b", to: "c", weight: 95 },
    ],
    quality: { fitness: 0.92, precision: 0.89, generalization: 0.85, simplicity: 0.90 },
  };

  const petriNetModel: ModelIR = {
    format_version: "1.0",
    model_type: "petri_net",
    algorithm_id: "alpha_plus_plus",
    capabilities: {
      online_safe: true, offline_only: false, replay_ready: true, alignment_ready: true,
      streaming_compatible: false, exportable_to_pnml: true, exportable_to_bpmn: false,
    },
    nodes: [
      { id: "p1", label: "Start", type: "place" },
      { id: "t1", label: "Register", type: "transition" },
      { id: "p2", label: "Pending", type: "place" },
      { id: "t2", label: "Approve", type: "transition" },
      { id: "p3", label: "Completed", type: "place" },
    ],
    edges: [
      { from: "p1", to: "t1" }, { from: "t1", to: "p2" },
      { from: "p2", to: "t2" }, { from: "t2", to: "p3" },
    ],
  };

  const powlModel: ModelIR = {
    format_version: "1.0",
    model_type: "powl",
    algorithm_id: "powl_discovery",
    capabilities: {
      online_safe: true, offline_only: false, replay_ready: false, alignment_ready: false,
      streaming_compatible: false, exportable_to_pnml: false, exportable_to_bpmn: false,
    },
    nodes: [
      { id: "a1", label: "Register", type: "activity" },
      { id: "op1", label: "Sequential (→)", type: "operator" },
      { id: "a2", label: "Review", type: "activity" },
      { id: "op2", label: "Choice (×)", type: "operator" },
      { id: "a3", label: "Approve", type: "activity" },
      { id: "a4", label: "Reject", type: "activity" },
    ],
    edges: [
      { from: "a1", to: "op1" }, { from: "op1", to: "a2" },
      { from: "a2", to: "op2" }, { from: "op2", to: "a3" }, { from: "op2", to: "a4" },
    ],
  };

  describe('inferStartActivities', () => {
    it('identifies start activities: no incoming, multiple components, and all-incoming cyclic', () => {
      expect(inferStartActivities(simpleDfgModel.nodes, simpleDfgModel.edges)).toEqual(["a"]);

      const multiStartEdges = [
        { from: "a", to: "b", weight: 100 }, { from: "c", to: "d", weight: 50 },
      ];
      const multiStartNodes = [
        { id: "a", label: "A", type: "transition" }, { id: "b", label: "B", type: "transition" },
        { id: "c", label: "C", type: "transition" }, { id: "d", label: "D", type: "transition" },
      ];
      const starts = inferStartActivities(multiStartNodes, multiStartEdges);
      expect(starts).toContain("a");
      expect(starts).toContain("c");
      expect(starts.length).toBe(2);

      const cyclicStarts = inferStartActivities(
        [{ id: "a", label: "A", type: "transition" }, { id: "b", label: "B", type: "transition" }],
        [{ from: "a", to: "b" }, { from: "b", to: "a" }]
      );
      expect(cyclicStarts).toHaveLength(0);
    });
  });

  describe('inferEndActivities', () => {
    it('identifies end activities: no outgoing, and multiple components', () => {
      expect(inferEndActivities(simpleDfgModel.nodes, simpleDfgModel.edges)).toEqual(["c"]);

      const multiEndNodes = [
        { id: "a", label: "A", type: "transition" }, { id: "b", label: "B", type: "transition" },
        { id: "c", label: "C", type: "transition" }, { id: "d", label: "D", type: "transition" },
      ];
      const ends = inferEndActivities(multiEndNodes, [{ from: "a", to: "b" }, { from: "c", to: "d" }]);
      expect(ends).toContain("b");
      expect(ends).toContain("d");
      expect(ends.length).toBe(2);
    });
  });

  describe('DFG conversion', () => {
    it('round-trips DFG without loss: preserves nodes, edges, start/end activities, quality, and weights', () => {
      const dfg = modelIrToDfg(simpleDfgModel);

      expect(dfg.format).toBe("dfg");
      expect(dfg.model_type).toBe("dfg");
      expect(dfg.algorithm_id).toBe("dfg");
      expect(dfg.nodes).toHaveLength(3);
      expect(dfg.edges).toHaveLength(2);
      expect(dfg.nodes[0].id).toBe("a");
      expect(dfg.edges[0].from).toBe("a");
      expect(dfg.edges[0].to).toBe("b");
      expect(dfg.edges[0].weight).toBe(100);
      expect(dfg.start_activities).toEqual(["a"]);
      expect(dfg.end_activities).toEqual(["c"]);
      expect(dfg.quality?.fitness).toBe(0.92);
      expect(dfg.quality?.precision).toBe(0.89);

      const reconstructed = dfgToModelIr(dfg);
      expect(reconstructed.format_version).toBe("1.0");
      expect(reconstructed.model_type).toBe("dfg");
      expect(reconstructed.nodes).toHaveLength(3);
      expect(reconstructed.edges).toHaveLength(2);
      expect(reconstructed.nodes[0].type).toBe("transition");
      expect(reconstructed.edges[0].weight).toBe(100);
      expect(reconstructed.edges[1].weight).toBe(95);
    });

    it('handles branching and merging topologies', () => {
      const branchModel: ModelIR = {
        format_version: "1.0", model_type: "dfg", algorithm_id: "dfg",
        capabilities: {
          online_safe: true, offline_only: false, replay_ready: true, alignment_ready: false,
          streaming_compatible: true, exportable_to_pnml: false, exportable_to_bpmn: false,
        },
        nodes: [
          { id: "a", label: "Register", type: "transition" },
          { id: "b", label: "Approve", type: "transition" },
          { id: "c", label: "Reject", type: "transition" },
        ],
        edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }],
      };
      const branchDfg = modelIrToDfg(branchModel);
      expect(branchDfg.start_activities).toEqual(["a"]);
      expect(branchDfg.end_activities).toContain("b");
      expect(branchDfg.end_activities).toContain("c");
      expect(branchDfg.end_activities).toHaveLength(2);

      const mergeModel: ModelIR = {
        format_version: "1.0", model_type: "dfg", algorithm_id: "dfg",
        capabilities: {
          online_safe: true, offline_only: false, replay_ready: true, alignment_ready: false,
          streaming_compatible: true, exportable_to_pnml: false, exportable_to_bpmn: false,
        },
        nodes: [
          { id: "a", label: "Approve", type: "transition" },
          { id: "b", label: "Reject", type: "transition" },
          { id: "c", label: "Notify", type: "transition" },
        ],
        edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }],
      };
      const mergeDfg = modelIrToDfg(mergeModel);
      expect(mergeDfg.start_activities).toContain("a");
      expect(mergeDfg.start_activities).toContain("b");
      expect(mergeDfg.end_activities).toEqual(["c"]);
    });
  });

  describe('Petri Net conversion', () => {
    it('round-trips Petri Net: separates places/transitions, infers markings, preserves arcs and labels', () => {
      const net = modelIrToPetriNet(petriNetModel);

      expect(net.format).toBe("petri_net");
      expect(net.model_type).toBe("petri_net");
      expect(net.places).toHaveLength(3);
      expect(net.transitions).toHaveLength(2);
      expect(net.places[0].id).toBe("p1");
      expect(net.transitions[0].id).toBe("t1");

      expect(net.initial_marking).toHaveProperty("p1", 1);
      expect(net.initial_marking).not.toHaveProperty("p2");
      expect(net.initial_marking).not.toHaveProperty("p3");

      expect(net.final_markings[0]).toHaveProperty("p3", 1);
      expect(net.final_markings[0]).not.toHaveProperty("p1");
      expect(net.final_markings[0]).not.toHaveProperty("p2");

      expect(net.arcs).toHaveLength(4);
      expect(net.arcs[0].source).toBe("p1");
      expect(net.arcs[0].target).toBe("t1");

      const reconstructed = petriNetToModelIr(net);
      expect(reconstructed.format_version).toBe("1.0");
      expect(reconstructed.model_type).toBe("petri_net");
      expect(reconstructed.nodes).toHaveLength(5);
      expect(reconstructed.edges).toHaveLength(4);
      expect(reconstructed.nodes.filter(n => n.type === "place")).toHaveLength(3);
      expect(reconstructed.nodes.filter(n => n.type === "transition")).toHaveLength(2);
      expect(reconstructed.nodes.find(n => n.id === "p1")?.label).toBe("Start");
      expect(reconstructed.nodes.find(n => n.id === "t1")?.label).toBe("Register");
    });
  });

  describe('POWL model conversion', () => {
    it('round-trips POWL: arena indices, index_map, edges, labels, and throws on missing nodes', () => {
      const powl = modelIrToPowlModel(powlModel);

      expect(powl.format).toBe("powl");
      expect(powl.model_type).toBe("powl");
      expect(powl.arena).toHaveLength(6);
      expect(powl.arena[0].id).toBe(0);
      expect(powl.arena[5].id).toBe(5);

      expect(powl.index_map["a1"]).toBe(0);
      expect(powl.index_map["op1"]).toBe(1);
      expect(powl.index_map["a2"]).toBe(2);
      expect(powl.index_map["op2"]).toBe(3);

      expect(powl.edges).toHaveLength(5);
      expect(powl.edges[0].from).toBe(0);
      expect(powl.edges[0].to).toBe(1);
      expect(powl.edges[2].from).toBe(2);
      expect(powl.edges[2].to).toBe(3);

      expect(powl.arena[0].label).toBe("Register");
      expect(powl.arena[1].label).toBe("Sequential (→)");
      expect(powl.arena[3].label).toBe("Choice (×)");

      const brokenModel: ModelIR = {
        format_version: "1.0", model_type: "powl", algorithm_id: "test",
        capabilities: {
          online_safe: true, offline_only: false, replay_ready: false, alignment_ready: false,
          streaming_compatible: false, exportable_to_pnml: false, exportable_to_bpmn: false,
        },
        nodes: [{ id: "a", label: "A", type: "activity" }],
        edges: [{ from: "a", to: "missing" }],
      };
      expect(() => modelIrToPowlModel(brokenModel)).toThrow(/Node not found in arena/);

      const reconstructed = powlModelToModelIr(powl);
      expect(reconstructed.format_version).toBe("1.0");
      expect(reconstructed.model_type).toBe("powl");
      expect(reconstructed.nodes).toHaveLength(6);
      expect(reconstructed.edges).toHaveLength(5);
      expect(reconstructed.nodes.find(n => n.id === "a1")?.label).toBe("Register");
      expect(reconstructed.nodes.find(n => n.id === "a1")?.type).toBe("activity");
      expect(reconstructed.nodes.find(n => n.id === "op1")?.type).toBe("operator");

      const originalEdges = powlModel.edges.map(e => `${e.from}->${e.to}`);
      const reconstructedEdges = reconstructed.edges.map(e => `${e.from}->${e.to}`);
      expect(reconstructedEdges.length).toBe(originalEdges.length);
      for (const edge of originalEdges) {
        expect(reconstructedEdges).toContain(edge);
      }
    });
  });

  describe('bidirectional mapping validation (POWL)', () => {
    it('index_map maps all IDs correctly, arena indices are sequential, reverse mapping recovers IDs', () => {
      const powl = modelIrToPowlModel(powlModel);

      for (const [stringId, index] of Object.entries(powl.index_map)) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(powl.arena.length);
        expect(powl.arena[index]).toBeDefined();
      }

      for (let i = 0; i < powl.arena.length; i++) {
        expect(powl.arena[i].id).toBe(i);
      }

      const reverseMap: Record<number, string> = {};
      for (const [id, idx] of Object.entries(powl.index_map)) {
        reverseMap[parseInt(idx.toString())] = id;
      }
      for (let i = 0; i < powl.arena.length; i++) {
        expect(reverseMap[i]).toBeDefined();
      }
    });
  });

  describe('quality metrics preservation', () => {
    it('preserves quality metrics through all format conversions', () => {
      expect(modelIrToDfg(simpleDfgModel).quality).toEqual(simpleDfgModel.quality);
      expect(modelIrToPetriNet(petriNetModel).quality).toBeUndefined();

      const powlWithQuality: ModelIR = {
        ...powlModel,
        quality: { fitness: 0.88, precision: 0.91 },
      };
      expect(modelIrToPowlModel(powlWithQuality).quality).toEqual(powlWithQuality.quality);
    });
  });
});
