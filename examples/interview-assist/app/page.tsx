"use client";

import { useEffect, useState } from "react";
import { SessionHeader, type InputStatus } from "../components/session-header";
import { SessionWorkspace } from "../components/session-workspace";
import { SessionActivityDrawer } from "../components/session-activity-drawer";
import { SessionMenu } from "../components/session-menu";
import { ExecutionResultCard } from "../components/execution-result-card";
import { AccessibilityPreferencesDialog } from "../components/accessibility-preferences-dialog";
import { ProblemPanel } from "../components/problem-panel";
import { TrackCandidatePanel } from "../components/track-candidate-panel";
import { CognitionPanel } from "../components/cognition-panel";
import { EditorShell, type EditorShellProps } from "../components/editor-shell";
import { DiagnosticsPanel, type Diagnostic } from "../components/diagnostics-panel";
import { ConsolePanel } from "../components/console-panel";
import { RefusalPresentation } from "../components/refusal-presentation";
import { SessionSummary } from "../components/session-summary";
import { Spinner } from "../components/spinner";
import { RequestErrorNotice } from "../components/request-error-notice";
import { fetchWithTimeout, describeFetchError } from "../lib/client/fetch-with-timeout";

import { sessionReducer, type SessionState, type SessionEvent } from "../lib/domain/reducer";
import type { Phase } from "../lib/domain/phase";
import { PHASE_TRANSITIONS } from "../lib/domain/phase-transitions";
import type { ProblemState } from "../lib/domain/problem-state";
import type { TrackCandidate } from "../lib/domain/track-candidate";
import type { VerificationState } from "../lib/domain/verification-state";
import type { RefusalCode } from "../lib/domain/refusal";
import type { TransitionReceipt } from "../lib/domain/receipt";
import { ACCESSIBILITY_DEFAULTS, type AccessibilityDefaults } from "../lib/accessibility/defaults";
import { DEFAULT_ACTIVE_MODE } from "../lib/adapters/policy-check-adapter";
import type { CapabilityId } from "../lib/adapters/sandbox-executor";
import type { CognitionOutcome } from "../lib/adapters/cognition-adapter";

interface AppState extends SessionState {
  phase: Phase;
  problem: ProblemState;
  trackCandidates: TrackCandidate[];
  verification: VerificationState;
  accessibility: AccessibilityDefaults;
  diagnostics: Diagnostic[];
  stdout: string;
  stderr: string;
  exitCode?: number;
  code: string;
  usedEvents: string[];
  refusal?: { code: RefusalCode; reason?: string };
  receipt?: TransitionReceipt;
  visibleTest?: { exitCode: number; stdout: string; stderr: string };
  hiddenTest?: { exitCode: number; stdout: string; stderr: string };
}

const INITIAL_STATE: AppState = {
  phase: "CREATED",
  problem: {},
  trackCandidates: [],
  verification: {},
  accessibility: ACCESSIBILITY_DEFAULTS,
  diagnostics: [],
  stdout: "",
  stderr: "",
  code: "print('hello, interview-assist')\n",
  usedEvents: [],
};

/** UX-polish pass (timeout/retry): client-side fetchWithTimeout budgets,
 * each set comfortably above the corresponding real SERVER-side timeout
 * (sandbox-executor.ts's `ExecutionRequest.timeoutMs`, passed explicitly in
 * each request body below) so the server's own real timeout/refusal path
 * fires first under normal conditions -- these are a backstop against the
 * request never coming back at all (e.g. the dev server itself hanging),
 * not a tighter budget that would race a legitimate slow-but-successful
 * run. /api/cognition has no server-side timeoutMs (a WASM call, not a
 * subprocess), so its budget is a flat, generous default. */
const ADMISSION_TIMEOUT_MS = 10_000;
const COGNITION_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 20_000; // server-side timeoutMs below is 10_000
const TEST_TIMEOUT_MS = 25_000; // server-side timeoutMs below is 15_000
const ACCESSIBILITY_TIMEOUT_MS = 10_000;
const RECEIPT_TIMEOUT_MS = 10_000;

