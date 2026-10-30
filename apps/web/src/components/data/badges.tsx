/** Connector, record-mode and quality badges: always words plus an icon (and a hatch for synthetic), never colour alone. */
import type { ConnectorRunItem, ConnectorStatus, QualityStatus, RecordMode } from '@tigeris/shared';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  Hand,
  Loader2,
  PauseCircle,
  PlugZap,
  Upload,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface Spec {
  label: string;
  icon: LucideIcon;
  cls: string;
}

function Tag({ spec, title, className }: { spec: Spec; title?: string; className?: string }) {
  const Icon = spec.icon;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[12px] font-semibold',
        spec.cls,
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
  amber: 'border-amber/60 bg-amber-soft text-amber',
  red: 'border-red/60 bg-red-soft text-red',
  muted: 'border-line-strong bg-raised text-ink-muted',
  gold: 'pattern-synthetic border-gold/60 bg-gold-soft text-gold-bright',
};

export const CONNECTOR_STATUS: Record<ConnectorStatus, Spec & { help: string }> = {
  sample: {
    label: 'Sample',
    icon: FlaskConical,
    cls: S.gold,
    help: 'Demonstration data; not a connection to any system.',
  },
  configured: {
    label: 'Configured',
    icon: CircleDashed,
    cls: S.muted,
    help: 'Registered; no successful authenticated fetch yet.',
  },
  connected: {
    label: 'Connected',
    icon: PlugZap,
    cls: S.emerald,
    help: 'The last authenticated fetch succeeded.',
  },
  paused: { label: 'Paused', icon: PauseCircle, cls: S.amber, help: 'No syncs or imports until resumed.' },
  failed: { label: 'Failed', icon: XCircle, cls: S.red, help: 'The last attempt failed; see the error.' },
  retired: { label: 'Retired', icon: Ban, cls: S.muted, help: 'Permanently out of use; history kept.' },
};

export function ConnectorStatusBadge({ value }: { value: ConnectorStatus }) {
  return <Tag spec={CONNECTOR_STATUS[value]} title={CONNECTOR_STATUS[value].help} />;
}

const MODE: Record<RecordMode, Spec> = {
  live: { label: 'Live', icon: PlugZap, cls: S.emerald },
  imported: { label: 'Imported', icon: Upload, cls: S.cyan },
  synthetic: { label: 'Synthetic', icon: FlaskConical, cls: S.gold },
  sample: { label: 'Sample', icon: FlaskConical, cls: S.gold },
  manual: { label: 'Manual entry', icon: Hand, cls: S.muted },
};

export function RecordModeBadge({ value }: { value: RecordMode }) {
  return <Tag spec={MODE[value]} />;
}

const QUALITY: Record<QualityStatus, Spec> = {
  valid: { label: 'Valid', icon: CheckCircle2, cls: S.emerald },
  warning: { label: 'Warning', icon: AlertTriangle, cls: S.amber },
  quarantined: { label: 'Quarantined', icon: Ban, cls: S.red },
};

export function QualityBadge({ value }: { value: QualityStatus }) {
  return <Tag spec={QUALITY[value]} />;
}

const RUN: Record<ConnectorRunItem['status'], Spec> = {
  running: { label: 'Running', icon: Loader2, cls: S.muted },
  succeeded: { label: 'Succeeded', icon: CheckCircle2, cls: S.emerald },
  partial: { label: 'Partial', icon: AlertTriangle, cls: S.amber },
  failed: { label: 'Failed', icon: XCircle, cls: S.red },
};

export function RunStatusBadge({ value }: { value: ConnectorRunItem['status'] }) {
  return <Tag spec={RUN[value]} />;
}

export function ApprovalBadge({ value }: { value: 'approved' | 'pending' | 'rejected' }) {
  const spec: Spec =
    value === 'approved'
      ? { label: 'Source approved', icon: CheckCircle2, cls: S.emerald }
      : value === 'pending'
        ? { label: 'Source pending approval', icon: Hand, cls: S.amber }
        : { label: 'Source rejected', icon: Ban, cls: S.red };
  return <Tag spec={spec} />;
}
