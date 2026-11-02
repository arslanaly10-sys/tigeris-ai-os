/**
 * Organisation levels for the demonstration institution (Phase 5E, D-107, D-119): asset-class desks roll up to the
 * Investment Committee, which rolls up to the Executive Office. Membership is synthetic, for the demonstration only.
 */
export const DIVISIONS = [
  {
    key: 'EXEC',
    name: 'Executive Office',
    kind: 'executive',
    parent: null,
    description: 'Final authority and institution-wide view.',
  },
  {
    key: 'IC',
    name: 'Investment Committee',
    kind: 'committee',
    parent: 'EXEC',
    description: 'Weighs the desks’ answers before decisions above desk authority.',
  },
  {
    key: 'PUB',
    name: 'Public Markets desk',
    kind: 'desk',
    parent: 'IC',
    description: 'Listed equities and fixed income.',
  },
  {
    key: 'PE',
    name: 'Private Equity desk',
    kind: 'desk',
    parent: 'IC',
    description: 'Direct and fund private equity.',
  },
  {
    key: 'INFRA',
    name: 'Infrastructure desk',
    kind: 'desk',
    parent: 'IC',
    description: 'Energy, utilities, ports and logistics assets.',
  },
  {
    key: 'RE',
    name: 'Real Estate desk',
    kind: 'desk',
    parent: 'IC',
    description: 'Direct and listed real estate.',
  },
  {
    key: 'CREDIT',
    name: 'Credit desk',
    kind: 'desk',
    parent: 'IC',
    description: 'Private credit and counterparty exposures.',
  },
] as const;

/** Demo roles placed on desks so each desk has someone who can answer. */
export const DESK_MEMBERS: { division: (typeof DIVISIONS)[number]['key']; role: string }[] = [
  { division: 'EXEC', role: 'executive' },
  { division: 'IC', role: 'approver' },
  { division: 'PUB', role: 'analyst' },
  { division: 'CREDIT', role: 'analyst' },
  { division: 'INFRA', role: 'domain_expert' },
  { division: 'PE', role: 'domain_expert' },
  { division: 'RE', role: 'approver' },
];
