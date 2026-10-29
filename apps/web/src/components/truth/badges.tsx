import { motion } from 'motion/react';
/**
 * Truth badges. Every state is carried by text + icon (+ border style/pattern), never colour alone (D-19, WCAG 2.2).
 */
import type {
  CaseState,
  ClaimClass,
  ConfidenceBand,
  DataMode,
  RelationshipClass,
  SignalDisposition,
  SignalType,
  SourceClass,
  Urgency,
  ValidationOutcome,
  ValidationStatus,
} from '@tigeris/shared';
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  Ban,
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe2,
  Image,
  Landmark,
  Lock,
  Newspaper,
  Radio,
  Rewind,
  Ship,
  ShieldQuestion,
  SlidersHorizontal,
  Split,
  Truck,
  Waypoints,
  XCircle,
  Zap,
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

const S = {
  emerald: 'border-emerald/60 bg-emerald-soft text-emerald',
  cyan: 'border-cyan/50 bg-cyan-soft text-cyan',
  cyanDashed: 'border-dashed border-cyan/60 bg-transparent text-cyan',
  amber: 'border-amber/60 bg-amber-soft text-amber',
  amberDashed: 'border-dashed border-amber/60 bg-amber-soft text-amber',
  red: 'border-red/60 bg-red-soft text-red',
  gold: 'pattern-synthetic border-gold/60 bg-gold-soft text-gold-bright',
  neutral: 'border-line-strong bg-raised text-ink-muted',
  illustrative: 'pattern-illustrative border-line-strong bg-raised text-ink-muted',
};

const CLAIM: Record<ClaimClass, Spec> = {
  observed: {
    label: 'Observed',
    icon: Eye,
    className: S.emerald,
    title: 'Directly present in an approved source record',
  },
  sourced: {
    label: 'Sourced',
    icon: FileText,
    className: S.cyan,
    title: 'Reported by a cited source; not independently observed',
  },
  inferred: {
    label: 'Inferred',
    icon: Waypoints,
    className: S.cyanDashed,
    title: 'Derived relationship or analytic conclusion',
  },
  assumed: {
    label: 'Assumption',
    icon: SlidersHorizontal,
    className: S.amberDashed,
    title: 'User- or scenario-entered condition',
  },
  synthetic: {
    label: 'Synthetic',
    icon: FlaskConical,
    className: S.gold,
    title: 'Fabricated demonstration value — not evidence',
  },
  illustrative: {
    label: 'Illustrative',
    icon: Image,
    className: S.illustrative,
    title: 'Example content — not validated evidence',
  },
};

export function ClaimBadge({
  value,
  className,
}: {
  value: ClaimClass | RelationshipClass;
  className?: string;
}) {
  return <Tag spec={CLAIM[value]} className={className} />;
}

const SOURCE: Record<SourceClass, Spec> = {
  public: { label: 'Public', icon: Landmark, className: S.cyan, title: 'Official public source' },
  third_party: {
    label: 'Third-party',
    icon: Newspaper,
    className: S.neutral,
    title: 'Public but third-party or derived (press, aggregators)',
  },
  licensed: { label: 'Licensed', icon: Lock, className: S.cyan, title: 'Licensed feed' },
  client: { label: 'Client', icon: Archive, className: S.emerald, title: 'Institution data' },
  synthetic: {
    label: 'Synthetic',
    icon: FlaskConical,
    className: S.gold,
    title: 'Synthetic demonstration source',
  },
};

export function SourceClassBadge({ value, className }: { value: SourceClass; className?: string }) {
  return <Tag spec={SOURCE[value]} className={className} />;
}

const MODE: Record<DataMode, Spec> = {
  live: { label: 'Live', icon: Radio, className: S.emerald, title: 'Approved live source' },
  snapshot: { label: 'Snapshot', icon: Globe2, className: S.cyan, title: 'Dated snapshot — not current' },
  replay: { label: 'Replay', icon: Rewind, className: S.cyan, title: 'Historical replay' },
  scenario: { label: 'Scenario', icon: Split, className: S.amberDashed, title: 'Hypothetical scenario' },
  synthetic_demo: {
    label: 'Synthetic demo',
    icon: FlaskConical,
    className: S.gold,
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
    className: S.emerald,
    title: 'Passed validation checks',
  },
  unverified: {
    label: 'Unverified',
    icon: ShieldQuestion,
    className: S.amber,
    title: 'Not yet verified — use with caution',
  },
  stale: { label: 'Stale', icon: Clock, className: S.amber, title: 'Past freshness limit' },
  disputed: {
    label: 'Disputed',
    icon: AlertTriangle,
    className: S.red,
    title: 'Conflicts with another source',
  },
  quarantined: {
    label: 'Quarantined',
    icon: Ban,
    className: S.red,
    title: 'Failed validation; excluded from analysis',
  },
};

