// Server-side admission boundary for TICKET-056.
//
// app/page.tsx is a client component and cannot import
// lib/domain/reducer-with-receipts.ts directly because its receipt path uses
// the Node-native BLAKE3 adapter. This route executes the real reducer and
// receipt wrapper on the server so a live client flow can obtain an admission
// receipt without pulling Node-only modules into the browser bundle.
import { NextRequest, NextResponse } from "next/server";
import { admitWithReceipt } from "../../../lib/domain/reducer-with-receipts";
import type { SessionEvent, SessionState } from "../../../lib/domain/reducer";
import type { TransitionReceipt } from "../../../lib/domain/receipt";

interface AdmissionRequestBody {
  state: SessionState;
  event: SessionEvent;
  prevReceipt?: TransitionReceipt;
}

function isSessionState(value: unknown): value is SessionState {
  return typeof value === "object" && value !== null && typeof (value as { phase?: unknown }).phase === "string";
}

function isSessionEvent(value: unknown): value is SessionEvent {
  return typeof value === "object" && value !== null && typeof (value as { family?: unknown }).family === "string";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<AdmissionRequestBody> | null;
  if (!body || !isSessionState(body.state) || !isSessionEvent(body.event)) {
    return NextResponse.json(
      { error: "invalid request body: state.phase and event.family are required" },
      { status: 400 },
    );
  }

  const outcome = admitWithReceipt(body.state, body.event, body.prevReceipt);
  const status = outcome.result.status === "admitted" ? 200 : 422;
  return NextResponse.json(outcome, { status });
}
