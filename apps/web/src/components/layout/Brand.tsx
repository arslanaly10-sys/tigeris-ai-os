import { cn } from '@/lib/cn';

/** Working wordmark pending client brand approval. A geometric mark — not a seal, flag or emblem. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="9" y="9" width="14" height="14" />
        <rect x="9" y="9" width="14" height="14" transform="rotate(45 16 16)" />
        <circle cx="16" cy="16" r="5" />
      </g>
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ size = 'md', stacked = false }: { size?: 'md' | 'lg'; stacked?: boolean }) {
  if (stacked) {
    return (
      <span className="flex flex-col items-center text-center">
        <span
          className={cn(
            'font-serif font-medium tracking-[0.32em] text-ink',
            size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl',
          )}
        >
          TIGERIS
        </span>
        <span className="mt-2 h-px w-10 bg-gold" aria-hidden />
        <span className="mt-3 text-[11px] font-medium uppercase tracking-[0.34em] text-gold-bright">
          Sovereign Intelligence OS
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="text-gold" />
      <span className="leading-tight">
        <span className="block font-serif text-xl font-medium tracking-[0.16em] text-ink">TIGERIS</span>
        <span className="block whitespace-nowrap text-[8.5px] font-medium uppercase tracking-[0.18em] text-gold-bright">
          Sovereign Intelligence OS
        </span>
      </span>
    </span>
  );
}
