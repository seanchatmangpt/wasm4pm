/**
 * Process Mining Visualization Utilities
 *
 * Generate diagrams and visualizations for process models:
 * - Petri Net diagrams (Mermaid)
 * - DFG flow diagrams (Mermaid)
 * - Interactive D3 visualizations
 * - HTML reports
 */
import * as api from './api.js';
/**
 * Generate Mermaid diagram for a Petri Net
 * @param petriNet The Petri Net model
 * @returns Mermaid diagram code
 */
export declare function petriNetToMermaid(petriNet: api.PetriNet): string;
/**
 * Generate Mermaid diagram for a DFG
 * @param dfg The Directly-Follows Graph
 * @returns Mermaid diagram code
 */
export declare function dfgToMermaid(dfg: api.DirectlyFollowsGraph): string;
/**
 * Generate Mermaid diagram for DECLARE constraints
 * @param model The DECLARE model
 * @returns Mermaid diagram code
 */
export declare function declareToMermaid(model: api.DeclareModel): string;
/**
 * Generate interactive D3 visualization code for DFG
 * @param dfg The Directly-Follows Graph
 * @returns HTML with embedded D3 visualization
 */
export declare function dfgToD3HTML(dfg: api.DirectlyFollowsGraph, containerId?: string): string;
/**
 * Generate HTML report combining statistics and visualizations
 * @param log EventLog statistics
 * @param dfg Discovered DFG
 * @returns Complete HTML report
 */
export declare function generateProcessMiningReport(log: {
    traceCount: number;
    eventCount: number;
    activities: string[];
    stats: any;
}, dfg: api.DirectlyFollowsGraph): string;
//# sourceMappingURL=visualizations.d.ts.map