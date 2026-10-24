import { AppErrorBoundary } from '@/app/routing/ErrorBoundary';
import AppShell from '@/app/AppShell';
import AppProviders from '@/app/providers/AppProviders';

export default function App() {
  return (
    // Outside the providers on purpose: a crash in a provider (the router, the query client, the
    // role theme) must also get a readable screen instead of a blank document.
    <AppErrorBoundary>
      <AppProviders>
        <AppShell />
      </AppProviders>
    </AppErrorBoundary>
  );
}
