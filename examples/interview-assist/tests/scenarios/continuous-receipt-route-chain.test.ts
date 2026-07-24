import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as admit } from "../../app/api/admission/route";
import { POST as runCognition } from "../../app/api/cognition/route";
import { POST as runCode } from "../../app/api/run/route";
import { POST as runTests } from "../../app/api/test/route";
import { POST as projectAccessibility } from "../../app/api/accessibility/route";
import type { TransitionReceipt } from "../../lib/domain/receipt";

const TWO_SUM_SOLUTION =
  "def two_sum(nums, target):\n" +
  "    seen = {}\n" +
  "    for i, n in enumerate(nums):\n" +
  "        complement = target - n\n" +
  "        if complement in seen:\n" +
  "            return [seen[complement], i]\n" +
  "        seen[n] = i\n" +
  "    return []\n";

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectReceipt(receipt: TransitionReceipt): void {
  expect(receipt.checksum.algorithm).toBe("BLAKE3");
  expect(receipt.checksum.checksumValue).toMatch(/^[0-9a-f]{64}$/);
}

describe("TICKET-056 continuous receipt chain through real route boundaries", () => {
  it(
    "chains admission -> cognition-run -> sandbox-execution -> test-result -> accessibility-projection",
    async () => {
      const admissionResponse = await admit(
        request("/api/admission", {
          state: { phase: "CREATED" },
          event: { family: "SessionEvent", targetPhase: "PREPARING" },
        }),
      );
      expect(admissionResponse.status).toBe(200);
      const admissionBody = (await admissionResponse.json()) as {
        result: { status: "admitted"; value: { phase: string } };
        receipt: TransitionReceipt;
      };
      expect(admissionBody.result.status).toBe("admitted");
      expect(admissionBody.result.value.phase).toBe("PREPARING");
      expectReceipt(admissionBody.receipt);

      const cognitionResponse = await runCognition(
        request("/api/cognition", {
          intent: "I have an array of numbers to search through, need to find a target",
          prevReceipt: admissionBody.receipt,
        }),
      );
      expect(cognitionResponse.status).toBe(200);
      const cognitionBody = (await cognitionResponse.json()) as {
        status: "matched";
        selected: string;
        receipt: TransitionReceipt;
      };
      expect(cognitionBody.status).toBe("matched");
      expect(cognitionBody.selected).toBe("ARRAY");
      expectReceipt(cognitionBody.receipt);

      const runResponse = await runCode(
        request("/api/run", {
          capability: "execute_python",
          files: { "solution.py": `${TWO_SUM_SOLUTION}print(two_sum([2, 7, 11, 15], 9))\n` },
          timeoutMs: 10_000,
          prevReceipt: cognitionBody.receipt,
        }),
      );
      expect(runResponse.status).toBe(200);
      const runBody = (await runResponse.json()) as {
        receipt: {
          exitCode: number;
          stdout: string;
          transitionReceipt: TransitionReceipt;
        };
      };
      expect(runBody.receipt.exitCode).toBe(0);
      expect(runBody.receipt.stdout.trim()).toBe("[0, 1]");
      expectReceipt(runBody.receipt.transitionReceipt);

      const testResponse = await runTests(
        request("/api/test", {
          testKind: "visible",
          code: TWO_SUM_SOLUTION,
          timeoutMs: 20_000,
          prevReceipt: runBody.receipt.transitionReceipt,
        }),
      );
      expect(testResponse.status).toBe(200);
      const testBody = (await testResponse.json()) as {
        receipt: {
          exitCode: number;
          stdout: string;
          transitionReceipt: TransitionReceipt;
        };
      };
      expect(testBody.receipt.exitCode).toBe(0);
      expect(testBody.receipt.stdout).toMatch(/passed/);
      expectReceipt(testBody.receipt.transitionReceipt);

      const accessibilityResponse = await projectAccessibility(
        request("/api/accessibility", {
          key: "high-contrast-projection",
          value: true,
          prevReceipt: testBody.receipt.transitionReceipt,
        }),
      );
      expect(accessibilityResponse.status).toBe(200);
      const accessibilityBody = (await accessibilityResponse.json()) as {
        receipt: TransitionReceipt;
      };
      expectReceipt(accessibilityBody.receipt);

      const receipts = [
        admissionBody.receipt,
        cognitionBody.receipt,
        runBody.receipt.transitionReceipt,
        testBody.receipt.transitionReceipt,
        accessibilityBody.receipt,
      ];
      expect(receipts).toHaveLength(5);
      expect(receipts[0]!.derivedFrom).toBeUndefined();
      for (let index = 1; index < receipts.length; index += 1) {
        const previousChecksum = receipts[index - 1]!.checksum.checksumValue;
        expect(receipts[index]!.derivedFrom).toBe(previousChecksum);
        expect(receipts[index]!.relation).toBe(previousChecksum);
      }
      expect(new Set(receipts.map((receipt) => receipt.checksum.checksumValue)).size).toBe(5);
    },
    30_000,
  );

  it("refuses an unknown accessibility setting without fabricating a receipt", async () => {
    const response = await projectAccessibility(
      request("/api/accessibility", {
        key: "not-an-admitted-setting",
        value: true,
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; receipt?: unknown };
    expect(body.error).toContain("admitted accessibility setting");
    expect(body.receipt).toBeUndefined();
  });
});
