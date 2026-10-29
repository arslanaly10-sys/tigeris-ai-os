/**
 * Truth badges. Every state is carried by text + icon (+ border/pattern), never colour alone (D-19, WCAG 2.2).
 */
import type {
  CaseState,
  ClaimClass,
  ConfidenceBand,
  DataMode,
  SourceClass,
  Urgency,
  ValidationStatus,
} from '@tigeris/shared';
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  FlaskConical,
  Globe2,
  Image,
  Landmark,
  Lock,
  Newspaper,
  Radio,
  Rewind,
  ShieldQuestion,
  SlidersHorizontal,
  Split,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface Spec {
  label: string;
  icon: LucideIcon;
  className: string;
  title: string;
}

function Tag({ spec, className }: { spec: Spec; className?: string }) {
  const Icon = spec.icon;
  return (
    <span
      title={spec.title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        spec.className,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {spec.label}
    </span>
  );
}

const CLAIM: Record<ClaimClass, Spec> = {
  observed: {
    label: 'Observed',
    icon: Eye,
    className: 'border-emerald bg-emerald-soft text-emerald',
    title: 'Directly present in an approved source record',
  },
  sourced: {
    label: 'Sourced',
    icon: FileText,
    className: 'border-navy-600 bg-navy-100 text-navy-800',
    title: 'Reported by a cited source; not independently observed',
  },
  inferred: {
    label: 'Inferred',
    icon: Waypoints,
    className: 'border-dashed border-navy-600 bg-paper text-navy-800',
    title: 'Derived relationship or analytic conclusion',
  },
  assumed: {
    label: 'Assumption',
    icon: SlidersHorizontal,
    className: 'border-amber bg-amber-soft text-amber',
    title: 'User- or scenario-entered condition',
  },
  synthetic: {
    label: 'Synthetic',
    icon: FlaskConical,
    className: 'pattern-synthetic border-gold bg-gold-soft text-gold-text',
    title: 'Fabricated demonstration value — not evidence',
  },
  illustrative: {
    label: 'Illustrative',
    icon: Image,
    className: 'pattern-illustrative border-line-strong bg-paper text-ink-muted',
    title: 'Example content — not validated evidence',
  },
};

export function ClaimBadge({ value, className }: { value: ClaimClass; className?: string }) {
  return <Tag spec={CLAIM[value]} className={className} />;
}

const SOURCE: Record<SourceClass, Spec> = {
  public: {
    label: 'Public',
    icon: Landmark,
    className: 'border-navy-600 bg-paper text-navy-800',
    title: 'Official public source',
  },
  third_party: {
    label: 'Third-party',
    icon: Newspaper,
    className: 'border-navy-300 bg-paper text-navy-700',
    title: 'Public but third-party or derived (press, aggregators)',
  },
  licensed: {
    label: 'Licensed',
    icon: Lock,
    className: 'border-navy-600 bg-navy-100 text-navy-800',
    title: 'Licensed feed',
  },
  client: {
    label: 'Client',
    icon: Archive,
    className: 'border-emerald bg-emerald-soft text-emerald',
    title: 'Institution data',
  },
  synthetic: {
    label: 'Synthetic',
    icon: FlaskConical,
    className: 'pattern-synthetic border-gold bg-gold-soft text-gold-text',
    title: 'Synthetic demonstration source',
  },
};

export function SourceClassBadge({ value, className }: { value: SourceClass; className?: string }) {
  return <Tag spec={SOURCE[value]} className={className} />;
}

const MODE: Record<DataMode, Spec> = {
  live: {
    label: 'Live',
    icon: Radio,
    className: 'border-emerald bg-emerald-soft text-emerald',
    title: 'Approved live source',
  },
  snapshot: {
    label: 'Snapshot',
    icon: Globe2,
    className: 'border-navy-600 bg-paper text-navy-800',
    title: 'Dated snapshot — not current',
  },
  replay: {
    label: 'Replay',
    icon: Rewind,
    className: 'border-navy-600 bg-paper text-navy-800',
    title: 'Historical replay',
  },
  scenario: {
    label: 'Scenario',
    icon: Split,
    className: 'border-dashed border-amber bg-amber-soft text-amber',
    title: 'Hypothetical scenario',
  },
  synthetic_demo: {
    label: 'Synthetic demo',
    icon: FlaskConical,
    className: 'pattern-synthetic border-gold bg-gold-soft text-gold-text',
    title: 'Synthetic demonstration data',
  },
};

export function DataModeBadge({ value, className }: { value: DataMode; className?: string }) {
  return <Tag spec={MODE[value]} className={className} />;
}

const VALIDATION: Record<ValidationStatus, Spec> = {
  validated: {
    label: 'Validated',
    icon: CheckCircle2,
    className: 'border-emerald bg-emerald-soft text-emerald',
    title: 'Passed validation checks',
  },
  unverified: {
    label: 'Unverified',
    icon: ShieldQuestion,
    className: 'border-amber bg-amber-soft text-amber',
    title: 'Not yet verified — use with caution',
  },
  stale: {
    label: 'Stale',
    icon: Clock,
    className: 'border-amber bg-amber-soft text-amber',
    title: 'Past freshness limit',
  },
  disputed: {
    label: 'Disputed',
    icon: AlertTriangle,
    className: 'border-red bg-red-soft text-red',
    title: 'Conflicts with another source',
  },
  quarantined: {
    label: 'Quarantined',
    icon: Ban,
    className: 'border-red bg-red-soft text-red',
    title: 'Failed validation; excluded from analysis',
  },
};

export function ValidationBadge({ value, className }: { value: ValidationStatus; className?: string }) {
  return <Tag spec={VALIDATION[value]} className={className} />;
}

const URGENCY: Record<Urgency, Spec> = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    className: 'border-red bg-red-soft text-red',
    title: 'Critical urgency',
  },
  elevated: {
    label: 'Elevated',
    icon: AlertTriangle,
    className: 'border-amber bg-amber-soft text-amber',
    title: 'Elevated urgency',
  },
  routine: {
    label: 'Routine',
    icon: Clock,
    className: 'border-line-strong bg-paper text-ink-muted',
    title: 'Routine',
  },
};

export function UrgencyBadge({ value, className }: { value: Urgency; className?: string }) {
  return <Tag spec={URGENCY[value]} className={className} />;
}

export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  insufficient: 'Insufficient',
};

const BAND_LEVEL: Record<ConfidenceBand, number> = { high: 3, moderate: 2, low: 1, insufficient: 0 };

/** Three-step band meter with a text label. Never a percentage. */
export function ConfidenceBandMeter({ band, className }: { band: ConfidenceBand; className?: string }) {
  const level = BAND_LEVEL[band];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-4 rounded-sm border',
              i <= level ? 'border-navy-700 bg-navy-700' : 'border-line-strong bg-paper',
            )}
          />
        ))}
      </span>
      <span className="text-sm font-semibold text-ink">{CONFIDENCE_LABEL[band]}</span>
    </span>
  );
}

export const STATE_LABEL: Record<CaseState, string> = {
  detected: 'Detected',
  triaged: 'Triaged',
  analysis: 'Analysis',
  scenario: 'Scenario',
  review: 'Expert review',
  decision: 'Decision',
  handoff: 'Handoff',
  closed: 'Closed',
};

export function StateBadge({ value, className }: { value: CaseState; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-navy-600 bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-800',
        className,
      )}
    >
      {STATE_LABEL[value]}
    </span>
  );
}
