import { initCognitionBrowser } from '@wasm4pm/cognition/browser';
import {
  runSessionTurn,
  type DomainPack,
  type SessionState,
  type SessionSuccessResult,
} from '@wasm4pm/cognition';
import wasmUrl from 'wasm4pm-cognition-web/wasm4pm_cognition_bg.wasm?url';
import domainPackJson from '../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';

const domainPack = domainPackJson as DomainPack;
const storageKey = `wasm4pm-interview:${domainPack.id}`;
let state: SessionState | undefined = loadState();
let observationSequence = state?.turn ?? 0;

const element = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

const currentTrack = element('current-track');
const phase = element('phase');
const transcript = element('transcript');
const hypotheses = element('hypotheses');
const covered = element('covered');
const missing = element('missing');
const confirmation = element('confirmation');
const confirmationCopy = element('confirmation-copy');
const receipt = element('receipt');
const trace = element('trace');
const listenButton = element<HTMLButtonElement>('listen');
const stopButton = element<HTMLButtonElement>('stop');
const manualForm = element<HTMLFormElement>('manual-form');
const manualText = element<HTMLInputElement>('manual-text');
const yesButton = element<HTMLButtonElement>('confirm-yes');
const noButton = element<HTMLButtonElement>('confirm-no');

function loadState(): SessionState | undefined {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    localStorage.removeItem(storageKey);
    return undefined;
  }
}

function persistState(next: SessionState): void {
  state = next;
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function render(result?: SessionSuccessResult): void {
  const projection = result?.output.projection;
  currentTrack.textContent = projection?.current_track
    ? projection.hypotheses.find((item) => item.id === projection.current_track)?.label ?? projection.current_track
    : 'Listening…';
  phase.textContent = projection?.phase_label ?? state?.phase ?? 'Track Identification';
  hypotheses.replaceChildren();
  for (const hypothesis of projection?.hypotheses ?? state?.hypotheses ?? []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'hypothesis';
    wrapper.innerHTML = `
      <div class="hypothesis-head">
        <span>${hypothesis.label}${hypothesis.eliminated ? ' · rejected' : ''}</span>
        <strong>${Math.round(hypothesis.score * 100)}%</strong>
      </div>
      <div class="bar"><span style="width:${Math.round(hypothesis.score * 100)}%"></span></div>
    `;
    hypotheses.append(wrapper);
  }

  const appendItems = (target: HTMLElement, values: string[]) => {
    target.replaceChildren(...values.map((value) => {
      const item = document.createElement('li');
      item.textContent = value.replaceAll('_', ' ');
      return item;
    }));
  };
  appendItems(covered, projection?.covered_concepts ?? state?.covered_concepts ?? []);
  appendItems(missing, projection?.missing_concepts ?? state?.missing_concepts ?? []);

  const pending = projection?.pending_confirmation ?? state?.pending_confirmation;
  confirmation.classList.toggle('hidden', !pending);
  confirmation.dataset.track = pending ?? '';
  confirmationCopy.textContent = pending
    ? `Commit ${projection?.hypotheses.find((item) => item.id === pending)?.label ?? pending} as the active track?`
    : '';

  if (result) {
    receipt.textContent = `turn ${result.output.state.turn} · ${result.replay_pointer}`;
    trace.textContent = JSON.stringify(result.output.inference_trace, null, 2);
  }
}

async function executeTurn(args: {
  text?: string;
  confirmation?: { track_id: string; accepted: boolean };
}): Promise<void> {
  observationSequence += 1;
  const result = await runSessionTurn({
    domain_pack: domainPack,
    previous_state: state,
    observation: args.text
      ? {
          id: `browser-${observationSequence}`,
          source: 'conversation',
          text: args.text,
          retract_evidence_ids: [],
        }
      : undefined,
    confirmation: args.confirmation,
  });
  persistState(result.output.state);
  if (args.text) transcript.textContent = args.text;
  render(result);
}

manualForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = manualText.value.trim();
  if (!text) return;
  manualText.value = '';
  void executeTurn({ text });
});

yesButton.addEventListener('click', () => {
  const track = confirmation.dataset.track;
  if (track) void executeTurn({ confirmation: { track_id: track, accepted: true } });
});

noButton.addEventListener('click', () => {
  const track = confirmation.dataset.track;
  if (track) void executeTurn({ confirmation: { track_id: track, accepted: false } });
});

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
};

const SpeechRecognition = (
  globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
).SpeechRecognition ?? (
  globalThis as typeof globalThis & { webkitSpeechRecognition?: SpeechRecognitionConstructor }
).webkitSpeechRecognition;

const recognition = SpeechRecognition ? new SpeechRecognition() : undefined;
if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    let interim = '';
    for (const result of Array.from(event.results)) {
      const text = result[0].transcript.trim();
      if (result.isFinal) void executeTurn({ text });
      else interim += `${text} `;
    }
    if (interim.trim()) transcript.textContent = interim.trim();
  };
  recognition.onend = () => {
    listenButton.disabled = false;
    stopButton.disabled = true;
  };
  listenButton.addEventListener('click', () => {
    recognition.start();
    listenButton.disabled = true;
    stopButton.disabled = false;
  });
  stopButton.addEventListener('click', () => recognition.stop());
} else {
  listenButton.disabled = true;
  listenButton.textContent = 'Speech recognition unavailable';
}

await initCognitionBrowser({ wasmUrl });
render();
