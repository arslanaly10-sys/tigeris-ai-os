/**
 * Model gateway (D-14, CLAUDE.md §7). In the MVP the only permitted model is a deterministic stub that fills
 * versioned prose templates from cited inputs. External model calls are refused by policy, and the database
 * refuses to record one (agent_runs CHECK NOT external).
 *
 * Every draft passes a grounding check: each number in the output must appear in a cited input's display
 * value. A model drafts prose; it never produces a quantity.
 */

export const MODEL_POLICY = {
  allowExternal: false,
  defaultModel: 'tigeris-stub',
  models: { 'tigeris-stub': { version: '1.0.0', external: false } } as Record<
    string,
    { version: string; external: boolean }
  >,
} as const;

export interface Citation {
  ref: string;
  label: string;
  /** The value exactly as the prose may quote it, with its unit. */
  display: string;
}

type Cited = Record<string, Citation>;

interface Template {
  version: string;
  render: (c: Cited) => string;
}

const v = (c: Cited, ref: string) => {
  const hit = c[ref];
  if (!hit) throw new Error(`template input missing: ${ref}`);
  return hit.display;
};

/** Versioned prose templates. They may only quote cited values. */
export const TEMPLATES: Record<string, Template> = {
  'impact-summary': {
    version: '1.0.0',
    render: (c) =>
      `Under this what-if, ${v(c, 'driver:capacityLostPct')} of normal transit capacity is lost for ${v(c, 'driver:durationDays')}. ` +
      `After bypass routes ramp up, the central estimate of oil flow disrupted is ${v(c, 'metric:net_disrupted_flow:central')} ` +
      `(range ${v(c, 'metric:net_disrupted_flow:low')} to ${v(c, 'metric:net_disrupted_flow:high')}) over ${v(c, 'horizon:d90')}, ` +
      `about ${v(c, 'metric:global_share_disrupted:central')} of global liquids consumption. ` +
      `The baseline flow of ${v(c, 'fact:hormuz_oil_flow')} is sourced but not yet verified against the primary publication.`,
  },
  'bypass-note': {
    version: '1.0.0',
    render: (c) =>
      `The analyst set bypass capacity at ${v(c, 'driver:bypassMbd')}, against an assumed register range of ` +
      `${v(c, 'assumption:bypass_capacity:low')} to ${v(c, 'assumption:bypass_capacity:high')}. ` +
      `Bypass routes are assumed to take ${v(c, 'assumption:bypass_ramp_days:central')} to reach full use, ` +
      `so the first ${v(c, 'horizon:h72')} carry more disruption: ${v(c, 'metric:net_disrupted_flow:h72')} central. ` +
      `Both values are assumptions and should be challenged by a domain expert.`,
  },
  'resilience-note': {
    version: '1.0.0',
    render: (c) =>
      `Gas-dependent desalination has a fuel buffer of ${v(c, 'fact:fuel_buffer_days')}. ` +
      `With a disruption of ${v(c, 'driver:durationDays')}, the central estimate is ${v(c, 'metric:desal_reduced_output_days:central')} of reduced output ` +
      `over ${v(c, 'horizon:d90')}. Utility fuel cost rises by ${v(c, 'metric:utility_fuel_cost:central')} on average over the same horizon ` +
      `under an oil price shock of ${v(c, 'driver:oilPriceShockPct')}. The buffer and plant dependency are synthetic demonstration values.`,
  },
  'exposure-note': {
    version: '1.0.0',
    render: (c) =>
      `Energy and shipping holdings are ${v(c, 'fact:energy_shipping_nav_share')} in the synthetic exposure register, ` +
      `across ${v(c, 'fact:route_dependent_holdings')} with a Hormuz route dependency. ` +
      `While the disruption lasts, the central estimate of NAV at risk is ${v(c, 'metric:nav_at_risk_peak:central')} ` +
      `(range ${v(c, 'metric:nav_at_risk_peak:low')} to ${v(c, 'metric:nav_at_risk_peak:high')}), ` +
      `driven by the assumed valuation sensitivity of ${v(c, 'assumption:valuation_elasticity:central')}.`,
  },
  'option-rationale': {
    version: '1.0.0',
    render: (c) =>
      `${v(c, 'option:title')}. Drafted for expert review because central NAV at risk while disrupted is ` +
      `${v(c, 'metric:nav_at_risk_peak:central')} over ${v(c, 'horizon:d90')}, which the ranking rule treats as ` +
      `${v(c, 'option:severity')} severity. War-risk premium averages ${v(c, 'metric:war_risk_premium:central')} over the same horizon. ` +
      `This option would need ${v(c, 'option:authority')}; it is not a recommendation until reviewed.`,
  },
  'mandate-summary': {
    version: '1.0.0',
    render: (c) => `Checked against the mandate register: ${v(c, 'mandates:summary')}.`,
  },
  // Case analysis (slice F). Each agent's prose quotes only what it was given; lists arrive as cited displays.
  'analysis-plan': {
    version: '1.0.0',
    render: (c) =>
      `Question: ${v(c, 'case:question')} The case is at the ${v(c, 'case:state')} stage. ` +
      `Plan: ${v(c, 'plan:steps')}. Each step reads only records this case may use; a step without enough of them reports a gap instead of an answer.`,
  },
  'evidence-brief': {
    version: '1.0.0',
    render: (c) =>
      `${v(c, 'evidence:count')} linked to the case: ${v(c, 'evidence:verified')}, ${v(c, 'evidence:unverified')} and ${v(c, 'evidence:disputed')}. ` +
      `${v(c, 'evidence:freshness')}. Unverified and disputed items cannot be the sole basis of a decision.`,
  },
  'impact-trace': {
    version: '1.0.0',
    render: (c) =>
      `Traced from ${v(c, 'impact:origin')}. ${v(c, 'impact:exposed')} exposed within ${v(c, 'impact:hops')}; directly: ${v(c, 'impact:first')}. ` +
      `It relies on ${v(c, 'impact:relies')}. ${v(c, 'impact:weakest')}.`,
  },
  'scenario-brief': {
    version: '1.0.0',
    render: (c) =>
      `The latest scenario run, ${v(c, 'scenario:key')}, assumes ${v(c, 'driver:capacityLostPct')} of transit capacity lost for ${v(c, 'driver:durationDays')}. ` +
      `Central NAV at risk while disrupted is ${v(c, 'metric:nav_at_risk_peak:central')} (range ${v(c, 'metric:nav_at_risk_peak:low')} to ${v(c, 'metric:nav_at_risk_peak:high')}) over ${v(c, 'horizon:d90')}. ` +
      `The range comes from the assumption register, not from observed data.`,
  },
  'option-brief': {
    version: '1.0.0',
    render: (c) =>
      `${v(c, 'options:ranker')} drafted ${v(c, 'options:count')} for review. Leading: ${v(c, 'options:leading')}. ${v(c, 'options:basis')}. ` +
      `None is a recommendation until an analyst proposes it and a domain expert reviews it.`,
  },
  'mandate-brief': {
    version: '1.0.0',
    render: (c) =>
      `For ${v(c, 'options:leading')}: ${v(c, 'mandates:summary')}. Authority needed: ${v(c, 'options:authority')}.`,
  },
  'red-team': {
    version: '1.0.0',
    render: (c) =>
      `Against ${v(c, 'options:leading')}: the estimate it rests on, ${v(c, 'sensitivity:central')}, is most sensitive to ${v(c, 'sensitivity:top')}. ` +
      `Across that input's range (${v(c, 'sensitivity:top_low_input')} to ${v(c, 'sensitivity:top_high_input')}) the estimate moves from ${v(c, 'sensitivity:top_low')} to ${v(c, 'sensitivity:top_high')}. ` +
      `Next most sensitive: ${v(c, 'sensitivity:second')}. ${v(c, 'evidence:weakness')}. ` +
      `What would change the conclusion: evidence that pins ${v(c, 'sensitivity:top')} near either end of its range.`,
  },
  'memory-brief': {
    version: '1.0.0',
    render: (c) =>
      `${v(c, 'memory:count')} in this institution's memory concern this case's workspace. Closest: ${v(c, 'memory:closest')}. ` +
      `Precedent informs the decision; it does not make it.`,
  },
  'analysis-gap': {
    version: '1.0.0',
    render: (c) => `Gap: ${v(c, 'gap:missing')}. This step gives no answer until that is in place.`,
  },
};

