from pathlib import Path

path = Path("examples/interview-assist/app/page.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match, found {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)


replace_once(
    """const COGNITION_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 20_000; // server-side timeoutMs below is 10_000
const TEST_TIMEOUT_MS = 25_000; // server-side timeoutMs below is 15_000
const RECEIPT_TIMEOUT_MS = 10_000;""",
    """const ADMISSION_TIMEOUT_MS = 10_000;
const COGNITION_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 20_000; // server-side timeoutMs below is 10_000
const TEST_TIMEOUT_MS = 25_000; // server-side timeoutMs below is 15_000
const ACCESSIBILITY_TIMEOUT_MS = 10_000;
const RECEIPT_TIMEOUT_MS = 10_000;""",
)

replace_once(
    """  const [receipts, setReceipts] = useState<TransitionReceipt[]>([]);
  const [accessibilityDialogOpen, setAccessibilityDialogOpen] = useState(false);
  const [debug, setDebug] = useState(false);""",
    """  const [receipts, setReceipts] = useState<TransitionReceipt[]>([]);
  const [accessibilityDialogOpen, setAccessibilityDialogOpen] = useState(false);
  const [accessibilityError, setAccessibilityError] = useState<{
    key: keyof AccessibilityDefaults;
    value: boolean;
    message: string;
  } | null>(null);
  const [debug, setDebug] = useState(false);""",
)

replace_once(
    """  function dispatch(event: SessionEvent, label: string): void {
    const result = sessionReducer(state, event);
    if (result.status === \"refused\") {
      setState((prev) => ({ ...prev, refusal: { code: result.code, reason: result.reason } }));
      return;
    }
    setState((prev) => ({
      ...(result.value as AppState),
      refusal: undefined,
      usedEvents: [...prev.usedEvents, label],
    }));
  }""",
    """  function dispatch(event: SessionEvent, label: string, baseState: AppState = state): void {
    const result = sessionReducer(baseState, event);
    if (result.status === \"refused\") {
      setState((prev) => ({ ...prev, refusal: { code: result.code, reason: result.reason } }));
      return;
    }
    setState((prev) => ({
      ...(result.value as AppState),
      refusal: undefined,
      usedEvents: [...prev.usedEvents, label],
    }));
  }""",
)

replace_once(
    '          body: JSON.stringify({ capability, files: { "solution.py": state.code }, timeoutMs: 10_000 }),',
    """          body: JSON.stringify({
            capability,
            files: { \"solution.py\": state.code },
            timeoutMs: 10_000,
            prevReceipt: receipts[receipts.length - 1],
          }),""",
)

replace_once(
    """  async function submitCognitionUtterance(intentOverride?: string): Promise<void> {
    const intent = (intentOverride ?? cognitionInputValue).trim();
    if (intent.length === 0) return;
    setCognitionSubmitting(true);
    setCognitionError(null);
    try {
      const res = await fetchWithTimeout(
        \"/api/cognition\",
        {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          body: JSON.stringify({ intent, prevReceipt: receipts[receipts.length - 1] }),
        },
        testTimeoutOverrideMs ?? COGNITION_TIMEOUT_MS,
      );
      const outcome = (await res.json()) as CognitionOutcome;
      setCognitionIntent(intent);
      setCognitionOutcome(outcome);
      if (intentOverride === undefined) setCognitionInputValue(\"\");
      if (\"receipt\" in outcome && outcome.receipt) setReceipts((prev) => [...prev, outcome.receipt as TransitionReceipt]);
      dispatch({ family: \"SpeechEvent\", type: \"utterance\", intent }, `SpeechEvent:${intent}`);
    } catch (err) {
      setCognitionError(describeFetchError(err));
    } finally {
      setCognitionSubmitting(false);
    }
  }""",
    """  async function submitCognitionUtterance(intentOverride?: string): Promise<void> {
    const intent = (intentOverride ?? cognitionInputValue).trim();
    if (intent.length === 0) return;
    setCognitionSubmitting(true);
    setCognitionError(null);
    try {
      let dispatchState = state;
      let prevReceipt = receipts[receipts.length - 1];

      if (prevReceipt === undefined && state.phase === \"CREATED\") {
        const admissionResponse = await fetchWithTimeout(
          \"/api/admission\",
          {
            method: \"POST\",
            headers: { \"content-type\": \"application/json\" },
            body: JSON.stringify({
              state,
              event: { family: \"SessionEvent\", targetPhase: \"PREPARING\" },
            }),
          },
          testTimeoutOverrideMs ?? ADMISSION_TIMEOUT_MS,
        );
        const admission = (await admissionResponse.json()) as {
          result?:
            | { status: \"admitted\"; value: SessionState }
            | { status: \"refused\"; code: RefusalCode; reason?: string };
          receipt?: TransitionReceipt;
          error?: string;
        };
        if (admission.result?.status !== \"admitted\" || admission.receipt === undefined) {
          const message =
            admission.result?.status === \"refused\"
              ? admission.result.reason ?? admission.result.code
              : admission.error ?? \"admission receipt unavailable\";
          setCognitionError(message);
          if (admission.result?.status === \"refused\") {
            setState((prev) => ({
              ...prev,
              refusal: { code: admission.result!.code, reason: admission.result!.reason },
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
          usedEvents: [...prev.usedEvents, \"SessionEvent:CREATED->PREPARING\"],
        }));
        setReceipts((prev) => [...prev, admissionReceipt]);
      }

      const res = await fetchWithTimeout(
        \"/api/cognition\",
        {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          body: JSON.stringify({ intent, prevReceipt }),
        },
        testTimeoutOverrideMs ?? COGNITION_TIMEOUT_MS,
      );
      const outcome = (await res.json()) as CognitionOutcome;
      setCognitionIntent(intent);
      setCognitionOutcome(outcome);
      if (intentOverride === undefined) setCognitionInputValue(\"\");
      if (\"receipt\" in outcome && outcome.receipt) setReceipts((prev) => [...prev, outcome.receipt as TransitionReceipt]);
      dispatch({ family: \"SpeechEvent\", type: \"utterance\", intent }, `SpeechEvent:${intent}`, dispatchState);
    } catch (err) {
      setCognitionError(describeFetchError(err));
    } finally {
      setCognitionSubmitting(false);
    }
  }""",
)

replace_once(
    "  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the real",
    """  async function changeAccessibilityPreference(
    key: keyof AccessibilityDefaults,
    value: boolean,
  ): Promise<void> {
    setAccessibilityError(null);
    try {
      const response = await fetchWithTimeout(
        \"/api/accessibility\",
        {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          body: JSON.stringify({ key, value, prevReceipt: receipts[receipts.length - 1] }),
        },
        testTimeoutOverrideMs ?? ACCESSIBILITY_TIMEOUT_MS,
      );
      const json = (await response.json()) as { receipt?: TransitionReceipt; error?: string };
      if (!response.ok || json.receipt === undefined) {
        throw new Error(json.error ?? \"accessibility projection receipt unavailable\");
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

  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the real""",
)

replace_once(
    """      setState((prev) => ({ ...prev, receipt: json.receipt }));
      setReceipts((prev) => [...prev, json.receipt]);""",
    "      setState((prev) => ({ ...prev, receipt: json.receipt }));",
)

replace_once(
    """        onChange={(key, value) =>
          setState((prev) => ({ ...prev, accessibility: { ...prev.accessibility, [key]: value } }))
        }""",
    "        onChange={(key, value) => void changeAccessibilityPreference(key, value)}",
)

replace_once(
    """      <AccessibilityPreferencesDialog
        open={accessibilityDialogOpen}
        settings={state.accessibility}
        onChange={(key, value) => void changeAccessibilityPreference(key, value)}
        onClose={() => setAccessibilityDialogOpen(false)}
      />
    </main>""",
    """      <AccessibilityPreferencesDialog
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
          data-testid=\"accessibility-request-error\"
        />
      )}
    </main>""",
)

path.write_text(text)
