/**
 * Intervention engine (Phase 5B, FR-53, D-106, D-116): manage by exception. Versioned watch rules turn observed
 * conditions into interventions routed to the roles that must act. The engine is deterministic: the same rule and the
 * same observations always give the same findings. It never acts and never closes an intervention; people do.
 */
import type { RuleEvaluation } from './semantic';
import type { Role, Sensitivity, Urgency } from './vocabulary';

export const INTERVENTION_ENGINE = 'intervention-engine 1.0.0';

export const WATCH_KINDS = ['semantic', 'signal_untriaged', 'connector_stale', 'decision_drift'] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export const WATCH_KIND_LABEL: Record<WatchKind, string> = {
  semantic: 'Codified rule at attention or breach',
  signal_untriaged: 'Urgent signal not triaged in time',
  connector_stale: 'Data connector failing or out of date',
  decision_drift: 'Decision outcome outside its expected range',
};

export const INTERVENTION_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];
export const LIVE_STATUSES: readonly InterventionStatus[] = ['open', 'acknowledged'];

export type InterventionSeverity = 'breach' | 'attention';

/** One input an intervention rests on, with where to find it. */
export interface InterventionInput {
  label: string;
  value: string;
  ref: string;
}

export interface Finding {
  subjectRef: string;
  severity: InterventionSeverity;
  title: string;
  detail: string;
  inputs: InterventionInput[];
  classification: Sensitivity;
  sectorKey: string | null;
  caseId: string | null;
}

export interface WatchRuleSpec {
  key: string;
  version: number;
  kind: WatchKind;
  params: Record<string, unknown>;
  severity: InterventionSeverity;
}

// ───────────────────────────── observations the API supplies ─────────────────────────────

export interface SemanticObservation {
  ruleKey: string;
  ruleVersion: number;
  label: string;
  description: string;
  evaluation: RuleEvaluation & { observedFrom: string | null; asOf: string | null; inputKeys: string[] };
  unit: string;
  classification: Sensitivity;
  sectorKey: string | null;
  caseId: string | null;
}
export interface SignalObservation {
  key: string;
  title: string;
  urgency: Urgency;
  disposition: string;
  detectedAt: string;
}
export interface ConnectorObservation {
  key: string;
  name: string;
  status: string;
  schedule: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  classification: Sensitivity;
  sectorKey: string | null;
}
export interface OutcomeObservation {
  key: string;
  caseId: string;
  caseKey: string;
  figureLabel: string;
  unit: string;
  expectedLow: number;
  expectedHigh: number;
  observedValue: number;
  observedOn: string;
  verdict: string;
  classification: Sensitivity;
  sectorKey: string | null;
}

export interface Observations {
  now: string;
  semantic: SemanticObservation[];
  signals: SignalObservation[];
  connectors: ConnectorObservation[];
  outcomes: OutcomeObservation[];
}

