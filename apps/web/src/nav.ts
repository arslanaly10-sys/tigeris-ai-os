import {
  Bot,
  Building2,
  Database,
  Gavel,
  GitFork,
  Landmark,
  Library,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/lib/i18n';

export interface NavItem {
  path: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Delivery phase in which the module becomes functional; 0 = built. */
  phase: number;
  /** Additional route prefixes that highlight this item. */
  match?: string[];
  purpose: string;
  willDo: string[];
  /** How the module fills once built: the named human steps that feed it. */
  flow?: { name: string; detail: string }[];
}

/** The nine-item navigation from the approved light concepts (decision D-07, revised). */
export const NAV: NavItem[] = [
  { path: '/', labelKey: 'nav.overview', icon: Landmark, phase: 0, purpose: '', willDo: [] },
  {
    path: '/sectors',
    labelKey: 'nav.sectors',
    icon: Building2,
    phase: 0,
    match: ['/sectors', '/signals', '/cases', '/graph'],
    purpose: '',
    willDo: [],
  },
  { path: '/ai', labelKey: 'nav.ai', icon: Bot, phase: 0, purpose: '', willDo: [] },
  {
    path: '/scenarios',
    labelKey: 'nav.scenarios',
    icon: GitFork,
    phase: 0,
    purpose: '',
    willDo: [],
  },
  { path: '/mandates', labelKey: 'nav.mandates', icon: ShieldCheck, phase: 0, purpose: '', willDo: [] },
  { path: '/decisions', labelKey: 'nav.decisions', icon: Gavel, phase: 0, purpose: '', willDo: [] },
  { path: '/execution', labelKey: 'nav.execution', icon: Workflow, phase: 0, purpose: '', willDo: [] },
  {
    path: '/memory',
    labelKey: 'nav.memory',
    icon: Library,
    phase: 4,
    purpose: 'Approved decisions, outcomes, precedents and lessons with provenance.',
    willDo: [
      'Only approved decisions and recorded outcomes become memory',
      'Institution-scoped search; no cross-client retrieval or silent model training',
    ],
    flow: [
      { name: 'Decision approved', detail: 'A named approver records it after expert review.' },
      { name: 'Handoff completed', detail: 'The operations owner carries it out and closes the handoff.' },
      { name: 'Outcome recorded', detail: 'What actually happened, against what the scenario expected.' },
      { name: 'Lesson kept', detail: 'Approved precedent, searchable within this institution only.' },
    ],
  },
  { path: '/sources', labelKey: 'nav.data', icon: Database, phase: 0, purpose: '', willDo: [] },
];

export function isActive(item: NavItem, pathname: string) {
  if (item.path === '/') return pathname === '/';
  return [item.path, ...(item.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
