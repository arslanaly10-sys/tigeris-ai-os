import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Database, FileCheck2, FlaskConical, Landmark, Server } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Wordmark } from '@/components/layout/Brand';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';
import { GulfSilhouette } from '@/components/map/GulfSilhouette';

/**
 * Sign-in (FR-01–FR-04, UI brief §8). Pilot and production deployments authenticate through the
 * institution's identity provider with MFA. This demonstration build has no password form: it offers
 * seeded, clearly labelled roles only.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const principals = useQuery({ queryKey: ['auth', 'demo-principals'], queryFn: api.demoPrincipals });
  const start = useMutation({
    mutationFn: api.startDemoSession,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth'] });
      navigate('/');
    },
  });

  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,40rem)]">
      <div className="relative hidden lg:block" aria-hidden>
        <GulfSilhouette className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-canvas rtl:bg-gradient-to-l" />
        <div className="absolute start-10 bottom-10 max-w-sm">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-ink-muted">
            Intelligence into capability
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.35em] text-gold-bright">
            Capital into sovereign advantage
          </p>
          <span className="mt-4 block h-px w-12 bg-gold" />
        </div>
      </div>

      <main className="motif relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl border border-line-strong bg-panel/95 px-6 py-8 shadow-2xl sm:px-9">
          <Wordmark stacked />
          <h1 className="mt-8 text-center text-2xl text-ink sm:text-3xl">Secure institutional access</h1>
          <p className="mt-1 text-center text-sm text-ink-muted">Sign in to your sovereign workspace</p>

          <div className="mt-7">
            <button
              type="button"
              disabled
              aria-describedby="sso-note"
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong text-sm font-medium text-ink-muted"
            >
              <Landmark className="h-4 w-4 text-gold" aria-hidden />
              Continue with institutional SSO
            </button>
            <p id="sso-note" className="mt-1.5 text-center text-xs text-ink-faint">
              Not connected in this demonstration build. Pilots use the institution&rsquo;s identity provider
              with MFA.
            </p>
          </div>

          <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-faint">
            <span className="h-px flex-1 bg-line" />
            Demonstration access
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="pattern-synthetic mb-4 flex items-start gap-2.5 rounded-lg border border-gold/50 bg-gold-soft px-3 py-2.5 text-xs text-gold-bright">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">Demonstration Mode.</strong> Choose a seeded role in the
              fictional {principals.data?.institution.name ?? 'demonstration institution'}. No real
              credentials are used.
            </p>
          </div>

          <h2 className="sr-only">Choose a demonstration role</h2>
          {principals.isPending ? (
            <p className="text-sm text-ink-muted">Loading roles…</p>
          ) : principals.isError ? (
            <p
              role="alert"
              className="rounded-lg border border-red/60 bg-red-soft px-4 py-3 text-sm text-red"
            >
              The demonstration service is unavailable. Check that the API is running and the database is
              seeded.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {principals.data.principals.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate(p.id)}
                    className="group flex w-full items-center gap-3 bg-panel px-3.5 py-2.5 text-start transition-colors hover:bg-raised disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{p.displayName}</span>
                      <span className="block text-xs text-ink-faint">
                        {ROLE_LABEL[p.roles[0]!]} · {p.title}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-ink-faint group-hover:text-gold-bright rtl:rotate-180"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {start.isError ? (
            <p role="alert" className="mt-3 text-sm text-red">
              Could not start the demonstration session. Try again.
            </p>
          ) : null}

          <ul className="mt-7 grid grid-cols-3 gap-2 border-t border-line pt-5 text-center text-[11px] text-ink-muted">
            <li className="flex flex-col items-center gap-1.5">
              <Database className="h-4 w-4 text-gold" aria-hidden />
              Institution-owned data
            </li>
            <li className="flex flex-col items-center gap-1.5">
              <Server className="h-4 w-4 text-gold" aria-hidden />
              Built for on-premise
            </li>
            <li className="flex flex-col items-center gap-1.5">
              <FileCheck2 className="h-4 w-4 text-gold" aria-hidden />
              All access is audited
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
