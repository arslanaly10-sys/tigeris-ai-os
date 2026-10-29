import { AnimatePresence, motion } from 'motion/react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { DURATION, EASE_OUT } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { useAuthContext } from '@/lib/session';
import { NAV } from '@/nav';
import { CaseWorkspacePage } from '@/pages/CaseWorkspace';
import { CasesListPage } from '@/pages/CasesList';
import { AiCommandPage, DecisionsPage, ExecutionPage, MandatesPage } from '@/pages/Governance';
import { OverviewPage } from '@/pages/Overview';
import { PlannedModulePage } from '@/pages/PlannedModule';
import { SectorCentrePage, SectorsIndexPage } from '@/pages/Sectors';
import { SignInPage } from '@/pages/SignIn';
import { GraphPage } from '@/pages/Graph';
import { SignalReviewPage } from '@/pages/SignalReview';
import { SourcesPage } from '@/pages/Sources';

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
          <Routes location={location}>
            <Route index element={<OverviewPage ctx={ctx} />} />
            <Route path="sectors" element={<SectorsIndexPage />} />
            <Route path="sectors/:key" element={<SectorCentrePage />} />
            <Route path="ai" element={<AiCommandPage />} />
            <Route path="mandates" element={<MandatesPage />} />
            <Route path="decisions" element={<DecisionsPage ctx={ctx} />} />
            <Route path="execution" element={<ExecutionPage />} />
            <Route path="cases" element={<CasesListPage />} />
            <Route path="cases/:key" element={<CaseWorkspacePage />} />
            <Route path="sources" element={<SourcesPage ctx={ctx} />} />
            <Route path="signals" element={<SignalReviewPage />} />
            <Route path="graph" element={<GraphPage />} />
            {NAV.filter((n) => n.phase > 0).map((n) => (
              <Route key={n.path} path={n.path.slice(1)} element={<PlannedModulePage item={n} />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}
