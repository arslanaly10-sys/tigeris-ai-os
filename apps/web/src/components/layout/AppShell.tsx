import type { AuthContext } from '@tigeris/shared';
import * as Dialog from '@radix-ui/react-dialog';
import { FlaskConical, LogOut, Menu, MoveHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { DataModeBadge } from '@/components/truth/badges';
import { cn } from '@/lib/cn';
import { useDirection } from '@/lib/direction';
import { ROLE_LABEL } from '@/lib/roles';
import { useSignOut } from '@/lib/session';
import { NAV } from '@/nav';
import { Wordmark } from './Brand';

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
                  'group flex items-center gap-3 rounded-md border-s-2 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'border-gold-bright bg-navy-800 font-semibold text-white'
                    : 'border-transparent text-navy-100 hover:bg-navy-800/70 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.phase > 1 ? (
                <span className="rounded border border-navy-600 px-1 text-[10px] font-medium text-navy-300">
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

/** Persistent banner: demonstration environment and synthetic data (FR-04, PRD §5.3). */
function DemoBanner() {
  return (
    <div
      role="note"
      className="pattern-synthetic flex items-center justify-center gap-2 border-b border-gold bg-gold-soft px-4 py-1.5 text-center text-xs font-semibold text-gold-text"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        DEMONSTRATION MODE — fictional institution; synthetic and dated public snapshot data only. No live
        feeds.
      </span>
    </div>
  );
}

function ContextBar({ ctx, onOpenNav }: { ctx: AuthContext; onOpenNav: () => void }) {
  const { dir, toggle } = useDirection();
  const signOut = useSignOut();
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-navy-800 bg-navy-900 px-4 py-2.5 text-navy-100 lg:px-6">
      <Button
        variant="onNavy"
        size="icon"
        className="lg:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>
      <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <div className="min-w-0">
          <dt className="sr-only">Institution</dt>
          <dd className="truncate font-semibold text-white">{ctx.institution.name}</dd>
        </div>
        <div className="hidden md:block">
          <dt className="inline text-navy-300">Environment: </dt>
          <dd className="inline font-semibold text-gold-bright">Demonstration</dd>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <dt className="text-navy-300">Data mode:</dt>
          <dd className="flex gap-1">
            {ctx.dataModes.map((m) => (
              <DataModeBadge key={m} value={m} />
            ))}
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-2">
        <Button
          variant="onNavy"
          size="sm"
          onClick={toggle}
          aria-pressed={dir === 'rtl'}
          title="Preview right-to-left layout for Arabic"
        >
          <MoveHorizontal className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">RTL preview</span>
        </Button>
        <div className="hidden text-end sm:block">
          <p className="text-xs font-semibold text-white">{ctx.principal.displayName}</p>
          <p className="text-[11px] text-navy-300">
            {ctx.principal.roles.map((r) => ROLE_LABEL[r]).join(', ')}
          </p>
        </div>
        <Button
          variant="onNavy"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => signOut.mutate(undefined, { onSettled: () => navigate('/sign-in') })}
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </header>
  );
}

export function AppShell({ ctx, children }: { ctx: AuthContext; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Primary" className="hidden w-64 shrink-0 flex-col bg-navy-950 lg:flex">
          <div className="border-b border-navy-800 px-5 py-4">
            <Wordmark />
            <p className="mt-2 text-[11px] leading-snug text-navy-300">
              Sovereign Intelligence Operating System
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavList />
          </div>
          <p className="border-t border-navy-800 px-5 py-3 text-[11px] text-navy-300">
            P2–P5 = module arrives in that delivery phase
          </p>
        </nav>

        <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50 lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-72 flex-col bg-navy-950 outline-none lg:hidden">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Description className="sr-only">Primary navigation</Dialog.Description>
              <div className="flex items-center justify-between border-b border-navy-800 px-5 py-4">
                <Wordmark />
                <Dialog.Close
                  className="rounded p-1 text-navy-100 hover:text-white"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" aria-hidden />
                </Dialog.Close>
              </div>
              <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
                <NavList onNavigate={() => setNavOpen(false)} />
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <ContextBar ctx={ctx} onOpenNav={() => setNavOpen(true)} />
          <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
