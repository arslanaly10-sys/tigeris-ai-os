import { describe, expect, it } from 'vitest';
import { evaluateWatchRule, type Observations, type WatchRuleSpec } from './interventions';
import { SEMANTIC_VERSION } from './semantic';

const now = '2026-10-30T12:00:00.000Z';
const empty: Observations = { now, semantic: [], signals: [], connectors: [], outcomes: [] };
const rule = (kind: WatchRuleSpec['kind'], params = {}): WatchRuleSpec => ({
  key: 'W-TEST',
  version: 1,
  kind,
  params,
  severity: 'attention',
});

describe('intervention engine', () => {
  it('raises codified rules at attention or breach, with the rule version and the records behind them', () => {
    const base = {
      ruleVersion: 1,
      description: 'Lowest plant fuel buffer >= 7 days',
      unit: 'days',
      classification: 'restricted' as const,
      sectorKey: 'utilities',
      caseId: null,
    };
    const ev = (status: 'within' | 'attention' | 'breach' | 'not_evaluable', value: number | null) => ({
      status,
      value,
      headroom: value === null ? null : value - 7,
      version: SEMANTIC_VERSION,
      observedFrom: 'Sector models',
      asOf: '2026-09-30',
      inputKeys: ['UA-S01'],
    });
    const findings = evaluateWatchRule(rule('semantic'), {
      ...empty,
      semantic: [
        { ...base, ruleKey: 'A-OK', label: 'ok', evaluation: ev('within', 9) },
        { ...base, ruleKey: 'B-BAD', label: 'bad', evaluation: ev('breach', 3) },
        { ...base, ruleKey: 'C-NEAR', label: 'near', evaluation: ev('attention', 7.5) },
        { ...base, ruleKey: 'D-NONE', label: 'none', evaluation: ev('not_evaluable', null) },
      ],
    });
    expect(findings.map((f) => [f.subjectRef, f.severity])).toEqual([
      ['rule:B-BAD', 'breach'],
      ['rule:C-NEAR', 'attention'],
    ]);
    expect(findings[0]!.inputs.map((i) => i.ref)).toEqual(['rule:B-BAD:v1', 'Sector models', 'UA-S01']);
    expect(findings[0]!.sectorKey).toBe('utilities');
  });

  it('flags only new signals of the watched urgency older than the allowed time', () => {
    const s = (key: string, urgency: 'critical' | 'elevated' | 'routine', disposition: string, detectedAt: string) => ({
      key,
      title: key,
      urgency,
      disposition,
      detectedAt,
    });
    const findings = evaluateWatchRule(rule('signal_untriaged', { urgencies: ['critical'], maxHours: 24 }), {
      ...empty,
      signals: [
        s('S-OLD', 'critical', 'new', '2026-10-28T12:00:00.000Z'),
        s('S-FRESH', 'critical', 'new', '2026-10-30T00:00:00.000Z'),
        s('S-TRIAGED', 'critical', 'monitoring', '2026-10-01T00:00:00.000Z'),
        s('S-ROUTINE', 'routine', 'new', '2026-10-01T00:00:00.000Z'),
      ],
    });
    expect(findings.map((f) => f.subjectRef)).toEqual(['signal:S-OLD']);
    expect(findings[0]!.title).toContain('2 days');
  });

  it('flags failing connectors as breach and stale scheduled ones as the rule severity, never paused ones', () => {
    const c = (key: string, over: object) => ({
      key,
      name: key,
      status: 'active',
      schedule: '0 * * * *',
      lastSuccessAt: '2026-10-29T00:00:00.000Z',
      lastErrorAt: null,
      lastError: null,
      classification: 'internal' as const,
      sectorKey: null,
      ...over,
    });
    const findings = evaluateWatchRule(rule('connector_stale', { maxDays: 7 }), {
      ...empty,
      connectors: [
        c('C-OK', {}),
        c('C-FAIL', { lastErrorAt: '2026-10-30T00:00:00.000Z', lastError: 'Request was cancelled.' }),
        c('C-STALE', { lastSuccessAt: '2026-10-01T00:00:00.000Z' }),
        c('C-PAUSED', { status: 'paused', lastErrorAt: '2026-10-30T00:00:00.000Z' }),
        c('C-MANUAL', { schedule: null, lastSuccessAt: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    expect(findings.map((f) => [f.subjectRef, f.severity])).toEqual([
      ['connector:C-FAIL', 'breach'],
      ['connector:C-STALE', 'attention'],
    ]);
  });

  it('flags missed outcomes only, naming expected and observed', () => {
    const o = (key: string, verdict: string) => ({
      key,
      caseId: 'c1',
      caseKey: 'HMZ-2024-0413',
      figureLabel: 'NAV at risk',
      unit: '% of NAV',
      expectedLow: 1,
      expectedHigh: 2,
      observedValue: 3.5,
      observedOn: '2026-10-15',
      verdict,
      classification: 'confidential' as const,
      sectorKey: null,
    });
    const findings = evaluateWatchRule(rule('decision_drift'), {
      ...empty,
      outcomes: [o('OR-1', 'held'), o('OR-2', 'missed'), o('OR-3', 'not_comparable')],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain('1–2 % of NAV');
    expect(findings[0]!.caseId).toBe('c1');
  });

  it('is deterministic', () => {
    const obs: Observations = {
      ...empty,
      signals: [{ key: 'S', title: 'S', urgency: 'critical', disposition: 'new', detectedAt: '2026-10-01T00:00:00.000Z' }],
    };
    const r = rule('signal_untriaged');
    expect(evaluateWatchRule(r, obs)).toEqual(evaluateWatchRule(r, obs));
  });
});
