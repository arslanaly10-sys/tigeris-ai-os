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
    const s = (
      key: string,
      urgency: 'critical' | 'elevated' | 'routine',
      disposition: string,
      detectedAt: string,
    ) => ({
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
      signals: [
        {
          key: 'S',
          title: 'S',
          urgency: 'critical',
          disposition: 'new',
          detectedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    };
    const r = rule('signal_untriaged');
    expect(evaluateWatchRule(r, obs)).toEqual(evaluateWatchRule(r, obs));
  });
});

describe('post-decision monitoring', () => {
  const m = (over: object) => ({
    memoryKey: 'MEM-1',
    caseId: 'c1',
    caseKey: 'HMZ-2024-0413',
    figureRef: 'scenario:SCN-1:metric:nav_at_risk_peak:d90',
    figureLabel: 'NAV at risk',
    unit: '% of NAV',
    expectedLow: 1,
    expectedHigh: 2,
    decisionRunKey: 'SCN-1',
    latestRunKey: 'SCN-2',
    latestCentral: 1.5,
    classification: 'confidential' as const,
    sectorKey: null,
    ...over,
  });
  const r = {
    key: 'W-MONITOR',
    version: 1,
    kind: 'decision_monitor' as const,
    params: { breachWidths: 1 },
    severity: 'attention' as const,
  };

  it('raises drift only when a newer run falls outside the expected range, breach beyond one range width', () => {
    const f = evaluateWatchRule(r, {
      ...empty,
      monitored: [
        m({ memoryKey: 'IN' }),
        m({ memoryKey: 'SAME-RUN', latestRunKey: 'SCN-1', latestCentral: 9 }),
        m({ memoryKey: 'NEAR', latestCentral: 2.5 }),
        m({ memoryKey: 'FAR', latestCentral: 3.5 }),
      ],
    });
    expect(f.map((x) => [x.subjectRef.split(':')[1], x.severity])).toEqual([
      ['NEAR', 'attention'],
      ['FAR', 'breach'],
    ]);
    expect(f[0]!.detail).toContain('SCN-2');
  });
});

describe('overdue validation', () => {
  it('raises requests past their due date (plus grace), naming who it waits on', () => {
    const v = (key: string, dueOn: string) => ({
      key,
      subjectLabel: 'Case HMZ-2024-0413',
      question: 'Is the bypass ramp-up assumption still right?',
      assignee: 'Infrastructure desk',
      dueOn,
      requestedBy: 'Omar Haddad',
      classification: 'confidential' as const,
      sectorKey: null,
      caseId: null,
    });
    const r = {
      key: 'W-VALIDATION',
      version: 1,
      kind: 'validation_overdue' as const,
      params: {},
      severity: 'attention' as const,
    };
    const f = evaluateWatchRule(r, {
      ...empty,
      validations: [v('VR-1', '2026-10-29'), v('VR-2', '2026-10-30')],
    });
    expect(f.map((x) => x.subjectRef)).toEqual(['validation:VR-1']);
    expect(f[0]!.title).toContain('overdue by 1 day');
    expect(f[0]!.detail).toContain('Infrastructure desk');
    expect(
      evaluateWatchRule(
        { ...r, params: { graceDays: 2 } },
        { ...empty, validations: [v('VR-1', '2026-10-29')] },
      ),
    ).toEqual([]);
  });
});

describe('series drop (D-127)', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 9, 30 - i)).toISOString().slice(0, 10);
  const series = (recent: number, base: number, n = 35) => ({
    seriesKey: 'PortWatch:Strait of Hormuz:n_total',
    connectorKey: 'CON-PORTWATCH-HORMUZ',
    source: 'IMF PortWatch',
    points: Array.from({ length: n }, (_, i) => ({
      observedOn: day(i),
      value: i < 7 ? recent : base,
      runKey: 'RUN-1',
    })),
    classification: 'internal' as const,
    sectorKey: 'supply_chain',
  });
  const r = rule('series_drop', { dropPct: 30 });

  it('raises when the recent average falls past the threshold, naming both windows', () => {
    const [f] = evaluateWatchRule(r, { ...empty, series: [series(60, 100)] });
    expect(f).toMatchObject({
      severity: 'attention',
      subjectRef: 'series:PortWatch:Strait of Hormuz:n_total',
    });
    expect(f!.title).toContain('40% below');
    expect(f!.detail).toContain('2026-10-24 to 2026-10-30');
    expect(f!.inputs.map((i) => i.label)).toEqual(['Recent average', 'Baseline average', 'Latest fetch run']);
  });

  it('escalates to breach at twice the threshold, and stays quiet within it', () => {
    expect(evaluateWatchRule(r, { ...empty, series: [series(30, 100)] })[0]!.severity).toBe('breach');
    expect(evaluateWatchRule(r, { ...empty, series: [series(80, 100)] })).toEqual([]);
  });

  it('makes no claim with too few points', () => {
    expect(evaluateWatchRule(r, { ...empty, series: [series(10, 100, 12)] })).toEqual([]);
    expect(evaluateWatchRule(r, empty)).toEqual([]);
  });
});
