import type { AuthContext } from '@tigeris/shared';
import * as Dialog from '@radix-ui/react-dialog';
import { FlaskConical, LogOut, Menu, MoveHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { DataModeBadge } from '@/components/truth/badges';
import { cn } from '@/lib/cn';
import { useDirection } from '@/lib/direction';
import { ROLE_LABEL } from '@/lib/roles';
import { useSignOut } from '@/lib/session';
import { NAV } from '@/nav';
import { Wordmark } from './Brand';
import { SearchBox } from './SearchBox';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg border-s-2 px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-gold bg-gradient-to-r from-gold/15 to-transparent font-semibold text-ink rtl:bg-gradient-to-l'
                    : 'border-transparent text-ink-muted hover:bg-raised/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-gold-bright' : '')} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.phase > 0 ? (
                    <span className="rounded border border-line-strong px-1 text-[10px] font-medium text-ink-faint">
                      P{item.phase}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Persistent banner: demonstration environment and synthetic data (FR-04, PRD §5.3). */
function DemoBanner() {
  return (
    <div
      role="note"
      className="pattern-synthetic flex items-center justify-center gap-2 border-b border-gold/40 bg-gold-soft px-4 py-1 text-center text-[11px] font-semibold tracking-wide text-gold-bright"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        DEMONSTRATION MODE — fictional institution; synthetic and dated public snapshot data. No live feeds.
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
  const { dir, toggle } = useDirection();
  const signOut = useSignOut();
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-line bg-navy-900/95 px-4 py-2.5 lg:px-6">
      <button
        type="button"
        className="rounded-md p-2 text-ink-muted hover:bg-raised hover:text-ink lg:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <p className="min-w-0 truncate text-sm font-medium text-ink md:hidden">{ctx.institution.name}</p>
      <SearchBox className="hidden w-full max-w-md md:block" />
      <dl className="ms-auto hidden items-center gap-4 text-xs xl:flex">
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-faint">Environment</dt>
          <dd className="font-semibold text-gold-bright">Demonstration</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-faint">Data</dt>
          <dd className="flex gap-1">
            {ctx.dataModes.map((m) => (
              <DataModeBadge key={m} value={m} />
            ))}
          </dd>
        </div>
      </dl>
      <div className="ms-auto flex items-center gap-2 xl:ms-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={dir === 'rtl'}
          title="Preview right-to-left layout for Arabic"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          <MoveHorizontal className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">RTL preview</span>
        </button>
        <div className="flex items-center gap-2.5 ps-1">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/50 bg-raised text-xs font-semibold text-gold-bright"
            aria-hidden
          >
            {initials(ctx.principal.displayName)}
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-ink">{ctx.principal.displayName}</p>
            <p className="text-[11px] text-ink-faint">
              {ctx.principal.roles.map((r) => ROLE_LABEL[r]).join(', ')}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => signOut.mutate(undefined, { onSettled: () => navigate('/sign-in') })}
          className="rounded-md p-2 text-ink-muted hover:bg-raised hover:text-ink"
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </button>
      </div>
    </header>
  );
}

export function AppShell({ ctx, children }: { ctx: AuthContext; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
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
          aria-label="Primary"
          className="hidden w-64 shrink-0 flex-col border-e border-line bg-navy-950 lg:flex"
        >
          <div className="px-5 py-5">
            <Wordmark />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <NavList />
          </div>
          <div className="border-t border-line px-5 py-3 text-[11px] leading-snug text-ink-faint">
            <p className="font-medium text-ink-muted">{ctx.institution.name}</p>
            <p className="mt-0.5">P3–P5: module arrives in that delivery phase</p>
          </div>
        </nav>

        <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/70 lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-line bg-navy-950 outline-none lg:hidden">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Description className="sr-only">Primary navigation</Dialog.Description>
              <div className="flex items-center justify-between px-5 py-4">
                <Wordmark />
                <Dialog.Close
                  className="rounded p-1 text-ink-muted hover:text-ink"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" aria-hidden />
                </Dialog.Close>
              </div>
              <div className="px-4 pb-3">
                <SearchBox />
              </div>
              <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
                <NavList onNavigate={() => setNavOpen(false)} />
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
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
