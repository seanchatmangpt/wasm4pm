/**
 * Process Mining Visualization Utilities
 *
 * Generate diagrams and visualizations for process models:
 * - Petri Net diagrams (Mermaid)
 * - DFG flow diagrams (Mermaid)
 * - Interactive D3 visualizations
 * - HTML reports
 */

import * as api from './api';

/**
 * Generate Mermaid diagram for a Petri Net
 * @param petriNet The Petri Net model
 * @returns Mermaid diagram code
 */
export function petriNetToMermaid(petriNet: api.PetriNet): string {
  let diagram = 'graph LR\n';

  // Add places (circles)
  for (const place of petriNet.places) {
    const marking = place.marking ? ` [${place.marking}]` : '';
    diagram += `  ${place.id}((${place.label}${marking}))\n`;
  }

  // Add transitions (rectangles)
  for (const transition of petriNet.transitions) {
    const style = transition.isInvisible ? '[[' : '[';
    const endStyle = transition.isInvisible ? ']]' : ']';
    diagram += `  ${transition.id}${style}${transition.label}${endStyle}\n`;
  }

  // Add arcs
  for (const arc of petriNet.arcs) {
    const weight = arc.weight && arc.weight > 1 ? `|${arc.weight}|` : '';
    diagram += `  ${arc.from} -->|${weight}| ${arc.to}\n`;
  }

  return diagram;
}

/**
 * Generate Mermaid diagram for a DFG
 * @param dfg The Directly-Follows Graph
 * @returns Mermaid diagram code
 */
export function dfgToMermaid(dfg: api.DirectlyFollowsGraph): string {
  let diagram = 'graph LR\n';

  // Add nodes with frequency labels
  const maxFreq = Math.max(...dfg.nodes.map(n => n.frequency));
  for (const node of dfg.nodes) {
    const sizePercent = Math.max(20, (node.frequency / maxFreq) * 100);
    const fontSize = Math.max(10, sizePercent / 5);
    diagram += `  ${node.id}["${node.label}<br/>(${node.frequency})"] style ${node.id} fill:#667eea,color:#fff,font-size:${fontSize}px\n`;
  }

  // Add edges with frequency labels
  for (const edge of dfg.edges) {
    const lineWidth = Math.max(1, Math.min(5, edge.frequency / maxFreq * 5));
    diagram += `  ${edge.from} -->|${edge.frequency}| ${edge.to} style ${edge.from}-${edge.to} stroke-width:${lineWidth}px\n`;
  }

  // Add start activities
  diagram += '  START[" "]\n';
  for (const [activity, freq] of Object.entries(dfg.start_activities)) {
    diagram += `  START -->|start${freq > 1 ? ` (${freq})` : ''}| ${activity}\n`;
  }

  // Add end activities
  diagram += '  END[" "]\n';
  for (const [activity, freq] of Object.entries(dfg.end_activities)) {
    diagram += `  ${activity} -->|end${freq > 1 ? ` (${freq})` : ''}| END\n`;
  }

  return diagram;
}

/**
 * Generate Mermaid diagram for DECLARE constraints
 * @param model The DECLARE model
 * @returns Mermaid diagram code
 */
export function declareToMermaid(model: api.DeclareModel): string {
  let diagram = 'graph TB\n';

  // Group constraints by type
  const constraintsByType: Record<string, api.DeclareConstraint[]> = {};
  for (const constraint of model.constraints) {
    if (!constraintsByType[constraint.template]) {
      constraintsByType[constraint.template] = [];
    }
    constraintsByType[constraint.template].push(constraint);
  }

  let nodeId = 1;
  for (const [template, constraints] of Object.entries(constraintsByType)) {
    const subgraph = `subgraph ${template}\n`;
    for (const constraint of constraints) {
      const support = (constraint.support * 100).toFixed(0);
      const confidence = (constraint.confidence * 100).toFixed(0);
      const activities = constraint.activities.join(' → ');
      diagram += `  n${nodeId}["${activities}<br/>${support}% / ${confidence}%"]\n`;
      nodeId++;
    }
    diagram += `  end\n`;
  }

  return diagram;
}

