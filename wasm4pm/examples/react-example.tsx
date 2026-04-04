/**
 * React Example for process_mining_wasm
 *
 * This component demonstrates how to integrate Rust4PM WASM
 * into a React application with hooks and state management.
 *
 * Usage:
 * import ProcessMiningDemo from './react-example';
 * <ProcessMiningDemo />
 */

import React, { useEffect, useState, useRef } from 'react';

// Type definitions
interface EventLog {
  handle: string;
  stats?: {
    num_traces: number;
    num_events: number;
    num_activities: number;
    event_frequency: Record<string, number>;
  };
}

interface AnalysisResult {
  type: 'statistics' | 'duration' | 'dfg' | 'petri_net' | 'declare';
  data: any;
  timestamp: number;
}

interface WasmModule {
  init: () => void;
  get_version: () => string;
  load_eventlog_from_xes: (content: string) => string;
  load_ocel_from_json: (content: string) => string;
  analyze_event_statistics: (handle: string) => string;
  analyze_case_duration: (handle: string) => string;
  analyze_dotted_chart: (handle: string) => string;
  discover_dfg: (handle: string) => string;
  discover_alpha_plus_plus: (handle: string, threshold: number) => string;
  discover_declare: (handle: string) => string;
  object_count: () => number;
  clear_all_objects: () => void;
}

// Hook for WASM initialization
function useWasm() {
  const [pm, setPm] = useState<WasmModule | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initWasm = async () => {
      try {
        // Import dynamically - adjust path based on your build setup
        // const mod = await import('process_mining_wasm');
        // In a real app, you would use the actual WASM module

        // For this example, we'll simulate the module
        const mockModule: WasmModule = {
          init: () => console.log('WASM initialized'),
          get_version: () => '0.5.4',
          load_eventlog_from_xes: (content: string) => 'handle_' + Math.random(),
          load_ocel_from_json: (content: string) => 'handle_' + Math.random(),
          analyze_event_statistics: (handle: string) =>
            JSON.stringify({
              num_traces: 3,
              num_events: 14,
              num_activities: 5,
            }),
          analyze_case_duration: (handle: string) =>
            JSON.stringify({
              min_duration: 3600000,
              max_duration: 7200000,
              mean_duration: 5400000,
            }),
          analyze_dotted_chart: (handle: string) =>
            JSON.stringify({ dotted_chart: [] }),
          discover_dfg: (handle: string) =>
            JSON.stringify({ nodes: [], edges: [] }),
          discover_alpha_plus_plus: (handle: string, threshold: number) =>
            JSON.stringify({ places: [], transitions: [] }),
          discover_declare: (handle: string) =>
            JSON.stringify({ constraints: [] }),
          object_count: () => 0,
          clear_all_objects: () => {},
        };

        setPm(mockModule);
        mockModule.init();
        setIsReady(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to initialize WASM'
        );
      }
    };

    initWasm();
  }, []);

  return { pm, isReady, error };
}