export default function InterviewAssistPage() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runningTest, setRunningTest] = useState<"visible" | "hidden" | null>(null);
  const [testError, setTestError] = useState<{ kind: "visible" | "hidden"; message: string } | null>(null);
  const [cognitionInputValue, setCognitionInputValue] = useState("");
  const [cognitionIntent, setCognitionIntent] = useState<string | null>(null);
  const [cognitionOutcome, setCognitionOutcome] = useState<CognitionOutcome | null>(null);
  const [cognitionSubmitting, setCognitionSubmitting] = useState(false);
  const [cognitionError, setCognitionError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<TransitionReceipt[]>([]);
  const [accessibilityDialogOpen, setAccessibilityDialogOpen] = useState(false);
  const [accessibilityError, setAccessibilityError] = useState<{
    key: keyof AccessibilityDefaults;
    value: boolean;
    message: string;
  } | null>(null);
  const [debug, setDebug] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [testTimeoutOverrideMs, setTestTimeoutOverrideMs] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDebug(params.get("debug") === "1");
    const rawTimeout = params.get("testTimeoutMs");
    const parsedTimeout = rawTimeout !== null ? Number(rawTimeout) : NaN;
    setTestTimeoutOverrideMs(Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : null);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reducedMotion = String(state.accessibility["reduced-motion-mode"]);
    root.dataset.highContrast = String(state.accessibility["high-contrast-projection"]);
    root.dataset.compactDensity = String(state.accessibility["configurable-information-density"]);
  }, [state.accessibility]);

  /** Dispatches through the real sessionReducer. `sessionReducer`'s own
   * signature types its return as AdmissionResult<SessionState> (not
   * generic over AppState) even though at runtime it only ever spreads or
   * passes through whatever state object it was given -- the `as AppState`
   * cast below reflects that real, verified behavior (see reducer.ts),
   * not an assumption. */
  function dispatch(event: SessionEvent, label: string, baseState: AppState = state): void {
    const result = sessionReducer(baseState, event);
    if (result.status === "refused") {
      setState((prev) => ({ ...prev, refusal: { code: result.code, reason: result.reason } }));
      return;
    }
    setState((prev) => ({
      ...(result.value as AppState),
      refusal: undefined,
      usedEvents: [...prev.usedEvents, label],
    }));
  }

  const nextPhases = PHASE_TRANSITIONS[state.phase] ?? [];

  function advanceTo(target: Phase): void {
    dispatch({ family: "WorkflowEvent", targetPhase: target }, `WorkflowEvent:${state.phase}->${target}`);
  }

  function refuseSession(): void {
    dispatch({ family: "SessionEvent", targetPhase: "REFUSED" }, `SessionEvent:${state.phase}->REFUSED`);
  }

  function triggerAdmissionRefusalDemo(): void {
    dispatch({ family: "NotAnAdmittedEventFamily" }, "demo:unrecognized-family");
  }

  function onEditorAction(key: string): void {
    setState((prev) => ({
      ...prev,
      diagnostics: [...prev.diagnostics, { message: `editor action: ${key}`, severity: "info" }],
    }));
    dispatch({ family: "EditorEvent", type: key }, `EditorEvent:${key}`);
  }

  const editorProps: EditorShellProps = {
    "editor/apply-deterministic-refactor": () => onEditorAction("editor/apply-deterministic-refactor"),
    "editor/create-file": () => onEditorAction("editor/create-file"),
    "editor/delete-file": () => onEditorAction("editor/delete-file"),
    "editor/display-diagnostics": () => onEditorAction("editor/display-diagnostics"),
    "editor/display-diff": () => onEditorAction("editor/display-diff"),
    "editor/format-source": () => onEditorAction("editor/format-source"),
    "editor/inspect-definition": () => onEditorAction("editor/inspect-definition"),
    "editor/inspect-references": () => onEditorAction("editor/inspect-references"),
    "editor/modify-file": () => onEditorAction("editor/modify-file"),
    "editor/navigate-symbol": () => onEditorAction("editor/navigate-symbol"),
    "editor/open-file": () => onEditorAction("editor/open-file"),
    "editor/rename-file": () => onEditorAction("editor/rename-file"),
  };

  async function runCode(): Promise<void> {
    setRunning(true);
    setRunError(null);
    try {
      const capability: CapabilityId = "execute_python";
      const res = await fetchWithTimeout(
        "/api/run",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            capability,
            files: { "solution.py": state.code },
            timeoutMs: 10_000,
            prevReceipt: receipts[receipts.length - 1],
          }),
        },
        testTimeoutOverrideMs ?? RUN_TIMEOUT_MS,
      );
      const json = (await res.json()) as {
        refusal?: { kind: string; reason?: string };
        receipt?: { stdout: string; stderr: string; exitCode: number; transitionReceipt?: TransitionReceipt };
      };
      if (json.refusal) {
        setState((prev) => ({
          ...prev,
          stdout: "",
          stderr: "",
          diagnostics: [
            ...prev.diagnostics,
            {
              message: `sandbox refused: ${json.refusal!.kind}${json.refusal!.reason ? ` (${json.refusal!.reason})` : ""}`,
              severity: "error",
            },
          ],
        }));
      } else if (json.receipt) {
        const { stdout, stderr, exitCode, transitionReceipt } = json.receipt;
        setState((prev) => ({
          ...prev,
          stdout,
          stderr,
          exitCode,
          verification: { ...prev.verification, "verification/run-example": exitCode === 0 },
          diagnostics:
            exitCode === 0
              ? prev.diagnostics
              : [...prev.diagnostics, { message: `execution exited with code ${exitCode}`, severity: "error" }],
        }));
        if (transitionReceipt) setReceipts((prev) => [...prev, transitionReceipt]);
      }
      if (state.phase === "IMPLEMENTATION") {
        dispatch({ family: "ExecutionEvent", targetPhase: "EXECUTION" }, "ExecutionEvent:run");
      }
    } catch (err) {
      setRunError(describeFetchError(err));
    } finally {
      setRunning(false);
    }
  }

  async function runTests(testKind: "visible" | "hidden"): Promise<void> {
    setRunningTest(testKind);
    setTestError(null);
    try {
      const res = await fetchWithTimeout(
        "/api/test",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            testKind,
            code: state.code,
            timeoutMs: 15_000,
            prevReceipt: receipts[receipts.length - 1],
          }),
        },
        testTimeoutOverrideMs ?? TEST_TIMEOUT_MS,
      );
      const json = (await res.json()) as {
        refusal?: { kind: string; reason?: string };
        receipt?: { stdout: string; stderr: string; exitCode: number; transitionReceipt?: TransitionReceipt };
      };
      if (json.refusal) {
        setState((prev) => ({
          ...prev,
          diagnostics: [
            ...prev.diagnostics,
            {
              message: `${testKind} tests refused: ${json.refusal!.kind}${json.refusal!.reason ? ` (${json.refusal!.reason})` : ""}`,
              severity: "error",
            },
          ],
        }));
      } else if (json.receipt) {
        const { stdout, stderr, exitCode, transitionReceipt } = json.receipt;
        const verificationKey =
          testKind === "visible" ? "verification/run-visible-test" : "verification/run-hidden-test";
        setState((prev) => ({
          ...prev,
          verification: { ...prev.verification, [verificationKey]: exitCode === 0 },
          ...(testKind === "visible"
            ? { visibleTest: { exitCode, stdout, stderr } }
            : { hiddenTest: { exitCode, stdout, stderr } }),
        }));
        if (transitionReceipt) setReceipts((prev) => [...prev, transitionReceipt]);
      }
    } catch (err) {
      setTestError({ kind: testKind, message: describeFetchError(err) });
    } finally {
      setRunningTest(null);
    }
  }

  async function submitCognitionUtterance(intentOverride?: string): Promise<void> {
    const intent = (intentOverride ?? cognitionInputValue).trim();
    if (intent.length === 0) return;
    setCognitionSubmitting(true);
    setCognitionError(null);
    try {
      let dispatchState = state;
      let prevReceipt = receipts[receipts.length - 1];

      if (prevReceipt === undefined && state.phase === "CREATED") {
        const admissionResponse = await fetchWithTimeout(
          "/api/admission",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              state,
              event: { family: "SessionEvent", targetPhase: "PREPARING" },
            }),
          },
          testTimeoutOverrideMs ?? ADMISSION_TIMEOUT_MS,
        );
        const admission = (await admissionResponse.json()) as {
          result?:
            | { status: "admitted"; value: SessionState }
            | { status: "refused"; code: RefusalCode; reason?: string };
          receipt?: TransitionReceipt;
          error?: string;
        };
        if (admission.result?.status !== "admitted" || admission.receipt === undefined) {
          const message =
            admission.result?.status === "refused"
              ? admission.result.reason ?? admission.result.code
              : admission.error ?? "admission receipt unavailable";
          setCognitionError(message);
          const refusedAdmission =
            admission.result?.status === "refused" ? admission.result : undefined;
          if (refusedAdmission !== undefined) {
            setState((prev) => ({
              ...prev,
              refusal: { code: refusedAdmission.code, reason: refusedAdmission.reason },
            }));
          }
          return;
        }

        dispatchState = admission.result.value as AppState;
        const admissionReceipt = admission.receipt;
        prevReceipt = admissionReceipt;
        setState((prev) => ({
          ...dispatchState,
          refusal: undefined,
          usedEvents: [...prev.usedEvents, "SessionEvent:CREATED->PREPARING"],
        }));
        setReceipts((prev) => [...prev, admissionReceipt]);
      }

      const res = await fetchWithTimeout(
        "/api/cognition",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intent, prevReceipt }),
        },
        testTimeoutOverrideMs ?? COGNITION_TIMEOUT_MS,
      );
      const outcome = (await res.json()) as CognitionOutcome;
      setCognitionIntent(intent);
      setCognitionOutcome(outcome);
      if (intentOverride === undefined) setCognitionInputValue("");
      if ("receipt" in outcome && outcome.receipt) setReceipts((prev) => [...prev, outcome.receipt as TransitionReceipt]);
      dispatch({ family: "SpeechEvent", type: "utterance", intent }, `SpeechEvent:${intent}`, dispatchState);
    } catch (err) {
      setCognitionError(describeFetchError(err));
    } finally {
      setCognitionSubmitting(false);
    }
  }

  function confirmCognitionProposal(): void {
    const nextPhase = PHASE_TRANSITIONS[state.phase]?.[0];
    const event: SessionEvent =
      nextPhase !== undefined
        ? { family: "HypothesisEvent", targetPhase: nextPhase }
        : { family: "HypothesisEvent" };
    dispatch(
      event,
      nextPhase !== undefined
        ? `HypothesisEvent:${state.phase}->${nextPhase}`
        : `HypothesisEvent:${state.phase}(no-transition)`,
    );
    setCognitionIntent(null);
    setCognitionOutcome(null);
  }

  function rejectCognitionProposal(): void {
    setCognitionIntent(null);
    setCognitionOutcome(null);
  }

  async function changeAccessibilityPreference(
    key: keyof AccessibilityDefaults,
    value: boolean,
  ): Promise<void> {
    setAccessibilityError(null);
    try {
      const response = await fetchWithTimeout(
        "/api/accessibility",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, value, prevReceipt: receipts[receipts.length - 1] }),
        },
        testTimeoutOverrideMs ?? ACCESSIBILITY_TIMEOUT_MS,
      );
      const json = (await response.json()) as { receipt?: TransitionReceipt; error?: string };
      if (!response.ok || json.receipt === undefined) {
        throw new Error(json.error ?? "accessibility projection receipt unavailable");
      }
      setState((prev) => ({
        ...prev,
        accessibility: { ...prev.accessibility, [key]: value },
      }));
      setReceipts((prev) => [...prev, json.receipt!]);
    } catch (err) {
      setAccessibilityError({ key, value, message: describeFetchError(err) });
    }
  }

  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the
   * real checksum-adapter (real blake3 hash, server-side) over the
   * session's recorded event labels.
   *
   * UX-polish pass: `finishing` drives SessionMenu's real busy state
   * (spinner + aria-busy + disabled on the Finish button, see that
   * component); the request itself is wrapped with a real client-side
   * timeout, and a real failure sets `finishError`, rendered with a Retry
   * affordance rather than the session silently never completing. */
  async function finishSession(): Promise<void> {
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetchWithTimeout(
        "/api/receipt",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: "interview-assist-session", used: state.usedEvents }),
        },
        testTimeoutOverrideMs ?? RECEIPT_TIMEOUT_MS,
      );
      const json = (await res.json()) as { receipt: TransitionReceipt };
      setState((prev) => ({ ...prev, receipt: json.receipt }));
    } catch (err) {
      setFinishError(describeFetchError(err));
    } finally {
      setFinishing(false);
    }
  }

  const inputStatus: InputStatus = cognitionSubmitting
    ? "processing"
    : cognitionInputValue.trim().length > 0
      ? "listening"
      : "idle";
  const canRefuse = state.phase !== "REFUSED" && state.phase !== "COMPLETE";

  return (
    <main>
      <h1>InterviewAssist</h1>

      <SessionHeader
        mode={DEFAULT_ACTIVE_MODE}
        phase={state.phase}
        inputStatus={inputStatus}
        onOpenAccessibilityPreferences={() => setAccessibilityDialogOpen(true)}
      />

      {state.refusal && <RefusalPresentation code={state.refusal.code} reason={state.refusal.reason} />}

      <SessionWorkspace
        cognition={
          <>
            <section aria-label="Observed utterance">
              <label htmlFor="cognition-intent-input">Observed utterance</label>
              <input
                id="cognition-intent-input"
                type="text"
                value={cognitionInputValue}
                onChange={(e) => setCognitionInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCognitionUtterance();
                }}
                data-testid="cognition-intent-input"
                placeholder="e.g. I have an array of numbers to search through"
              />
              <button
                type="button"
                onClick={() => void submitCognitionUtterance()}
                disabled={cognitionSubmitting || cognitionInputValue.trim().length === 0}
                aria-busy={cognitionSubmitting}
                data-testid="cognition-submit"
              >
                {cognitionSubmitting && <Spinner data-testid="cognition-submit-spinner" />}
                {cognitionSubmitting ? "Submitting..." : "Submit"}
              </button>
              {cognitionError && (
                <RequestErrorNotice
                  message={cognitionError}
                  onRetry={() => void submitCognitionUtterance()}
                  data-testid="cognition-request-error"
                />
              )}
            </section>

            {cognitionIntent !== null && cognitionOutcome !== null && (
              <CognitionPanel
                intent={cognitionIntent}
                outcome={cognitionOutcome}
                onConfirm={confirmCognitionProposal}
                onReject={rejectCognitionProposal}
                onRetryUnavailable={() => void submitCognitionUtterance(cognitionIntent)}
              />
            )}

            <section aria-label="Track candidates">
              <h3 className="region-heading">Track choices</h3>
              <TrackCandidatePanel candidates={state.trackCandidates} />
            </section>
          </>
        }
        objective={<ProblemPanel problem={state.problem} />}
        coding={
          <>
            <section aria-label="Code">
              <textarea
                data-testid="code-editor"
                value={state.code}
                onChange={(e) => setState((prev) => ({ ...prev, code: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => void runCode()}
                disabled={running}
                aria-busy={running}
                data-testid="run-code"
              >
                {running && <Spinner data-testid="run-code-spinner" />}
                {running ? "Running..." : "Run"}
              </button>
              {runError && (
                <RequestErrorNotice message={runError} onRetry={() => void runCode()} data-testid="run-code-error" />
              )}
              <button
                type="button"
                onClick={() => void runTests("visible")}
                disabled={runningTest !== null}
                aria-busy={runningTest === "visible"}
                data-testid="run-visible-tests"
              >
                {runningTest === "visible" && <Spinner data-testid="run-visible-tests-spinner" />}
                {runningTest === "visible" ? "Running visible tests..." : "Run visible tests"}
              </button>
              <button
                type="button"
                onClick={() => void runTests("hidden")}
                disabled={runningTest !== null}
                aria-busy={runningTest === "hidden"}
                data-testid="run-hidden-tests"
              >
                {runningTest === "hidden" && <Spinner data-testid="run-hidden-tests-spinner" />}
                {runningTest === "hidden" ? "Running hidden tests..." : "Run hidden tests"}
              </button>
              {testError && (
                <RequestErrorNotice
                  message={`${testError.kind === "visible" ? "Visible" : "Hidden"} tests: ${testError.message}`}
                  onRetry={() => void runTests(testError.kind)}
                  data-testid="run-tests-error"
                />
              )}
            </section>
            <EditorShell {...editorProps} />
            <DiagnosticsPanel diagnostics={state.diagnostics} />
            <ConsolePanel stdout={state.stdout} stderr={state.stderr} exitCode={state.exitCode} />
          </>
        }
        result={
          <ExecutionResultCard
            exitCode={state.exitCode}
            verification={state.verification}
            receiptCount={receipts.length}
            visibleTest={state.visibleTest}
            hiddenTest={state.hiddenTest}
          />
        }
      />

      <SessionActivityDrawer
        events={state.usedEvents}
        receipts={receipts}
        debug={debug}
        phase={state.phase}
        nextPhases={nextPhases}
        onAdvance={advanceTo}
        onTriggerAdmissionRefusalDemo={triggerAdmissionRefusalDemo}
      />

      <SessionMenu
        canRefuse={canRefuse}
        onRefuse={refuseSession}
        onFinish={() => void finishSession()}
        finishing={finishing}
      />
      {finishError && (
        <RequestErrorNotice
          message={finishError}
          onRetry={() => void finishSession()}
          data-testid="finish-session-error"
        />
      )}
      {state.receipt && <SessionSummary receipt={state.receipt} />}

      <AccessibilityPreferencesDialog
        open={accessibilityDialogOpen}
        settings={state.accessibility}
        onChange={(key, value) => void changeAccessibilityPreference(key, value)}
        onClose={() => setAccessibilityDialogOpen(false)}
      />
      {accessibilityError && (
        <RequestErrorNotice
          message={accessibilityError.message}
          onRetry={() =>
            void changeAccessibilityPreference(accessibilityError.key, accessibilityError.value)
          }
          data-testid="accessibility-request-error"
        />
      )}
    </main>
  );
}
