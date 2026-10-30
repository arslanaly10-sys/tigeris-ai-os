/**
 * Semantic registry (Phase 5A, FR-52, D-111). The institution's shared meaning: what each metric is (definition,
 * unit, formula, owner, source, jurisdiction) and the codified rules that judge it (subject, operator, threshold,
 * severity). Rule evaluation is deterministic and versioned; intervention rules (5B) and guardrails (5C) build on it.
 *
 * Engine metrics and sector indicators are registered automatically as "system" definitions, versioned with the engine
 * that computes them. Institution definitions, terms and rules are authored, approved by a second person and versioned;
 * an approved version is never edited, only superseded.
 */
import { METRICS, ENGINE } from './scenario-engine';
import {
  SECTOR_DATASETS,
  SECTOR_DATASET_DEFS,
  SECTOR_MODELS_VERSION,
  sectorIndicators,
} from './sector-models';
import type { Role } from './vocabulary';

export const SEMANTIC_VERSION = 'semantic-rules 1.0.0';
export const VOCAB_IRI = 'urn:tigeris:vocab:';

export const DEFINITION_KINDS = ['metric', 'term'] as const;
export type DefinitionKind = (typeof DEFINITION_KINDS)[number];
export const SEMANTIC_STATUSES = ['draft', 'approved', 'retired'] as const;
export type SemanticStatus = (typeof SEMANTIC_STATUSES)[number];
export const RULE_OPERATORS = ['<=', '<', '>=', '>'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];
export const RULE_SEVERITIES = ['breach', 'attention'] as const;
export type RuleSeverity = (typeof RULE_SEVERITIES)[number];

/** Who may author and who may approve semantic content. The author never approves their own version. */
export const SEMANTIC_AUTHOR_ROLES: readonly Role[] = ['analyst', 'domain_expert', 'executive'];
export const SEMANTIC_APPROVER_ROLES: readonly Role[] = ['domain_expert', 'executive'];

/**
 * Situation measures: point inputs a scenario run records about the institution itself (from evidence facts and the
 * synthetic registers), as opposed to scenario outputs. Codified mandate rules judge these.
 */
export const SITUATION_MEASURES = [
  {
    key: 'situation:route_dependent_holdings',
    label: 'Route-dependent holdings',
    unit: 'holdings',
    formula: 'Count of holdings whose value depends on transit through the Strait of Hormuz.',
  },
  {
    key: 'situation:exposed_nav_share_pct',
    label: 'Energy and shipping share of NAV',
    unit: '% of NAV',
    formula: 'Sum of energy and shipping holdings divided by net asset value.',
  },
  {
    key: 'situation:fuel_buffer_days',
    label: 'Fuel buffer before output reduction',
    unit: 'days',
    formula: 'Days of fuel on site at gas-dependent essential plants before output falls.',
  },
] as const;

export interface SystemDefinition {
  key: string;
  label: string;
  kind: 'metric';
  unit: string;
  formula: string;
  source: string;
  version: string;
}

/** Every measure the system computes or records, with the engine version that defines it. */
export function systemDefinitions(): SystemDefinition[] {
  return [
    ...METRICS.map((m) => ({
      key: `scenario:${m.key}`,
      label: m.label,
      kind: 'metric' as const,
      unit: m.unit,
      formula: m.formula,
      source: `Scenario engine ${ENGINE.key}`,
      version: ENGINE.version,
    })),
    ...SITUATION_MEASURES.map((s) => ({
      ...s,
      kind: 'metric' as const,
      source: 'Scenario run inputs (evidence facts and registers)',
      version: ENGINE.version,
    })),
    ...SECTOR_DATASETS.flatMap((d) =>
      sectorIndicators(d, []).map((i) => ({
        key: `sector:${d}:${i.key}`,
        label: i.label,
        kind: 'metric' as const,
        unit: i.unit,
        formula: i.method,
        source: `Sector models over ${SECTOR_DATASET_DEFS[d].label.toLowerCase()}`,
        version: SECTOR_MODELS_VERSION,
      })),
    ),
  ];
}

export interface RuleSpec {
  operator: RuleOperator;
  threshold: number;
  severity: RuleSeverity;
  /** Raise "attention" when within this share of the threshold on the safe side (e.g. 0.1 = 10%). */
  attentionMargin: number;
}

export interface RuleEvaluation {
  status: 'within' | 'attention' | 'breach' | 'not_evaluable';
  value: number | null;
  /** Distance to the threshold; positive on the safe side. */
  headroom: number | null;
  version: string;
}

