function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderComponent(component) {
  const metrics = component.metrics.map((m) => `<div class="metric"><span>${esc(m.label)}</span><strong>${esc(m.value)}</strong></div>`).join("");
  const actions = component.actions.map((a) => `<button data-intent="${esc(a.id)}">${esc(a.label)}</button>`).join("");
  return `<article class="card" data-component="${esc(component.component)}" data-claim="${esc(component.id)}"><div class="eyebrow">${esc(component.component)} · ${esc(component.standing)}</div><h2>${esc(component.title)}</h2><p>${esc(component.businessImpact)}</p>${metrics}<div class="actions">${actions}</div></article>`;
}

export function renderScreen(screen) {
  return `<header><div><div class="eyebrow">DETERMINISTIC DYNAMIC UI</div><h1>${esc(screen.title)}</h1></div><div class="status">${screen.components.length} lawful projections</div></header>${screen.components.map(renderComponent).join("")}`;
}
