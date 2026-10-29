import { cn } from '@/lib/cn';

/** Working wordmark pending client brand approval. A geometric mark — not a seal, flag or emblem. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="9" y="9" width="14" height="14" />
        <rect x="9" y="9" width="14" height="14" transform="rotate(45 16 16)" />
      </g>
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="text-gold-bright" />
      <span className="leading-tight">
        <span className="block font-serif text-xl font-semibold tracking-[0.12em] text-white">TIGERIS</span>
        {compact ? null : (
          <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-gold-bright">
            AI OS
          </span>
        )}
      </span>
    </span>
  );
}
