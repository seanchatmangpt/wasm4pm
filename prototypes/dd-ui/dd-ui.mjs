import { AVATAR_PROFILES, CLAIM_STANDING, COMPONENTS, CONSEQUENCES, CONTEXT_PROFILES, DDUI_GRAMMAR_VERSION, DOMAINS, STANDING_TO_EXECUTIVE, SYSTEM_STANDING, grammarDescriptor } from "./grammar.mjs";

export class DduiRefusal extends Error {
  constructor(code, detail, evidence = {}) { super(`${code}: ${detail}`); this.name = "DduiRefusal"; this.code = code; this.detail = detail; this.evidence = evidence; }
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const uniqueSorted = (xs = []) => [...new Set(xs.map(String))].sort();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function assertEnum(value, allowed, code, label) { if (!allowed.includes(value)) throw new DduiRefusal(code, `${label}=${String(value)}`); }
function validateMetric(metric, claimId) { if (!metric || typeof metric !== "object" || !metric.id || !metric.label) throw new DduiRefusal("REFUSED_INVALID_METRIC", claimId); return { id: String(metric.id), label: String(metric.label), value: metric.value ?? null, vocabulary: metric.vocabulary ?? "business", unit: metric.unit ?? null }; }
function validateAction(action, claimId) { if (!action || typeof action !== "object" || !action.id || !action.label) throw new DduiRefusal("REFUSED_INVALID_ACTION", claimId); const consequence = action.consequence ?? "SELECT"; assertEnum(consequence, CONSEQUENCES, "REFUSED_INVALID_CONSEQUENCE", consequence); return { id: String(action.id), label: String(action.label), consequence, requiredAuthority: action.requiredAuthority ? String(action.requiredAuthority) : null, reversible: action.reversible !== false, expectedValue: action.expectedValue ?? null, cost: action.cost ?? null, risk: action.risk ?? null }; }
function normalizeClaim(claim, eventId) {
  if (!claim || typeof claim !== "object" || !claim.id || !claim.title) throw new DduiRefusal("REFUSED_INVALID_CLAIM", eventId);
  const standing = claim.standing ?? "UNKNOWN"; const systemStanding = claim.systemStanding ?? null; const domain = claim.domain ?? "PROCESS";
  assertEnum(standing, CLAIM_STANDING, "REFUSED_INVALID_STANDING", standing); if (systemStanding !== null) assertEnum(systemStanding, SYSTEM_STANDING, "REFUSED_INVALID_SYSTEM_STANDING", systemStanding); assertEnum(domain, DOMAINS, "REFUSED_UNKNOWN_DOMAIN", domain);
  return { id: String(claim.id), title: String(claim.title), kind: claim.kind ?? "KPI", standing, systemStanding, domain, materiality: number(claim.materiality), businessImpact: claim.businessImpact ?? null, owner: claim.owner ?? null, roles: uniqueSorted(claim.roles), contexts: uniqueSorted(claim.contexts), metrics: [...(claim.metrics ?? [])].map((m) => validateMetric(m, claim.id)).sort(byId), actions: [...(claim.actions ?? [])].map((a) => validateAction(a, claim.id)).sort(byId), evidence: uniqueSorted(claim.evidence) };
}

export function normalizeInput(raw) {
  if (!raw || typeof raw !== "object") throw new DduiRefusal("REFUSED_INVALID_INPUT", "input must be an object");
  if (!(raw.avatar in AVATAR_PROFILES)) throw new DduiRefusal("REFUSED_UNKNOWN_AVATAR", String(raw.avatar));
  if (!(raw.context in CONTEXT_PROFILES)) throw new DduiRefusal("REFUSED_UNKNOWN_CONTEXT", String(raw.context));
  const authority = uniqueSorted(raw.authority); const events = [...(raw.events ?? [])].map((e) => ({ ...e })).sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")) || byId(a, b)); const ids = new Set();
  for (const event of events) { if (!event.id || !event.at || !event.type) throw new DduiRefusal("REFUSED_INVALID_EVENT", JSON.stringify(event)); if (ids.has(event.id)) throw new DduiRefusal("REFUSED_DUPLICATE_EVENT_ID", String(event.id)); ids.add(event.id); }
  return { grammarVersion: raw.grammarVersion ?? DDUI_GRAMMAR_VERSION, avatar: raw.avatar, context: raw.context, authority, asOf: raw.asOf ?? null, events };
}

export function reduceProcess(events) {
  const claims = new Map(); const processTrace = [];
  for (const event of events) {
    processTrace.push({ id: event.id, at: event.at, type: event.type, objectId: event.objectId ?? event.claim?.id ?? null });
    if (event.type === "claim.observed") { claims.set(String(event.claim?.id), normalizeClaim(event.claim, event.id)); continue; }
    const id = String(event.objectId ?? ""); const current = claims.get(id); if (!current) throw new DduiRefusal("REFUSED_UNKNOWN_CLAIM", id, { eventId: event.id });
    switch (event.type) {
      case "claim.standing": assertEnum(event.standing, CLAIM_STANDING, "REFUSED_INVALID_STANDING", event.standing); claims.set(id, { ...current, standing: event.standing }); break;
      case "claim.system-standing": assertEnum(event.standing, SYSTEM_STANDING, "REFUSED_INVALID_SYSTEM_STANDING", event.standing); claims.set(id, { ...current, systemStanding: event.standing }); break;
      case "claim.metric": { const metric = validateMetric(event.metric, id); claims.set(id, { ...current, metrics: [...current.metrics.filter((m) => m.id !== metric.id), metric].sort(byId) }); break; }
      case "claim.action": { const action = validateAction(event.action, id); claims.set(id, { ...current, actions: [...current.actions.filter((a) => a.id !== action.id), action].sort(byId) }); break; }
      case "claim.removed": claims.delete(id); break;
      default: throw new DduiRefusal("REFUSED_UNKNOWN_EVENT", String(event.type));
    }
  }
  return { claims: [...claims.values()].sort(byId), processTrace };
}

function semanticCandidates(claim, avatar) {
  const allowed = AVATAR_PROFILES[avatar].allowed;
  const exact = COMPONENTS[claim.kind] && allowed.includes(claim.kind) ? [claim.kind] : [];
  const standingFallback = (claim.systemStanding || ["UNKNOWN", "OBSERVED"].includes(claim.standing)) && allowed.includes("Standing") ? ["Standing"] : [];
  const evidenceFallback = claim.evidence.length > 0 && allowed.includes("Evidence") ? ["Evidence"] : [];
  const generalFallback = allowed.includes("KPI") ? ["KPI"] : allowed.includes("ClaimBadge") ? ["ClaimBadge"] : [allowed[0]];
  return uniqueSorted([...exact, ...standingFallback, ...evidenceFallback, ...generalFallback]);
}
function candidateVector(component, claim, input) { const profile = AVATAR_PROFILES[input.avatar]; const preferenceIndex = profile.preferred.indexOf(component); return { semanticFit: component === claim.kind ? 100 : component === "ClaimBadge" ? 20 : 55, contextFit: number(CONTEXT_PROFILES[input.context].priorities[component]), avatarFit: preferenceIndex < 0 ? 0 : Math.max(1, 100 - preferenceIndex * 10), evidenceFit: ["Evidence", "Receipt", "ClaimBadge"].includes(component) ? Math.min(100, claim.evidence.length * 25 + 25) : 50, materiality: claim.materiality, grammarRank: COMPONENTS[component].rank }; }
function dominates(a, b) { const keys = Object.keys(a.vector); return keys.every((k) => a.vector[k] >= b.vector[k]) && keys.some((k) => a.vector[k] > b.vector[k]); }
export function enumerateDfcmFrontier(claim, input) {
  const candidates = semanticCandidates(claim, input.avatar).map((component) => ({ id: `${claim.id}:${component}`, component, vector: candidateVector(component, claim, input) }));
  const frontier = candidates.filter((candidate) => !candidates.some((other) => other.id !== candidate.id && dominates(other, candidate))); const score = (c) => Object.values(c.vector).reduce((a, b) => a + b, 0); const ordered = [...frontier].sort((a, b) => score(b) - score(a) || a.component.localeCompare(b.component));
  return { claimId: claim.id, candidateCount: candidates.length, candidates, frontierCount: ordered.length, frontier: ordered, selectedPresentation: ordered[0]?.component ?? null, selectionLaw: "reversible-presentation-only: max-pareto-score then lexical" };
}

function projectAction(action, authority) { if (action.consequence === "DO" && (!action.requiredAuthority || !action.requiredAuthority.startsWith("brce:"))) return { refusal: { code: "REFUSED_DIRECT_DO", actionId: action.id, requiredAuthority: action.requiredAuthority } }; if (action.requiredAuthority && !authority.includes(action.requiredAuthority)) return { refusal: { code: "REFUSED_AUTHORITY_MISSING", actionId: action.id, requiredAuthority: action.requiredAuthority } }; return { action: { ...action, intentOnly: true, selected: false } }; }
function metricProjection(claim, avatar) { const vocabulary = AVATAR_PROFILES[avatar].metricVocabulary; const preferred = claim.metrics.filter((m) => vocabulary.includes(m.vocabulary)); return (preferred.length ? preferred : claim.metrics).sort(byId); }
function regionFor(component, context) { if (context === "incident" && ["Risk", "Dependency", "Standing", "Decision"].includes(component)) return "attention"; if (context === "audit" && ["Receipt", "Evidence", "Standing"].includes(component)) return "evidence"; return COMPONENTS[component].regions[0]; }
function executiveStatus(claim, actions, refusals) { if (actions.some((a) => a.consequence === "DO") || refusals.some((r) => r.code === "REFUSED_AUTHORITY_MISSING")) return "ACTION_REQUIRED"; return STANDING_TO_EXECUTIVE[claim.systemStanding ?? claim.standing] ?? "ATTENTION"; }

export function projectDeterministicUi(rawInput) {
  const input = normalizeInput(rawInput); if (input.grammarVersion !== DDUI_GRAMMAR_VERSION) throw new DduiRefusal("REFUSED_GRAMMAR_VERSION", input.grammarVersion); const world = reduceProcess(input.events); const refusals = []; const frontiers = []; const components = [];
  for (const claim of world.claims) {
    if (claim.roles.length && !claim.roles.includes(input.avatar)) continue; if (claim.contexts.length && !claim.contexts.includes(input.context)) continue;
    const frontier = enumerateDfcmFrontier(claim, input); frontiers.push(frontier); const actions = []; const claimRefusals = [];
    for (const candidate of claim.actions) { const projected = projectAction(candidate, input.authority); if (projected.refusal) { const refusal = { claimId: claim.id, ...projected.refusal }; refusals.push(refusal); claimRefusals.push(refusal); } if (projected.action) actions.push(projected.action); }
    const component = frontier.selectedPresentation; const contextPriority = number(CONTEXT_PROFILES[input.context].priorities[component]);
    components.push({ id: claim.id, component, region: regionFor(component, input.context), domain: claim.domain, title: claim.title, standing: claim.standing, systemStanding: claim.systemStanding, executiveStatus: executiveStatus(claim, actions, claimRefusals), businessImpact: claim.businessImpact, owner: claim.owner, metrics: metricProjection(claim, input.avatar), actions: actions.sort(byId), evidenceCount: claim.evidence.length, noActionRequired: actions.length === 0, materiality: claim.materiality, contextPriority });
  }
  components.sort((a, b) => b.contextPriority - a.contextPriority || b.materiality - a.materiality || byId(a, b)); refusals.sort((a, b) => a.claimId.localeCompare(b.claimId) || a.actionId.localeCompare(b.actionId)); frontiers.sort((a, b) => a.claimId.localeCompare(b.claimId));
  const summary = { visibleClaims: components.length, decisionsRequired: components.filter((c) => c.executiveStatus === "ACTION_REQUIRED").length, attention: components.filter((c) => c.executiveStatus === "ATTENTION").length, onPlan: components.filter((c) => c.executiveStatus === "ON_PLAN").length, refusedActions: refusals.length, renderActuationCount: 0, domains: uniqueSorted(components.map((c) => c.domain)) };
  const screen = { schema: "https://chatmangpt.com/wasm4pm/dd-ui/screen/v2", grammarVersion: input.grammarVersion, avatar: input.avatar, avatarLabel: AVATAR_PROFILES[input.avatar].label, context: input.context, contextLabel: CONTEXT_PROFILES[input.context].label, title: `${AVATAR_PROFILES[input.avatar].label} · ${CONTEXT_PROFILES[input.context].label}`, summary, layout: { regions: ["hero", "attention", "main", "secondary", "evidence"], desktopColumns: input.context === "board" ? 3 : 2, mobileColumns: 1, mobileOrder: components.map((c) => c.id) }, components: components.map(({ contextPriority, materiality, ...c }) => c), refusals, dfcm: { preservedCandidates: frontiers.reduce((n, f) => n + f.candidateCount, 0), frontierCandidates: frontiers.reduce((n, f) => n + f.frontierCount, 0), irreversibleSelections: 0, frontiers }, process: ["observe", "admit", "enumerate", "prune", "project", "render", "intent", "receipt", "replay"], runtimeAiRenderAuthority: false, directActuation: false };
  return { input, world, screen };
}

function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`; return JSON.stringify(value); }
export const canonicalJson = canonical;
export async function sha256(value) { const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonical(value)); const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function manufactureUiReceipt(rawInput) { const projection = projectDeterministicUi(rawInput); const grammarDigest = await sha256(grammarDescriptor()); const worldDigest = await sha256(projection.world); const inputDigest = await sha256(projection.input); const frontierDigest = await sha256(projection.screen.dfcm); const screenDigest = await sha256(projection.screen); return { ...projection, receipt: { schema: "https://chatmangpt.com/wasm4pm/dd-ui/receipt/v2", equation: "UI_t=P(G_t,alpha,kappa,rho)", grammarDigest, worldDigest, inputDigest, frontierDigest, screenDigest, avatar: projection.input.avatar, context: projection.input.context, grammarVersion: projection.input.grammarVersion, directActuation: false, runtimeAiRenderAuthority: false } }; }
export async function replayUi(bundle) { const replay = await manufactureUiReceipt(bundle.input); const fields = ["grammarDigest", "worldDigest", "inputDigest", "frontierDigest", "screenDigest"]; const mismatches = fields.filter((field) => replay.receipt[field] !== bundle.receipt[field]); return { match: mismatches.length === 0, mismatches, expected: bundle.receipt.screenDigest, actual: replay.receipt.screenDigest }; }
export async function manufactureIntentReceipt(bundle, claimId, actionId) { const component = bundle.screen.components.find((c) => c.id === claimId); if (!component) throw new DduiRefusal("REFUSED_UNKNOWN_CLAIM", claimId); const action = component.actions.find((a) => a.id === actionId); if (!action) throw new DduiRefusal("REFUSED_UNPROJECTED_ACTION", actionId, { claimId }); const intent = { schema: "https://chatmangpt.com/wasm4pm/dd-ui/intent/v1", screenDigest: bundle.receipt.screenDigest, claimId, actionId, consequence: action.consequence, requiredAuthority: action.requiredAuthority, selectedPresentation: component.component, actuation: false }; return { intent, receipt: { intentDigest: await sha256(intent), screenDigest: bundle.receipt.screenDigest, actuation: false } }; }
export function mermaidUiuxMap() { const avatars = Object.keys(AVATAR_PROFILES).sort().map((a) => `  G --> ${a}[${a} projection]`).join("\n"); const components = Object.keys(COMPONENTS).sort().map((c) => `  Grammar --> C_${c}[${c}]`).join("\n"); return `flowchart TB\n  Events[Process / OCEL events] --> G[Admitted world G_t]\n  Context[Context kappa] --> P[Deterministic projection P]\n  Authority[Authority rho] --> P\n  Grammar[Bounded grammar ${DDUI_GRAMMAR_VERSION}] --> P\n  G --> P\n${avatars}\n${components}\n  P --> Screen[Screen IR]\n  Screen --> Intent[Intent only]\n  Intent --> BRCE[BRCE boundary]\n  BRCE --> DO[DO]\n  Screen -. no direct actuation .-> DO\n  Screen --> Receipt[Screen receipt]\n  Receipt --> Replay[Replay]\n  LLM[LLM / AGI] -. no runtime render authority .-> P`; }
