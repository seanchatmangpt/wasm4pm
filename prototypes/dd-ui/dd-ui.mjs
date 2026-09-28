const AVATARS = new Set(["CEO", "CFO", "CTO", "ENGINEER"]);
const CONTEXTS = new Set(["normal", "incident", "board"]);
const CLAIM_STANDING = new Set(["UNKNOWN", "OBSERVED", "FORECAST", "DERIVED", "VERIFIED", "RECEIPTED"]);

export class DduiRefusal extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "DduiRefusal";
    this.code = code;
    this.detail = detail;
  }
}

function compareId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

export function normalizeInput(input) {
  if (!input || typeof input !== "object") throw new DduiRefusal("REFUSED_INVALID_INPUT", "input must be an object");
  if (!AVATARS.has(input.avatar)) throw new DduiRefusal("REFUSED_UNKNOWN_AVATAR", String(input.avatar));
  if (!CONTEXTS.has(input.context)) throw new DduiRefusal("REFUSED_UNKNOWN_CONTEXT", String(input.context));
  const authority = [...new Set(input.authority ?? [])].sort();
  const events = [...(input.events ?? [])].map((e) => ({ ...e })).sort((a, b) =>
    String(a.at).localeCompare(String(b.at)) || compareId(a, b)
  );
  return {
    grammarVersion: input.grammarVersion ?? "dd-ui/1",
    avatar: input.avatar,
    context: input.context,
    authority,
    events,
  };
}

export function reduceProcess(events) {
  const claims = new Map();
  const processTrace = [];
  for (const event of events) {
    processTrace.push({ id: event.id, at: event.at, type: event.type, objectId: event.objectId ?? null });
    switch (event.type) {
      case "claim.observed": {
        const claim = { ...event.claim };
        if (!claim.id || !claim.title || !CLAIM_STANDING.has(claim.standing ?? "UNKNOWN")) {
          throw new DduiRefusal("REFUSED_INVALID_CLAIM", event.id);
        }
        claims.set(claim.id, { materiality: 0, roles: [], contexts: [], metrics: [], actions: [], ...claim });
        break;
      }
      case "claim.standing": {
        const current = claims.get(event.objectId);
        if (!current) throw new DduiRefusal("REFUSED_UNKNOWN_CLAIM", String(event.objectId));
        if (!CLAIM_STANDING.has(event.standing)) throw new DduiRefusal("REFUSED_INVALID_STANDING", String(event.standing));
        claims.set(event.objectId, { ...current, standing: event.standing });
        break;
      }
      case "claim.metric": {
        const current = claims.get(event.objectId);
        if (!current) throw new DduiRefusal("REFUSED_UNKNOWN_CLAIM", String(event.objectId));
        claims.set(event.objectId, { ...current, metrics: [...current.metrics, { ...event.metric }] });
        break;
      }
      default:
        throw new DduiRefusal("REFUSED_UNKNOWN_EVENT", String(event.type));
    }
  }
  return { claims: [...claims.values()].sort(compareId), processTrace };
}

const ROLE_COMPONENTS = {
  CEO: ["ExecutiveSummary", "KPI", "Risk", "Decision", "Opportunity", "Forecast", "ClaimBadge"],
  CFO: ["FinancialSummary", "KPI", "Variance", "Risk", "Decision", "Forecast", "ClaimBadge"],
  CTO: ["TechnologyStanding", "KPI", "Standing", "Dependency", "Decision", "Evidence", "ClaimBadge"],
  ENGINEER: ["WorkQueue", "Standing", "Dependency", "Evidence", "Receipt", "ClaimBadge"],
};

const CONTEXT_PRIORITY = {
  normal: { Risk: 20, Decision: 15, Opportunity: 10, Forecast: 5 },
  incident: { Risk: 100, Dependency: 90, Standing: 80, Decision: 70, Evidence: 60 },
  board: { ExecutiveSummary: 100, FinancialSummary: 100, KPI: 90, Forecast: 80, Risk: 70, Decision: 60 },
};

