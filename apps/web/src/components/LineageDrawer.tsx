import type { EvidenceFact, EvidenceItem } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { ClaimBadge, SourceClassBadge, ValidationBadge } from '@/components/truth/badges';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { formatDateTime, formatFactValue, humanize } from '@/lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  );
}

export interface LineageTarget {
  evidenceId: string;
  fact: EvidenceFact | null;
  /** Resolve the fact from the loaded evidence by predicate (used by sector KPIs). */
  predicate?: string;
}

/**
 * Lineage drawer (FR-08, AC-03, TRD §5.1): origin, time and scope, rights and version,
 * transformation, data class and validation for one fact. Opening it records an audit event.
 */
export function LineageDrawer({ target, onClose }: { target: LineageTarget | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['evidence', target?.evidenceId],
    queryFn: () => api.evidence(target!.evidenceId),
    enabled: target !== null,
  });
  const e: EvidenceItem | undefined = q.data;
  const fact =
    target?.fact ??
    (target?.predicate ? (e?.facts.find((f) => f.predicate === target.predicate) ?? null) : null);

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Lineage"
      description={fact ? `${fact.subject} — ${fact.predicate}` : e?.title}
    >
      {q.isPending ? <p className="px-5 py-4 text-sm text-ink-muted">Loading lineage…</p> : null}
      {q.isError ? (
        <p role="alert" className="m-5 rounded-md border border-red bg-red-soft px-4 py-3 text-sm text-red">
          Lineage could not be loaded.
        </p>
      ) : null}
      {e ? (
        <>
          {fact ? (
            <Section title="Value">
              <Row label="Value">
                <span className="tabular font-semibold">{formatFactValue(fact)}</span>
              </Row>
              <Row label="Claim class">
                <ClaimBadge value={fact.claimClass} />
              </Row>
              {fact.validFrom ? <Row label="Valid from">{formatDateTime(fact.validFrom)}</Row> : null}
              <Row label="Transformation">{fact.transformation ?? 'None recorded — value as reported.'}</Row>
              <Row label="Extraction">{fact.extractionVersion}</Row>
            </Section>
          ) : null}

          <Section title="Evidence record">
            <Row label="Title">{e.title}</Row>
            <Row label="Validation">
              <span className="flex flex-col items-start gap-1">
                <ValidationBadge value={e.validationStatus} />
                {e.validationNote ? <span className="text-ink-muted">{e.validationNote}</span> : null}
              </span>
            </Row>
            <Row label="Event time">{formatDateTime(e.eventTime)}</Row>
            <Row label="Retrieved">{formatDateTime(e.retrievedAt)}</Row>
            <Row label="Version">{e.version}</Row>
            <Row label="Content hash">
              {e.sha256 ? (
                <span className="font-mono text-xs">{e.sha256}</span>
              ) : (
                <span className="text-amber">Not captured — snapshot pending</span>
              )}
            </Row>
          </Section>

          <Section title="Source">
            <Row label="Publisher">{e.source.publisher}</Row>
            <Row label="Title">{e.source.title}</Row>
            <Row label="Class">
              <SourceClassBadge value={e.source.sourceClass} />
            </Row>
            <Row label="Approval">{humanize(e.source.approvalStatus)}</Row>
            <Row label="Terms">{e.source.termsRef ?? 'Not recorded'}</Row>
            <Row label="Link">
              {e.source.url ? (
                <a
                  href={e.source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 break-all text-cyan underline underline-offset-2"
                >
                  {e.source.url}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                'No external link (synthetic source)'
              )}
            </Row>
          </Section>
          <p className="px-5 py-4 text-xs text-ink-muted">
            Viewing lineage is recorded in the institution&rsquo;s audit trail.
          </p>
        </>
      ) : null}
    </Sheet>
  );
}
