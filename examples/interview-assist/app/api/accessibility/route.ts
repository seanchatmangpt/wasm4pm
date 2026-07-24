// Server-side accessibility projection boundary for the continuous receipt chain.
//
// The admitted setting key is validated against the generated accessibility
// defaults before a real BLAKE3 transition receipt is emitted.
import { NextRequest, NextResponse } from "next/server";
import { ACCESSIBILITY_DEFAULTS, type AccessibilityDefaults } from "../../../lib/accessibility/defaults";
import { emitReceipt } from "../../../lib/domain/receipt-emitter";
import type { TransitionReceipt } from "../../../lib/domain/receipt";

interface AccessibilityProjectionRequestBody {
  key: keyof AccessibilityDefaults;
  value: boolean;
  prevReceipt?: TransitionReceipt;
}

const ACCESSIBILITY_KEYS: ReadonlySet<string> = new Set(Object.keys(ACCESSIBILITY_DEFAULTS));

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<AccessibilityProjectionRequestBody> | null;
  if (
    !body ||
    typeof body.key !== "string" ||
    !ACCESSIBILITY_KEYS.has(body.key) ||
    typeof body.value !== "boolean"
  ) {
    return NextResponse.json(
      { error: "invalid request body: key must be an admitted accessibility setting and value must be boolean" },
      { status: 400 },
    );
  }

  const receipt = emitReceipt("accessibility-projection", {
    used: [body.key, String(body.value)],
    label: `accessibility-projection: ${body.key}`,
    generated: `${body.key}=${String(body.value)}`,
    timestamp: Date.now(),
    prevReceipt: body.prevReceipt,
  });

  return NextResponse.json({ key: body.key, value: body.value, receipt });
}
