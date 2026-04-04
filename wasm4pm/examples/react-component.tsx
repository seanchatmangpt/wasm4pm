/**
 * wasm4pm React Component Example
 *
 * Shows how to integrate wasm4pm into a modern React application
 * Includes real-time process discovery and visualization
 */

import React, { useState, useCallback, useMemo } from 'react';

interface ProcessLog {
  id: string;
  name: string;
  traceCount: number;
  eventCount: number;
  activities: string[];
}

interface DiscoveryResult {
  type: 'dfg' | 'petri' | 'declare';
  timestamp: number;
  nodes?: number;
  edges?: number;
  constraints?: number;
}

export const ProcessMiningApp: React.FC = () => {
  const [log, setLog] = useState<ProcessLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<'dfg' | 'petri' | 'declare'>('dfg');
  const [minFrequency, setMinFrequency] = useState(1);

  /**
   * Handle file upload
   */
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const content = await file.text();

      // In real implementation, this would call the actual WASM functions:
      // const handle = wasm.load_eventlog_from_xes(content);
      // const stats = wasm.analyze_event_statistics(handle);

      const mockLog: ProcessLog = {
        id: `log-${Date.now()}`,
        name: file.name,
        traceCount: 1234,
        eventCount: 12567,
        activities: ['Register', 'Approve', 'Execute', 'Complete', 'Archive']
      };

      setLog(mockLog);
      setResults([]);
    } catch (error) {
      console.error('Failed to load log:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Run discovery algorithm
   */
  const runDiscovery = useCallback(async () => {
    if (!log) return;

    setLoading(true);
    try {
      // In real implementation, this would call WASM functions like:
      // const dfgHandle = wasm.discover_dfg_filtered(logHandle, 'concept:name', minFrequency);
      // const dfgData = wasm.export_dfg_to_json(dfgHandle);

      const result: DiscoveryResult = {
        type: selectedAlgorithm,
        timestamp: Date.now(),
        nodes: Math.floor(Math.random() * 50) + 20,
        edges: Math.floor(Math.random() * 150) + 50,
        constraints: selectedAlgorithm === 'declare' ? Math.floor(Math.random() * 20) + 5 : undefined
      };

      setResults(prev => [result, ...prev]);
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setLoading(false);
    }
  }, [log, selectedAlgorithm, minFrequency]);

  /**
   * Analytics summary
   */
  const analytics = useMemo(() => {
    if (!log) return null;

    return {
      avgEventsPerTrace: (log.eventCount / log.traceCount).toFixed(2),
      uniqueActivities: log.activities.length,
      totalDiscoveries: results.length,
      lastDiscovery: results[0]?.timestamp
    };
  }, [log, results]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>⚙️ wasm4pm React Integration</h1>
        <p>Real-time Process Discovery in React Applications</p>
      </header>

      <div style={styles.grid}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <section style={styles.section}>
            <h2>📁 Load Event Log</h2>
            <input
              type="file"
              accept=".xes,.json,.xml"
              onChange={handleFileUpload}
              disabled={loading}
              style={styles.fileInput}
            />
          </section>

          {log && (
            <section style={styles.section}>
              <h3>Log Information</h3>
              <div style={styles.infoBox}>
                <div style={styles.infoRow}>
                  <span>File:</span>
                  <strong>{log.name}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Traces:</span>
                  <strong>{log.traceCount.toLocaleString()}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Events:</span>
                  <strong>{log.eventCount.toLocaleString()}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Avg Events/Trace:</span>
                  <strong>{analytics?.avgEventsPerTrace}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Activities:</span>
                  <strong>{log.activities.length}</strong>
                </div>
              </div>

              <div style={{ marginTop: '15px' }}>
                <h4>Activities ({log.activities.length})</h4>
                <div style={styles.tagList}>
                  {log.activities.map(activity => (
                    <span key={activity} style={styles.tag}>
                      {activity}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {log && (
            <section style={styles.section}>
              <h3>🔬 Discovery</h3>
              <div style={styles.algorithmSelect}>
                {(['dfg', 'petri', 'declare'] as const).map(algo => (
                  <label key={algo} style={styles.radioLabel}>
                    <input
                      type="radio"
                      value={algo}
                      checked={selectedAlgorithm === algo}
                      onChange={(e) => setSelectedAlgorithm(e.target.value as typeof algo)}
                    />
                    {algo.toUpperCase()}
                  </label>
                ))}
              </div>

              {selectedAlgorithm === 'dfg' && (
                <div style={{ marginTop: '10px' }}>
                  <label>
                    Min Frequency:
                    <input
                      type="number"
                      min="1"
                      value={minFrequency}
                      onChange={(e) => setMinFrequency(parseInt(e.target.value))}
                      style={{ width: '60px', marginLeft: '10px' }}
                    />
                  </label>
                </div>
              )}

              <button
                onClick={runDiscovery}
                disabled={!log || loading}
                style={styles.button}
              >
                {loading ? 'Running...' : 'Discover'}
              </button>
            </section>
          )}
        </aside>

        {/* Main Content */}
        <main style={styles.main}>
          {!log ? (
            <div style={styles.emptyState}>
              <p>👈 Load an event log to get started</p>
              <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
                Supported formats: XES, JSON, OCEL XML
              </p>
            </div>
          ) : (
            <>
              <section style={styles.analyticsGrid}>
                <div style={styles.card}>
                  <div style={styles.metric}>
                    {analytics?.avgEventsPerTrace}
                  </div>
                  <div style={styles.label}>Avg Events per Trace</div>
                </div>
                <div style={styles.card}>
                  <div style={styles.metric}>
                    {log.activities.length}
                  </div>
                  <div style={styles.label}>Unique Activities</div>
                </div>
                <div style={styles.card}>
                  <div style={styles.metric}>
                    {analytics?.totalDiscoveries}
                  </div>
                  <div style={styles.label}>Discoveries Run</div>
                </div>
              </section>

              <section style={styles.section}>
                <h2>📊 Discovery Results</h2>
                {results.length === 0 ? (
                  <p style={{ color: '#999' }}>No discoveries yet. Run an algorithm to get started.</p>
                ) : (
                  <div style={styles.resultsList}>
                    {results.map((result, idx) => (
                      <div key={idx} style={styles.resultCard}>
                        <div style={styles.resultHeader}>
                          <strong>{result.type.toUpperCase()}</strong>
                          <small>
                            {new Date(result.timestamp).toLocaleTimeString()}
                          </small>
                        </div>
                        <div style={styles.resultBody}>
                          {result.nodes && (
                            <div>
                              <span>Nodes:</span>
                              <strong>{result.nodes}</strong>
                            </div>
                          )}
                          {result.edges && (
                            <div>
                              <span>Edges:</span>
                              <strong>{result.edges}</strong>
                            </div>
                          )}
                          {result.constraints && (
                            <div>
                              <span>Constraints:</span>
                              <strong>{result.constraints}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
    background: '#f5f5f5'
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '30px',
    textAlign: 'center' as const
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '20px',
    padding: '20px',
    flex: 1
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  main: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  section: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  fileInput: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  button: {
    width: '100%',
    padding: '10px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    marginTop: '10px',
    transition: 'background 0.3s'
  },
  infoBox: {
    background: '#f9f9f9',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '0.9em'
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #eee'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    marginTop: '8px'
  },
  tag: {
    background: '#667eea',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '0.85em'
  },
  algorithmSelect: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer'
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '15px'
  },
  card: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  metric: {
    fontSize: '2em',
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: '10px'
  },
  label: {
    fontSize: '0.9em',
    color: '#666'
  },
  resultsList: {
    display: 'grid',
    gap: '10px'
  },
  resultCard: {
    background: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '12px'
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid #eee'
  },
  resultBody: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    fontSize: '0.9em'
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '400px',
    color: '#999',
    textAlign: 'center' as const
  }
};

export default ProcessMiningApp;
