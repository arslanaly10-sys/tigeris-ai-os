import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'rounded-xl border border-line bg-panel shadow-[0_1px_0_rgb(255_255_255/0.02)_inset]',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  action,
  id,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-1 text-gold">{icon}</span> : null}
        <div className="min-w-0">
          <h2 id={id} className="text-lg text-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}
