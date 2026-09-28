export const DDUI_GRAMMAR_VERSION = "dd-ui/2";

export const COMPONENTS = Object.freeze({
  ExecutiveSummary: { family: "summary", rank: 100, regions: ["hero", "main"] },
  FinancialSummary: { family: "summary", rank: 100, regions: ["hero", "main"] },
  TechnologyStanding: { family: "summary", rank: 100, regions: ["hero", "main"] },
  WorkQueue: { family: "queue", rank: 90, regions: ["hero", "main"] },
  KPI: { family: "performance", rank: 80, regions: ["main", "secondary"] },
  Variance: { family: "performance", rank: 82, regions: ["main", "secondary"] },
  Risk: { family: "attention", rank: 95, regions: ["attention", "main"] },
  Decision: { family: "attention", rank: 96, regions: ["attention", "main"] },
  Opportunity: { family: "attention", rank: 75, regions: ["main", "secondary"] },
  Forecast: { family: "performance", rank: 76, regions: ["main", "secondary"] },
  Standing: { family: "system", rank: 84, regions: ["main", "secondary"] },
  Dependency: { family: "system", rank: 92, regions: ["attention", "main"] },
  Evidence: { family: "evidence", rank: 60, regions: ["evidence", "secondary"] },
  Receipt: { family: "evidence", rank: 58, regions: ["evidence", "secondary"] },
  ClaimBadge: { family: "evidence", rank: 50, regions: ["secondary", "evidence"] },
});

export const AVATAR_PROFILES = Object.freeze({
  CEO: { label: "Chief Executive Officer", allowed: ["ExecutiveSummary", "KPI", "Risk", "Decision", "Opportunity", "Forecast", "ClaimBadge"], preferred: ["ExecutiveSummary", "Decision", "Risk", "KPI", "Forecast", "Opportunity", "ClaimBadge"], metricVocabulary: ["business", "financial", "delivery"] },
  CFO: { label: "Chief Financial Officer", allowed: ["FinancialSummary", "KPI", "Variance", "Risk", "Decision", "Forecast", "ClaimBadge"], preferred: ["FinancialSummary", "Variance", "Forecast", "Decision", "Risk", "KPI", "ClaimBadge"], metricVocabulary: ["financial", "business"] },
  CTO: { label: "Chief Technology Officer", allowed: ["TechnologyStanding", "KPI", "Standing", "Dependency", "Decision", "Evidence", "ClaimBadge"], preferred: ["TechnologyStanding", "Dependency", "Standing", "Decision", "Evidence", "KPI", "ClaimBadge"], metricVocabulary: ["technology", "delivery", "evidence"] },
  ENGINEER: { label: "Engineer", allowed: ["WorkQueue", "Standing", "Dependency", "Evidence", "Receipt", "ClaimBadge"], preferred: ["WorkQueue", "Dependency", "Standing", "Evidence", "Receipt", "ClaimBadge"], metricVocabulary: ["technology", "evidence"] },
  AUDITOR: { label: "Auditor", allowed: ["Standing", "Evidence", "Receipt", "Risk", "ClaimBadge"], preferred: ["Receipt", "Evidence", "Standing", "Risk", "ClaimBadge"], metricVocabulary: ["evidence", "financial", "technology"] },
});

export const CONTEXT_PROFILES = Object.freeze({
  normal: { label: "Operating", priorities: { Decision: 45, Risk: 40, KPI: 35, Variance: 34, Dependency: 33, Forecast: 30, Opportunity: 25 } },
  incident: { label: "Incident", priorities: { Risk: 100, Dependency: 95, Standing: 90, Decision: 85, Evidence: 75, Receipt: 70 } },
  board: { label: "Board", priorities: { ExecutiveSummary: 100, FinancialSummary: 100, TechnologyStanding: 95, KPI: 90, Variance: 88, Forecast: 85, Risk: 80, Decision: 75 } },
  audit: { label: "Audit", priorities: { Receipt: 100, Evidence: 95, Standing: 90, Risk: 80, Dependency: 75, ClaimBadge: 70 } },
});

export const CLAIM_STANDING = Object.freeze(["UNKNOWN", "OBSERVED", "FORECAST", "DERIVED", "VERIFIED", "RECEIPTED"]);
export const SYSTEM_STANDING = Object.freeze(["UNKNOWN", "PARTIAL_ALIVE", "ALIVE", "BLOCKED", "BUILD_BROKEN", "UNSUPPORTED"]);
export const CONSEQUENCES = Object.freeze(["SELECT", "CONSTRUCT", "DO"]);
export const DOMAINS = Object.freeze(["GGEN", "IAAS", "PAAS", "SAAS", "PROCESS", "GOVERNANCE"]);

export const STANDING_TO_EXECUTIVE = Object.freeze({ UNKNOWN: "ATTENTION", OBSERVED: "ATTENTION", FORECAST: "ON_PLAN", DERIVED: "ON_PLAN", VERIFIED: "ON_PLAN", RECEIPTED: "ON_PLAN", PARTIAL_ALIVE: "ATTENTION", ALIVE: "ON_PLAN", BLOCKED: "ACTION_REQUIRED", BUILD_BROKEN: "ACTION_REQUIRED", UNSUPPORTED: "ATTENTION" });

export function grammarDescriptor() {
  return { version: DDUI_GRAMMAR_VERSION, components: Object.keys(COMPONENTS).sort(), avatars: Object.keys(AVATAR_PROFILES).sort(), contexts: Object.keys(CONTEXT_PROFILES).sort(), claimStanding: [...CLAIM_STANDING], systemStanding: [...SYSTEM_STANDING], consequences: [...CONSEQUENCES], domains: [...DOMAINS], runtimeAiRenderAuthority: false, renderActuationAuthority: false };
}
