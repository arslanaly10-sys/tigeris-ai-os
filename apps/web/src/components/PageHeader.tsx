import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {meta}
    </div>
  );
}

export function LoadState({ isPending, error }: { isPending: boolean; error: unknown }) {
  if (isPending) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (error)
    return (
      <p role="alert" className="rounded-md border border-red bg-red-soft px-4 py-3 text-sm text-red">
        This view could not be loaded. The service returned an error; nothing has been changed.
      </p>
    );
  return null;
}
