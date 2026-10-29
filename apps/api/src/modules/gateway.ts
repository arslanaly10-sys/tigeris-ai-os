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
};

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
