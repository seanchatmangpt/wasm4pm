import { demoInput } from "./demo-data.mjs";
import { manufactureUiReceipt } from "./dd-ui.mjs";

const avatar = document.querySelector("#avatar");
const context = document.querySelector("#context");
const authority = document.querySelector("#authority");
const root = document.querySelector("#screen");
const receipt = document.querySelector("#receipt");

function renderComponent(component) {
  const metrics = component.metrics.map((m) => `<div class="metric"><span>${m.label}</span><strong>${m.value}</strong></div>`).join("");
  const actions = component.actions.map((a) => `<button data-intent="${a.id}">${a.label}</button>`).join("");
  return `<article class="card"><div class="eyebrow">${component.component} · ${component.standing}</div><h2>${component.title}</h2><p>${component.businessImpact ?? ""}</p>${metrics}<div class="actions">${actions}</div></article>`;
}

async function update() {
  const input = { ...demoInput, avatar: avatar.value, context: context.value, authority: authority.checked ? ["brce:identity-remediation", "construct:repair"] : [] };
  const bundle = await manufactureUiReceipt(input);
  root.innerHTML = `<header><div><div class="eyebrow">DETERMINISTIC DYNAMIC UI</div><h1>${bundle.screen.title}</h1></div><div class="status">${bundle.screen.components.length} lawful projections</div></header>` + bundle.screen.components.map(renderComponent).join("");
  receipt.textContent = JSON.stringify(bundle.receipt, null, 2);
  root.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => alert(`Intent only: ${button.dataset.intent}. Rendering never actuates.`)));
}

avatar.addEventListener("change", update);
context.addEventListener("change", update);
authority.addEventListener("change", update);
update();
