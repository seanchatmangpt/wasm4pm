from pathlib import Path

helper_path = Path(".github/agent/finish_interviewassist_ticket_056.py")
page_path = Path("examples/interview-assist/app/page.tsx")

page_text = page_path.read_text()
if "const ADMISSION_TIMEOUT_MS = 10_000;" not in page_text:
    helper_text = helper_path.read_text()
    old_argument = '    "  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the real",'
    new_argument = '''    """  function rejectCognitionProposal(): void {
    setCognitionIntent(null);
    setCognitionOutcome(null);
  }""",'''
    old_replacement = '    """  async function changeAccessibilityPreference('
    new_replacement = '''    """  function rejectCognitionProposal(): void {
    setCognitionIntent(null);
    setCognitionOutcome(null);
  }

  async function changeAccessibilityPreference('''
    if helper_text.count(old_argument) != 1 or helper_text.count(old_replacement) != 1:
        raise SystemExit("temporary page patch helper drifted")
    helper_text = helper_text.replace(old_argument, new_argument, 1)
    helper_text = helper_text.replace(old_replacement, new_replacement, 1)
    exec(compile(helper_text, str(helper_path), "exec"), {"__name__": "__main__"})

page_text = page_path.read_text()
duplicate_comment = '''  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the real

  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the
   * real checksum-adapter'''
clean_comment = '''  /** Real end-to-end receipt: POSTs to app/api/receipt, which calls the
   * real checksum-adapter'''
if page_text.count(duplicate_comment) == 1:
    page_text = page_text.replace(duplicate_comment, clean_comment, 1)
elif page_text.count(clean_comment) != 1:
    raise SystemExit("finish-session comment boundary drifted")

old_narrowing = '''          if (admission.result?.status === "refused") {
            setState((prev) => ({
              ...prev,
              refusal: { code: admission.result!.code, reason: admission.result!.reason },
            }));
          }'''
new_narrowing = '''          const refusedAdmission =
            admission.result?.status === "refused" ? admission.result : undefined;
          if (refusedAdmission !== undefined) {
            setState((prev) => ({
              ...prev,
              refusal: { code: refusedAdmission.code, reason: refusedAdmission.reason },
            }));
          }'''
if page_text.count(old_narrowing) == 1 and page_text.count(new_narrowing) == 0:
    page_text = page_text.replace(old_narrowing, new_narrowing, 1)
elif page_text.count(old_narrowing) != 0 or page_text.count(new_narrowing) != 1:
    raise SystemExit("admission refusal narrowing boundary drifted")

required_fragments = (
    "const ADMISSION_TIMEOUT_MS = 10_000;",
    "const ACCESSIBILITY_TIMEOUT_MS = 10_000;",
    "prevReceipt: receipts[receipts.length - 1]",
    "void changeAccessibilityPreference(key, value)",
    "const refusedAdmission =",
)
for fragment in required_fragments:
    if fragment not in page_text:
        raise SystemExit(f"required page fragment absent after patch: {fragment}")

page_path.write_text(page_text)
