import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-xl border border-line bg-panel', className)} {...props} />;
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
        {icon ? <span className="mt-1 text-gold-bright">{icon}</span> : null}
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

/**
 * A card's foot: its total or its "View all". In a row of cards it grows to fill the card's stretched height,
 * so cards share a bottom edge without leaving a blank band (taste review: ragged rows and panel voids).
 */
export function PanelFooter({ children, grow = true }: { children: ReactNode; grow?: boolean }) {
  return (
    <div
      className={cn(
        'mt-auto flex items-end border-t border-line bg-raised/50 px-5 py-2.5 text-[13px] text-ink-muted',
        grow && 'flex-1',
      )}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-2">{children}</div>
    </div>
  );
}