const num = (v: number) => Number(v.toFixed(2)).toString();
const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
const asNumber = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Evaluates one approved watch rule against the observations. Pure and deterministic. */
export function evaluateWatchRule(rule: WatchRuleSpec, obs: Observations): Finding[] {
  switch (rule.kind) {
    case 'semantic': {
      const include = (rule.params.statuses as string[] | undefined) ?? ['attention', 'breach'];
      return obs.semantic
        .filter((s) => include.includes(s.evaluation.status))
        .map((s) => ({
          subjectRef: `rule:${s.ruleKey}`,
          severity: s.evaluation.status === 'breach' ? 'breach' : 'attention',
          title: `${s.ruleKey} ${s.evaluation.status === 'breach' ? 'breached' : 'near its threshold'}: ${s.label}`,
          detail: `${s.description}. Current ${num(s.evaluation.value!)}${s.unit ? ` ${s.unit}` : ''}, headroom ${num(s.evaluation.headroom!)}.`,
          inputs: [
            {
              label: 'Rule',
              value: `${s.ruleKey} v${s.ruleVersion} (${s.evaluation.version})`,
              ref: `rule:${s.ruleKey}:v${s.ruleVersion}`,
            },
            {
              label: 'Observed',
              value: `${num(s.evaluation.value!)}${s.unit ? ` ${s.unit}` : ''}${s.evaluation.asOf ? ` as of ${s.evaluation.asOf.slice(0, 10)}` : ''}`,
              ref: s.evaluation.observedFrom ?? 'unknown',
            },
            ...s.evaluation.inputKeys.map((k) => ({ label: 'Record', value: k, ref: k })),
          ],
          classification: s.classification,
          sectorKey: s.sectorKey,
          caseId: s.caseId,
        }));
    }
    case 'signal_untriaged': {
      const urgencies = (rule.params.urgencies as Urgency[] | undefined) ?? ['critical'];
      const maxHours = asNumber(rule.params.maxHours, 24);
      return obs.signals
        .filter((s) => s.disposition === 'new' && urgencies.includes(s.urgency))
        .filter((s) => hoursBetween(s.detectedAt, obs.now) > maxHours)
        .map((s) => {
          const hours = Math.floor(hoursBetween(s.detectedAt, obs.now));
          const age = hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`;
          return {
            subjectRef: `signal:${s.key}`,
            severity: rule.severity,
            title: `${s.urgency === 'critical' ? 'Critical' : 'Elevated'} signal ${s.key} not triaged for ${age}`,
            detail: `"${s.title}" is still new. The rule allows ${maxHours} hours before triage (monitor, corroborate, dismiss or open a case).`,
            inputs: [
              {
                label: 'Signal',
                value: `${s.key} · ${s.urgency} · ${s.disposition}`,
                ref: `signal:${s.key}`,
              },
              { label: 'Detected', value: s.detectedAt, ref: `signal:${s.key}:detected_at` },
              {
                label: 'Allowed',
                value: `${maxHours} hours`,
                ref: `watch:${rule.key}:v${rule.version}:maxHours`,
              },
            ],
            classification: 'internal',
            sectorKey: null,
            caseId: null,
          } satisfies Finding;
        });
    }
    case 'connector_stale': {
      const maxDays = asNumber(rule.params.maxDays, 7);
      return obs.connectors
        .filter((c) => c.status !== 'paused' && c.status !== 'retired')
        .flatMap((c): Finding[] => {
          const failing =
            c.lastErrorAt !== null && (c.lastSuccessAt === null || c.lastErrorAt > c.lastSuccessAt);
          const stale =
            c.schedule !== null &&
            c.lastSuccessAt !== null &&
            hoursBetween(c.lastSuccessAt, obs.now) > maxDays * 24;
          if (!failing && !stale) return [];
          return [
            {
              subjectRef: `connector:${c.key}`,
              severity: failing ? 'breach' : rule.severity,
              title: failing
                ? `Connector ${c.key} is failing`
                : `Connector ${c.key} has not synced for over ${maxDays} days`,
              detail: failing
                ? `${c.name}: the last attempt failed${c.lastError ? ` (${c.lastError})` : ''}. Data from it is not current.`
                : `${c.name} is scheduled but last succeeded ${c.lastSuccessAt!.slice(0, 10)}.`,
              inputs: [
                { label: 'Connector', value: `${c.key} · ${c.status}`, ref: `connector:${c.key}` },
                {
                  label: 'Last success',
                  value: c.lastSuccessAt ?? 'never',
                  ref: `connector:${c.key}:last_success_at`,
                },
                ...(failing
                  ? [{ label: 'Last error', value: c.lastErrorAt!, ref: `connector:${c.key}:last_error_at` }]
                  : []),
              ],
              classification: c.classification,
              sectorKey: c.sectorKey,
              caseId: null,
            },
          ];
        });
    }
    case 'decision_drift':
      return obs.outcomes
        .filter((o) => o.verdict === 'missed')
        .map((o) => ({
          subjectRef: `outcome:${o.key}`,
          severity: rule.severity,
          title: `Outcome of ${o.caseKey} outside its expected range: ${o.figureLabel}`,
          detail: `Observed ${num(o.observedValue)} ${o.unit} on ${o.observedOn}, against an expected range of ${num(o.expectedLow)}–${num(o.expectedHigh)} ${o.unit}. Review the decision's assumptions.`,
          inputs: [
            { label: 'Outcome review', value: o.key, ref: `outcome:${o.key}` },
            {
              label: 'Expected',
              value: `${num(o.expectedLow)}–${num(o.expectedHigh)} ${o.unit}`,
              ref: `outcome:${o.key}:expected`,
            },
            {
              label: 'Observed',
              value: `${num(o.observedValue)} ${o.unit} on ${o.observedOn}`,
              ref: `outcome:${o.key}:observed`,
            },
          ],
          classification: o.classification,
          sectorKey: o.sectorKey,
          caseId: o.caseId,
        }));
  }
}

/** Roles that may draft and approve watch rules (the author never approves their own version). */
export const WATCH_AUTHOR_ROLES: readonly Role[] = ['analyst', 'domain_expert', 'executive', 'administrator'];
export const WATCH_APPROVER_ROLES: readonly Role[] = ['domain_expert', 'executive'];
