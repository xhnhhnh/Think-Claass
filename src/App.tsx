import AppShell from '@/app/AppShell';
import AppProviders from '@/app/providers/AppProviders';

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
