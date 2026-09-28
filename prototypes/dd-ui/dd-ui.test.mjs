import test from "node:test";
import assert from "node:assert/strict";
import { demoEvents, demoInput } from "./demo-data.mjs";
import { DduiRefusal, manufactureUiReceipt, projectDeterministicUi, replayUi } from "./dd-ui.mjs";

test("same admitted inputs manufacture byte-identical screen identity", async () => {
  const a = await manufactureUiReceipt(demoInput);
  const b = await manufactureUiReceipt(demoInput);
  assert.deepEqual(a.screen, b.screen);
  assert.equal(a.receipt.screenDigest, b.receipt.screenDigest);
});

test("event and authority ordering do not change projection", async () => {
  const a = await manufactureUiReceipt({ ...demoInput, authority: ["construct:repair", "brce:identity-remediation"] });
  const b = await manufactureUiReceipt({ ...demoInput, events: [...demoEvents].reverse(), authority: ["brce:identity-remediation", "construct:repair"] });
  assert.equal(a.receipt.screenDigest, b.receipt.screenDigest);
});

test("avatars project one process world instead of separate screens", () => {
  const ceo = projectDeterministicUi({ ...demoInput, avatar: "CEO" }).screen;
  const cto = projectDeterministicUi({ ...demoInput, avatar: "CTO", authority: ["construct:repair"] }).screen;
  assert.notDeepEqual(ceo.components.map((c) => c.id), cto.components.map((c) => c.id));
  assert.ok(cto.components.some((c) => c.id === "source-drift"));
});

test("incident context deterministically reprioritizes risk", () => {
  const incident = projectDeterministicUi({ ...demoInput, context: "incident" }).screen;
  assert.equal(incident.components[0].id, "identity-risk");
});

test("DO is never exposed without BRCE-shaped admitted authority", () => {
  const without = projectDeterministicUi(demoInput).screen;
  assert.equal(without.components.find((c) => c.id === "identity-risk").actions.some((a) => a.id === "approve"), false);
  assert.ok(without.refusals.some((r) => r.code === "REFUSED_AUTHORITY_MISSING"));
  const withAuthority = projectDeterministicUi({ ...demoInput, authority: ["brce:identity-remediation"] }).screen;
  assert.equal(withAuthority.components.find((c) => c.id === "identity-risk").actions.find((a) => a.id === "approve").intentOnly, true);
});

test("direct DO without BRCE authority is typed REFUSED", () => {
  const events = structuredClone(demoEvents);
  events[0].claim.actions = [{ id: "bad-do", label: "Bad", consequence: "DO", requiredAuthority: "deploy:any" }];
  const screen = projectDeterministicUi({ ...demoInput, events, authority: ["deploy:any"] }).screen;
  assert.ok(screen.refusals.some((r) => r.code === "REFUSED_DIRECT_DO"));
});

test("receipt replay reconstructs exact screen identity", async () => {
  const bundle = await manufactureUiReceipt({ ...demoInput, avatar: "CFO", context: "board" });
  const replay = await replayUi(bundle);
  assert.equal(replay.match, true);
  assert.equal(replay.expected, replay.actual);
});

test("invalid avatars fail closed", () => {
  assert.throws(() => projectDeterministicUi({ ...demoInput, avatar: "SUPERUSER" }), (error) => error instanceof DduiRefusal && error.code === "REFUSED_UNKNOWN_AVATAR");
});