const passes = (op: RuleOperator, v: number, t: number) =>
  op === '<=' ? v <= t : op === '<' ? v < t : op === '>=' ? v >= t : v > t;

/** Deterministic: the same rule and value always give the same result. */
export function evaluateRule(rule: RuleSpec, value: number | null): RuleEvaluation {
  if (value === null || !Number.isFinite(value))
    return { status: 'not_evaluable', value: null, headroom: null, version: SEMANTIC_VERSION };
  const upper = rule.operator === '<=' || rule.operator === '<';
  const headroom = Math.round((upper ? rule.threshold - value : value - rule.threshold) * 10_000) / 10_000;
  if (!passes(rule.operator, value, rule.threshold))
    return { status: rule.severity, value, headroom, version: SEMANTIC_VERSION };
  const band = Math.abs(rule.threshold) * rule.attentionMargin;
  return {
    status: band > 0 && headroom <= band ? 'attention' : 'within',
    value,
    headroom,
    version: SEMANTIC_VERSION,
  };
}

export const describeRule = (label: string, r: Pick<RuleSpec, 'operator' | 'threshold'>, unit: string) =>
  `${label} ${r.operator} ${r.threshold}${unit ? ` ${unit}` : ''}`;

/** The published vocabulary: a JSON-LD @context mapping registry fields to open vocabularies (SKOS, Dublin Core). */
export const SEMANTIC_CONTEXT = {
  '@version': 1.1,
  tg: VOCAB_IRI,
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dct: 'http://purl.org/dc/terms/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  Definition: 'tg:Definition',
  Rule: 'tg:Rule',
  Registry: 'tg:Registry',
  key: 'skos:notation',
  label: 'skos:prefLabel',
  description: 'skos:definition',
  version: 'dct:hasVersion',
  status: 'tg:status',
  kind: 'tg:kind',
  unit: 'tg:unit',
  formula: 'tg:formula',
  ownerRole: 'tg:ownerRole',
  source: 'dct:source',
  jurisdiction: 'dct:spatial',
  claimClass: 'tg:claimClass',
  subject: { '@id': 'tg:subject', '@type': '@id' },
  operator: 'tg:operator',
  threshold: { '@id': 'tg:threshold', '@type': 'xsd:decimal' },
  severity: 'tg:severity',
  attentionMargin: { '@id': 'tg:attentionMargin', '@type': 'xsd:decimal' },
  mandateKey: 'tg:mandate',
  rationale: 'tg:rationale',
  approvedAt: { '@id': 'dct:dateAccepted', '@type': 'xsd:dateTime' },
  publisher: 'dct:publisher',
  issued: { '@id': 'dct:issued', '@type': 'xsd:dateTime' },
  definitions: { '@id': 'tg:definition', '@container': '@set' },
  rules: { '@id': 'tg:rule', '@container': '@set' },
} as const;

export const definitionIri = (key: string) => `${VOCAB_IRI}def:${key}`;
export const ruleIri = (key: string, version: number) => `${VOCAB_IRI}rule:${key}:v${version}`;

interface ExportableDefinition {
  key: string;
  version: string;
  status: string;
}
interface ExportableRule {
  key: string;
  version: number;
  subject: string;
  status: string;
}

/**
 * Portable export of the approved registry as JSON-LD (FR-52). Only approved content is exported; identities of the
 * people who approved are left out (they are in the audit log), so the document can leave the institution.
 */
export function registryJsonLd(
  publisher: string,
  issued: string,
  definitions: readonly ExportableDefinition[],
  rules: readonly ExportableRule[],
) {
  const strip = (o: object) =>
    Object.fromEntries(
      Object.entries(o).filter(
        ([k, v]) =>
          v !== null && !['createdBy', 'approvedBy', 'evaluation', 'origin', 'subjectLabel'].includes(k),
      ),
    );
  return {
    '@context': SEMANTIC_CONTEXT,
    '@type': 'Registry',
    '@id': `${VOCAB_IRI}registry`,
    version: SEMANTIC_VERSION,
    publisher,
    issued,
    definitions: definitions
      .filter((d) => d.status === 'approved')
      .map((d) => ({ '@id': definitionIri(d.key), '@type': 'Definition', ...strip(d) })),
    rules: rules
      .filter((r) => r.status === 'approved')
      .map((r) => ({
        '@id': ruleIri(r.key, r.version),
        '@type': 'Rule',
        ...strip(r),
        subject: definitionIri(r.subject),
      })),
  };
}
