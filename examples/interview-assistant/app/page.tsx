'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { initCognitionBrowser } from '@wasm4pm/cognition/browser';
import {
  CognitionError,
  DomainPackSchema,
  SessionStateSchema,
  projectSessionCode,
  runSessionTurn,
  verifySessionState,
  type CodeProjection,
  type DomainPack,
  type SessionState,
} from '@wasm4pm/cognition';
import domainPackJson from '../../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading Monaco…</div>,
});

const domainPack: DomainPack = DomainPackSchema.parse(domainPackJson);
const storageKey = `wasm4pm-interview-next:${domainPack.id}`;

type BootStatus = 'loading' | 'ready' | 'failed';

function describeError(error: unknown): string {
  if (error instanceof CognitionError) {
    const refusal = error.details?.refusal_code;
    return refusal ? `${String(refusal)}: ${error.message}` : `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function visibleClock(): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/Los_Angeles',
  }).format(new Date());
}

export default function InterviewWorkspace() {
  const [state, setState] = useState<SessionState | undefined>(undefined);
  const [code, setCode] = useState<CodeProjection | null>(null);
  const [transcript, setTranscript] = useState('');
  const [bootStatus, setBootStatus] = useState<BootStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [turnReceipt, setTurnReceipt] = useState('');
  const [codeReceipt, setCodeReceipt] = useState('');
  const stateRef = useRef<SessionState | undefined>(undefined);
  const turnLocked = useRef(false);

  const commitVisibleState = useCallback(
    (nextState: SessionState, nextCode: CodeProjection | null, nextCodeReceipt: string) => {
      stateRef.current = nextState;
      setState(nextState);
      setCode(nextCode);
      setCodeReceipt(nextCodeReceipt);
      localStorage.setItem(storageKey, JSON.stringify(nextState));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      setBootStatus('loading');
      try {
        await initCognitionBrowser({
          moduleLoader: () => import('wasm4pm-cognition-web') as Promise<unknown>,
        });

        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = SessionStateSchema.safeParse(JSON.parse(raw) as unknown);
          if (!parsed.success) {
            throw new Error('Stored cognition state failed structural admission.');
          }
          await verifySessionState(domainPack, parsed.data);
          const projected = await projectSessionCode(domainPack, parsed.data);
          if (cancelled) return;
          commitVisibleState(parsed.data, projected.code, projected.attested_hash);
        }

        if (!cancelled) setBootStatus('ready');
      } catch (bootError) {
        localStorage.removeItem(storageKey);
        if (!cancelled) {
          stateRef.current = undefined;
          setState(undefined);
          setCode(null);
          setCodeReceipt('');
          setBootStatus('failed');
          setError(`${describeError(bootError)} Stored state was discarded.`);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [commitVisibleState]);

  const submitTurn = useCallback(
    async (request: {
      text?: string;
      confirmation?: { track_id: string; accepted: boolean };
    }) => {
      if (bootStatus !== 'ready' || turnLocked.current) return;
      turnLocked.current = true;
      setBusy(true);
      setError('');
      try {
        const text = request.text?.trim();
        const result = await runSessionTurn({
          domain_pack: domainPack,
          previous_state: stateRef.current,
          observation: text
            ? {
                id: `browser-${crypto.randomUUID()}`,
                source: 'conversation',
                text,
                retract_evidence_ids: [],
              }
            : undefined,
          confirmation: request.confirmation,
        });
        const nextState = result.output.state;
        const projected = await projectSessionCode(domainPack, nextState);
        commitVisibleState(nextState, projected.code, projected.attested_hash);
        setTurnReceipt(result.attested_hash);
      } catch (turnError) {
        setError(describeError(turnError));
      } finally {
        turnLocked.current = false;
        setBusy(false);
      }
    },
    [bootStatus, commitVisibleState],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = transcript.trim();
    if (!text || turnLocked.current) return;
    setTranscript('');
    void submitTurn({ text });
  }

  function reset(): void {
    if (turnLocked.current) return;
    localStorage.removeItem(storageKey);
    stateRef.current = undefined;
    setState(undefined);
    setCode(null);
    setTranscript('');
    setTurnReceipt('');
    setCodeReceipt('');
    setError('');
  }

  const pendingTrack = state?.pending_confirmation;
  const currentTrack = useMemo(() => {
    const id =
      state?.committed_track ??
      state?.hypotheses.find((item) => !item.eliminated && item.score > 0)?.id;
    return state?.hypotheses.find((item) => item.id === id)?.label ?? 'Undetermined';
  }, [state]);

  const recentObservations = useMemo(() => state?.observations.slice(-8) ?? [], [state]);
  const editorSource =
    code?.source ??
    '# wasm4pm-cognition has not selected an implementation track yet.\n# Continue the interview to accumulate admissible evidence.\n';
  const controlsDisabled = bootStatus !== 'ready' || busy;

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">WASM4PM COGNITION</p>
          <h1>Interview Code Projection</h1>
        </div>
        <div className="status-cluster">
          <span className="interview-clock" aria-label="Interview clock">
            {visibleClock()}
          </span>
          <span className={`kernel-status ${bootStatus === 'ready' ? 'ready' : ''}`}>
            {bootStatus === 'ready'
              ? 'WASM ready'
              : bootStatus === 'loading'
                ? 'WASM loading'
                : 'WASM unavailable'}
          </span>
          <button type="button" className="ghost-button" onClick={reset} disabled={controlsDisabled}>
            Reset
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="grid">
        <aside className="cognition-panel">
          <section className="summary-card">
            <div>
              <span>Current track</span>
              <strong>{currentTrack}</strong>
            </div>
            <div>
              <span>Phase</span>
              <strong>{state?.phase.replaceAll('_', ' ') ?? 'uninitialized'}</strong>
            </div>
            <div>
              <span>Turn</span>
              <strong>{state?.turn ?? 0}</strong>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <h2>Ranked hypotheses</h2>
              <span>{state?.committed_track ? 'committed' : 'evaluating'}</span>
            </div>
            <div className="hypothesis-list">
              {(state?.hypotheses ?? []).map((hypothesis) => (
                <article
                  className="hypothesis"
                  key={hypothesis.id}
                  data-eliminated={hypothesis.eliminated}
                >
                  <div className="hypothesis-title">
                    <span>{hypothesis.label}</span>
                    <strong>{percent(hypothesis.score)}</strong>
                  </div>
                  <div className="meter">
                    <span style={{ width: percent(hypothesis.score) }} />
                  </div>
                  <small>
                    support {percent(hypothesis.support)} · contradiction{' '}
                    {percent(hypothesis.contradiction)}
                  </small>
                </article>
              ))}
              {!state?.hypotheses.length ? <p className="empty">No evidence admitted yet.</p> : null}
            </div>
          </section>

          <section className="concept-grid">
            <div>
              <h2>Covered</h2>
              <ul>
                {(state?.covered_concepts ?? []).map((concept) => (
                  <li key={concept}>✓ {domainPack.concepts[concept]?.label ?? concept}</li>
                ))}
                {!state?.covered_concepts.length ? <li className="empty">None</li> : null}
              </ul>
            </div>
            <div>
              <h2>Missing</h2>
              <ul>
                {(state?.missing_concepts ?? []).map((concept) => (
                  <li key={concept} title={domainPack.concepts[concept]?.prompt}>
                    ○ {domainPack.concepts[concept]?.label ?? concept}
                  </li>
                ))}
                {!state?.missing_concepts.length ? <li className="empty">None</li> : null}
              </ul>
            </div>
          </section>

          {pendingTrack ? (
            <section className="confirmation-card">
              <p>
                Commit{' '}
                {state?.hypotheses.find((item) => item.id === pendingTrack)?.label ?? pendingTrack}?
              </p>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    void submitTurn({
                      confirmation: { track_id: pendingTrack, accepted: true },
                    })
                  }
                  disabled={controlsDisabled}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void submitTurn({
                      confirmation: { track_id: pendingTrack, accepted: false },
                    })
                  }
                  disabled={controlsDisabled}
                >
                  No
                </button>
              </div>
            </section>
          ) : null}

          <form className="transcript-form" onSubmit={onSubmit}>
            <label htmlFor="transcript">Admit transcript observation</label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="I would keep x and y, use a dictionary of moves, and process each command once…"
              rows={5}
              disabled={controlsDisabled}
            />
            <button type="submit" disabled={controlsDisabled || !transcript.trim()}>
              {busy ? 'Processing…' : 'Admit observation'}
            </button>
          </form>

          <section className="panel-section transcript-history" aria-label="Admitted transcript">
            <div className="section-heading">
              <h2>Admitted transcript</h2>
              <span>{state?.observations.length ?? 0} observations</span>
            </div>
            {recentObservations.length ? (
              <ol>
                {recentObservations.map((observation) => (
                  <li key={observation.id}>
                    <strong>{observation.source}</strong>
                    <span>{observation.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">No transcript admitted yet.</p>
            )}
          </section>
        </aside>

        <section className="editor-panel">
          <div className="editor-header">
            <div>
              <span className="file-name">{code?.filename ?? 'pending_selection.py'}</span>
              <span className="selection-status">
                {code?.selection_status.replaceAll('_', ' ') ?? 'no selection'}
              </span>
            </div>
            <div className="hash-group">
              <span>source</span>
              <code>{code?.source_hash.slice(0, 16) ?? '—'}</code>
              <span>code receipt</span>
              <code>{codeReceipt.slice(0, 16) || '—'}</code>
              <span>turn receipt</span>
              <code>{turnReceipt.slice(0, 16) || '—'}</code>
            </div>
          </div>
          <div className="editor-frame">
            <MonacoEditor
              path={code?.filename ?? 'pending_selection.py'}
              language="python"
              value={editorSource}
              theme="vs-dark"
              height="100%"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 15,
                lineHeight: 24,
                fontLigatures: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderLineHighlight: 'none',
                padding: { top: 18, bottom: 18 },
              }}
            />
          </div>
          <footer className="editor-footer">
            <span>Python selected by replay-verified Rust/WASM cognition</span>
            <span>{code ? `${code.track_label} · ${code.language}` : 'Awaiting evidence'}</span>
          </footer>
        </section>
      </section>
    </main>
  );
}
