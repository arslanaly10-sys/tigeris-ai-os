import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * TIGERIS palm mark (working mark pending client brand approval). A stylised date palm only — deliberately
 * no crossed swords or other elements of national emblems.
 */
export function PalmMark({ className, tone = 'gold' }: { className?: string; tone?: 'gold' | 'ink' }) {
  const id = useId();
  const fill = tone === 'gold' ? `url(#${id}-g)` : 'currentColor';
  return (
    <svg viewBox="0 0 48 48" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6b471" />
          <stop offset="0.55" stopColor="#b8924f" />
          <stop offset="1" stopColor="#8a6a31" />
        </linearGradient>
      </defs>
      <g fill={fill}>
        <path d="M24 16 C18 10 10 10 3.5 15.5 C11 13 17 14 24 17.5 Z" />
        <path d="M24 16 C30 10 38 10 44.5 15.5 C37 13 31 14 24 17.5 Z" />
        <path d="M24 15.5 C21 8 15 3.5 8.5 3.5 C15 7 19 10.5 24 16.5 Z" />
        <path d="M24 15.5 C27 8 33 3.5 39.5 3.5 C33 7 29 10.5 24 16.5 Z" />
        <path d="M24 15 C23 9 24 4.5 26.5 1 C26 6 25.6 10.5 24.8 15.8 Z" />
        <path d="M24 17 C17 16 11 19.5 6.5 26 C12 21.5 18 19.5 24 18.5 Z" />
        <path d="M24 17 C31 16 37 19.5 41.5 26 C36 21.5 30 19.5 24 18.5 Z" />
        <path d="M22.8 17.5 C22.4 26 22 36 20.8 46 L25.4 46 C25.3 36 25.2 26 25.2 17.5 Z" />
      </g>
      <g stroke={tone === 'gold' ? '#f6eedc' : 'white'} strokeWidth="0.7" opacity="0.7">
        {[22, 26, 30, 34, 38, 42].map((y) => (
          <line key={y} x1="21.5" y1={y} x2="25.5" y2={y - 1.2} />
        ))}
      </g>
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <PalmMark className="h-10 w-10 shrink-0" />
      <span className="leading-tight">
        <span className="block font-serif text-[1.35rem] font-semibold tracking-[0.06em] text-ink">
          TIGERIS AI OS
        </span>
        {compact ? null : (
          <span className="block max-w-[13rem] text-[12px] font-medium text-gold-bright">
            Sovereign Intelligence OS
          </span>
        )}
      </span>
    </span>
  );
}
