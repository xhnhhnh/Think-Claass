import AppRoutes from '@/app/routing/AppRoutes';
import GuidedTour from '@/features/onboarding/GuidedTour';

/**
 * The application shell.
 *
 * `GuidedTour` is a sibling of the routes rather than a wrapper around them, and that is the whole
 * point of where it sits: the tour spotlights real elements, so the application has to be mounted
 * and laid out behind it. A tour that rendered instead of the routes would have nothing to point at.
 *
 * It sits here rather than in `main.tsx` because it needs the router (to know which shell the reader
 * is in) and the query client (to read the site settings and, for a teacher, whether a class exists
 * yet - which decides which of the two teacher tours applies).
 */
export default function AppShell() {
  return (
    <>
      <AppRoutes />
      <GuidedTour />
    </>
  );
}
