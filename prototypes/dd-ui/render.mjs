function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderMetrics(metrics) {
  if (!metrics.length) return "";
  return `<dl class="metrics">${metrics.map((m) => `<div class="metric"><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>`;
}

function renderActions(actions) {
  if (!actions.length) return `<p class="closed-loop" role="status">✓ No action required</p>`;
  return `<div class="actions" aria-label="Available intents">${actions.map((a) => `<button type="button" data-claim="${esc(a.claimId ?? "")}" data-intent="${esc(a.id)}" data-consequence="${esc(a.consequence)}">${esc(a.label)}</button>`).join("")}</div>`;
}

export function renderComponent(component) {
  const actions = component.actions.map((a) => ({ ...a, claimId: component.id }));
  return `<article class="card" data-component="${esc(component.component)}" data-claim="${esc(component.id)}" data-domain="${esc(component.domain)}" data-status="${esc(component.executiveStatus)}"><div class="card-top"><span class="eyebrow">${esc(component.domain)} · ${esc(component.component)}</span><span class="claim-badge">${esc(component.standing)}</span></div><h2>${esc(component.title)}</h2><p>${esc(component.businessImpact)}</p>${renderMetrics(component.metrics)}${renderActions(actions)}<footer>${component.owner ? `Owner: ${esc(component.owner)} · ` : ""}Evidence: ${component.evidenceCount}</footer></article>`;
}

export function renderScreen(screen, receipt = null) {
  const s = screen.summary;
  const summary = `<section class="summary-grid" aria-label="Executive summary"><div><span>On plan</span><strong>${s.onPlan}</strong></div><div><span>Attention</span><strong>${s.attention}</strong></div><div><span>Decisions required</span><strong>${s.decisionsRequired}</strong></div><div><span>Render actuation</span><strong>${s.renderActuationCount}</strong></div></section>`;
  const cards = screen.components.map(renderComponent).join("");
  const digest = receipt ? `<p class="digest">Screen receipt: <code>${esc(receipt.screenDigest)}</code></p>` : "";
  return `<header><div><div class="eyebrow">DETERMINISTIC DYNAMIC UI · ${esc(screen.contextLabel)}</div><h1>${esc(screen.title)}</h1><p class="subtitle">${esc(screen.summary.domains.join(" · "))}</p></div><div class="status">${screen.components.length} lawful projections</div></header>${summary}<section class="card-grid" aria-label="Projected business claims">${cards}</section>${digest}`;
}
