import { initCognitionBrowser } from '../../packages/cognition/src/browser.ts';
import {
  CognitionError,
  DomainPackSchema,
  SessionStateSchema,
  runSessionTurn,
  verifySessionState,
  type DomainPack,
  type SessionState,
} from '../../packages/cognition/src/index.ts';
import domainPackJson from '../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';

type TurnRequest = {
  text?: string;
  confirmation?: { track_id: string; accepted: boolean };
};

type ReceiptSnapshot = {
  turn: number;
  replayPointer: string;
  attestedHash: string;
  attestationKind: string;
};

type StoredSession = {
  format: 'wasm4pm-interview-session-v2';
  state: unknown;
  transcript?: unknown;
  receipt?: unknown;
  trace?: unknown;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
};

const element = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
};

const currentTrack = element('current-track');
const phase = element('phase');
const transcript = element('transcript');
const hypotheses = element('hypotheses');
const covered = element('covered');
const missing = element('missing');
const evidence = element('evidence');
const confirmation = element('confirmation');
const confirmationCopy = element('confirmation-copy');
const receipt = element('receipt');
const trace = element('trace');
const kernelStatus = element('kernel-status');
const operationStatus = element('operation-status');
const listenButton = element<HTMLButtonElement>('listen');
const stopButton = element<HTMLButtonElement>('stop');
const resetButton = element<HTMLButtonElement>('reset');
const manualForm = element<HTMLFormElement>('manual-form');
const manualText = element<HTMLInputElement>('manual-text');
const admitButton = element<HTMLButtonElement>('admit');
const yesButton = element<HTMLButtonElement>('confirm-yes');
const noButton = element<HTMLButtonElement>('confirm-no');

let domainPack: DomainPack | undefined;
let storageKey = '';
let state: SessionState | undefined;
let latestTranscript = '';
let latestReceipt: ReceiptSnapshot | undefined;
let latestTrace: unknown[] = [];
let observationSequence = 0;
let ready = false;
let listening = false;
let queuedTurns = 0;
let turnQueue: Promise<void> = Promise.resolve();

const SpeechRecognition = (
  globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
).SpeechRecognition ??
  (
    globalThis as typeof globalThis & {
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
  ).webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : undefined;

function setKernelStatus(message: string, status: 'loading' | 'ready' | 'error'): void {
  kernelStatus.textContent = message;
  kernelStatus.dataset.state = status;
}

function setOperationStatus(message = '', status?: 'busy' | 'error'): void {
  operationStatus.textContent = message;
  if (status) operationStatus.dataset.state = status;
  else delete operationStatus.dataset.state;
}

function updateControls(): void {
  const busy = queuedTurns > 0;
  manualText.disabled = !ready || busy;
  admitButton.disabled = !ready || busy;
  yesButton.disabled = !ready || busy;
  noButton.disabled = !ready || busy;
  resetButton.disabled = busy;
  listenButton.disabled = !ready || !recognition || listening;
  stopButton.disabled = !ready || !recognition || !listening;
}

function parseReceipt(value: unknown): ReceiptSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<ReceiptSnapshot>;
  if (
    !Number.isSafeInteger(candidate.turn) ||
    typeof candidate.replayPointer !== 'string' ||
    typeof candidate.attestedHash !== 'string' ||
    typeof candidate.attestationKind !== 'string'
  ) {
    return undefined;
  }
  return candidate as ReceiptSnapshot;
}

function clearStoredSession(message?: string): void {
  if (storageKey) localStorage.removeItem(storageKey);
  state = undefined;
  latestTranscript = '';
  latestReceipt = undefined;
  latestTrace = [];
  observationSequence = 0;
  if (message) setOperationStatus(message, 'error');
}

function loadStoredSession(): void {
  if (!storageKey) return;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const decoded = JSON.parse(raw) as StoredSession;
    if (decoded.format !== 'wasm4pm-interview-session-v2') {
      throw new TypeError('Unsupported stored-session format.');
    }
    const parsedState = SessionStateSchema.safeParse(decoded.state);
    if (!parsedState.success) throw parsedState.error;
    state = parsedState.data;
    latestTranscript = typeof decoded.transcript === 'string' ? decoded.transcript : '';
    latestReceipt = parseReceipt(decoded.receipt);
    latestTrace = Array.isArray(decoded.trace) ? decoded.trace : [];
    observationSequence = state.observations.length;
  } catch (error) {
    console.warn('Discarding malformed persisted interview session.', error);
    clearStoredSession('Stored state was malformed and has been discarded.');
  }
}

