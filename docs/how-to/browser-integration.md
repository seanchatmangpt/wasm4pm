# How-To: Use wasm4pm in a Browser

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## Installation

```html
<script src="https://cdn.jsdelivr.net/npm/@wasm4pm/wasm4pm@26.4.5/dist/wasm4pm.umd.js"></script>
```

## Basic HTML

```html
<!DOCTYPE html>
<html>
<head>
  <script src="wasm4pm.umd.js"></script>
</head>
<body>
  <input type="file" id="logFile" />
  <button onclick="analyze()">Analyze</button>
  <div id="results"></div>

  <script>
    async function analyze() {
      const file = document.getElementById('logFile').files[0];
      const data = await file.text();

      const pm = new Wasm4pm.ProcessMiner();
      const result = await pm.run({
        config: {
          discovery: { algorithm: 'dfg', profile: 'fast' },
          source: { type: 'inline', data }
        }
      });

      document.getElementById('results').innerHTML = `
        Nodes: ${result.model.nodes.length}<br>
        Edges: ${result.model.edges.length}
      `;
    }
  </script>
</body>
</html>
```

## React Component

```jsx
import React, { useState } from 'react';
import Wasm4pm from '@wasm4pm/wasm4pm';

export function ProcessMiner() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async (file) => {
    setLoading(true);
    try {
      const data = await file.text();
      const pm = new Wasm4pm();
      const res = await pm.run({
        config: {
          discovery: { algorithm: 'dfg' },
          source: { type: 'inline', data }
        }
      });
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => analyze(e.target.files[0])}
      />
      {loading && <p>Analyzing...</p>}
      {result && (
        <div>
          <h3>Results</h3>
          <p>Nodes: {result.model.nodes.length}</p>
          <p>Edges: {result.model.edges.length}</p>
        </div>
      )}
    </div>
  );
}
```

## Vue Component

```vue
<template>
  <div>
    <input type="file" @change="analyze" />
    <div v-if="loading">Analyzing...</div>
    <div v-if="result">
      Nodes: {{ result.model.nodes.length }}
    </div>
  </div>
</template>

<script>
import Wasm4pm from '@wasm4pm/wasm4pm';

export default {
  data() {
    return {
      loading: false,
      result: null
    };
  },
  methods: {
    async analyze(event) {
      const file = event.target.files[0];
      this.loading = true;
      const data = await file.text();
      const pm = new Wasm4pm();
      this.result = await pm.run({
        config: {
          discovery: { algorithm: 'dfg' },
          source: { type: 'inline', data }
        }
      });
      this.loading = false;
    }
  }
};
</script>
```

## Web Worker

Prevent UI blocking:

```javascript
// worker.js
importScripts('wasm4pm.umd.js');

self.onmessage = async (event) => {
  const { config, data } = event.data;
  const pm = new Wasm4pm.ProcessMiner();
  const result = await pm.run({
    config: { ...config, source: { type: 'inline', data } }
  });
  self.postMessage(result);
};

// main.js
const worker = new Worker('worker.js');
worker.onmessage = (event) => {
  console.log('Result:', event.data);
};
worker.postMessage({
  config: { discovery: { algorithm: 'dfg' } },
  data: logData
});
```

## Visualize Results

```html
<script src="https://d3js.org/d3.v7.min.js"></script>

<svg id="graph" width="800" height="600"></svg>

<script>
  async function analyzeAndVisualize() {
    // ... run analysis ...
    visualizeDFG(result.model);
  }

  function visualizeDFG(model) {
    const svg = d3.select('#graph');
    
    // Create nodes
    svg.selectAll('.node')
      .data(model.nodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', 5);
    
    // Create edges
    svg.selectAll('.edge')
      .data(model.edges)
      .enter()
      .append('line')
      .attr('class', 'edge');
  }
</script>
```

## Performance Tips

1. **Use Web Workers** for large logs (>10KB)
2. **Stream processing** for real-time data
3. **Chunking** for incremental analysis
4. **Memory management**: Free handles when done

## See Also

- [Reference: TypeScript Types](../reference/types.ts)
- [Tutorial: Service Mode](../tutorials/service-mode.md)
