/**
 * Seeded watch rules for the demonstration (Phase 5B, D-106, D-116): one per kind the owner chose. Thresholds are
 * synthetic, owner-approved for the demonstration only.
 */
export const WATCH_BASIS = 'Synthetic watch rule; owner-approved for the demonstration (D-116)';

export const WATCH_RULES = [
  {
    key: 'W-RULES',
    label: 'Codified rules at attention or breach',
    kind: 'semantic',
    params: { statuses: ['attention', 'breach'] },
    severity: 'breach',
    routeRoles: ['executive', 'approver', 'domain_expert'],
    rationale:
      'Every approved codified rule that reaches attention or breach needs a named owner to look at it.',
  },
  {
    key: 'W-SIGNALS',
    label: 'Critical or elevated signals not triaged within 24 hours',
    kind: 'signal_untriaged',
    params: { urgencies: ['critical', 'elevated'], maxHours: 24 },
    severity: 'attention',
    routeRoles: ['analyst'],
    rationale:
      'A critical signal should be monitored, corroborated, dismissed or turned into a case within a day.',
  },
  {
    key: 'W-CONNECTORS',
    label: 'Connectors failing or not synced for 7 days',
    kind: 'connector_stale',
    params: { maxDays: 7 },
    severity: 'attention',
    routeRoles: ['administrator'],
    rationale: 'Data that stopped arriving must be noticed before anyone relies on it as current.',
  },
  {
    key: 'W-DRIFT',
    label: 'Decision outcomes outside the expected range',
    kind: 'decision_drift',
    params: {},
    severity: 'breach',
    routeRoles: ['executive', 'domain_expert'],
    rationale: 'When an outcome misses its expected range the assumptions behind the decision need review.',
  },
] as const;
