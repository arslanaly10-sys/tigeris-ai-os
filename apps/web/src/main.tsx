import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ApiError } from './lib/api';
import { DirectionProvider } from './lib/direction';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Client errors (401/403/404) are answers, not transient failures: never retry them.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DirectionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DirectionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