/**
 * Model-provider boundary (FR-35, D-53). A local OpenAI-compatible endpoint or a hosted provider can be named in
 * configuration, but no request is ever sent while D-14 holds: the provider is reported as configured and refused.
 * Turning it on needs a decision entry, a policy change and the migration that lifts `agent_runs CHECK (NOT external)`.
 */
export interface ProviderStatus {
  active: 'tigeris-stub';
  external: { configured: boolean; endpointHost: string | null; enabled: false; reason: string };
}

export function providerStatus(endpoint: string | undefined): ProviderStatus {
  let host: string | null = null;
  try {
    host = endpoint ? new URL(endpoint).host : null;
  } catch {
    host = null;
  }
  return {
    active: 'tigeris-stub',
    external: {
      configured: host !== null,
      endpointHost: host,
      enabled: false,
      reason: MODEL_POLICY.allowExternal
        ? 'Allowed by policy'
        : 'External model calls are disabled by policy (D-14); drafts use the internal deterministic stub.',
    },
  };
}

/** Number tokens not glued to letters or hyphens, so identifiers such as M-RISK-02 are not counted. */
const NUMBER = /(?<![\w.-])\d+(?:[.,]\d+)*(?![\w-])/g;
const tokens = (text: string) => text.match(NUMBER) ?? [];