function componentForClaim(claim, avatar) {
  const kind = claim.kind ?? "KPI";
  if (ROLE_COMPONENTS[avatar].includes(kind)) return kind;
  if (claim.standing === "UNKNOWN" || claim.standing === "OBSERVED") return ROLE_COMPONENTS[avatar].includes("Standing") ? "Standing" : "ClaimBadge";
  return ROLE_COMPONENTS[avatar].includes("KPI") ? "KPI" : "ClaimBadge";
}

function actionProjection(action, authority) {
  const required = action.requiredAuthority ?? null;
  const consequence = action.consequence ?? "SELECT";
  if (consequence === "DO" && (!required || !String(required).startsWith("brce:"))) {
    return { refused: { code: "REFUSED_DIRECT_DO", actionId: action.id } };
  }
  if (required && !authority.includes(required)) {
    return { refused: { code: "REFUSED_AUTHORITY_MISSING", actionId: action.id, requiredAuthority: required } };
  }
  return {
    action: {
      id: action.id,
      label: action.label,
      consequence,
      intentOnly: true,
      requiredAuthority: required,
    },
  };
}

export function projectDeterministicUi(rawInput) {
  const input = normalizeInput(rawInput);
  const world = reduceProcess(input.events);
  const refusals = [];

  const visible = world.claims
    .filter((claim) => claim.roles.length === 0 || claim.roles.includes(input.avatar))
    .filter((claim) => claim.contexts.length === 0 || claim.contexts.includes(input.context))
    .map((claim) => {
      const actions = [];
      for (const candidate of [...claim.actions].sort(compareId)) {
        const projected = actionProjection(candidate, input.authority);
        if (projected.refused) refusals.push({ claimId: claim.id, ...projected.refused });
        if (projected.action) actions.push(projected.action);
      }
      const component = componentForClaim(claim, input.avatar);
      return {
        id: claim.id,
        component,
        title: claim.title,
        standing: claim.standing,
        businessImpact: claim.businessImpact ?? null,
        metrics: [...claim.metrics].sort((a, b) => String(a.id).localeCompare(String(b.id))),
        actions,
        materiality: Number(claim.materiality ?? 0),
        priority: Number(CONTEXT_PRIORITY[input.context][component] ?? 0),
      };
    })
    .sort((a, b) => b.priority - a.priority || b.materiality - a.materiality || compareId(a, b));

  const screen = {
    schema: "https://chatmangpt.com/wasm4pm/dd-ui/screen/v1",
    grammarVersion: input.grammarVersion,
    avatar: input.avatar,
    context: input.context,
    title: input.context === "incident" ? "Executive incident view" : input.context === "board" ? "Board operating view" : `${input.avatar} operating view`,
    components: visible.map(({ priority, materiality, ...component }) => component),
    refusals: refusals.sort((a, b) => String(a.claimId).localeCompare(String(b.claimId)) || String(a.actionId).localeCompare(String(b.actionId))),
    process: ["observe", "admit", "project", "render", "intent", "receipt", "replay"],
  };

  return { input, world, screen };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalJson(value) {
  return canonical(value);
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function manufactureUiReceipt(rawInput) {
  const projection = projectDeterministicUi(rawInput);
  const inputDigest = await sha256(projection.input);
  const screenDigest = await sha256(projection.screen);
  return {
    ...projection,
    receipt: {
      schema: "https://chatmangpt.com/wasm4pm/dd-ui/receipt/v1",
      projection: "UI_t=P(G_t,alpha,kappa,rho)",
      inputDigest,
      screenDigest,
      avatar: projection.input.avatar,
      context: projection.input.context,
      grammarVersion: projection.input.grammarVersion,
      directActuation: false,
    },
  };
}

export async function replayUi(receiptBundle) {
  const replay = await manufactureUiReceipt(receiptBundle.input);
  return {
    match: replay.receipt.inputDigest === receiptBundle.receipt.inputDigest && replay.receipt.screenDigest === receiptBundle.receipt.screenDigest,
    expected: receiptBundle.receipt.screenDigest,
    actual: replay.receipt.screenDigest,
  };
}
