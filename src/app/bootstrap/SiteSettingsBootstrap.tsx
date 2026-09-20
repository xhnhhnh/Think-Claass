import { useEffect } from 'react';

import { useSettings } from '@/hooks/queries/useSettings';
import { brandIconDataUrl } from '@/lib/brandIcon';

export default function SiteSettingsBootstrap() {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (settings.site_title) {
      document.title = settings.site_title;
    }

    // `index.html` carries no `<link rel="icon">`, so this is the only place the tab icon is set:
    // the superadmin's upload when there is one, the built-in mark otherwise. The mark comes from
    // `@/lib/brandIcon` as a data URL rather than a file under `public/`, so there is no second
    // copy of the artwork to keep in step.
    const href = settings.site_favicon || brandIconDataUrl();
    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = href;
  }, [settings]);

  return null;
}
