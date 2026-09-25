import type { ReactNode } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import SiteSettingsBootstrap from '@/app/bootstrap/SiteSettingsBootstrap';
import { queryClient } from '@/app/queryClient';
import RoleTheme from '@/app/theme/RoleTheme';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" richColors />
      <Router>
        <RoleTheme>
          <SiteSettingsBootstrap />
          {children}
        </RoleTheme>
      </Router>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
