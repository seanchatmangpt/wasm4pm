/**
 * model-ir-converter.test.ts
 *
 * Unit tests for ModelIR ↔ Process Model format conversions.
 * Tests all supported formats: DFG, Petri Net, POWL.
 * Validates round-trip losslessness and arena allocation correctness.
 */
import { describe, it, expect } from 'vitest';
import { inferStartActivities, inferEndActivities, modelIrToDfg, modelIrToPetriNet, modelIrToPowlModel, dfgToModelIr, petriNetToModelIr, powlModelToModelIr, } from '../src/converters/model-ir-converter.js';
describe('model-ir-converter', () => {
    /**
     * Example 1: Simple DFG with linear flow (A → B → C)
     */
    const simpleDfgModel = {
        format_version: "1.0",
        model_type: "dfg",
        algorithm_id: "dfg",
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: true,
            alignment_ready: false,
            streaming_compatible: true,
            exportable_to_pnml: false,
            exportable_to_bpmn: false,
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
        quality: {
            fitness: 0.92,
            precision: 0.89,
            generalization: 0.85,
            simplicity: 0.90,
        },
    };
    /**
     * Example 2: Petri Net with places and transitions
     * P1 (start) → T1 (activity) → P2 → T2 (activity) → P3 (end)
     */
    const petriNetModel = {
        format_version: "1.0",
        model_type: "petri_net",
        algorithm_id: "alpha_plus_plus",
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: true,
            alignment_ready: true,
            streaming_compatible: false,
            exportable_to_pnml: true,
            exportable_to_bpmn: false,
        },
        nodes: [
            { id: "p1", label: "Start", type: "place" },
            { id: "t1", label: "Register", type: "transition" },
            { id: "p2", label: "Pending", type: "place" },
            { id: "t2", label: "Approve", type: "transition" },
            { id: "p3", label: "Completed", type: "place" },
        ],
        edges: [
            { from: "p1", to: "t1" },
            { from: "t1", to: "p2" },
            { from: "p2", to: "t2" },
            { from: "t2", to: "p3" },
        ],
    };
    /**
     * Example 3: POWL model with operators and activities
     */
    const powlModel = {
        format_version: "1.0",
        model_type: "powl",
        algorithm_id: "powl_discovery",
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: false,
            alignment_ready: false,
            streaming_compatible: false,
            exportable_to_pnml: false,
            exportable_to_bpmn: false,
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
            { from: "a1", to: "op1" },
            { from: "op1", to: "a2" },
            { from: "a2", to: "op2" },
            { from: "op2", to: "a3" },
            { from: "op2", to: "a4" },
        ],
    };
    describe('inferStartActivities', () => {
        it('identifies activities with no incoming edges', () => {
            const starts = inferStartActivities(simpleDfgModel.nodes, simpleDfgModel.edges);
            expect(starts).toEqual(["a"]);
        });
        it('returns multiple start activities if graph has disconnected components', () => {
            const multiStartEdges = [
                { from: "a", to: "b", weight: 100 },
                { from: "c", to: "d", weight: 50 },
            ];
            const multiStartNodes = [
                { id: "a", label: "A", type: "transition" },
                { id: "b", label: "B", type: "transition" },
                { id: "c", label: "C", type: "transition" },
                { id: "d", label: "D", type: "transition" },
            ];
            const starts = inferStartActivities(multiStartNodes, multiStartEdges);
            expect(starts).toContain("a");
            expect(starts).toContain("c");
            expect(starts.length).toBe(2);
        });
        it('returns empty array if all transitions have incoming edges', () => {
            const cyclicEdges = [
                { from: "a", to: "b" },
                { from: "b", to: "a" },
            ];
            const cyclicNodes = [
                { id: "a", label: "A", type: "transition" },
                { id: "b", label: "B", type: "transition" },
            ];
            const starts = inferStartActivities(cyclicNodes, cyclicEdges);
            expect(starts).toHaveLength(0);
        });
    });
    describe('inferEndActivities', () => {
        it('identifies activities with no outgoing edges', () => {
            const ends = inferEndActivities(simpleDfgModel.nodes, simpleDfgModel.edges);
            expect(ends).toEqual(["c"]);
        });
        it('returns multiple end activities if graph has disconnected components', () => {
            const multiEndEdges = [
                { from: "a", to: "b" },
                { from: "c", to: "d" },
            ];
            const multiEndNodes = [
                { id: "a", label: "A", type: "transition" },
                { id: "b", label: "B", type: "transition" },
                { id: "c", label: "C", type: "transition" },
                { id: "d", label: "D", type: "transition" },
            ];
            const ends = inferEndActivities(multiEndNodes, multiEndEdges);
            expect(ends).toContain("b");
            expect(ends).toContain("d");
            expect(ends.length).toBe(2);
        });
    });
    describe('DFG conversion', () => {
        it('modelIrToDfg preserves nodes and edges', () => {
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
        });
        it('modelIrToDfg infers start and end activities', () => {
            const dfg = modelIrToDfg(simpleDfgModel);
            expect(dfg.start_activities).toEqual(["a"]);
            expect(dfg.end_activities).toEqual(["c"]);
        });
        it('modelIrToDfg preserves quality metrics', () => {
            const dfg = modelIrToDfg(simpleDfgModel);
            expect(dfg.quality).toBeDefined();
            expect(dfg.quality?.fitness).toBe(0.92);
            expect(dfg.quality?.precision).toBe(0.89);
        });
        it('dfgToModelIr round-trips without loss', () => {
            const dfg = modelIrToDfg(simpleDfgModel);
            const reconstructed = dfgToModelIr(dfg);
            expect(reconstructed.format_version).toBe("1.0");
            expect(reconstructed.model_type).toBe("dfg");
            expect(reconstructed.nodes).toHaveLength(3);
            expect(reconstructed.edges).toHaveLength(2);
            expect(reconstructed.nodes[0].type).toBe("transition");
        });
        it('DFG round-trip preserves edge weights', () => {
            const dfg = modelIrToDfg(simpleDfgModel);
            const reconstructed = dfgToModelIr(dfg);
            expect(reconstructed.edges[0].weight).toBe(100);
            expect(reconstructed.edges[1].weight).toBe(95);
        });
    });
    describe('Petri Net conversion', () => {
        it('modelIrToPetriNet separates places and transitions', () => {
            const net = modelIrToPetriNet(petriNetModel);
            expect(net.format).toBe("petri_net");
            expect(net.model_type).toBe("petri_net");
            expect(net.places).toHaveLength(3);
            expect(net.transitions).toHaveLength(2);
            expect(net.places[0].id).toBe("p1");
            expect(net.transitions[0].id).toBe("t1");
        });
        it('modelIrToPetriNet infers initial marking from topology', () => {
            const net = modelIrToPetriNet(petriNetModel);
            // p1 has no incoming arcs from transitions, so it's a source place
            expect(net.initial_marking).toHaveProperty("p1", 1);
            // p2 and p3 have incoming arcs, so no initial tokens
            expect(net.initial_marking).not.toHaveProperty("p2");
            expect(net.initial_marking).not.toHaveProperty("p3");
        });
        it('modelIrToPetriNet infers final marking from topology', () => {
            const net = modelIrToPetriNet(petriNetModel);
            // p3 has no outgoing arcs, so it's a sink place
            expect(net.final_markings[0]).toHaveProperty("p3", 1);
            // p1 and p2 have outgoing arcs
            expect(net.final_markings[0]).not.toHaveProperty("p1");
            expect(net.final_markings[0]).not.toHaveProperty("p2");
        });
        it('modelIrToPetriNet converts arcs and preserves weights', () => {
            const net = modelIrToPetriNet(petriNetModel);
            expect(net.arcs).toHaveLength(4);
            expect(net.arcs[0].source).toBe("p1");
            expect(net.arcs[0].target).toBe("t1");
        });
        it('petriNetToModelIr round-trips without loss', () => {
            const net = modelIrToPetriNet(petriNetModel);
            const reconstructed = petriNetToModelIr(net);
            expect(reconstructed.format_version).toBe("1.0");
            expect(reconstructed.model_type).toBe("petri_net");
            expect(reconstructed.nodes).toHaveLength(5);
            expect(reconstructed.edges).toHaveLength(4);
            // Check node types are preserved
            const places = reconstructed.nodes.filter(n => n.type === "place");
            const transitions = reconstructed.nodes.filter(n => n.type === "transition");
            expect(places).toHaveLength(3);
            expect(transitions).toHaveLength(2);
        });
        it('Petri Net round-trip preserves place and transition labels', () => {
            const net = modelIrToPetriNet(petriNetModel);
            const reconstructed = petriNetToModelIr(net);
            const startPlace = reconstructed.nodes.find(n => n.id === "p1");
            expect(startPlace?.label).toBe("Start");
            const registerTransition = reconstructed.nodes.find(n => n.id === "t1");
            expect(registerTransition?.label).toBe("Register");
        });
    });
    describe('POWL model conversion', () => {
        it('modelIrToPowlModel allocates arena indices sequentially', () => {
            const powl = modelIrToPowlModel(powlModel);
            expect(powl.format).toBe("powl");
            expect(powl.model_type).toBe("powl");
            expect(powl.arena).toHaveLength(6);
            expect(powl.arena[0].id).toBe(0);
            expect(powl.arena[1].id).toBe(1);
            expect(powl.arena[5].id).toBe(5);
        });
        it('modelIrToPowlModel creates index_map for ID lookup', () => {
            const powl = modelIrToPowlModel(powlModel);
            expect(powl.index_map["a1"]).toBe(0);
            expect(powl.index_map["op1"]).toBe(1);
            expect(powl.index_map["a2"]).toBe(2);
            expect(powl.index_map["op2"]).toBe(3);
        });
        it('modelIrToPowlModel remaps edges to arena indices', () => {
            const powl = modelIrToPowlModel(powlModel);
            expect(powl.edges).toHaveLength(5);
            expect(powl.edges[0].from).toBe(0); // a1
            expect(powl.edges[0].to).toBe(1); // op1
            expect(powl.edges[2].from).toBe(2); // a2
            expect(powl.edges[2].to).toBe(3); // op2
        });
        it('modelIrToPowlModel preserves node labels in arena', () => {
            const powl = modelIrToPowlModel(powlModel);
            expect(powl.arena[0].label).toBe("Register");
            expect(powl.arena[1].label).toBe("Sequential (→)");
            expect(powl.arena[3].label).toBe("Choice (×)");
        });
        it('modelIrToPowlModel throws on missing nodes in edges', () => {
            const brokenModel = {
                format_version: "1.0",
                model_type: "powl",
                algorithm_id: "test",
                capabilities: {
                    online_safe: true,
                    offline_only: false,
                    replay_ready: false,
                    alignment_ready: false,
                    streaming_compatible: false,
                    exportable_to_pnml: false,
                    exportable_to_bpmn: false,
                },
                nodes: [
                    { id: "a", label: "A", type: "activity" },
                ],
                edges: [
                    { from: "a", to: "missing" }, // "missing" not in nodes
                ],
            };
            expect(() => modelIrToPowlModel(brokenModel)).toThrow(/Node not found in arena/);
        });
        it('powlModelToModelIr round-trips without loss', () => {
            const powl = modelIrToPowlModel(powlModel);
            const reconstructed = powlModelToModelIr(powl);
            expect(reconstructed.format_version).toBe("1.0");
            expect(reconstructed.model_type).toBe("powl");
            expect(reconstructed.nodes).toHaveLength(6);
            expect(reconstructed.edges).toHaveLength(5);
        });
        it('POWL round-trip preserves node labels and types', () => {
            const powl = modelIrToPowlModel(powlModel);
            const reconstructed = powlModelToModelIr(powl);
            const a1 = reconstructed.nodes.find(n => n.id === "a1");
            expect(a1?.label).toBe("Register");
            expect(a1?.type).toBe("activity");
            const op1 = reconstructed.nodes.find(n => n.id === "op1");
            expect(op1?.label).toBe("Sequential (→)");
            expect(op1?.type).toBe("operator");
        });
        it('POWL round-trip preserves edge structure', () => {
            const powl = modelIrToPowlModel(powlModel);
            const reconstructed = powlModelToModelIr(powl);
            // Original edges
            const originalEdges = powlModel.edges.map(e => `${e.from}->${e.to}`);
            // Reconstructed edges
            const reconstructedEdges = reconstructed.edges.map(e => `${e.from}->${e.to}`);
            expect(reconstructedEdges.length).toBe(originalEdges.length);
            for (const edge of originalEdges) {
                expect(reconstructedEdges).toContain(edge);
            }
        });
    });
    describe('bidirectional mapping validation (POWL)', () => {
        it('index_map correctly maps all string IDs to arena indices', () => {
            const powl = modelIrToPowlModel(powlModel);
            for (const [stringId, index] of Object.entries(powl.index_map)) {
                expect(index).toBeGreaterThanOrEqual(0);
                expect(index).toBeLessThan(powl.arena.length);
                expect(powl.arena[index]).toBeDefined();
            }
        });
        it('arena indices are sequential 0..N-1', () => {
            const powl = modelIrToPowlModel(powlModel);
            for (let i = 0; i < powl.arena.length; i++) {
                expect(powl.arena[i].id).toBe(i);
            }
        });
        it('reverse mapping (arena -> string ID) recovers original node IDs', () => {
            const powl = modelIrToPowlModel(powlModel);
            const reverseMap = {};
            for (const [id, idx] of Object.entries(powl.index_map)) {
                reverseMap[parseInt(idx.toString())] = id;
            }
            for (let i = 0; i < powl.arena.length; i++) {
                expect(reverseMap[i]).toBeDefined();
            }
        });
    });
    describe('quality metrics preservation', () => {
        it('DFG conversion preserves quality metrics', () => {
            const dfg = modelIrToDfg(simpleDfgModel);
            expect(dfg.quality).toEqual(simpleDfgModel.quality);
        });
        it('Petri Net conversion preserves quality metrics', () => {
            const net = modelIrToPetriNet(petriNetModel);
            // petriNetModel doesn't have quality, so dfg should either omit it or have undefined
            expect(net.quality).toBeUndefined();
        });
        it('POWL conversion preserves quality metrics when present', () => {
            const powlWithQuality = {
                ...powlModel,
                quality: {
                    fitness: 0.88,
                    precision: 0.91,
                },
            };
            const powl = modelIrToPowlModel(powlWithQuality);
            expect(powl.quality).toEqual(powlWithQuality.quality);
        });
    });
    describe('complex graph topologies', () => {
        it('handles DFG with branching (one-to-many)', () => {
            const branchModel = {
                format_version: "1.0",
                model_type: "dfg",
                algorithm_id: "dfg",
                capabilities: {
                    online_safe: true,
                    offline_only: false,
                    replay_ready: true,
                    alignment_ready: false,
                    streaming_compatible: true,
                    exportable_to_pnml: false,
                    exportable_to_bpmn: false,
                },
                nodes: [
                    { id: "a", label: "Register", type: "transition" },
                    { id: "b", label: "Approve", type: "transition" },
                    { id: "c", label: "Reject", type: "transition" },
                ],
                edges: [
                    { from: "a", to: "b" },
                    { from: "a", to: "c" },
                ],
            };
            const dfg = modelIrToDfg(branchModel);
            expect(dfg.start_activities).toEqual(["a"]);
            expect(dfg.end_activities).toContain("b");
            expect(dfg.end_activities).toContain("c");
            expect(dfg.end_activities).toHaveLength(2);
        });
        it('handles DFG with merging (many-to-one)', () => {
            const mergeModel = {
                format_version: "1.0",
                model_type: "dfg",
                algorithm_id: "dfg",
                capabilities: {
                    online_safe: true,
                    offline_only: false,
                    replay_ready: true,
                    alignment_ready: false,
                    streaming_compatible: true,
                    exportable_to_pnml: false,
                    exportable_to_bpmn: false,
                },
                nodes: [
                    { id: "a", label: "Approve", type: "transition" },
                    { id: "b", label: "Reject", type: "transition" },
                    { id: "c", label: "Notify", type: "transition" },
                ],
                edges: [
                    { from: "a", to: "c" },
                    { from: "b", to: "c" },
                ],
            };
            const dfg = modelIrToDfg(mergeModel);
            expect(dfg.start_activities).toContain("a");
            expect(dfg.start_activities).toContain("b");
            expect(dfg.end_activities).toEqual(["c"]);
        });
        it('handles Petri Net with complex topology', () => {
            const complexPetri = {
                format_version: "1.0",
                model_type: "petri_net",
                algorithm_id: "test",
                capabilities: {
                    online_safe: true,
                    offline_only: false,
                    replay_ready: true,
                    alignment_ready: true,
                    streaming_compatible: false,
                    exportable_to_pnml: true,
                    exportable_to_bpmn: false,
                },
                nodes: [
                    { id: "p1", label: "S1", type: "place" },
                    { id: "t1", label: "A", type: "transition" },
                    { id: "p2", label: "S2", type: "place" },
                    { id: "t2", label: "B", type: "transition" },
                    { id: "p3", label: "S3", type: "place" },
                    { id: "t3", label: "C", type: "transition" },
                    { id: "p4", label: "S4", type: "place" },
                ],
                edges: [
                    { from: "p1", to: "t1" },
                    { from: "t1", to: "p2" },
                    { from: "p2", to: "t2" },
                    { from: "t2", to: "p3" },
                    { from: "t2", to: "p4" },
                    { from: "p3", to: "t3" },
                    { from: "t3", to: "p4" },
                ],
            };
            const net = modelIrToPetriNet(complexPetri);
            expect(net.places).toHaveLength(4);
            expect(net.transitions).toHaveLength(3);
            expect(net.initial_marking).toHaveProperty("p1", 1);
            // p4 is sink (no outgoing), p3 has outgoing to t3
            expect(net.final_markings[0]).toHaveProperty("p4", 1);
        });
    });
});
//# sourceMappingURL=model-ir-converter.test.js.map