// Real server-side dispatch to the sandbox-executor adapter (TICKET-035),
// invoked from app/page.tsx and the public wpm verification command.
//
// Distinct from the pre-existing app/api/sandbox/[capability]/route.ts: that
// route only validates a capability id against a static OPERATIONS table and
// echoes `{status: "accepted"}` -- it never calls a real executor, despite
// its own name implying dispatch. This route performs the real thing: it
// calls the real, subprocess-spawning `getSandboxExecutor().execute(...)`
// (real python3/rustc/cargo child processes, no mocks).
import { NextRequest, NextResponse } from "next/server";
import { getSandboxExecutor, isExecutionRefusal, type CapabilityId } from "../../../lib/adapters/sandbox-executor";
import type { PolicyId } from "../../../lib/adapters/policy-check-adapter";
import type { TransitionReceipt } from "../../../lib/domain/receipt";

interface RunRequestBody {
  capability: CapabilityId;
  files: Record<string, string>;
  timeoutMs?: number;
  activeMode?: PolicyId;
  /** TICKET-056: immediately preceding manufacturing-chain receipt. */
  prevReceipt?: TransitionReceipt;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RunRequestBody;
  if (!body || typeof body.capability !== "string" || typeof body.files !== "object") {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const executor = getSandboxExecutor();
  const result = await executor.execute({
    capability: body.capability,
    files: body.files,
    timeoutMs: body.timeoutMs ?? 10_000,
    activeMode: body.activeMode,
    prevReceipt: body.prevReceipt,
  });
  if (isExecutionRefusal(result)) {
    return NextResponse.json({ refusal: result });
  }
  return NextResponse.json({ receipt: result });
}
