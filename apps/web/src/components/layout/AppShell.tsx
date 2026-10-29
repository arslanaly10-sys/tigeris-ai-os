import { SECTORS, type AuthContext, type SectorKey } from '@tigeris/shared';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Landmark,
  Layers,
  LogOut,
  Menu,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { SidebarLandscape } from '@/components/illustrations/Scenes';
import { Wordmark } from '@/components/illustrations/PalmMark';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { useSignOut } from '@/lib/session';
import { isActive, NAV } from '@/nav';
import { DURATION, EASE_OUT, INDICATOR_SPRING } from '@/components/ui/motion';
import { SearchBox } from './SearchBox';

function hrefFor(kind: string, ref: string) {
  if (kind === 'case') return `/cases/${ref}`;
  if (kind === 'source') return `/sources#${ref}`;
  return `/signals?selected=${ref}`;
}

function NavList({ onNavigate, layoutGroup }: { onNavigate?: () => void; layoutGroup: string }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <ul className="space-y-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(item, pathname);
        return (
          <li key={item.path} className="relative">
            {active ? (
              <motion.span
                layoutId={`nav-active-${layoutGroup}`}
                className="absolute inset-0 rounded-lg bg-brand-soft"
                transition={INDICATOR_SPRING}
                aria-hidden
              />
            ) : null}
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-lg border-s-[3px] px-3 py-2.5 text-[14.5px] transition-colors',
                active
                  ? 'border-brand font-semibold text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.phase > 0 ? (
                <span className="rounded border border-line-strong px-1 text-[10px] font-medium text-ink-muted">
                  P{item.phase}
                </span>
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function DemoBanner() {
  const { t, lang } = useI18n();
  return (
    <div role="note" className="border-b border-gold/40 bg-gold-soft">
      <p className="pattern-synthetic flex items-center justify-center gap-2 px-4 py-1 text-center text-[11px] font-semibold tracking-wide text-gold-bright">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('demo.banner')}
      </p>
      {lang === 'ar' ? (
        <p className="border-t border-gold/30 px-4 py-0.5 text-center text-[11px] text-gold-bright">
          {t('ar.draft')}
        </p>
      ) : null}
    </div>
  );
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const options = [
    { value: 'en' as const, label: 'EN', className: '' },
    { value: 'ar' as const, label: 'العربية', className: 'font-arabic' },
  ];
  return (
    <div role="group" aria-label={t('top.language')} className="flex items-center text-sm">
      {options.map((o, i) => (
        <span key={o.value} className="flex items-center">
          {i > 0 ? (
            <span className="text-line-strong" aria-hidden>
              |
            </span>
          ) : null}
          <button
            type="button"
            lang={o.value}
            aria-pressed={lang === o.value}
            onClick={() => setLang(o.value)}
            className={cn(
              'relative rounded px-1.5 py-1',
              o.className,
              lang === o.value ? 'font-semibold text-ink' : 'text-ink-faint hover:text-ink',
            )}
          >
            {lang === o.value ? (
              <motion.span
                layoutId="lang-active"
                className="absolute inset-x-1.5 -bottom-0.5 h-0.5 rounded-full bg-brand"
                transition={INDICATOR_SPRING}
                aria-hidden
              />
            ) : null}
            {o.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function ApprovalsPopover() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['approvals'], queryFn: api.pendingApprovals, refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const count = q.data?.count ?? 0;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
          count > 0 ? 'border-gold bg-gold-soft text-gold-bright' : 'border-line-strong text-ink-muted',
        )}
      >
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">{t('top.approvals')}</span>
        <motion.span
          key={count}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          className={cn(
            'tabular min-w-5 rounded-full px-1.5 text-center text-xs font-semibold',
            count > 0 ? 'bg-gold-bright text-white' : 'bg-raised text-ink-faint',
          )}
        >
          {count}
        </motion.span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: DURATION.fast }}
          className="inline-flex"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </motion.span>
      </Popover.Trigger>
      <AnimatePresence>
        {open ? (
          <Popover.Portal forceMount>
            <Popover.Content align="end" sideOffset={8} asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                className="card-shadow z-40 w-[22rem] rounded-xl border border-line bg-panel p-2"
              >
                <p className="px-2 pt-1 pb-2 text-xs text-ink-faint">{t('top.approvalsHint')}</p>
                {count === 0 ? (
                  <p className="px-2 pb-2 text-sm text-ink-muted">{t('top.noApprovals')}</p>
                ) : (
                  <ul className="max-h-80 overflow-y-auto">
                    {q.data!.items.map((i) => (
                      <li key={`${i.kind}:${i.id}`}>
                        <Link
                          to={hrefFor(i.kind, i.ref)}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-raised"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink">{i.title}</span>
                            <span className="block text-xs text-ink-faint">
                              {i.nextStep}
                              {i.updatedAt ? ` · ${formatRelative(i.updatedAt)}` : ''}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 h-4 w-4 text-ink-faint rtl:rotate-180" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </AnimatePresence>
    </Popover.Root>
  );
}

function SectorSelect() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = pathname.startsWith('/sectors/') ? (pathname.split('/')[2] as SectorKey) : '';
  return (
    <label className="relative flex h-12 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-panel ps-3 pe-8">
      <Layers className="h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[10.5px] text-ink-faint">{t('top.sector')}</span>
        <select
          value={current}
          onChange={(e) => navigate(e.target.value ? `/sectors/${e.target.value}` : '/sectors')}
          className="block w-full max-w-[14rem] appearance-none truncate bg-transparent text-sm font-medium text-ink focus:outline-none"
        >
          <option value="">{t('top.allSectors')}</option>
          {SECTORS.map((s) => (
            <option key={s.key} value={s.key}>
              {lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
            </option>
          ))}
        </select>
      </span>
      <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-ink-faint" aria-hidden />
    </label>
  );
}

function InstitutionDisplay({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  return (
    <div
      className="flex h-12 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-panel px-3"
      title="Single-institution deployment: switching is disabled"
    >
      <Landmark className="h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[10.5px] text-ink-faint">{t('top.institution')}</span>
        <span className="block truncate text-sm font-medium text-ink">{ctx.institution.name}</span>
      </span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

function TopBar({ ctx, onOpenNav }: { ctx: AuthContext; onOpenNav: () => void }) {
  const { t } = useI18n();
  const signOut = useSignOut();
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur lg:px-6">
      <button
        type="button"
        className="rounded-md p-2 text-ink-muted hover:bg-raised hover:text-ink lg:hidden"
        onClick={onOpenNav}
        aria-label={t('nav.open')}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <div className="hidden min-w-0 gap-3 xl:flex">
        <InstitutionDisplay ctx={ctx} />
        <SectorSelect />
      </div>
      <p className="min-w-0 truncate text-sm font-medium text-ink xl:hidden">{ctx.institution.name}</p>
      <SearchBox className="ms-auto hidden w-full max-w-xs md:block" />
      <div className="ms-auto flex items-center gap-2 md:ms-0">
        <LanguageSwitch />
        <ApprovalsPopover />
        <div className="flex items-center gap-2 ps-1">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
            aria-hidden
          >
            {initials(ctx.principal.displayName)}
          </span>
          <div className="hidden leading-tight 2xl:block">
            <p className="text-sm font-medium text-ink">{ctx.principal.displayName}</p>
            <p className="text-[11px] text-ink-faint">
              {ctx.principal.roles.map((r) => ROLE_LABEL[r]).join(', ')}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('top.signOut')}
          title={t('top.signOut')}
          onClick={() => signOut.mutate(undefined, { onSettled: () => navigate('/sign-in') })}
          className="rounded-md p-2 text-ink-muted hover:bg-raised hover:text-ink"
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function Sidebar({
  ctx,
  onNavigate,
  layoutGroup,
}: {
  ctx: AuthContext;
  onNavigate?: () => void;
  layoutGroup: string;
}) {
  const { t } = useI18n();
  return (
    <div className="motif relative flex h-full flex-col bg-raised">
      <div className="px-5 pt-5 pb-6">
        <Wordmark />
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-4">
        <NavList onNavigate={onNavigate} layoutGroup={layoutGroup} />
      </div>
      <SidebarLandscape className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full" />
      <div className="relative z-10 mx-3 mb-3 rounded-lg border border-line bg-panel/90 px-3 py-2 text-[11px] leading-snug text-ink-muted backdrop-blur-sm">
        <p className="font-medium text-ink">{ctx.institution.name}</p>
        <p>{t('demo.label')}</p>
      </div>
    </div>
  );
}

export function AppShell({ ctx, children }: { ctx: AuthContext; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { t, dir } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t('nav.primary')}
          className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 border-e border-line lg:block"
        >
          <Sidebar ctx={ctx} layoutGroup="desktop" />
        </nav>

        <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
          <AnimatePresence>
            {navOpen ? (
              <Dialog.Portal forceMount>
                <Dialog.Overlay forceMount asChild>
                  <motion.div
                    className="fixed inset-0 z-40 bg-navy-950/35 lg:hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION.base }}
                  />
                </Dialog.Overlay>
                <Dialog.Content forceMount asChild>
                  <motion.div
                    initial={{ x: dir === 'rtl' ? '100%' : '-100%' }}
                    animate={{ x: 0 }}
                    exit={{
                      x: dir === 'rtl' ? '100%' : '-100%',
                      transition: { duration: DURATION.base, ease: [0.4, 0, 1, 1] },
                    }}
                    transition={{ duration: DURATION.slow, ease: EASE_OUT }}
                    className="fixed inset-y-0 start-0 z-50 w-72 border-e border-line outline-none lg:hidden"
                  >
                    <Dialog.Title className="sr-only">{t('nav.primary')}</Dialog.Title>
                    <Dialog.Description className="sr-only">{t('nav.primary')}</Dialog.Description>
                    <Dialog.Close
                      className="absolute end-3 top-5 z-20 rounded p-1 text-ink-muted hover:text-ink"
                      aria-label={t('nav.close')}
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </Dialog.Close>
                    <nav aria-label={t('nav.primary')} className="h-full">
                      <Sidebar ctx={ctx} layoutGroup="mobile" onNavigate={() => setNavOpen(false)} />
                    </nav>
                  </motion.div>
                </Dialog.Content>
              </Dialog.Portal>
            ) : null}
          </AnimatePresence>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar ctx={ctx} onOpenNav={() => setNavOpen(true)} />
          <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