function persistStoredSession(): void {
  if (!storageKey || !state) return;
  const snapshot: StoredSession = {
    format: 'wasm4pm-interview-session-v2',
    state,
    transcript: latestTranscript,
    receipt: latestReceipt,
    trace: latestTrace,
  };
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

function conceptSpec(id: string): { label: string; prompt: string } {
  return domainPack?.concepts[id] ?? { label: id.replaceAll('_', ' '), prompt: '' };
}

function appendEmpty(target: HTMLElement, copy: string): void {
  const item = document.createElement('p');
  item.className = 'empty-copy';
  item.textContent = copy;
  target.replaceChildren(item);
}

function renderConcepts(target: HTMLElement, ids: string[], includePrompt: boolean): void {
  target.replaceChildren();
  if (ids.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'None';
    target.append(item);
    return;
  }
  for (const id of ids) {
    const spec = conceptSpec(id);
    const item = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'concept-title';
    title.textContent = spec.label;
    item.append(title);
    if (includePrompt && spec.prompt) {
      const prompt = document.createElement('span');
      prompt.className = 'concept-prompt';
      prompt.textContent = spec.prompt;
      item.append(prompt);
    }
    target.append(item);
  }
}

function renderHypotheses(): void {
  hypotheses.replaceChildren();
  const ranked = state?.hypotheses ?? [];
  if (ranked.length === 0) {
    appendEmpty(hypotheses, 'No track evidence yet.');
    return;
  }
  for (const hypothesis of ranked) {
    const wrapper = document.createElement('div');
    wrapper.className = 'hypothesis';
    const heading = document.createElement('div');
    heading.className = 'hypothesis-head';
    const label = document.createElement('span');
    label.textContent = `${hypothesis.label}${hypothesis.eliminated ? ' · rejected' : ''}`;
    const score = document.createElement('strong');
    score.textContent = `${Math.round(hypothesis.score * 100)}%`;
    heading.append(label, score);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.round(hypothesis.score * 100)}%`;
    bar.append(fill);
    const meta = document.createElement('div');
    meta.className = 'hypothesis-meta';
    meta.textContent = `support ${Math.round(hypothesis.support * 100)}% · contradiction ${Math.round(
      hypothesis.contradiction * 100,
    )}%`;
    wrapper.append(heading, bar, meta);
    hypotheses.append(wrapper);
  }
}

function renderEvidence(): void {
  evidence.replaceChildren();
  const active = (state?.evidence ?? []).filter((item) => item.active).slice(-24).reverse();
  if (active.length === 0) {
    appendEmpty(evidence, 'No phrases matched yet.');
    return;
  }
  for (const item of active) {
    const chip = document.createElement('span');
    chip.className = 'evidence-chip';
    chip.dataset.polarity = item.polarity;
    const concept = item.concept ? conceptSpec(item.concept).label : item.proposition;
    chip.textContent = `${item.polarity === 'negative' ? '¬ ' : ''}${item.matched_phrase} · ${concept}`;
    chip.title = `observation ${item.observation_id} · pattern ${item.pattern_id}`;
    evidence.append(chip);
  }
}

function render(): void {
  const ranked = state?.hypotheses ?? [];
  const selectedId = state?.committed_track ?? ranked.find((item) => !item.eliminated && item.score > 0)?.id;
  currentTrack.textContent = ranked.find((item) => item.id === selectedId)?.label ?? 'Listening…';
  const phaseSpec = domainPack?.phases.find((item) => item.id === state?.phase);
  phase.textContent = state?.phase === 'complete' ? 'Complete' : (phaseSpec?.label ?? 'Track Identification');
  renderHypotheses();
  renderConcepts(covered, state?.covered_concepts ?? [], false);
  renderConcepts(missing, state?.missing_concepts ?? [], true);
  renderEvidence();
  const pending = state?.pending_confirmation;
  confirmation.classList.toggle('hidden', !pending);
  confirmation.dataset.track = pending ?? '';
  const pendingLabel = ranked.find((item) => item.id === pending)?.label ?? pending;
  confirmationCopy.textContent = pending ? `Commit ${pendingLabel} as the active track?` : '';
  transcript.textContent = latestTranscript || 'No transcript yet.';
  trace.textContent = JSON.stringify(latestTrace, null, 2);
  receipt.textContent = latestReceipt
    ? `turn ${latestReceipt.turn} · ${latestReceipt.replayPointer} · ${latestReceipt.attestationKind}`
    : 'No receipted turn';
  receipt.title = latestReceipt?.attestedHash ?? 'No receipted turn';
  updateControls();
}

function describeError(error: unknown): string {
  if (error instanceof CognitionError) {
    const refusal = error.details?.refusal_code;
    return refusal ? `${String(refusal)}: ${error.message}` : `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function executeTurn(request: TurnRequest): Promise<void> {
  if (!domainPack) throw new Error('Interview domain is not initialized.');
  const text = request.text?.trim();
  const observation = text
    ? {
        id: `browser-${++observationSequence}`,
        source: 'conversation',
        text,
        retract_evidence_ids: [],
      }
    : undefined;
  const result = await runSessionTurn({
    domain_pack: domainPack,
    previous_state: state,
    observation,
    confirmation: request.confirmation,
  });
  state = result.output.state;
  if (text) latestTranscript = text;
  latestReceipt = {
    turn: state.turn,
    replayPointer: result.replay_pointer,
    attestedHash: result.attested_hash,
    attestationKind: result.attestation.kind,
  };
  latestTrace = result.output.inference_trace;
  persistStoredSession();
  render();
}

function enqueueTurn(request: TurnRequest): void {
  queuedTurns += 1;
  setOperationStatus(`Processing ${queuedTurns === 1 ? 'turn' : `${queuedTurns} queued turns`}…`, 'busy');
  updateControls();
  turnQueue = turnQueue
    .then(() => executeTurn(request))
    .catch((error: unknown) => setOperationStatus(describeError(error), 'error'))
    .finally(() => {
      queuedTurns -= 1;
      if (queuedTurns === 0 && operationStatus.dataset.state === 'busy') setOperationStatus();
      updateControls();
    });
}

function resetSession(): void {
  recognition?.abort();
  clearStoredSession();
  setOperationStatus('Session reset.');
  render();
}

manualForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = manualText.value.trim();
  if (!text || !ready || queuedTurns > 0) return;
  manualText.value = '';
  enqueueTurn({ text });
});
yesButton.addEventListener('click', () => {
  const track = confirmation.dataset.track;
  if (track && ready && queuedTurns === 0) enqueueTurn({ confirmation: { track_id: track, accepted: true } });
});
noButton.addEventListener('click', () => {
  const track = confirmation.dataset.track;
  if (track && ready && queuedTurns === 0) enqueueTurn({ confirmation: { track_id: track, accepted: false } });
});
resetButton.addEventListener('click', resetSession);

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    const finalSegments: string[] = [];
    const interimSegments: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result?.[0]?.transcript.trim();
      if (!text) continue;
      if (result.isFinal) finalSegments.push(text);
      else interimSegments.push(text);
    }
    if (interimSegments.length > 0) transcript.textContent = interimSegments.join(' ');
    const finalText = finalSegments.join(' ').trim();
    if (finalText) enqueueTurn({ text: finalText });
  };
  recognition.onend = () => {
    listening = false;
    updateControls();
  };
  recognition.onerror = (event) => {
    listening = false;
    setOperationStatus(`Speech recognition error: ${event.message ?? event.error}`, 'error');
    updateControls();
  };
  listenButton.addEventListener('click', () => {
    if (!ready || listening) return;
    try {
      recognition.start();
      listening = true;
      setOperationStatus('Listening…');
      updateControls();
    } catch (error) {
      setOperationStatus(describeError(error), 'error');
    }
  });
  stopButton.addEventListener('click', () => recognition.stop());
} else {
  listenButton.textContent = 'Speech recognition unavailable';
}