/**
 * Generate interactive D3 visualization code for DFG
 * @param dfg The Directly-Follows Graph
 * @returns HTML with embedded D3 visualization
 */
export function dfgToD3HTML(dfg: api.DirectlyFollowsGraph, containerId: string = 'visualization'): string {
  const nodes = dfg.nodes.map((n, i) => ({
    id: n.id,
    label: n.label,
    frequency: n.frequency,
    index: i,
  }));

  const links = dfg.edges.map(e => ({
    source: e.from,
    target: e.to,
    value: e.frequency,
  }));

  const nodesJSON = JSON.stringify(nodes);
  const linksJSON = JSON.stringify(links);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DFG Visualization</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    #${containerId} { width: 100%; height: 100vh; }
    .node { fill: #667eea; stroke: #333; stroke-width: 2px; }
    .node:hover { fill: #764ba2; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .label { font-size: 12px; text-anchor: middle; pointer-events: none; fill: #333; }
    .tooltip { position: absolute; padding: 8px 12px; background: rgba(0,0,0,0.8); color: white; border-radius: 4px; font-size: 12px; pointer-events: none; }
  </style>
</head>
<body>
  <div id="${containerId}"></div>
  <script>
    const nodes = ${nodesJSON};
    const links = ${linksJSON};

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select('#${containerId}')
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke-width', d => Math.sqrt(d.value));

    const node = svg.selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', d => Math.sqrt(d.frequency) * 3)
      .call(drag(simulation));

    const labels = svg.selectAll('.label')
      .data(nodes)
      .enter()
      .append('text')
      .attr('class', 'label')
      .text(d => d.label);

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      labels
        .attr('x', d => d.x)
        .attr('y', d => d.y - Math.sqrt(d.frequency) * 3 - 10);
    });

    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }
  </script>
</body>
</html>
  `;
}

/**
 * Generate HTML report combining statistics and visualizations
 * @param log EventLog statistics
 * @param dfg Discovered DFG
 * @returns Complete HTML report
 */
export function generateProcessMiningReport(
  log: {
    traceCount: number;
    eventCount: number;
    activities: string[];
    stats: any;
  },
  dfg: api.DirectlyFollowsGraph
): string {
  const dfgMermaid = dfgToMermaid(dfg);
  const dfgD3 = dfgToD3HTML(dfg, 'dfg-visualization');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Process Mining Report</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }
    h1 { font-size: 2.5em; margin-bottom: 10px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .stat-card h3 { color: #667eea; margin-bottom: 10px; }
    .stat-card .value { font-size: 2em; font-weight: bold; }
    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .section h2 { color: #667eea; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #667eea; }
    .mermaid { display: flex; justify-content: center; }
    #dfg-visualization { height: 600px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 Process Mining Analysis Report</h1>
      <p>Automated discovery and analysis of process models</p>
      <p style="font-size: 0.9em; margin-top: 10px;">Generated at: ${new Date().toISOString()}</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Cases</h3>
        <div class="value">${log.traceCount.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <h3>Events</h3>
        <div class="value">${log.eventCount.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <h3>Activities</h3>
        <div class="value">${log.activities.length}</div>
      </div>
      <div class="stat-card">
        <h3>Avg Events/Case</h3>
        <div class="value">${(log.eventCount / log.traceCount).toFixed(2)}</div>
      </div>
    </div>

    <div class="section">
      <h2>📈 DFG Diagram</h2>
      <div class="mermaid">
\`\`\`mermaid
${dfgMermaid}
\`\`\`
      </div>
    </div>

    <div class="section">
      <h2>🎯 Activities</h2>
      <ul style="list-style: none;">
        ${log.activities
          .slice(0, 10)
          .map(
            (a, i) => `<li style="padding: 8px 0; border-bottom: 1px solid #eee;">${i + 1}. ${a}</li>`
          )
          .join('')}
      </ul>
    </div>

    <div class="section">
      <h2>🔄 Interactive Visualization</h2>
      <div id="dfg-visualization"></div>
    </div>
  </div>

  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
    mermaid.contentLoaded();
  </script>
</body>
</html>
  `;
}
