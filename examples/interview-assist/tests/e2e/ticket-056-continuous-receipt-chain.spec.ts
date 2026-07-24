import { test, expect } from "./support";
import type { TransitionReceipt } from "../../lib/domain/receipt";

const TWO_SUM_SOLUTION =
  "def two_sum(nums, target):\n" +
  "    seen = {}\n" +
  "    for i, n in enumerate(nums):\n" +
  "        complement = target - n\n" +
  "        if complement in seen:\n" +
  "            return [seen[complement], i]\n" +
  "        seen[n] = i\n" +
  "    return []\n" +
  "\nprint(two_sum([2, 7, 11, 15], 9))\n";

function expectReceipt(receipt: TransitionReceipt): void {
  expect(receipt.checksum.algorithm).toBe("BLAKE3");
  expect(receipt.checksum.checksumValue).toMatch(/^[0-9a-f]{64}$/);
}

test("the live client preserves one five-step manufacturing receipt chain", async ({ page }) => {
  await page.goto("/");

  const admissionResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/admission") && response.request().method() === "POST",
  );
  const cognitionResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/cognition") && response.request().method() === "POST",
  );

  await page.getByTestId("cognition-intent-input").fill(
    "I have an array of numbers to search through, need to find a target",
  );
  await page.getByTestId("cognition-submit").click();

  const admissionResponse = await admissionResponsePromise;
  const cognitionResponse = await cognitionResponsePromise;
  expect(admissionResponse.status()).toBe(200);
  expect(cognitionResponse.status()).toBe(200);

  const admissionBody = (await admissionResponse.json()) as {
    receipt: TransitionReceipt;
    result: { status: string; value: { phase: string } };
  };
  const cognitionBody = (await cognitionResponse.json()) as {
    status: string;
    receipt: TransitionReceipt;
  };
  expect(admissionBody.result.status).toBe("admitted");
  expect(admissionBody.result.value.phase).toBe("PREPARING");
  expect(cognitionBody.status).toBe("matched");
  expectReceipt(admissionBody.receipt);
  expectReceipt(cognitionBody.receipt);

  await page.getByTestId("code-editor").fill(TWO_SUM_SOLUTION);
  const runResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/run") && response.request().method() === "POST",
  );
  await page.getByTestId("run-code").click();
  const runBody = (await (await runResponsePromise).json()) as {
    receipt: { exitCode: number; transitionReceipt: TransitionReceipt };
  };
  expect(runBody.receipt.exitCode).toBe(0);
  expectReceipt(runBody.receipt.transitionReceipt);

  const testResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/test") && response.request().method() === "POST",
  );
  await page.getByTestId("run-visible-tests").click();
  const testBody = (await (await testResponsePromise).json()) as {
    receipt: { exitCode: number; transitionReceipt: TransitionReceipt };
  };
  expect(testBody.receipt.exitCode).toBe(0);
  expectReceipt(testBody.receipt.transitionReceipt);

  await page.getByTestId("session-header-accessibility-button").click();
  const accessibilityResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/accessibility") && response.request().method() === "POST",
  );
  await page
    .getByTestId("accessibility-control-high-contrast-projection")
    .locator('input[type="checkbox"]')
    .check();
  const accessibilityBody = (await (await accessibilityResponsePromise).json()) as {
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
});