export function groundingCheck(text: string, citations: Citation[]) {
  const allowed = new Set(citations.flatMap((c) => tokens(c.display)));
  const numbers = tokens(text).map((value) => ({ value, cited: allowed.has(value) }));
  return { passed: numbers.every((n) => n.cited), numbers };
}

export interface DraftRequest {
  templateKey: string;
  citations: Citation[];
  model?: string;
}

export interface DraftResult {
  status: 'completed' | 'refused';
  modelId: string;
  modelVersion: string;
  external: false;
  templateKey: string;
  templateVersion: string;
  text: string;
  grounding: { passed: boolean; numbers: { value: string; cited: boolean }[] };
  policyDecision: string;
}

/** Draft prose through the gateway. Refuses any model other than the internal deterministic stub. */
export function draft(req: DraftRequest): DraftResult {
  const modelId = req.model ?? MODEL_POLICY.defaultModel;
  const model = MODEL_POLICY.models[modelId];
  const template = TEMPLATES[req.templateKey];
  if (!template) throw new Error(`unknown template: ${req.templateKey}`);
  if (!model || (model.external && !MODEL_POLICY.allowExternal)) {
    return {
      status: 'refused',
      modelId,
      modelVersion: model?.version ?? 'unknown',
      external: false,
      templateKey: req.templateKey,
      templateVersion: template.version,
      text: '',
      grounding: { passed: true, numbers: [] },
      policyDecision:
        'refused: only the internal deterministic stub is permitted (external model calls disabled)',
    };
  }
  const cited = Object.fromEntries(req.citations.map((c) => [c.ref, c]));
  const text = template.render(cited);
  const grounding = groundingCheck(text, req.citations);
  if (!grounding.passed) throw new Error(`grounding check failed for ${req.templateKey}`);
  return {
    status: 'completed',
    modelId,
    modelVersion: model.version,
    external: false,
    templateKey: req.templateKey,
    templateVersion: template.version,
    text,
    grounding,
    policyDecision: 'allowed: internal deterministic stub',
  };
}
