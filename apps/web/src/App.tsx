import { AnimatePresence, motion } from 'motion/react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { DURATION, EASE_OUT } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { useAuthContext } from '@/lib/session';
import { NAV } from '@/nav';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { lazy, Suspense } from 'react';

/**
 * Route-level code splitting: each screen loads its own chunk, so sign-in no longer downloads MapLibre,
 * deck.gl or React Flow. Pages keep their named exports.
 */
const CaseWorkspacePage = lazy(() =>
  import('@/pages/CaseWorkspace').then((m) => ({ default: m.CaseWorkspacePage })),
);
const CasesListPage = lazy(() => import('@/pages/CasesList').then((m) => ({ default: m.CasesListPage })));
const AiCommandPage = lazy(() => import('@/pages/Governance').then((m) => ({ default: m.AiCommandPage })));
const DecisionsPage = lazy(() => import('@/pages/Governance').then((m) => ({ default: m.DecisionsPage })));
const ExecutionPage = lazy(() => import('@/pages/Governance').then((m) => ({ default: m.ExecutionPage })));
const MandatesPage = lazy(() => import('@/pages/Governance').then((m) => ({ default: m.MandatesPage })));
const OverviewPage = lazy(() => import('@/pages/Overview').then((m) => ({ default: m.OverviewPage })));
const PlannedModulePage = lazy(() =>
  import('@/pages/PlannedModule').then((m) => ({ default: m.PlannedModulePage })),
);
const ScenarioBuilderPage = lazy(() =>
  import('@/pages/Scenarios').then((m) => ({ default: m.ScenarioBuilderPage })),
);
const ScenarioRunPage = lazy(() => import('@/pages/Scenarios').then((m) => ({ default: m.ScenarioRunPage })));
const ScenariosPage = lazy(() => import('@/pages/Scenarios').then((m) => ({ default: m.ScenariosPage })));
const SectorCentrePage = lazy(() => import('@/pages/Sectors').then((m) => ({ default: m.SectorCentrePage })));
const SectorsIndexPage = lazy(() => import('@/pages/Sectors').then((m) => ({ default: m.SectorsIndexPage })));
const SignInPage = lazy(() => import('@/pages/SignIn').then((m) => ({ default: m.SignInPage })));
const GraphPage = lazy(() => import('@/pages/Graph').then((m) => ({ default: m.GraphPage })));
const SignalReviewPage = lazy(() =>
  import('@/pages/SignalReview').then((m) => ({ default: m.SignalReviewPage })),
);
const MemoryPage = lazy(() => import('@/pages/Memory').then((m) => ({ default: m.MemoryPage })));
const OutcomeReviewPage = lazy(() =>
  import('@/pages/OutcomeReview').then((m) => ({ default: m.OutcomeReviewPage })),
);
const CaseReportPage = lazy(() => import('@/pages/CaseReport').then((m) => ({ default: m.CaseReportPage })));
const CompetitivePage = lazy(() =>
  import('@/pages/Competitive').then((m) => ({ default: m.CompetitivePage })),
);
const OversightPage = lazy(() => import('@/pages/Oversight').then((m) => ({ default: m.OversightPage })));
const SourcesPage = lazy(() => import('@/pages/Sources').then((m) => ({ default: m.SourcesPage })));

const pageFallback = <p className="p-8 text-sm text-ink-muted">Loading…</p>;

function Protected() {
  const auth = useAuthContext();
  const location = useLocation();
  if (auth.isPending) return <p className="p-8 text-sm text-ink-muted">Loading…</p>;
  if (auth.error instanceof ApiError && auth.error.status === 401) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  if (!auth.data)
    return (
      <p role="alert" className="m-8 rounded-lg border border-red/60 bg-red-soft px-4 py-3 text-sm text-red">
        The TIGERIS service is unavailable.
      </p>
    );
  const ctx = auth.data;
  return (
    <AppShell ctx={ctx}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          <ScreenErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={pageFallback}>
              <Routes location={location}>
                <Route index element={<OverviewPage ctx={ctx} />} />
                <Route path="sectors" element={<SectorsIndexPage />} />
                <Route path="sectors/:key" element={<SectorCentrePage />} />
                <Route path="ai" element={<AiCommandPage />} />
                <Route path="mandates" element={<MandatesPage />} />
                <Route path="decisions" element={<DecisionsPage ctx={ctx} />} />
                <Route path="execution" element={<ExecutionPage ctx={ctx} />} />
                <Route path="memory" element={<MemoryPage />} />
                <Route path="memory/:key" element={<OutcomeReviewPage />} />
                <Route path="oversight" element={<OversightPage ctx={ctx} />} />
                <Route path="competitive" element={<CompetitivePage />} />
                <Route path="scenarios" element={<ScenariosPage />} />
                <Route path="scenarios/new" element={<ScenarioBuilderPage />} />
                <Route path="scenarios/:key" element={<ScenarioRunPage />} />
                <Route path="cases" element={<CasesListPage />} />
                <Route path="cases/:key" element={<CaseWorkspacePage />} />
                <Route path="cases/:key/report" element={<CaseReportPage />} />
                <Route path="sources" element={<SourcesPage ctx={ctx} />} />
                <Route path="signals" element={<SignalReviewPage />} />
                <Route path="graph" element={<GraphPage />} />
                {NAV.filter((n) => n.phase > 0).map((n) => (
                  <Route key={n.path} path={n.path.slice(1)} element={<PlannedModulePage item={n} />} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ScreenErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export function App() {
  return (
    <ScreenErrorBoundary resetKey="app">
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </Suspense>
    </ScreenErrorBoundary>
  );
}
