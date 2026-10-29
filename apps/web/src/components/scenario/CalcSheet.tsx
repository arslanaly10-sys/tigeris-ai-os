import {
  formatScenarioValue,
  type MetricDef,
  type ScenarioInputRef,
  type ScenarioRunDetail,
} from '@tigeris/shared';
import { Calculator, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { ClaimBadge, ValidationBadge } from '@/components/truth/badges';
import { Sheet } from '@/components/ui/sheet';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function InputRow({
  input,
  onEvidence,
}: {
  input: ScenarioInputRef;
  onEvidence: (id: string, label: string) => void;
}) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{input.label}</span>
        <ClaimBadge value={input.claimClass} />
        {input.kind === 'evidence_fact' && input.validationStatus !== 'validated' ? (
          <ValidationBadge value={input.validationStatus} />
        ) : null}
      </div>
      <p className="tabular mt-0.5 text-sm text-ink">
        {input.kind === 'assumption'
          ? `${formatScenarioValue(input.low, input.unit)} · ${formatScenarioValue(input.central, input.unit)} · ${formatScenarioValue(input.high, input.unit)} (low · central · high)`
          : formatScenarioValue(input.value, input.unit)}
      </p>
      <p className="text-xs text-ink-muted">
        {input.kind === 'evidence_fact'
          ? `Evidence fact · ${input.publisher}`
          : input.kind === 'assumption'
            ? `Assumption register v${input.version} · ${input.rationale}`
            : 'Analyst driver for this run'}
      </p>
      {input.kind === 'evidence_fact' ? (
        <button
          type="button"
          onClick={() => onEvidence(input.evidenceId, input.label)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Source lineage<span className="sr-only"> for {input.label}</span>
        </button>
      ) : null}
    </li>
  );
}

/**
 * Calculation lineage for one scenario metric: the versioned formula, every input it used with its truth
 * label, and the values at each horizon. Evidence inputs link onward to source lineage.
 */
export function CalcSheet({
  run,
  metric,
  onClose,
  onEvidence,
}: {
  run: ScenarioRunDetail;
  metric: MetricDef | null;
  onClose: () => void;
  onEvidence: (evidenceId: string, predicate: string) => void;
}) {
  const values = metric ? run.result.metrics.find((m) => m.key === metric.key)?.values : undefined;
  const inputs = metric ? run.inputs.filter((i) => metric.inputs.includes(i.ref)) : [];
  return (
    <Sheet
      open={metric !== null}
      onOpenChange={(o) => !o && onClose()}
      title="How this is calculated"
      description={metric?.label}
    >
      {metric && values ? (
        <>
          <Section title="Formula">
            <p className="flex gap-2 text-sm text-ink">
              <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
              {metric.formula}
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Engine {run.templateKey} {run.engineVersion} · deterministic code, no model · unit:{' '}
              {metric.unit}
            </p>
          </Section>
          <Section title="Values by horizon">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-muted">
                  <th scope="col" className="py-1 text-start font-medium">
                    Horizon
                  </th>
                  <th scope="col" className="py-1 text-end font-medium">
                    Low
                  </th>
                  <th scope="col" className="py-1 text-end font-medium">
                    Central
                  </th>
                  <th scope="col" className="py-1 text-end font-medium">
                    High
                  </th>
                  <th scope="col" className="py-1 text-end font-medium">
                    Baseline
                  </th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {run.result.horizons.map((h) => {
                  const v = values[h.key];
                  return (
                    <tr key={h.key}>
                      <th scope="row" className="py-1.5 text-start font-normal text-ink-muted">
                        {h.label}
                      </th>
                      <td className="py-1.5 text-end">{formatScenarioValue(v.low, null, metric.decimals)}</td>
                      <td className="py-1.5 text-end font-semibold">
                        {formatScenarioValue(v.central, null, metric.decimals)}
                      </td>
                      <td className="py-1.5 text-end">
                        {formatScenarioValue(v.high, null, metric.decimals)}
                      </td>
                      <td className="py-1.5 text-end text-ink-muted">
                        {formatScenarioValue(v.baseline, null, metric.decimals)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
          <Section title={`Inputs (${inputs.length})`}>
            <ul className="divide-y divide-line">
              {inputs.map((i) => (
                <InputRow key={i.ref} input={i} onEvidence={(id, label) => onEvidence(id, label)} />
              ))}
            </ul>
          </Section>
          <p className="px-5 py-4 text-xs text-ink-muted">
            Ranges evaluate the same formula with every assumption at its low-impact end, its central value
            and its high-impact end. Drivers stay fixed. Run {run.key} is reproducible from these stored
            inputs.
          </p>
        </>
      ) : null}
    </Sheet>
  );
}
