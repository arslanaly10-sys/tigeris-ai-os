import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Wordmark } from '@/components/layout/Brand';
import { api } from '@/lib/api';
import { ROLE_LABEL, ROLE_PURPOSE } from '@/lib/roles';

/**
 * Sign-in (FR-01–FR-04, UI brief §8). Production authenticates through the institution's identity
 * provider with MFA; this demonstration build offers seeded roles only and says so plainly.
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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-navy-950 px-6 py-8 text-navy-100 sm:px-10 lg:py-12">
        <svg
          className="pointer-events-none absolute -end-24 -bottom-24 h-96 w-96 text-navy-800"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <g fill="none" stroke="currentColor" strokeWidth="0.6">
            {[0, 1, 2, 3].map((i) => (
              <g key={i} transform={`scale(${1 - i * 0.2}) translate(${i * 12.5} ${i * 12.5})`}>
                <rect x="20" y="20" width="60" height="60" />
                <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
              </g>
            ))}
          </g>
        </svg>
        <div className="relative">
          <Wordmark />
          <h1 className="mt-10 max-w-md text-3xl leading-tight text-white sm:text-4xl">
            Intelligence into Capability.
            <span className="block text-gold-bright">Capital into Sovereign Advantage.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-300">
            An institution-owned intelligence and decision layer. Validated evidence becomes governed,
            traceable options for human authority.
          </p>
        </div>
        <ul className="relative mt-10 space-y-3 text-sm">
          <li className="flex gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
            <span>
              Pilot and production deployments sign in through the institution&rsquo;s own identity provider
              with MFA. No public registration.
            </span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
            <span>
              Data, graph, policies and memory stay inside the institution&rsquo;s deployment boundary. These
              visual cues are not a security certification.
            </span>
          </li>
        </ul>
      </aside>

      <main className="flex flex-col bg-ivory px-4 py-8 sm:px-10 lg:py-12">
        <div className="pattern-synthetic mb-6 flex items-start gap-3 rounded-lg border border-gold bg-gold-soft px-4 py-3 text-sm text-gold-text">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Demonstration Mode.</strong> Choose a seeded role to explore the
            fictional {principals.data?.institution.name ?? 'demonstration institution'}. All institution data
            is synthetic; public facts are dated snapshots pending factual review. No real credentials are
            used.
          </p>
        </div>

        <h2 className="text-2xl text-ink">Choose a demonstration role</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Each role sees the same case through its own authority boundary.
        </p>

        {principals.isPending ? (
          <p className="mt-6 text-sm text-ink-muted">Loading roles…</p>
        ) : principals.isError ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red bg-red-soft px-4 py-3 text-sm text-red"
          >
            The demonstration service is unavailable. Check that the API is running and the database is
            seeded.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {principals.data.principals.map((p) => {
              const role = p.roles[0]!;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate(p.id)}
                    className="group flex h-full w-full flex-col rounded-lg border border-line bg-paper p-4 text-start transition-colors hover:border-navy-600 hover:bg-white disabled:opacity-60"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gold-text">
                        {ROLE_LABEL[role]}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1.5 font-serif text-lg font-semibold text-ink">{p.displayName}</span>
                    <span className="text-sm text-ink-muted">{p.title}</span>
                    <span className="mt-2 text-xs leading-relaxed text-ink-muted">{ROLE_PURPOSE[role]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {start.isError ? (
          <p role="alert" className="mt-4 text-sm text-red">
            Could not start the demonstration session. Try again.
          </p>
        ) : null}
      </main>
    </div>
  );
}
