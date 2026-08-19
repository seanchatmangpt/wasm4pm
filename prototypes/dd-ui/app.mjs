import { demoInput } from "./demo-data.mjs";
import { manufactureIntentReceipt, manufactureUiReceipt, mermaidUiuxMap } from "./dd-ui.mjs";
import { renderScreen } from "./render.mjs";

const avatar = document.querySelector("#avatar");
const context = document.querySelector("#context");
const authority = document.querySelector("#authority");
const root = document.querySelector("#screen");
const receipt = document.querySelector("#receipt");
const intentReceipt = document.querySelector("#intent-receipt");
const mermaid = document.querySelector("#mermaid-spec");
let currentBundle;

async function update() {
  const admittedAuthority = authority.checked ? ["brce:identity-remediation", "construct:repair"] : [];
  currentBundle = await manufactureUiReceipt({ ...demoInput, avatar: avatar.value, context: context.value, authority: admittedAuthority });
  root.innerHTML = renderScreen(currentBundle.screen, currentBundle.receipt);
  receipt.textContent = JSON.stringify(currentBundle.receipt, null, 2);
  mermaid.textContent = mermaidUiuxMap();
  intentReceipt.textContent = "No intent manufactured.";
  root.querySelectorAll("button[data-intent]").forEach((button) => button.addEventListener("click", async () => {
    const result = await manufactureIntentReceipt(currentBundle, button.dataset.claim, button.dataset.intent);
    intentReceipt.textContent = JSON.stringify(result, null, 2);
  }));
}

avatar.addEventListener("change", update);
context.addEventListener("change", update);
authority.addEventListener("change", update);
update();
