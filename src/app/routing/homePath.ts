import { adminPath } from '@/constants';

/**
 * The landing page of a role's console.
 *
 * One definition for every surface that has to answer "where does this person belong": the login
 * page (an already signed-in visitor), `PrivateRoute` (a URL that belongs to another console) and
 * the 404 page (a mistyped address). Before this each site invented its own fallback, and two of
 * them fell back to the marketing homepage - a signed-in teacher who opened `/student` lost their
 * console and had to sign in again.
 *
 * `unknown` intentionally returns `/`: a public visitor belongs on the public site.
 */
export function homePathForRole(role: string | null | undefined): string {
  switch (role) {
    case 'teacher':
      return '/teacher';
    case 'student':
      return '/student';
    case 'parent':
      return '/parent/dashboard';
    case 'admin':
    case 'superadmin':
      return adminPath();
    default:
      return '/';
  }
}

export default homePathForRole;
