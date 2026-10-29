import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ApiError } from '@/lib/api';
import { useAuthContext } from '@/lib/session';
import { NAV } from '@/nav';
import { CaseWorkspacePage } from '@/pages/CaseWorkspace';
import { CasesListPage } from '@/pages/CasesList';
import { CommandCentrePage } from '@/pages/CommandCentre';
import { PlannedModulePage } from '@/pages/PlannedModule';
import { SignInPage } from '@/pages/SignIn';
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
      <p role="alert" className="m-8 rounded-md border border-red bg-red-soft px-4 py-3 text-sm text-red">
        The TIGERIS service is unavailable.
      </p>
    );
  const ctx = auth.data;
  return (
    <AppShell ctx={ctx}>
      <Routes>
        <Route index element={<CommandCentrePage ctx={ctx} />} />
        <Route path="cases" element={<CasesListPage />} />
        <Route path="cases/:key" element={<CaseWorkspacePage />} />
        <Route path="sources" element={<SourcesPage />} />
        {NAV.filter((n) => n.phase > 1).map((n) => (
          <Route key={n.path} path={n.path.slice(1)} element={<PlannedModulePage item={n} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