// Main Component
const ProcessMiningDemo: React.FC = () => {
  const { pm, isReady, error: wasmError } = useWasm();

  const [xesInput, setXesInput] = useState('');
  const [ocelInput, setOcelInput] = useState('');
  const [eventLog, setEventLog] = useState<EventLog | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectCount, setObjectCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load XES
  const handleLoadXES = () => {
    if (!pm || !xesInput.trim()) {
      setError('Please enter XES content');
      return;
    }

    try {
      setIsLoading(true);
      const handle = pm.load_eventlog_from_xes(xesInput);
      const statsJson = pm.analyze_event_statistics(handle);
      const stats = JSON.parse(statsJson);

      setEventLog({ handle, stats });
      setError(null);
      updateObjectCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load XES');
    } finally {
      setIsLoading(false);
    }
  };

  // Load OCEL
  const handleLoadOCEL = () => {
    if (!pm || !ocelInput.trim()) {
      setError('Please enter OCEL content');
      return;
    }

    try {
      setIsLoading(true);
      const handle = pm.load_ocel_from_json(ocelInput);
      setEventLog({ handle });
      setError(null);
      updateObjectCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OCEL');
    } finally {
      setIsLoading(false);
    }
  };

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith('.xes') || file.name.endsWith('.xml')) {
        setXesInput(content);
      } else if (file.name.endsWith('.json')) {
        setOcelInput(content);
      }
    };
    reader.readAsText(file);
  };

  // Run analysis
  const runAnalysis = (type: string) => {
    if (!pm || !eventLog) {
      setError('Please load an event log first');
      return;
    }

    try {
      setIsLoading(true);
      let result;
      let dataType: AnalysisResult['type'];

      switch (type) {
        case 'statistics':
          result = JSON.parse(pm.analyze_event_statistics(eventLog.handle));
          dataType = 'statistics';
          break;
        case 'duration':
          result = JSON.parse(pm.analyze_case_duration(eventLog.handle));
          dataType = 'duration';
          break;
        case 'dfg':
          result = JSON.parse(pm.discover_dfg(eventLog.handle));
          dataType = 'dfg';
          break;
        case 'alpha':
          result = JSON.parse(pm.discover_alpha_plus_plus(eventLog.handle, 0));
          dataType = 'petri_net';
          break;
        case 'declare':
          result = JSON.parse(pm.discover_declare(eventLog.handle));
          dataType = 'declare';
          break;
        default:
          return;
      }

      setAnalysisResults((prev) => [
        ...prev,
        { type: dataType, data: result, timestamp: Date.now() },
      ]);
      setError(null);
    } catch (err) {
      setError(
        'Analysis failed: ' + (err instanceof Error ? err.message : 'Unknown error')
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Update object count
  const updateObjectCount = () => {
    if (pm) {
      setObjectCount(pm.object_count());
    }
  };

  // Clear all
  const handleClearAll = () => {
    if (pm) {
      pm.clear_all_objects();
      setEventLog(null);
      setAnalysisResults([]);
      setXesInput('');
      setOcelInput('');
      setObjectCount(0);
      setError(null);
    }
  };

  // Load sample XES
  const loadSampleXES = () => {
    const sample = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00"/>
  </global>
  <trace>
    <string key="concept:name" value="Case001"/>
    <event><string key="concept:name" value="Request"/><date key="time:timestamp" value="2023-01-01T08:00:00"/></event>
    <event><string key="concept:name" value="Review"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2023-01-01T12:00:00"/></event>
  </trace>
</log>`;
    setXesInput(sample);
  };

  if (wasmError) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h2>Failed to Initialize</h2>
        <p>{wasmError}</p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Loading Rust4PM WASM...</h2>
        <p>Please wait while the WebAssembly module is being initialized.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>Rust4PM Process Mining in React</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>1. Load Event Log</h2>

        <div style={{ marginBottom: '10px' }}>
          <h3>XES File</h3>
          <textarea
            value={xesInput}
            onChange={(e) => setXesInput(e.target.value)}
            placeholder="Paste XES content or load sample"
            style={{
              width: '100%',
              height: '150px',
              padding: '10px',
              fontFamily: 'monospace',
            }}
          />
          <div style={{ marginTop: '10px' }}>
            <button onClick={handleLoadXES} disabled={isLoading}>
              Load XES
            </button>
            <button onClick={loadSampleXES} style={{ marginLeft: '10px' }}>
              Load Sample
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <h3>OCEL File</h3>
          <textarea
            value={ocelInput}
            onChange={(e) => setOcelInput(e.target.value)}
            placeholder="Paste OCEL JSON content"
            style={{
              width: '100%',
              height: '150px',
              padding: '10px',
              fontFamily: 'monospace',
            }}
          />
          <button onClick={handleLoadOCEL} disabled={isLoading} style={{ marginTop: '10px' }}>
            Load OCEL
          </button>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <h3>Upload File</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xes,.json,.xml"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {eventLog && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
          <h2>Loaded Event Log</h2>
          <p>Handle: {eventLog.handle}</p>
          {eventLog.stats && (
            <ul>
              <li>Traces: {eventLog.stats.num_traces}</li>
              <li>Events: {eventLog.stats.num_events}</li>
              <li>Activities: {eventLog.stats.num_activities}</li>
            </ul>
          )}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h2>2. Analysis & Discovery</h2>

        <div style={{ marginBottom: '10px' }}>
          <h3>Analysis Functions</h3>
          <button
            onClick={() => runAnalysis('statistics')}
            disabled={!eventLog || isLoading}
          >
            Event Statistics
          </button>
          <button
            onClick={() => runAnalysis('duration')}
            disabled={!eventLog || isLoading}
            style={{ marginLeft: '10px' }}
          >
            Case Duration
          </button>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <h3>Discovery Algorithms</h3>
          <button
            onClick={() => runAnalysis('dfg')}
            disabled={!eventLog || isLoading}
          >
            Discover DFG
          </button>
          <button
            onClick={() => runAnalysis('alpha')}
            disabled={!eventLog || isLoading}
            style={{ marginLeft: '10px' }}
          >
            Discover Alpha++
          </button>
          <button
            onClick={() => runAnalysis('declare')}
            disabled={!eventLog || isLoading}
            style={{ marginLeft: '10px' }}
          >
            Discover DECLARE
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>3. Results</h2>

        {error && (
          <div style={{ padding: '10px', backgroundColor: '#ffcccc', color: 'red', marginBottom: '10px' }}>
            {error}
          </div>
        )}

        {isLoading && <p>Processing...</p>}

        <div style={{ marginBottom: '10px' }}>
          <p>Objects stored: {objectCount}</p>
          <button onClick={updateObjectCount} style={{ marginRight: '10px' }}>
            Refresh Count
          </button>
          <button onClick={handleClearAll}>Clear All</button>
        </div>

        <div>
          {analysisResults.map((result, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '10px',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              <h4>{result.type}</h4>
              <pre
                style={{
                  backgroundColor: '#f5f5f5',
                  padding: '10px',
                  overflow: 'auto',
                  maxHeight: '300px',
                }}
              >
                {JSON.stringify(result.data, null, 2)}
              </pre>
              <small>
                {new Date(result.timestamp).toLocaleTimeString()}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProcessMiningDemo;