async function boot(): Promise<void> {
  const parsedDomain = DomainPackSchema.safeParse(domainPackJson);
  if (!parsedDomain.success) {
    setKernelStatus('Interview ontology failed validation.', 'error');
    setOperationStatus(parsedDomain.error.message, 'error');
    return;
  }
  domainPack = parsedDomain.data;
  storageKey = `wasm4pm-interview:${domainPack.id}`;
  loadStoredSession();

  try {
    const wasmUrl = new URL(
      '../../packages/cognition/pkg-web/wasm4pm_cognition_bg.wasm',
      import.meta.url,
    );
    await initCognitionBrowser({
      wasmUrl,
      moduleLoader: () =>
        import('../../packages/cognition/pkg-web/wasm4pm_cognition.js') as Promise<unknown>,
    });
    if (state) {
      try {
        const verification = await verifySessionState(domainPack, state);
        latestReceipt = {
          turn: state.turn,
          replayPointer: verification.replay_pointer,
          attestedHash: verification.attested_hash,
          attestationKind: verification.attestation.kind,
        };
        persistStoredSession();
      } catch (error) {
        console.warn('Discarding replay-invalid persisted interview session.', error);
        clearStoredSession(`Stored state failed kernel replay and was discarded: ${describeError(error)}`);
      }
    }
    ready = true;
    setKernelStatus('Local deterministic WASM kernel ready.', 'ready');
    render();
  } catch (error) {
    ready = false;
    setKernelStatus('Local WASM kernel failed to initialize.', 'error');
    setOperationStatus(describeError(error), 'error');
    updateControls();
  }
}

void boot();
