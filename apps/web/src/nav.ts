import {
  Brain,
  Building2,
  Database,
  Gavel,
  GitFork,
  LayoutDashboard,
  Library,
  Radar,
  Scale,
  Settings2,
  Share2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Delivery phase in which the module becomes functional (Implementation Plan §4). */
  phase: number;
  purpose: string;
  willDo: string[];
}

/** The PRD's 11 navigation items (D-07), in PRD order. */
export const NAV: NavItem[] = [
  {
    path: '/',
    label: 'Command Centre',
    icon: LayoutDashboard,
    phase: 1,
    purpose: 'Attention queue: what needs attention, why, and who acts next.',
    willDo: [],
  },
  {
    path: '/signals',
    label: 'Signals & Early Warning',
    icon: Radar,
    phase: 2,
    purpose: 'Validated, unvalidated, conflicting and dismissed signals with source health and disposition.',
    willDo: [
      'Signal detail with publisher, event and retrieval times, rights and corroboration',
      'Corroborate, challenge, monitor, dismiss or open a case — with recorded rationale',
      'Replayable early-warning detection against dated snapshots',
    ],
  },
  {
    path: '/cases',
    label: 'Intelligence Cases',
    icon: Brain,
    phase: 1,
    purpose: 'Case list and case workspaces — the primary work object of the OS.',
    willDo: [],
  },
  {
    path: '/graph',
    label: 'Intelligence Graph',
    icon: Share2,
    phase: 2,
    purpose: 'Shared entities, dependencies and temporal causal links across the institution.',
    willDo: [
      'Entities, routes, assets, suppliers and exposures with stable identifiers',
      'Each link labelled observed, sourced, inferred or assumed, with evidence',
      'First-, second- and third-order paths from an event to affected domains',
    ],
  },
  {
    path: '/scenarios',
    label: 'Scenarios & Foresight',
    icon: GitFork,
    phase: 3,
    purpose: 'Baseline and what-if scenarios across 72 hours, 90 days, one year and five years.',
    willDo: [
      'Deterministic calculators with units, formulas and input lineage',
      'Bounded what-if assumptions that never overwrite the baseline',
      'Reproducible saved runs and sensitivity ranges',
    ],
  },
  {
    path: '/decisions',
    label: 'Decision Authority',
    icon: Gavel,
    phase: 4,
    purpose: 'Recommendations awaiting named human review and decision.',
    willDo: [
      'Evidence-backed options with confidence basis, constraints, owner and authority required',
      'Approve, reject, defer or request evidence — self-approval always blocked',
      'Operations handoff and outcome capture',
    ],
  },
  {
    path: '/domains',
    label: 'Domains',
    icon: Building2,
    phase: 5,
    purpose: 'Domain packs (energy, resilience, capital) extending the shared graph and workflows.',
    willDo: [
      'Energy & maritime, resilience and sovereign capital configurations',
      'Domain ontology extensions, calculators and case templates — not separate dashboards',
    ],
  },
  {
    path: '/sources',
    label: 'Data & Sources',
    icon: Database,
    phase: 1,
    purpose: 'Source registry: class, terms, approval, cadence and freshness.',
    willDo: [],
  },
  {
    path: '/memory',
    label: 'Institutional Memory',
    icon: Library,
    phase: 4,
    purpose: 'Approved decisions, outcomes, precedents and lessons with provenance.',
    willDo: [
      'Only approved decisions and outcomes become memory',
      'Institution-scoped search; no cross-client retrieval or silent training',
    ],
  },
  {
    path: '/governance',
    label: 'Governance & Audit',
    icon: Scale,
    phase: 4,
    purpose: 'Policies as code, PASS / HOLD / BLOCK results and the append-only audit trail.',
    willDo: [
      'Versioned policy rules with test results and activation history',
      'Hash-chained audit trail with independent verification',
      'Export controls and retention settings',
    ],
  },
  {
    path: '/admin',
    label: 'Administration',
    icon: Settings2,
    phase: 4,
    purpose: 'Institution, divisions, roles, retention and deployment configuration.',
    willDo: [
      'Role and division management',
      'Identity provider configuration (OIDC seam)',
      'Retention and localisation',
    ],
  },
];
