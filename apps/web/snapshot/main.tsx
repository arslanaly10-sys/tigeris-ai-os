/**
 * Read-only snapshot build (one self-contained HTML file). The real TIGERIS web app, answering its API calls from
 * answers recorded on the seeded demonstration institution. Nothing here reaches a server: reading works for every
 * demo role; anything that would change data is refused with a plain message. Hash routing, so it opens from disk.
 */
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, MemoryRouter } from 'react-router';
import { App } from '@/App';
import { ApiError } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';
import snapshot from './snapshot-data.json';
import { installSnapshotFetch, type Snapshot } from './shim';

installSnapshotFetch(snapshot as unknown as Snapshot);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
    },
  },
});

// Opened as a file or from a web host: addresses work (#/cases/...). In a preview frame without an address
// (about:srcdoc, blob:), navigation stays in memory.
const Router = /^(https?|file):$/.test(location.protocol) ? HashRouter : MemoryRouter;

const recorded = new Date((snapshot as unknown as Snapshot).recordedAt).toUTCString().slice(5, 22);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div
      role="note"
      className="bg-ink px-4 py-1.5 text-center text-xs text-white"
      style={{ position: 'relative', zIndex: 60 }}
    >
      Read-only snapshot of the TIGERIS demonstration, recorded {recorded} UTC. Fictional institution and
      synthetic data. Actions that change data are disabled.
    </div>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MotionConfig reducedMotion="user">
          <Router>
            <App />
          </Router>
        </MotionConfig>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
