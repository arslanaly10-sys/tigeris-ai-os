import { describe, expect, it } from 'vitest';
import { definitionIri, evaluateRule, registryJsonLd, ruleIri, systemDefinitions } from './semantic';

describe('system definitions', () => {
  it('register every engine metric, situation measure and sector indicator once, with its version', () => {
    const defs = systemDefinitions();
    const keys = defs.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        'scenario:nav_at_risk_peak',
        'situation:route_dependent_holdings',
        'sector:utility_assets:min_fuel_buffer',
        'sector:counterparty_exposures:over_limit',
      ]),
    );
    expect(defs.every((d) => d.version && d.formula && d.source)).toBe(true);
  });
});

describe('rule evaluation (semantic-rules 1.0.0)', () => {
  const max = { operator: '<=', threshold: 15, severity: 'breach', attentionMargin: 0.1 } as const;
  const min = { operator: '>=', threshold: 7, severity: 'breach', attentionMargin: 0 } as const;

  it('judges upper limits with headroom and an attention band', () => {
    expect(evaluateRule(max, 11)).toMatchObject({ status: 'within', headroom: 4 });
    expect(evaluateRule(max, 14)).toMatchObject({ status: 'attention', headroom: 1 });
    expect(evaluateRule(max, 15)).toMatchObject({ status: 'attention', headroom: 0 });
    expect(evaluateRule(max, 16)).toMatchObject({ status: 'breach', headroom: -1 });
  });

  it('judges lower limits, uses the rule severity, and says when nothing can be evaluated', () => {
    expect(evaluateRule(min, 9)).toMatchObject({ status: 'within', headroom: 2 });
    expect(evaluateRule(min, 5)).toMatchObject({ status: 'breach', headroom: -2 });
    expect(evaluateRule({ ...min, severity: 'attention' }, 5).status).toBe('attention');
    expect(evaluateRule(min, null)).toMatchObject({ status: 'not_evaluable', headroom: null });
  });
});

describe('JSON-LD export', () => {
  it('exports approved content only, links rules to definitions and omits approver identities', () => {
    const defs = [
      { key: 'situation:fuel_buffer_days', version: 'v1', status: 'approved', approvedBy: 'someone' },
      { key: 'term:draft_term', version: '1', status: 'draft' },
    ];
    const rules = [
      {
        key: 'M-RES-04',
        version: 1,
        subject: 'situation:fuel_buffer_days',
        status: 'approved',
        createdBy: 'x',
      },
    ];
    const doc = registryJsonLd('Demo', '2026-10-30T00:00:00.000Z', defs, rules);
    expect(doc['@context'].skos).toContain('skos');
    expect(doc.definitions).toHaveLength(1);
    expect(doc.definitions[0]).not.toHaveProperty('approvedBy');
    expect(doc.rules[0]!.subject).toBe(definitionIri('situation:fuel_buffer_days'));
    expect(doc.rules[0]!['@id']).toBe(ruleIri('M-RES-04', 1));
    expect(doc.rules[0]!).not.toHaveProperty('createdBy');
  });
});
