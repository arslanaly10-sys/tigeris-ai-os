import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BarChart3, ChevronRight, FlaskConical, Layers, Leaf } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PalmMark } from '@/components/illustrations/PalmMark';
import { SkylineHero } from '@/components/illustrations/Scenes';
import { Collapse, StaggerItem, StaggerList } from '@/components/ui/motion';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';

function LanguageLinks() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('top.language')}
      className="flex items-center gap-3 font-serif text-[15px]"
    >
      <button
        type="button"
        lang="en"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
        className={lang === 'en' ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'}
      >
        English
      </button>
      <span className="text-line-strong" aria-hidden>
        |
      </span>
      <button
        type="button"
        lang="ar"
        aria-pressed={lang === 'ar'}
        onClick={() => setLang('ar')}
        className={cn(
          'font-arabic',
          lang === 'ar' ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        العربية
      </button>
    </div>
  );
}

function RolePicker({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
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
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="pattern-synthetic mb-4 flex items-start gap-2.5 rounded-lg border border-gold/50 bg-gold-soft px-3 py-2.5 text-xs text-gold-bright">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>{t('signin.demoNote')}</p>
      </div>
      <h2 className="mb-2 text-lg text-ink">{t('signin.chooseRole')}</h2>
      {principals.isPending ? (
        <p className="text-sm text-ink-muted">{t('common.loading')}</p>
      ) : principals.isError ? (
        <p role="alert" className="text-sm text-red">
          The demonstration service is unavailable.
        </p>
      ) : (
        <StaggerList className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {principals.data.principals.map((p) => (
            <StaggerItem key={p.id}>
              <button
                type="button"
                disabled={start.isPending}
                onClick={() => start.mutate(p.id)}
                className="group flex w-full items-center gap-3 bg-panel px-3.5 py-2.5 text-start transition-colors hover:bg-raised disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{p.displayName}</span>
                  <span className="block text-xs text-ink-muted">
                    {ROLE_LABEL[p.roles[0]!]} · {p.title}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 text-ink-faint group-hover:text-brand rtl:rotate-180"
                  aria-hidden
                />
              </button>
            </StaggerItem>
          ))}
        </StaggerList>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-3 inline-flex items-center gap-1 text-sm text-cyan hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
        {t('signin.back')}
      </button>
    </motion.div>
  );
}

/**
 * Institutional sign-in (FR-01..FR-04). Step 1 identifies the institution by code or work email — in a
 * pilot that routes to the institution's identity provider. In this demonstration build the demo code
 * reveals labelled seeded roles. There is no password field anywhere.
 */
export function SignInPage() {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [resolved, setResolved] = useState(false);
  const resolve = useMutation({
    mutationFn: () => api.resolveInstitution(identifier.trim()),
    onSuccess: () => setResolved(true),
  });
  const notConnected = resolve.error instanceof ApiError && resolve.error.status === 404;

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden lg:block">
        <SkylineHero className="absolute inset-0 h-full w-full" />
        <div className="relative flex h-full flex-col px-12 pt-12 pb-8 xl:px-16">
          <div className="flex items-center gap-4">
            <PalmMark className="h-16 w-16" />
            <div>
              <p className="font-serif text-3xl font-medium tracking-[0.12em] text-ink">TIGERIS AI OS</p>
              <p className="mt-1 font-serif text-[15px] text-ink-muted">{t('brand.tagline')}</p>
            </div>
          </div>
          <div className="mt-16 max-w-2xl">
            <p className="font-serif text-[2.25rem] leading-[1.1] font-medium text-ink xl:text-5xl">
              <span className="block whitespace-nowrap">{t('signin.headline1')}</span>
              <span className="block whitespace-nowrap">{t('signin.headline2')}</span>
            </p>
            <p className="mt-5 font-serif text-lg text-ink-muted">{t('signin.sub')}</p>
          </div>
          <p className="mt-auto text-sm text-ink-muted">{t('signin.authorisedOnly')}</p>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 lg:invisible">
            <PalmMark className="h-9 w-9" />
            <span className="font-serif text-lg font-semibold tracking-[0.08em] text-ink">TIGERIS AI OS</span>
          </span>
          <LanguageLinks />
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-panel/90 px-6 py-9 sm:px-12">
            <h1 className="font-serif text-[1.75rem] text-ink">{t('signin.title')}</h1>
            <p className="mt-2 font-serif text-[17px] text-ink-muted">{t('signin.lead')}</p>

            <AnimatePresence mode="wait">
              {resolved ? (
                <div className="mt-7" key="roles">
                  <RolePicker
                    onBack={() => {
                      setResolved(false);
                      resolve.reset();
                    }}
                  />
                </div>
              ) : (
                <motion.form
                  key="identify"
                  className="mt-8"
                  exit={{ opacity: 0 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (identifier.trim().length >= 2) resolve.mutate();
                  }}
                >
                  <label htmlFor="institution-id" className="text-sm font-medium text-ink">
                    {t('signin.idLabel')}
                  </label>
                  <input
                    id="institution-id"
                    autoComplete="organization"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (resolve.isError) resolve.reset();
                    }}
                    placeholder={t('signin.idPlaceholder')}
                    aria-describedby="institution-hint"
                    aria-invalid={notConnected || undefined}
                    className="mt-2 h-12 w-full rounded-lg border border-line-strong bg-panel px-4 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                  />
                  <p id="institution-hint" className="mt-1.5 text-xs text-ink-faint">
                    {t('signin.demoHint')}
                  </p>
                  <AnimatePresence initial={false}>
                    {notConnected ? (
                      <Collapse key="not-connected">
                        <p
                          role="alert"
                          className="mt-2 rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-amber"
                        >
                          {t('signin.notConnected')}
                        </p>
                      </Collapse>
                    ) : null}
                  </AnimatePresence>
                  <button
                    type="submit"
                    disabled={identifier.trim().length < 2 || resolve.isPending}
                    className="mt-5 flex h-13 w-full items-center justify-center gap-3 rounded-lg bg-brand px-5 py-3.5 font-serif text-[17px] text-white transition-[background-color,transform] duration-150 hover:bg-brand-hover active:scale-[0.99] motion-reduce:active:scale-100 disabled:opacity-60"
                  >
                    {t('signin.continue')}
                    <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
                  </button>
                  <p className="mt-3 font-serif text-sm text-ink-muted">{t('signin.managed')}</p>
                </motion.form>
              )}
            </AnimatePresence>

            <hr className="my-8 border-line" />
            <h2 className="font-serif text-xl text-ink">{t('signin.workspace')}</h2>
            <p className="mt-1.5 font-serif text-[15px] text-ink-muted">{t('signin.workspaceLead')}</p>
            <ul className="mt-4 flex flex-wrap gap-2.5" aria-label="Example workspaces">
              {[
                { icon: Leaf, label: 'Energy' },
                { icon: BarChart3, label: 'Banking' },
                { icon: Layers, label: 'Sovereign Capital' },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-lg bg-raised px-3.5 py-2 font-serif text-[15px] text-ink"
                >
                  <Icon className="h-4 w-4 text-brand" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ink-muted">
              {t('signin.contactAdmin')}. Your administrator manages access and roles.
            </p>
          </div>
        </div>

        <p className="flex justify-center gap-3 text-xs text-ink-faint">
          <span>{t('signin.privacy')}</span>
          <span aria-hidden>|</span>
          <span>{t('signin.support')}</span>
        </p>
      </main>
    </div>
  );
}
