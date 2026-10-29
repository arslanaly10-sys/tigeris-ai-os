import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { useI18n, type MessageKey } from '@/lib/i18n';

const ITEMS: { to: string; key: MessageKey }[] = [
  { to: '/sectors', key: 'sub.sectors' },
  { to: '/signals', key: 'sub.signals' },
  { to: '/cases', key: 'sub.cases' },
  { to: '/graph', key: 'sub.graph' },
];

/** Secondary navigation inside Sector Intelligence (Signals, Cases and Graph are nested here). */
export function SectorSubnav() {
  const { t } = useI18n();
  return (
    <nav aria-label={t('nav.sectors')} className="mb-5 flex flex-wrap gap-1 border-b border-line">
      {ITEMS.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              isActive ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink',
            )
          }
        >
          {t(i.key)}
        </NavLink>
      ))}
    </nav>
  );
}