export function ValidationBadge({ value, className }: { value: ValidationStatus; className?: string }) {
  return <Tag spec={VALIDATION[value]} className={className} />;
}

const OUTCOME: Record<ValidationOutcome, Spec> = {
  accepted: { label: 'Accepted', icon: CheckCircle2, className: S.emerald, title: 'Passed all checks' },
  warned: {
    label: 'Accepted with warning',
    icon: AlertTriangle,
    className: S.amber,
    title: 'Stored with a visible qualification',
  },
  quarantined: {
    label: 'Quarantined',
    icon: Ban,
    className: S.red,
    title: 'Stored but excluded from analysis',
  },
  rejected: { label: 'Rejected', icon: XCircle, className: S.red, title: 'Not stored' },
  duplicate: {
    label: 'Duplicate',
    icon: Copy,
    className: S.neutral,
    title: 'Already held; nothing new stored',
  },
};

export function OutcomeBadge({ value, className }: { value: ValidationOutcome; className?: string }) {
  return <Tag spec={OUTCOME[value]} className={className} />;
}

const URGENCY: Record<Urgency, Spec> = {
  critical: { label: 'Critical', icon: AlertOctagon, className: S.red, title: 'Critical urgency' },
  elevated: { label: 'Elevated', icon: AlertTriangle, className: S.amber, title: 'Elevated urgency' },
  routine: { label: 'Routine', icon: Clock, className: S.neutral, title: 'Routine' },
};

export function UrgencyBadge({ value, className }: { value: Urgency; className?: string }) {
  return <Tag spec={URGENCY[value]} className={className} />;
}

const DISPOSITION: Record<SignalDisposition, Spec> = {
  new: { label: 'New', icon: Radio, className: S.cyan, title: 'Awaiting triage' },
  monitoring: { label: 'Monitoring', icon: Eye, className: S.amber, title: 'Under observation' },
  corroborated: {
    label: 'Corroborated',
    icon: CheckCircle2,
    className: S.emerald,
    title: 'Independently corroborated',
  },
  dismissed: { label: 'Dismissed', icon: XCircle, className: S.neutral, title: 'Dismissed with rationale' },
  case_opened: {
    label: 'Case opened',
    icon: FolderOpen,
    className: S.emerald,
    title: 'Promoted to an intelligence case',
  },
};

export function DispositionBadge({ value, className }: { value: SignalDisposition; className?: string }) {
  return <Tag spec={DISPOSITION[value]} className={className} />;
}

export const SIGNAL_TYPE: Record<SignalType, { label: string; icon: LucideIcon }> = {
  maritime: { label: 'Maritime', icon: Ship },
  land: { label: 'Land', icon: Truck },
  energy: { label: 'Energy', icon: Zap },
  supply_chain: { label: 'Supply chain', icon: Boxes },
  institutional: { label: 'Institutional', icon: Building2 },
};

export function SignalTypeTile({ value, className }: { value: SignalType; className?: string }) {
  const { icon: Icon, label } = SIGNAL_TYPE[value];
  return (
    <span
      title={label}
      className={cn(
        'motif flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-raised text-gold-bright',
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
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
              'relative h-2 w-4 overflow-hidden rounded-sm border',
              i <= level ? 'border-emerald' : 'border-line-strong',
            )}
          >
            {i <= level ? (
              <motion.span
                className="absolute inset-0 origin-left bg-emerald rtl:origin-right"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1], delay: 0.08 * i }}
              />
            ) : null}
          </span>
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
        'inline-flex items-center gap-1.5 rounded-full border border-cyan/50 bg-cyan-soft px-2.5 py-0.5 text-xs font-semibold text-cyan',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
      {STATE_LABEL[value]}
    </span>
  );
}
